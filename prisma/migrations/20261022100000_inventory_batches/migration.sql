-- INV-002 batches (ADR-023). The new StockMovementType values are added by the
-- previous migration so that the carry-over below may use them even when a
-- migration runs inside one transaction.

-- CreateEnum
CREATE TYPE "BatchInspectionStatus" AS ENUM ('PENDING_INSPECTION', 'RELEASED', 'QUARANTINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExpiryBasis" AS ENUM ('RECORDED', 'UNKNOWN', 'NOT_TRACKED');

-- CreateEnum
CREATE TYPE "ExpiryPrecision" AS ENUM ('DAY', 'MONTH');

-- CreateEnum
CREATE TYPE "BatchVerificationResult" AS ENUM ('NONE', 'PASSED', 'FAILED');

-- DropIndex
DROP INDEX "stock_balances_variant_id_warehouse_id_status_key";

-- AlterTable
ALTER TABLE "stock_balances" ADD COLUMN     "batch_id" UUID;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "batch_id" UUID;

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "variant_id" UUID NOT NULL,
    "lot_number" VARCHAR(64),
    "is_legacy" BOOLEAN NOT NULL DEFAULT false,
    "details_complete" BOOLEAN NOT NULL DEFAULT true,
    "manufactured_on" DATE,
    "expiry_basis" "ExpiryBasis" NOT NULL,
    "expires_on" DATE,
    "expiry_precision" "ExpiryPrecision",
    "supplier_id" UUID,
    "document_type" VARCHAR(40),
    "document_id" VARCHAR(64),
    "inspection_status" "BatchInspectionStatus" NOT NULL DEFAULT 'PENDING_INSPECTION',
    "status_reason" VARCHAR(500),
    "status_changed_at" TIMESTAMPTZ(3),
    "status_changed_by_id" UUID,
    "verification_result" "BatchVerificationResult" NOT NULL DEFAULT 'NONE',
    "physical_check_ok" BOOLEAN,
    "label_check_ok" BOOLEAN,
    "verification_notes" VARCHAR(1000),
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_batches_variant_id_idx" ON "stock_batches"("variant_id");

-- CreateIndex
CREATE INDEX "stock_batches_expires_on_idx" ON "stock_batches"("expires_on");

-- CreateIndex
CREATE INDEX "stock_batches_inspection_status_idx" ON "stock_batches"("inspection_status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_legal_entity_id_variant_id_lot_number_key" ON "stock_batches"("legal_entity_id", "variant_id", "lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_batches_id_variant_id_key" ON "stock_batches"("id", "variant_id");

-- CreateIndex
CREATE INDEX "stock_balances_batch_id_warehouse_id_idx" ON "stock_balances"("batch_id", "warehouse_id");

-- CreateIndex (NULLS NOT DISTINCT: exactly one balance row per key, with or without a batch)
CREATE UNIQUE INDEX "stock_balances_variant_id_warehouse_id_status_batch_id_key" ON "stock_balances"("variant_id", "warehouse_id", "status", "batch_id") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "stock_movements_batch_id_idx" ON "stock_movements"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_id_legal_entity_id_key" ON "suppliers"("id", "legal_entity_id");

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_legal_entity_id_country_code_fkey" FOREIGN KEY ("legal_entity_id", "country_code") REFERENCES "legal_entities"("id", "country_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_supplier_id_legal_entity_id_fkey" FOREIGN KEY ("supplier_id", "legal_entity_id") REFERENCES "suppliers"("id", "legal_entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_status_changed_by_id_fkey" FOREIGN KEY ("status_changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_batch_id_variant_id_fkey" FOREIGN KEY ("batch_id", "variant_id") REFERENCES "stock_batches"("id", "variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_variant_id_fkey" FOREIGN KEY ("batch_id", "variant_id") REFERENCES "stock_batches"("id", "variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- Batches (ADR-023, DR-001…DR-010). Prisma does not diff the SQL below.
-- ═════════════════════════════════════════════════════════════════════════════

-- One LEGACY batch per company and variant.
CREATE UNIQUE INDEX "stock_batches_one_legacy_per_variant" ON "stock_batches"("legal_entity_id", "variant_id") WHERE "is_legacy";

-- Lot numbers: letters, digits, space, hyphen, slash, period; stored upper-case
-- and trimmed (DR-007). Only a LEGACY batch may lack one (DR-008).
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_lot_required" CHECK ("lot_number" IS NOT NULL OR "is_legacy");
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_lot_format" CHECK (
  "lot_number" IS NULL OR "lot_number" ~ '^[A-Z0-9./-]([A-Z0-9 ./-]{0,62}[A-Z0-9./-])?$'
);
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_details_incomplete_only_legacy" CHECK ("details_complete" OR "is_legacy");
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_complete_needs_lot" CHECK (NOT "details_complete" OR "lot_number" IS NOT NULL);
-- Dates.
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_expiry_after_manufacture" CHECK (
  "expires_on" IS NULL OR "manufactured_on" IS NULL OR "expires_on" > "manufactured_on"
);
-- The expiry state is explicit: a date exists exactly when the basis is RECORDED.
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_expiry_basis_date" CHECK (
  ("expiry_basis" = 'RECORDED') = ("expires_on" IS NOT NULL)
);
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_expiry_precision_date" CHECK (
  ("expires_on" IS NULL) = ("expiry_precision" IS NULL)
);
-- A month-precision expiry is stored as the month's last day (DR-007).
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_expiry_month_end" CHECK (
  "expiry_precision" IS DISTINCT FROM 'MONTH'
  OR "expires_on" = (date_trunc('month', "expires_on") + interval '1 month - 1 day')::date
);
-- Verification: nothing recorded, or both checks with who and when (DR-010).
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_verification_consistency" CHECK (
  ("verification_result" = 'NONE'
     AND "verified_at" IS NULL AND "verified_by_id" IS NULL
     AND "physical_check_ok" IS NULL AND "label_check_ok" IS NULL)
  OR ("verification_result" <> 'NONE'
     AND "verified_at" IS NOT NULL AND "verified_by_id" IS NOT NULL
     AND "physical_check_ok" IS NOT NULL AND "label_check_ok" IS NOT NULL
     AND ("verification_result" = 'PASSED') = ("physical_check_ok" AND "label_check_ok"))
);
-- A LEGACY batch, or any batch with unknown expiry, is released only after a
-- passing verification; a failed verification keeps the batch out of sale.
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_release_needs_verification" CHECK (
  "inspection_status" <> 'RELEASED'
  OR (NOT "is_legacy" AND "expiry_basis" <> 'UNKNOWN')
  OR "verification_result" = 'PASSED'
);
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_failed_not_sellable" CHECK (
  "verification_result" <> 'FAILED' OR "inspection_status" IN ('QUARANTINED', 'REJECTED')
);
-- Quarantine and rejection always carry a reason.
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_status_reason" CHECK (
  "inspection_status" NOT IN ('QUARANTINED', 'REJECTED') OR "status_reason" IS NOT NULL
);
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_document_pair" CHECK (
  ("document_type" IS NULL) = ("document_id" IS NULL)
);
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_version_positive" CHECK ("version" >= 1);

