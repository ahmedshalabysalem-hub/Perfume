-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "subject_type" VARCHAR(64) NOT NULL,
    "subject_id" VARCHAR(64) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "country_code" CHAR(2),
    "legal_entity_id" UUID,
    "store_id" UUID,
    "warehouse_id" UUID,
    "summary" VARCHAR(300) NOT NULL,
    "snapshot" JSONB,
    "request_reason" VARCHAR(500) NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "reason" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_subject_type_subject_id_idx" ON "approval_requests"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "approval_requests_status_requested_at_idx" ON "approval_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "approval_requests_requested_by_id_idx" ON "approval_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "approval_actions_request_id_occurred_at_idx" ON "approval_actions"("request_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Integrity rules (not diffed by Prisma; see docs/DATABASE.md) ───────────

-- At most one open request per subject.
CREATE UNIQUE INDEX "approval_requests_one_pending_per_subject"
  ON "approval_requests"("subject_type", "subject_id") WHERE "status" = 'PENDING';

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_type_format"
  CHECK ("subject_type" ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$');
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_subject_id_not_blank"
  CHECK (btrim("subject_id") <> '');
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_summary_not_blank"
  CHECK (btrim("summary") <> '');
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_request_reason_not_blank"
  CHECK (btrim("request_reason") <> '');
-- A request is decided exactly when it has left PENDING.
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decision_consistency" CHECK (
  ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_id" IS NULL AND "decision_reason" IS NULL)
  OR ("status" <> 'PENDING' AND "decided_at" IS NOT NULL)
);
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decision_has_decider"
  CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR "decided_by_id" IS NOT NULL);
-- Separation of duties: the requester can never approve or reject their own request.
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requester_cannot_decide"
  CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR "decided_by_id" <> "requested_by_id");
-- Only the requester (or a system actor, recorded as NULL) withdraws a request.
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_cancelled_by_requester"
  CHECK ("status" <> 'CANCELLED' OR "decided_by_id" IS NULL OR "decided_by_id" = "requested_by_id");
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_rejection_has_reason"
  CHECK ("status" <> 'REJECTED' OR btrim(coalesce("decision_reason", '')) <> '');

ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_actor_consistency"
  CHECK (("actor_type" = 'USER') = ("actor_user_id" IS NOT NULL));

-- Requests are never deleted, only the decision columns of a PENDING request
-- may change, and a decided request is final.
CREATE OR REPLACE FUNCTION "approval_requests_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approval_requests rows cannot be deleted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'approval request % is already %', OLD."id", OLD."status"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."subject_type" IS DISTINCT FROM OLD."subject_type"
    OR NEW."subject_id" IS DISTINCT FROM OLD."subject_id"
    OR NEW."country_code" IS DISTINCT FROM OLD."country_code"
    OR NEW."legal_entity_id" IS DISTINCT FROM OLD."legal_entity_id"
    OR NEW."store_id" IS DISTINCT FROM OLD."store_id"
    OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
    OR NEW."summary" IS DISTINCT FROM OLD."summary"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."request_reason" IS DISTINCT FROM OLD."request_reason"
    OR NEW."requested_by_id" IS DISTINCT FROM OLD."requested_by_id"
    OR NEW."requested_at" IS DISTINCT FROM OLD."requested_at" THEN
    RAISE EXCEPTION 'the requested content of approval request % cannot change', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "approval_requests_guard_update"
  BEFORE UPDATE ON "approval_requests"
  FOR EACH ROW EXECUTE FUNCTION "approval_requests_guard"();

CREATE TRIGGER "approval_requests_guard_delete"
  BEFORE DELETE ON "approval_requests"
  FOR EACH ROW EXECUTE FUNCTION "approval_requests_guard"();

-- The action history is append-only, like audit_logs, and shares its
-- retention-purge switch (also used by the test reset).
CREATE OR REPLACE FUNCTION "approval_actions_block_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND current_setting('app.audit_retention_purge', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'approval_actions is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "approval_actions_no_update"
  BEFORE UPDATE ON "approval_actions"
  FOR EACH ROW EXECUTE FUNCTION "approval_actions_block_mutation"();

CREATE TRIGGER "approval_actions_no_delete"
  BEFORE DELETE ON "approval_actions"
  FOR EACH ROW EXECUTE FUNCTION "approval_actions_block_mutation"();

CREATE TRIGGER "approval_actions_no_truncate"
  BEFORE TRUNCATE ON "approval_actions"
  FOR EACH STATEMENT EXECUTE FUNCTION "approval_actions_block_mutation"();
