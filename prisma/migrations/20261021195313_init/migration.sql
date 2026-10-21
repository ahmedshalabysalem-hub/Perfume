-- Trigram matching for normalised catalogue search (products.search_text).
-- pg_trgm is a trusted extension: the database owner may create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FRAGRANCE', 'GIFT_SET', 'BODY_CARE', 'HOME_FRAGRANCE', 'ACCESSORY', 'SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('MEN', 'WOMEN', 'UNISEX');

-- CreateEnum
CREATE TYPE "NoteLayer" AS ENUM ('TOP', 'HEART', 'BASE');

-- CreateEnum
CREATE TYPE "BarcodeType" AS ENUM ('EAN_13', 'EAN_8', 'UPC_A', 'GTIN_14', 'CODE_128');

-- CreateEnum
CREATE TYPE "BarcodeSource" AS ENUM ('MANUFACTURER', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('GLOBAL', 'COUNTRY', 'LEGAL_ENTITY', 'STORE', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "StoreType" AS ENUM ('ONLINE', 'RETAIL');

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "description_en" TEXT,
    "description_ar" TEXT,
    "country_of_origin_code" CHAR(2),
    "website_url" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "parent_id" UUID,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "description_en" TEXT,
    "description_ar" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragrance_families" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fragrance_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragrance_concentrations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fragrance_concentrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragrance_notes" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fragrance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "type" "ProductType" NOT NULL DEFAULT 'FRAGRANCE',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "brand_id" UUID NOT NULL,
    "primary_category_id" UUID,
    "name_en" VARCHAR(200) NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "short_description_en" VARCHAR(400),
    "short_description_ar" VARCHAR(400),
    "description_en" TEXT,
    "description_ar" TEXT,
    "audience" "Audience",
    "concentration_id" UUID,
    "fragrance_family_id" UUID,
    "country_of_origin_code" CHAR(2),
    "manufacturer_name" VARCHAR(200),
    "ingredients_en" TEXT,
    "ingredients_ar" TEXT,
    "warnings_en" TEXT,
    "warnings_ar" TEXT,
    "storage_instructions_en" TEXT,
    "storage_instructions_ar" TEXT,
    "seo_title_en" VARCHAR(160),
    "seo_title_ar" VARCHAR(160),
    "seo_description_en" VARCHAR(320),
    "seo_description_ar" VARCHAR(320),
    "launch_year" SMALLINT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMPTZ(3),
    "discontinued_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "product_fragrance_notes" (
    "product_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "layer" "NoteLayer" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_fragrance_notes_pkey" PRIMARY KEY ("product_id","note_id","layer")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "barcode" VARCHAR(64),
    "barcode_type" "BarcodeType",
    "barcode_source" "BarcodeSource",
    "name_en" VARCHAR(120),
    "name_ar" VARCHAR(120),
    "size_ml" DECIMAL(8,2),
    "weight_grams" INTEGER,
    "is_tester" BOOLEAN NOT NULL DEFAULT false,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "track_batches" BOOLEAN NOT NULL DEFAULT true,
    "track_expiry" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "compare_at_amount" DECIMAL(14,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "storage_key" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_en" VARCHAR(200),
    "alt_ar" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_compliance" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "authority" VARCHAR(40) NOT NULL,
    "reference_type" VARCHAR(60) NOT NULL,
    "reference_number" VARCHAR(80),
    "status" "ComplianceStatus" NOT NULL DEFAULT 'PENDING',
    "issued_at" DATE,
    "expires_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_compliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "ActorType" NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "summary" VARCHAR(300),
    "before" JSONB,
    "after" JSONB,
    "reason" VARCHAR(500),
    "correlation_id" VARCHAR(64),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "type" "UserType" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "preferred_locale" VARCHAR(5),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(3),
    "deactivated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(3),
    "refresh_token_expires_at" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "description_en" TEXT NOT NULL,
    "description_ar" TEXT NOT NULL,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "description_en" TEXT,
    "description_ar" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "allowed_scope_types" "ScopeType"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_key" VARCHAR(100) NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" "ScopeType" NOT NULL,
    "scope_key" VARCHAR(80) NOT NULL,
    "country_code" CHAR(2),
    "legal_entity_id" UUID,
    "store_id" UUID,
    "warehouse_id" UUID,
    "assigned_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "symbol_en" VARCHAR(8) NOT NULL,
    "symbol_ar" VARCHAR(8) NOT NULL,
    "minor_units" SMALLINT NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "default_locale" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "phone_code" VARCHAR(6) NOT NULL,
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "legal_entities" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "legal_name_en" VARCHAR(200) NOT NULL,
    "legal_name_ar" VARCHAR(200) NOT NULL,
    "trade_name_en" VARCHAR(200),
    "trade_name_ar" VARCHAR(200),
    "commercial_registration_no" VARCHAR(40),
    "tax_registration_no" VARCHAR(40),
    "address_line1" VARCHAR(200),
    "address_line2" VARCHAR(200),
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "postal_code" VARCHAR(20),
    "building_number" VARCHAR(20),
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "type" "StoreType" NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "address_line1" VARCHAR(200),
    "city" VARCHAR(100),
    "phone" VARCHAR(32),
    "email" VARCHAR(254),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "name_en" VARCHAR(120) NOT NULL,
    "name_ar" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "address_line1" VARCHAR(200),
    "city" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "brands_is_active_idx" ON "brands"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "fragrance_families_code_key" ON "fragrance_families"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fragrance_concentrations_code_key" ON "fragrance_concentrations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fragrance_notes_slug_key" ON "fragrance_notes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");

-- CreateIndex
CREATE INDEX "products_primary_category_id_idx" ON "products"("primary_category_id");

-- CreateIndex
CREATE INDEX "products_created_at_idx" ON "products"("created_at");

-- CreateIndex
CREATE INDEX "products_search_text_trgm_idx" ON "products" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- CreateIndex
CREATE INDEX "product_fragrance_notes_note_id_idx" ON "product_fragrance_notes"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_status_idx" ON "product_variants"("status");

-- CreateIndex
CREATE INDEX "product_prices_country_code_is_active_idx" ON "product_prices"("country_code", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_variant_id_country_code_key" ON "product_prices"("variant_id", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_storage_key_key" ON "product_images"("storage_key");

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "product_compliance_product_id_idx" ON "product_compliance"("product_id");

-- CreateIndex
CREATE INDEX "product_compliance_country_code_status_idx" ON "product_compliance"("country_code", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_type_status_idx" ON "users"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "role_permissions_permission_key_idx" ON "role_permissions"("permission_key");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_scope_key_key" ON "user_roles"("user_id", "role_id", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_currency_code_key" ON "countries"("code", "currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_code_key" ON "legal_entities"("code");

-- CreateIndex
CREATE INDEX "legal_entities_country_code_idx" ON "legal_entities"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_id_country_code_key" ON "legal_entities"("id", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE INDEX "stores_legal_entity_id_idx" ON "stores"("legal_entity_id");

-- CreateIndex
CREATE INDEX "stores_country_code_idx" ON "stores"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_legal_entity_id_idx" ON "warehouses"("legal_entity_id");

-- CreateIndex
CREATE INDEX "warehouses_country_code_idx" ON "warehouses"("country_code");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_primary_category_id_fkey" FOREIGN KEY ("primary_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_concentration_id_fkey" FOREIGN KEY ("concentration_id") REFERENCES "fragrance_concentrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_fragrance_family_id_fkey" FOREIGN KEY ("fragrance_family_id") REFERENCES "fragrance_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fragrance_notes" ADD CONSTRAINT "product_fragrance_notes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_fragrance_notes" ADD CONSTRAINT "product_fragrance_notes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "fragrance_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_country_code_currency_code_fkey" FOREIGN KEY ("country_code", "currency_code") REFERENCES "countries"("code", "currency_code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compliance" ADD CONSTRAINT "product_compliance_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_compliance" ADD CONSTRAINT "product_compliance_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_legal_entity_id_country_code_fkey" FOREIGN KEY ("legal_entity_id", "country_code") REFERENCES "legal_entities"("id", "country_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_legal_entity_id_country_code_fkey" FOREIGN KEY ("legal_entity_id", "country_code") REFERENCES "legal_entities"("id", "country_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- Integrity rules that the Prisma schema language cannot express.
-- Prisma does not diff CHECK constraints or triggers, so later migrations
-- generated by `prisma migrate dev` leave these intact.
-- ═════════════════════════════════════════════════════════════════════════════

-- Reference data formats --------------------------------------------------------
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_code_format" CHECK ("code" ~ '^[A-Z]{3}$');
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_minor_units_range" CHECK ("minor_units" BETWEEN 0 AND 4);
ALTER TABLE "countries" ADD CONSTRAINT "countries_code_format" CHECK ("code" ~ '^[A-Z]{2}$');

-- Organisation codes ------------------------------------------------------------
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]*$');
ALTER TABLE "stores" ADD CONSTRAINT "stores_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]*$');
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]*$');

-- Identity ------------------------------------------------------------------------
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- Role assignments: exactly the FK column matching scope_type is populated and
-- scope_key is its canonical form (used by the unique index).
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_scope_consistency" CHECK (
  ("scope_type" = 'GLOBAL'
     AND "country_code" IS NULL AND "legal_entity_id" IS NULL AND "store_id" IS NULL AND "warehouse_id" IS NULL
     AND "scope_key" = 'GLOBAL')
  OR ("scope_type" = 'COUNTRY'
     AND "country_code" IS NOT NULL AND "legal_entity_id" IS NULL AND "store_id" IS NULL AND "warehouse_id" IS NULL
     AND "scope_key" = 'COUNTRY:' || "country_code")
  OR ("scope_type" = 'LEGAL_ENTITY'
     AND "legal_entity_id" IS NOT NULL AND "country_code" IS NULL AND "store_id" IS NULL AND "warehouse_id" IS NULL
     AND "scope_key" = 'LEGAL_ENTITY:' || "legal_entity_id"::text)
  OR ("scope_type" = 'STORE'
     AND "store_id" IS NOT NULL AND "country_code" IS NULL AND "legal_entity_id" IS NULL AND "warehouse_id" IS NULL
     AND "scope_key" = 'STORE:' || "store_id"::text)
  OR ("scope_type" = 'WAREHOUSE'
     AND "warehouse_id" IS NOT NULL AND "country_code" IS NULL AND "legal_entity_id" IS NULL AND "store_id" IS NULL
     AND "scope_key" = 'WAREHOUSE:' || "warehouse_id"::text)
);

-- Catalogue -------------------------------------------------------------------------
ALTER TABLE "brands" ADD CONSTRAINT "brands_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "fragrance_notes" ADD CONSTRAINT "fragrance_notes_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "fragrance_families" ADD CONSTRAINT "fragrance_families_code_format" CHECK ("code" ~ '^[A-Z0-9_]+$');
ALTER TABLE "fragrance_concentrations" ADD CONSTRAINT "fragrance_concentrations_code_format" CHECK ("code" ~ '^[A-Z0-9_]+$');

ALTER TABLE "products" ADD CONSTRAINT "products_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "products" ADD CONSTRAINT "products_launch_year_range" CHECK ("launch_year" IS NULL OR "launch_year" BETWEEN 1700 AND 2200);
ALTER TABLE "products" ADD CONSTRAINT "products_published_has_timestamp" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);

-- SKUs are stored normalised (upper-case, no spaces).
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_sku_format" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$');
-- A barcode always carries its symbology and its source.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_barcode_consistency" CHECK (
  ("barcode" IS NULL AND "barcode_type" IS NULL AND "barcode_source" IS NULL)
  OR ("barcode" IS NOT NULL AND "barcode_type" IS NOT NULL AND "barcode_source" IS NOT NULL)
);
-- GTIN symbologies are digits of the right length (check digit validated in the service).
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_gtin_format" CHECK (
  "barcode_type" IS NULL
  OR "barcode_type" = 'CODE_128'
  OR ("barcode_type" = 'EAN_13' AND "barcode" ~ '^[0-9]{13}$')
  OR ("barcode_type" = 'EAN_8' AND "barcode" ~ '^[0-9]{8}$')
  OR ("barcode_type" = 'UPC_A' AND "barcode" ~ '^[0-9]{12}$')
  OR ("barcode_type" = 'GTIN_14' AND "barcode" ~ '^[0-9]{14}$')
);
-- Internally assigned codes are Code 128 and are never presented as GS1 GTINs.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_internal_barcode_code128" CHECK (
  "barcode_source" IS DISTINCT FROM 'INTERNAL' OR "barcode_type" = 'CODE_128'
);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_size_positive" CHECK ("size_ml" IS NULL OR "size_ml" > 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_weight_positive" CHECK ("weight_grams" IS NULL OR "weight_grams" > 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_batches_require_inventory" CHECK (NOT "track_batches" OR "track_inventory");
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_expiry_requires_batches" CHECK (NOT "track_expiry" OR "track_batches");

ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_compare_at_gt_amount" CHECK ("compare_at_amount" IS NULL OR "compare_at_amount" > "amount");

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_size_positive" CHECK ("size_bytes" > 0);
ALTER TABLE "product_compliance" ADD CONSTRAINT "product_compliance_date_order" CHECK ("expires_at" IS NULL OR "issued_at" IS NULL OR "expires_at" >= "issued_at");

-- Governance: append-only audit trail ---------------------------------------------
-- UPDATE is always rejected. DELETE / TRUNCATE are only allowed inside a
-- retention job that sets `app.audit_retention_purge = 'on'` for its
-- transaction. Production should additionally run the application with a role
-- that lacks UPDATE/DELETE/TRUNCATE on this table (see docs/DATABASE.md).
CREATE OR REPLACE FUNCTION "audit_logs_block_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.audit_retention_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD; -- row-level BEFORE trigger: returning OLD lets the delete proceed
    ELSIF TG_OP = 'TRUNCATE' THEN
      RETURN NULL; -- statement-level trigger: return value is ignored
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update"
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_block_mutation"();

CREATE TRIGGER "audit_logs_no_delete"
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_block_mutation"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_block_mutation"();