-- Is stock of this batch eligible for sale in this warehouse today? The single
-- database form of the eligibility rule (ADR-023); the application mirrors it
-- in src/lib/inventory/eligibility.ts.
CREATE OR REPLACE FUNCTION "stock_batch_is_sellable"(p_batch_id uuid, p_warehouse_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT b."inspection_status" = 'RELEASED'
       AND (b."expiry_basis" <> 'UNKNOWN' OR b."verification_result" = 'PASSED')
       AND (b."expiry_basis" <> 'RECORDED' OR b."expires_on" >= (now() AT TIME ZONE w."timezone")::date)
      FROM "stock_batches" b, "warehouses" w
     WHERE b."id" = p_batch_id AND w."id" = p_warehouse_id
  ), false)
$$;

-- ─── Carry-over of stock that predates batches (DR-008, DR-010) ──────────────
-- Re-keys every non-zero balance of a batch-tracked variant onto one LEGACY
-- batch per company and variant, in the same stock status, through two
-- compensating BATCH_ASSIGNMENT movements. Existing movements are never
-- changed; no lot, date or verification is invented; LEGACY batches start
-- PENDING_INSPECTION, unverified, with UNKNOWN expiry (not sellable). Quantities
-- are reconciled before and after; any difference aborts. Running it again
-- changes nothing.
CREATE OR REPLACE FUNCTION "stock_carry_over_to_legacy_batches"() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  moved integer := 0;
  created integer;
  bal record;
  legacy_id uuid;
  after_in integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS "_carry_over_before" (
    "variant_id" uuid, "warehouse_id" uuid, "status" "StockStatus", "on_hand" bigint
  ) ON COMMIT DROP;
  TRUNCATE "_carry_over_before";
  INSERT INTO "_carry_over_before"
    SELECT "variant_id", "warehouse_id", "status", SUM("on_hand") FROM "stock_balances" GROUP BY 1, 2, 3;

  FOR bal IN
    SELECT b."id", b."variant_id", b."warehouse_id", b."status", b."on_hand", b."reserved",
           w."legal_entity_id", w."country_code"
      FROM "stock_balances" b
      JOIN "product_variants" v ON v."id" = b."variant_id"
      JOIN "warehouses" w ON w."id" = b."warehouse_id"
     WHERE b."batch_id" IS NULL AND b."on_hand" > 0 AND v."track_batches"
     ORDER BY b."warehouse_id", b."variant_id", b."status"
       FOR UPDATE OF b
  LOOP
    IF bal."reserved" <> 0 THEN
      RAISE EXCEPTION 'carry-over: balance % has reserved stock', bal."id";
    END IF;
    IF EXISTS (SELECT 1 FROM "stock_movements" WHERE "idempotency_key" = 'migration:inv-002:' || bal."id") THEN
      RAISE EXCEPTION 'carry-over: balance % was carried over before but holds stock again', bal."id";
    END IF;

    INSERT INTO "stock_batches" ("id", "legal_entity_id", "country_code", "variant_id", "lot_number",
                                 "is_legacy", "details_complete", "expiry_basis", "inspection_status",
                                 "verification_result", "updated_at")
    VALUES (gen_random_uuid(), bal."legal_entity_id", bal."country_code", bal."variant_id", NULL,
            true, false, 'UNKNOWN', 'PENDING_INSPECTION', 'NONE', now())
    ON CONFLICT ("legal_entity_id", "variant_id") WHERE "is_legacy" DO NOTHING;
    GET DIAGNOSTICS created = ROW_COUNT;
    SELECT "id" INTO STRICT legacy_id FROM "stock_batches"
     WHERE "legal_entity_id" = bal."legal_entity_id" AND "variant_id" = bal."variant_id" AND "is_legacy";
    IF created = 1 THEN
      INSERT INTO "audit_logs" ("id", "occurred_at", "actor_type", "action", "entity_type", "entity_id",
                                "summary", "after", "reason", "correlation_id")
      VALUES (gen_random_uuid(), now(), 'SYSTEM', 'inventory.batch.legacy_create', 'stock_batch', legacy_id::text,
              'LEGACY batch for stock recorded before batches',
              jsonb_build_object('legalEntityId', bal."legal_entity_id", 'variantId', bal."variant_id",
                                 'inspectionStatus', 'PENDING_INSPECTION', 'expiryBasis', 'UNKNOWN',
                                 'verificationResult', 'NONE'),
              'INV-002 migration: lot, dates and verification unknown', 'migration:inv-002');
    END IF;

    UPDATE "stock_balances" SET "on_hand" = 0, "updated_at" = now() WHERE "id" = bal."id";
    INSERT INTO "stock_balances" ("id", "variant_id", "warehouse_id", "status", "batch_id", "on_hand", "reserved", "updated_at")
    VALUES (gen_random_uuid(), bal."variant_id", bal."warehouse_id", bal."status", legacy_id, 0, 0, now())
    ON CONFLICT DO NOTHING;
    UPDATE "stock_balances" SET "on_hand" = "on_hand" + bal."on_hand", "updated_at" = now()
     WHERE "variant_id" = bal."variant_id" AND "warehouse_id" = bal."warehouse_id"
       AND "status" = bal."status" AND "batch_id" = legacy_id
    RETURNING "on_hand" INTO STRICT after_in;

    INSERT INTO "stock_movements" ("id", "posted_at", "type", "variant_id", "warehouse_id", "status", "batch_id",
                                   "quantity", "balance_after", "document_type", "document_id", "reason",
                                   "actor_type", "correlation_id", "idempotency_key", "line_no")
    VALUES
      (gen_random_uuid(), now(), 'BATCH_ASSIGNMENT', bal."variant_id", bal."warehouse_id", bal."status", NULL,
       -bal."on_hand", 0, 'stock_balance', bal."id"::text,
       'INV-002: stock recorded before batches moved to the LEGACY batch', 'SYSTEM', 'migration:inv-002',
       'migration:inv-002:' || bal."id", 1),
      (gen_random_uuid(), now(), 'BATCH_ASSIGNMENT', bal."variant_id", bal."warehouse_id", bal."status", legacy_id,
       bal."on_hand", after_in, 'stock_balance', bal."id"::text,
       'INV-002: stock recorded before batches moved to the LEGACY batch', 'SYSTEM', 'migration:inv-002',
       'migration:inv-002:' || bal."id", 2);
    moved := moved + 1;
  END LOOP;

  -- Reconciliation: quantities per variant × warehouse × status are unchanged…
  IF EXISTS (
    SELECT 1
      FROM (SELECT "variant_id", "warehouse_id", "status", SUM("on_hand") AS "on_hand"
              FROM "stock_balances" GROUP BY 1, 2, 3) a
      FULL JOIN "_carry_over_before" b USING ("variant_id", "warehouse_id", "status")
     WHERE a."on_hand" IS DISTINCT FROM b."on_hand"
  ) THEN
    RAISE EXCEPTION 'carry-over: quantities per variant, warehouse and status changed';
  END IF;
  -- …and the ledger still sums to every balance.
  IF EXISTS (
    SELECT 1 FROM "stock_balances" b
     WHERE b."on_hand" <> COALESCE((
       SELECT SUM(m."quantity") FROM "stock_movements" m
        WHERE m."variant_id" = b."variant_id" AND m."warehouse_id" = b."warehouse_id"
          AND m."status" = b."status" AND m."batch_id" IS NOT DISTINCT FROM b."batch_id"), 0)
  ) THEN
    RAISE EXCEPTION 'carry-over: the ledger no longer sums to the balances';
  END IF;
  RETURN moved;
