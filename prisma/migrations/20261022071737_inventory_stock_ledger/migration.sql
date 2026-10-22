-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('SELLABLE', 'QUARANTINED', 'DAMAGED', 'RETURNED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING_BALANCE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "StockStatus" NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "StockMovementType" NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "StockStatus" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "unit_cost" DECIMAL(19,4),
    "currency_code" CHAR(3),
    "document_type" VARCHAR(40),
    "document_id" VARCHAR(64),
    "reason" VARCHAR(500),
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "correlation_id" VARCHAR(64),
    "idempotency_key" VARCHAR(120) NOT NULL,
    "line_no" SMALLINT NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_balances_warehouse_id_status_idx" ON "stock_balances"("warehouse_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_variant_id_warehouse_id_status_key" ON "stock_balances"("variant_id", "warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_warehouse_id_posted_at_idx" ON "stock_movements"("variant_id", "warehouse_id", "posted_at");

-- CreateIndex
CREATE INDEX "stock_movements_warehouse_id_posted_at_idx" ON "stock_movements"("warehouse_id", "posted_at");

-- CreateIndex
CREATE INDEX "stock_movements_document_type_document_id_idx" ON "stock_movements"("document_type", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_idempotency_key_line_no_key" ON "stock_movements"("idempotency_key", "line_no");

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Stock ledger integrity (ADR-019). Prisma does not diff these.
-- ═════════════════════════════════════════════════════════════════════════════

-- Balances never go negative and never reserve more than is on hand. Only
-- sellable stock can be reserved.
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_on_hand_non_negative" CHECK ("on_hand" >= 0);
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_reserved_range" CHECK ("reserved" >= 0 AND "reserved" <= "on_hand");
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_reserved_only_sellable" CHECK ("status" = 'SELLABLE' OR "reserved" = 0);

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_non_zero" CHECK ("quantity" <> 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_balance_after_non_negative" CHECK ("balance_after" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_line_no_positive" CHECK ("line_no" >= 1);
-- A cost always carries its currency, and is never negative.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cost_currency" CHECK (
  ("unit_cost" IS NULL AND "currency_code" IS NULL) OR ("unit_cost" IS NOT NULL AND "currency_code" IS NOT NULL)
);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_cost_non_negative" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);
-- Opening balances bring stock in, at a known cost.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_opening_balance_inbound" CHECK (
  "type" <> 'OPENING_BALANCE' OR ("quantity" > 0 AND "unit_cost" IS NOT NULL)
);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_consistency" CHECK (
  ("actor_type" = 'USER') = ("actor_user_id" IS NOT NULL)
);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_pair" CHECK (
  ("document_type" IS NULL) = ("document_id" IS NULL)
);

-- Append-only ledger: corrections are compensating movements. TRUNCATE is
-- only possible when a session sets `app.stock_ledger_purge = 'on'` (used to
-- reset disposable test databases). Production should also run the
-- application with a role lacking UPDATE/DELETE/TRUNCATE on this table.
CREATE OR REPLACE FUNCTION "stock_movements_block_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' AND current_setting('app.stock_ledger_purge', true) = 'on' THEN
    RETURN NULL; -- statement-level trigger: return value is ignored
  END IF;
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "stock_movements_no_update"
  BEFORE UPDATE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_movements_block_mutation"();

CREATE TRIGGER "stock_movements_no_delete"
  BEFORE DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_movements_block_mutation"();

CREATE TRIGGER "stock_movements_no_truncate"
  BEFORE TRUNCATE ON "stock_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION "stock_movements_block_mutation"();
