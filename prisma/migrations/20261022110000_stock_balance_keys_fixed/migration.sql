-- INV-002 review fix. A stock balance's key (variant, warehouse, status,
-- batch) is fixed once the row exists: the ledger only ever changes "on_hand"
-- and "reserved", and stock moves between keys through movements on both
-- keys. Without this, a direct UPDATE could relabel stock past the batch rules
-- (another company's batch, no batch on a tracked variant) and the sellable
-- guard (QUARANTINED rows of an ineligible batch renamed SELLABLE), since both
-- only look at INSERTs or at the change in "on_hand".
CREATE OR REPLACE FUNCTION "stock_balances_key_fixed"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."variant_id" IS DISTINCT FROM OLD."variant_id"
     OR NEW."warehouse_id" IS DISTINCT FROM OLD."warehouse_id"
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."batch_id" IS DISTINCT FROM OLD."batch_id" THEN
    RAISE EXCEPTION 'stock balance %: variant, warehouse, status and batch cannot change; post movements instead', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_balances_key_fixed"
  BEFORE UPDATE OF "variant_id", "warehouse_id", "status", "batch_id" ON "stock_balances"
  FOR EACH ROW EXECUTE FUNCTION "stock_balances_key_fixed"();

-- The comment in 20261022100000_inventory_batches names a file that does not
-- exist; the application mirror of this rule is batchEligibility().
COMMENT ON FUNCTION "stock_batch_is_sellable"(uuid, uuid) IS
  'ADR-023 eligibility for sale; the application mirror is batchEligibility in src/lib/inventory/batches.ts';