END;
$$;

SELECT "stock_carry_over_to_legacy_batches"();

-- ─── Triggers (created after the carry-over) ─────────────────────────────────

-- A batch exactly when the variant tracks batches, and only in a warehouse of
-- the batch's own company (DR-001).
CREATE OR REPLACE FUNCTION "stock_ledger_batch_rules"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tracks boolean;
  batch_entity uuid;
  warehouse_entity uuid;
BEGIN
  SELECT "track_batches" INTO tracks FROM "product_variants" WHERE "id" = NEW."variant_id";
  IF tracks AND NEW."batch_id" IS NULL THEN
    RAISE EXCEPTION 'variant % tracks batches: % needs a batch', NEW."variant_id", TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT tracks AND NEW."batch_id" IS NOT NULL THEN
    RAISE EXCEPTION 'variant % does not track batches: % cannot carry one', NEW."variant_id", TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."batch_id" IS NOT NULL THEN
    SELECT "legal_entity_id" INTO batch_entity FROM "stock_batches" WHERE "id" = NEW."batch_id";
    SELECT "legal_entity_id" INTO warehouse_entity FROM "warehouses" WHERE "id" = NEW."warehouse_id";
    IF batch_entity IS DISTINCT FROM warehouse_entity THEN
      RAISE EXCEPTION 'batch % belongs to another company than warehouse %', NEW."batch_id", NEW."warehouse_id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_movements_batch_rules"
  BEFORE INSERT ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_ledger_batch_rules"();
