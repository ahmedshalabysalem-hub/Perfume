
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('ONLINE');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "fulfilment_warehouse_id" UUID;

-- CreateTable
CREATE TABLE "order_number_counters" (
    "country_code" CHAR(2) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("country_code")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(20) NOT NULL,
    "channel" "OrderChannel" NOT NULL DEFAULT 'ONLINE',
    "store_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "is_guest" BOOLEAN NOT NULL DEFAULT true,
    "locale" VARCHAR(5) NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "customer_email" VARCHAR(254),
    "ship_country_code" CHAR(2) NOT NULL,
    "ship_region" VARCHAR(40),
    "ship_city" VARCHAR(100) NOT NULL,
    "ship_district" VARCHAR(100),
    "ship_street" VARCHAR(200) NOT NULL,
    "ship_building_number" VARCHAR(20),
    "ship_unit" VARCHAR(40),
    "ship_postal_code" VARCHAR(10),
    "ship_short_address" VARCHAR(8),
    "ship_additional" VARCHAR(200),
    "delivery_notes" VARCHAR(300),
    "item_count" INTEGER NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "shipping_fee" DECIMAL(14,2),
    "total" DECIMAL(14,2),
    "prices_include_tax" BOOLEAN NOT NULL,
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_due_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(500),
    "idempotency_key" VARCHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_no" SMALLINT NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "product_name_en" VARCHAR(200) NOT NULL,
    "product_name_ar" VARCHAR(200) NOT NULL,
    "brand_name_en" VARCHAR(120) NOT NULL,
    "brand_name_ar" VARCHAR(120) NOT NULL,
    "variant_name_en" VARCHAR(120),
    "variant_name_ar" VARCHAR(120),
    "size_ml" DECIMAL(8,2),
    "is_tester" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "batch_id" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    "release_reason" VARCHAR(40),

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_changes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "reason" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_throttles" (
    "key" VARCHAR(200) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL,

    CONSTRAINT "request_throttles_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_country_code_placed_at_idx" ON "orders"("country_code", "placed_at");

-- CreateIndex
CREATE INDEX "orders_store_id_placed_at_idx" ON "orders"("store_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_status_review_due_at_idx" ON "orders"("status", "review_due_at");

-- CreateIndex
CREATE INDEX "orders_customer_phone_idx" ON "orders"("customer_phone");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_idempotency_key_key" ON "orders"("store_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_line_no_key" ON "order_items"("order_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_variant_id_key" ON "order_items"("order_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_id_order_id_key" ON "order_items"("id", "order_id");

-- CreateIndex
CREATE INDEX "stock_reservations_order_id_idx" ON "stock_reservations"("order_id");

-- CreateIndex
CREATE INDEX "stock_reservations_variant_id_warehouse_id_status_idx" ON "stock_reservations"("variant_id", "warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stock_reservations_batch_id_status_idx" ON "stock_reservations"("batch_id", "status");

-- CreateIndex
CREATE INDEX "order_status_changes_order_id_occurred_at_idx" ON "order_status_changes"("order_id", "occurred_at");

-- CreateIndex
CREATE INDEX "request_throttles_window_start_idx" ON "request_throttles"("window_start");

-- CreateIndex
CREATE UNIQUE INDEX "stores_id_legal_entity_id_country_code_key" ON "stores"("id", "legal_entity_id", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_id_legal_entity_id_key" ON "warehouses"("id", "legal_entity_id");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_fulfilment_warehouse_id_legal_entity_id_fkey" FOREIGN KEY ("fulfilment_warehouse_id", "legal_entity_id") REFERENCES "warehouses"("id", "legal_entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_number_counters" ADD CONSTRAINT "order_number_counters_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_legal_entity_id_country_code_fkey" FOREIGN KEY ("store_id", "legal_entity_id", "country_code") REFERENCES "stores"("id", "legal_entity_id", "country_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_country_code_currency_code_fkey" FOREIGN KEY ("country_code", "currency_code") REFERENCES "countries"("code", "currency_code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouse_id_legal_entity_id_fkey" FOREIGN KEY ("warehouse_id", "legal_entity_id") REFERENCES "warehouses"("id", "legal_entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_item_id_order_id_fkey" FOREIGN KEY ("order_item_id", "order_id") REFERENCES "order_items"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_batch_id_variant_id_fkey" FOREIGN KEY ("batch_id", "variant_id") REFERENCES "stock_batches"("id", "variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_changes" ADD CONSTRAINT "order_status_changes_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── ORD-001 integrity rules (ADR-025). Prisma does not diff these. ─────────

-- Orders: amounts, contact and lifecycle are consistent.
ALTER TABLE "orders" ADD CONSTRAINT "orders_number_format" CHECK (
  "order_number" ~ '^[A-Z]{2}-[0-9]{6,}$' AND left("order_number", 2) = "country_code");
ALTER TABLE "orders" ADD CONSTRAINT "orders_ships_in_store_country" CHECK ("ship_country_code" = "country_code");
ALTER TABLE "orders" ADD CONSTRAINT "orders_locale" CHECK ("locale" IN ('ar', 'en'));
ALTER TABLE "orders" ADD CONSTRAINT "orders_phone_e164" CHECK ("customer_phone" ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE "orders" ADD CONSTRAINT "orders_request_hash" CHECK ("request_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "orders" ADD CONSTRAINT "orders_idempotency_key" CHECK ("idempotency_key" ~ '^[A-Za-z0-9_-]{16,64}$');
ALTER TABLE "orders" ADD CONSTRAINT "orders_item_count_positive" CHECK ("item_count" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_subtotal_positive" CHECK ("subtotal" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_fee_non_negative" CHECK ("shipping_fee" IS NULL OR "shipping_fee" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_is_sum" CHECK (
  ("shipping_fee" IS NULL AND "total" IS NULL) OR ("total" = "subtotal" + "shipping_fee"));
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_fields" CHECK (
  CASE "status"
    WHEN 'PENDING_REVIEW' THEN "confirmed_at" IS NULL AND "cancelled_at" IS NULL AND "shipping_fee" IS NULL
    WHEN 'CONFIRMED' THEN "confirmed_at" IS NOT NULL AND "confirmed_by_id" IS NOT NULL
                          AND "shipping_fee" IS NOT NULL AND "cancelled_at" IS NULL
    WHEN 'CANCELLED' THEN "cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL
  END);
ALTER TABLE "orders" ADD CONSTRAINT "orders_version_positive" CHECK ("version" >= 1);

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_positive" CHECK ("unit_price" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total" CHECK ("line_total" = "unit_price" * "quantity");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_no_positive" CHECK ("line_no" >= 1);

ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_release_fields" CHECK (
  ("status" = 'ACTIVE' AND "released_at" IS NULL AND "release_reason" IS NULL)
  OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND "release_reason" IS NOT NULL));

ALTER TABLE "order_number_counters" ADD CONSTRAINT "order_number_counters_non_negative" CHECK ("last_value" >= 0);
ALTER TABLE "request_throttles" ADD CONSTRAINT "request_throttles_hits_positive" CHECK ("hits" >= 1);

-- An order's identity, customer snapshot and amounts are fixed once placed;
-- status moves only forward; every change advances the version; no deletes.
CREATE OR REPLACE FUNCTION "orders_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'orders rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."order_number", NEW."channel", NEW."store_id", NEW."legal_entity_id", NEW."country_code",
      NEW."currency_code", NEW."warehouse_id", NEW."is_guest", NEW."locale", NEW."customer_name",
      NEW."customer_phone", NEW."customer_email", NEW."ship_country_code", NEW."ship_region", NEW."ship_city",
      NEW."ship_district", NEW."ship_street", NEW."ship_building_number", NEW."ship_unit",
      NEW."ship_postal_code", NEW."ship_short_address", NEW."ship_additional", NEW."delivery_notes",
      NEW."item_count", NEW."subtotal", NEW."prices_include_tax", NEW."placed_at", NEW."review_due_at",
      NEW."idempotency_key", NEW."request_hash", NEW."created_at")
     IS DISTINCT FROM
     (OLD."order_number", OLD."channel", OLD."store_id", OLD."legal_entity_id", OLD."country_code",
      OLD."currency_code", OLD."warehouse_id", OLD."is_guest", OLD."locale", OLD."customer_name",
      OLD."customer_phone", OLD."customer_email", OLD."ship_country_code", OLD."ship_region", OLD."ship_city",
      OLD."ship_district", OLD."ship_street", OLD."ship_building_number", OLD."ship_unit",
      OLD."ship_postal_code", OLD."ship_short_address", OLD."ship_additional", OLD."delivery_notes",
      OLD."item_count", OLD."subtotal", OLD."prices_include_tax", OLD."placed_at", OLD."review_due_at",
      OLD."idempotency_key", OLD."request_hash", OLD."created_at") THEN
    RAISE EXCEPTION 'order %: placed details cannot change', OLD."order_number" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
       (OLD."status" = 'PENDING_REVIEW' AND NEW."status" IN ('CONFIRMED', 'CANCELLED'))
    OR (OLD."status" = 'CONFIRMED' AND NEW."status" = 'CANCELLED')) THEN
    RAISE EXCEPTION 'order %: % cannot become %', OLD."order_number", OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'CANCELLED' THEN
    RAISE EXCEPTION 'order %: a cancelled order is final', OLD."order_number" USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'CONFIRMED' AND (NEW."shipping_fee" IS DISTINCT FROM OLD."shipping_fee"
      OR NEW."confirmed_at" IS DISTINCT FROM OLD."confirmed_at"
      OR NEW."confirmed_by_id" IS DISTINCT FROM OLD."confirmed_by_id") THEN
    RAISE EXCEPTION 'order %: confirmation details are fixed', OLD."order_number" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'order %: every change must advance the version by one', OLD."order_number"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "orders_guard"
  BEFORE UPDATE OR DELETE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION "orders_guard"();

-- Order lines and status history are append-only.
CREATE OR REPLACE FUNCTION "sales_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER "order_items_append_only"
  BEFORE UPDATE OR DELETE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION "sales_append_only"();
CREATE TRIGGER "order_status_changes_append_only"
  BEFORE UPDATE OR DELETE ON "order_status_changes"
  FOR EACH ROW EXECUTE FUNCTION "sales_append_only"();

-- A reservation changes only once, from ACTIVE to RELEASED; nothing else moves.
CREATE OR REPLACE FUNCTION "stock_reservations_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_reservations rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."order_id", NEW."order_item_id", NEW."variant_id", NEW."warehouse_id", NEW."batch_id",
      NEW."quantity", NEW."created_at")
     IS DISTINCT FROM
     (OLD."order_id", OLD."order_item_id", OLD."variant_id", OLD."warehouse_id", OLD."batch_id",
      OLD."quantity", OLD."created_at")
     OR OLD."status" <> 'ACTIVE' OR NEW."status" <> 'RELEASED' THEN
    RAISE EXCEPTION 'stock reservation %: only an ACTIVE reservation can be released', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_reservations_guard"
  BEFORE UPDATE OR DELETE ON "stock_reservations"
  FOR EACH ROW EXECUTE FUNCTION "stock_reservations_guard"();
