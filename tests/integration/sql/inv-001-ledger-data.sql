-- Stock as INV-001 left it (before INV-002 batches): used by the INV-002
-- migration test. Two companies, a batch-tracked variant with stock in three
-- statuses and two warehouses, a variant without batch tracking, and a zero
-- balance. Every balance equals the sum of its movements.
INSERT INTO "currencies" ("code", "name_en", "name_ar", "symbol_en", "symbol_ar", "minor_units", "updated_at") VALUES
  ('SAR', 'Saudi Riyal', 'ريال سعودي', 'SAR', 'ر.س', 2, now()),
  ('EGP', 'Egyptian Pound', 'جنيه مصري', 'EGP', 'ج.م', 2, now());
INSERT INTO "countries" ("code", "name_en", "name_ar", "currency_code", "default_locale", "timezone", "phone_code", "updated_at") VALUES
  ('SA', 'Saudi Arabia', 'السعودية', 'SAR', 'ar', 'Asia/Riyadh', '+966', now()),
  ('EG', 'Egypt', 'مصر', 'EGP', 'ar', 'Africa/Cairo', '+20', now());
INSERT INTO "legal_entities" ("id", "code", "country_code", "legal_name_en", "legal_name_ar", "updated_at") VALUES
  ('00000000-0000-7000-8000-000000000001', 'MIG-SA', 'SA', 'Mig SA', 'ترحيل السعودية', now()),
  ('00000000-0000-7000-8000-000000000002', 'MIG-EG', 'EG', 'Mig EG', 'ترحيل مصر', now());
INSERT INTO "warehouses" ("id", "code", "legal_entity_id", "country_code", "name_en", "name_ar", "timezone", "updated_at") VALUES
  ('00000000-0000-7000-8000-000000000011', 'MIG-SA-1', '00000000-0000-7000-8000-000000000001', 'SA', 'Riyadh', 'الرياض', 'Asia/Riyadh', now()),
  ('00000000-0000-7000-8000-000000000012', 'MIG-SA-2', '00000000-0000-7000-8000-000000000001', 'SA', 'Jeddah', 'جدة', 'Asia/Riyadh', now()),
  ('00000000-0000-7000-8000-000000000013', 'MIG-EG-1', '00000000-0000-7000-8000-000000000002', 'EG', 'Cairo', 'القاهرة', 'Africa/Cairo', now());
INSERT INTO "brands" ("id", "slug", "name_en", "name_ar", "updated_at") VALUES
  ('00000000-0000-7000-8000-000000000021', 'mig', 'Mig', 'ترحيل', now());
INSERT INTO "products" ("id", "slug", "brand_id", "name_en", "name_ar", "search_text", "updated_at") VALUES
  ('00000000-0000-7000-8000-000000000031', 'mig-oud', '00000000-0000-7000-8000-000000000021', 'Mig Oud', 'عود', 'mig oud', now());
INSERT INTO "product_variants" ("id", "product_id", "sku", "track_inventory", "track_batches", "track_expiry", "updated_at") VALUES
  ('00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000031', 'MIG-TRACKED', true, true, true, now()),
  ('00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000031', 'MIG-PLAIN', true, false, false, now());

-- balances: (tracked, SA-1, SELLABLE) 10 = +12 −2; (tracked, SA-1, QUARANTINED) 3;
-- (tracked, SA-2, SELLABLE) 5; (tracked, EG-1, DAMAGED) 1; (tracked, SA-2, RETURNED) 0 = +2 −2;
-- (plain, SA-1, SELLABLE) 7.
INSERT INTO "stock_balances" ("id", "variant_id", "warehouse_id", "status", "on_hand", "reserved", "updated_at") VALUES
  ('00000000-0000-7000-8000-000000000051', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000011', 'SELLABLE', 10, 0, now()),
  ('00000000-0000-7000-8000-000000000052', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000011', 'QUARANTINED', 3, 0, now()),
  ('00000000-0000-7000-8000-000000000053', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000012', 'SELLABLE', 5, 0, now()),
  ('00000000-0000-7000-8000-000000000054', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000013', 'DAMAGED', 1, 0, now()),
  ('00000000-0000-7000-8000-000000000055', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000012', 'RETURNED', 0, 0, now()),
  ('00000000-0000-7000-8000-000000000056', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000011', 'SELLABLE', 7, 0, now());
INSERT INTO "stock_movements" ("id", "type", "variant_id", "warehouse_id", "status", "quantity", "balance_after", "unit_cost", "currency_code", "actor_type", "idempotency_key", "line_no") VALUES
  (gen_random_uuid(), 'OPENING_BALANCE', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000011', 'SELLABLE', 12, 12, 100, 'SAR', 'SYSTEM', 'opening-balance:t:sa1:s', 1),
  (gen_random_uuid(), 'ADJUSTMENT', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000011', 'SELLABLE', -2, 10, NULL, NULL, 'SYSTEM', 'adj:1', 1),
  (gen_random_uuid(), 'OPENING_BALANCE', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000011', 'QUARANTINED', 3, 3, 100, 'SAR', 'SYSTEM', 'opening-balance:t:sa1:q', 1),
  (gen_random_uuid(), 'OPENING_BALANCE', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000012', 'SELLABLE', 5, 5, 100, 'SAR', 'SYSTEM', 'opening-balance:t:sa2:s', 1),
  (gen_random_uuid(), 'OPENING_BALANCE', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000013', 'DAMAGED', 1, 1, 900, 'EGP', 'SYSTEM', 'opening-balance:t:eg1:d', 1),
  (gen_random_uuid(), 'ADJUSTMENT', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000012', 'RETURNED', 2, 2, NULL, NULL, 'SYSTEM', 'adj:2', 1),
  (gen_random_uuid(), 'ADJUSTMENT', '00000000-0000-7000-8000-000000000041', '00000000-0000-7000-8000-000000000012', 'RETURNED', -2, 0, NULL, NULL, 'SYSTEM', 'adj:3', 1),
  (gen_random_uuid(), 'OPENING_BALANCE', '00000000-0000-7000-8000-000000000042', '00000000-0000-7000-8000-000000000011', 'SELLABLE', 7, 7, 50, 'SAR', 'SYSTEM', 'opening-balance:p:sa1:s', 1);