CREATE TRIGGER "stock_balances_batch_rules"
  BEFORE INSERT ON "stock_balances"
  FOR EACH ROW EXECUTE FUNCTION "stock_ledger_batch_rules"();

-- Sellable stock of a batch only grows while the batch is eligible for sale,
-- whatever code path writes the balance (DR-010).
CREATE OR REPLACE FUNCTION "stock_balances_sellable_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'SELLABLE' AND NEW."batch_id" IS NOT NULL
     AND NEW."on_hand" > (CASE WHEN TG_OP = 'UPDATE' THEN OLD."on_hand" ELSE 0 END)
     AND NOT "stock_batch_is_sellable"(NEW."batch_id", NEW."warehouse_id") THEN
    RAISE EXCEPTION 'batch % is not eligible for sale: sellable stock cannot grow', NEW."batch_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_balances_sellable_guard"
  BEFORE INSERT OR UPDATE OF "on_hand", "status", "batch_id" ON "stock_balances"
  FOR EACH ROW EXECUTE FUNCTION "stock_balances_sellable_guard"();

-- Batch records: no deletes; identity fixed; REJECTED final; lot fixed once stock
-- exists except on LEGACY batches; a recorded expiry never becomes unknown;
-- NOT_TRACKED only for variants whose catalogue setting disables expiry; a
-- LEGACY batch is born unverified with nothing invented (DR-005, DR-008, DR-010).
CREATE OR REPLACE FUNCTION "stock_batches_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tracks_expiry boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_batches rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "track_expiry" INTO tracks_expiry FROM "product_variants" WHERE "id" = NEW."variant_id";
  IF NEW."expiry_basis" = 'NOT_TRACKED' AND tracks_expiry THEN
    RAISE EXCEPTION 'batch %: expiry cannot be NOT_TRACKED for a variant that tracks expiry', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."is_legacy" AND (NEW."expiry_basis" <> 'UNKNOWN' OR NEW."inspection_status" <> 'PENDING_INSPECTION'
        OR NEW."verification_result" <> 'NONE' OR NEW."lot_number" IS NOT NULL
        OR NEW."manufactured_on" IS NOT NULL OR NEW."details_complete") THEN
      RAISE EXCEPTION 'a LEGACY batch starts unverified, pending, with unknown lot and expiry'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT NEW."is_legacy" AND tracks_expiry AND NEW."expiry_basis" <> 'RECORDED' THEN
      RAISE EXCEPTION 'batch %: the variant tracks expiry, so an expiry date is required', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."legal_entity_id" <> OLD."legal_entity_id" OR NEW."country_code" <> OLD."country_code"
     OR NEW."variant_id" <> OLD."variant_id" OR NEW."is_legacy" <> OLD."is_legacy"
     OR NEW."created_at" <> OLD."created_at" OR NEW."created_by_id" IS DISTINCT FROM OLD."created_by_id" THEN
    RAISE EXCEPTION 'batch %: identity columns cannot change', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'batch %: every change must advance the version by one', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."inspection_status" = 'REJECTED' AND NEW."inspection_status" <> 'REJECTED' THEN
    RAISE EXCEPTION 'batch % is rejected; the decision is final', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."lot_number" IS DISTINCT FROM OLD."lot_number" THEN
    IF NEW."lot_number" IS NULL THEN
      RAISE EXCEPTION 'batch %: a lot number cannot be removed', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
    IF NOT OLD."is_legacy" AND EXISTS (SELECT 1 FROM "stock_movements" WHERE "batch_id" = OLD."id") THEN
      RAISE EXCEPTION 'batch %: the lot number is fixed once stock is recorded', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD."expiry_basis" = 'RECORDED' AND NEW."expiry_basis" <> 'RECORDED' THEN
    RAISE EXCEPTION 'batch %: a recorded expiry date cannot become unknown', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_batches_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "stock_batches"
  FOR EACH ROW EXECUTE FUNCTION "stock_batches_guard"();

-- Tracking flags are frozen once a variant has ledger history; expiry tracking
-- cannot be switched on while a batch says expiry is not tracked (ADR-023).
CREATE OR REPLACE FUNCTION "product_variants_tracking_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."track_inventory" <> OLD."track_inventory" OR NEW."track_batches" <> OLD."track_batches")
     AND EXISTS (SELECT 1 FROM "stock_movements" WHERE "variant_id" = OLD."id") THEN
    RAISE EXCEPTION 'variant %: inventory and batch tracking cannot change once stock is recorded', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."track_expiry" AND NOT OLD."track_expiry"
     AND EXISTS (SELECT 1 FROM "stock_batches" WHERE "variant_id" = OLD."id" AND "expiry_basis" = 'NOT_TRACKED') THEN
    RAISE EXCEPTION 'variant %: batches record expiry as not tracked', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "product_variants_tracking_guard"
  BEFORE UPDATE OF "track_inventory", "track_batches", "track_expiry" ON "product_variants"
  FOR EACH ROW EXECUTE FUNCTION "product_variants_tracking_guard"();

