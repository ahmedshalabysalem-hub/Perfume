-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('PREPAID', 'ON_DELIVERY', 'NET');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "supplier_country_code" CHAR(2) NOT NULL,
    "tax_registration_no" VARCHAR(40),
    "commercial_registration_no" VARCHAR(40),
    "payment_terms" "PaymentTerms" NOT NULL DEFAULT 'NET',
    "payment_term_days" SMALLINT,
    "currency_code" CHAR(3) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "website_url" VARCHAR(300),
    "address_line1" VARCHAR(200),
    "city" VARCHAR(100),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contacts" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "job_title" VARCHAR(120),
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "supplier_sku" VARCHAR(64) NOT NULL,
    "supplier_product_name" VARCHAR(200),
    "last_cost_amount" DECIMAL(14,2),
    "last_cost_currency" CHAR(3),
    "last_cost_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_country_code_idx" ON "suppliers"("country_code");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_legal_entity_id_tax_registration_no_key" ON "suppliers"("legal_entity_id", "tax_registration_no");

-- CreateIndex
CREATE INDEX "supplier_contacts_supplier_id_idx" ON "supplier_contacts"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_products_variant_id_idx" ON "supplier_products"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplier_id_variant_id_key" ON "supplier_products"("supplier_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplier_id_supplier_sku_key" ON "supplier_products"("supplier_id", "supplier_sku");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_legal_entity_id_country_code_fkey" FOREIGN KEY ("legal_entity_id", "country_code") REFERENCES "legal_entities"("id", "country_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_last_cost_currency_fkey" FOREIGN KEY ("last_cost_currency") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Integrity rules (Prisma does not diff CHECK constraints) ────────────────
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]*$');
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_supplier_country_format" CHECK ("supplier_country_code" ~ '^[A-Z]{2}$');
-- NET terms always carry 1–365 days; prepaid and on-delivery terms carry none.
-- (IS NOT NULL is explicit: a NULL comparison would otherwise make the CHECK pass.)
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_payment_term_days" CHECK (
  ("payment_terms" = 'NET' AND "payment_term_days" IS NOT NULL AND "payment_term_days" BETWEEN 1 AND 365)
  OR ("payment_terms" <> 'NET' AND "payment_term_days" IS NULL)
);

ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplier_sku_format" CHECK ("supplier_sku" = upper(btrim("supplier_sku")) AND "supplier_sku" <> '');
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_last_cost_positive" CHECK ("last_cost_amount" IS NULL OR "last_cost_amount" > 0);
-- A last cost is always recorded with its currency and date.
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_last_cost_consistency" CHECK (
  ("last_cost_amount" IS NULL AND "last_cost_currency" IS NULL AND "last_cost_at" IS NULL)
  OR ("last_cost_amount" IS NOT NULL AND "last_cost_currency" IS NOT NULL AND "last_cost_at" IS NOT NULL)
);
