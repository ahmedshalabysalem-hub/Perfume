import { beforeEach, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/server/context";
import { db } from "@/server/db";
import { AppError, ConflictError, ForbiddenError, InvalidStateError, ValidationError } from "@/server/errors";
import {
  addSupplierContact,
  addSupplierProduct,
  createSupplier,
  getSupplier,
  getSupplierHistory,
  listSuppliers,
  removeSupplierContact,
  setSupplierActive,
  setSupplierProductActive,
  supplierEntityOptions,
  updateSupplier,
  updateSupplierContact,
  updateSupplierProduct,
} from "@/server/modules/procurement/suppliers.service";
import { auditEntries, contextFor, createStaff, seedFixture, type Fixture } from "./fixtures";

let f: Fixture;
let egEntityId: string;
let procurementSa: ServiceContext;
let procurementEntity: ServiceContext;
let procurementEg: ServiceContext;
let accountant: ServiceContext;
let variantId: string;

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("expected the operation to fail");
}

const supplierInput = (overrides: Record<string, unknown> = {}) => ({
  code: "sup-001",
  legalEntityId: f.legalEntitySaId,
  nameEn: "Gulf Oud Traders",
  nameAr: "تجار عود الخليج",
  supplierCountryCode: "sa",
  taxRegistrationNo: "300000000000003",
  commercialRegistrationNo: "",
  paymentTerms: "NET",
  paymentTermDays: "30",
  currencyCode: "SAR",
  email: "Sales@Gulf-Oud.example",
  phone: "",
  websiteUrl: "",
  addressLine1: "",
  city: "Jeddah",
  notes: "",
  ...overrides,
});

const productInput = (overrides: Record<string, unknown> = {}) => ({
  variantCode: "test-roi-100",
  supplierSku: " got-roi 100 ",
  supplierProductName: "Royal Oud 100ml",
  lastCostAmount: "120.50",
  ...overrides,
});

beforeEach(async () => {
  f = await seedFixture();
  const eg = await db.legalEntity.create({
    data: { code: "TEST-EG", countryCode: "EG", legalNameEn: "Test Egypt", legalNameAr: "اختبار مصر" },
  });
  egEntityId = eg.id;
  procurementSa = contextFor(
    await createStaff("buyer.sa@test.local", "procurement_staff", { type: "COUNTRY", countryCode: "SA" }),
  );
  procurementEntity = contextFor(
    await createStaff("buyer.entity@test.local", "procurement_staff", {
      type: "LEGAL_ENTITY",
      legalEntityId: f.legalEntitySaId,
    }),
  );
  procurementEg = contextFor(
    await createStaff("buyer.eg@test.local", "procurement_staff", { type: "COUNTRY", countryCode: "EG" }),
  );
  accountant = contextFor(await createStaff("accountant@test.local", "accountant", { type: "GLOBAL" }));
  const brand = await db.brand.create({ data: { slug: "test-house", nameEn: "Test House", nameAr: "دار" } });
  const product = await db.product.create({
    data: { slug: "royal-oud", brandId: brand.id, nameEn: "Royal Oud", nameAr: "عود ملكي" },
  });
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      sku: "TEST-ROI-100",
      barcode: "4006381333931",
      barcodeType: "EAN_13",
      barcodeSource: "MANUFACTURER",
    },
  });
  variantId = variant.id;
});

describe("supplier profiles", () => {
  it("creates a supplier in the buying entity's country with normalised fields and an audit entry", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id } });
    expect(supplier).toMatchObject({
      code: "SUP-001",
      countryCode: "SA",
      supplierCountryCode: "SA",
      paymentTerms: "NET",
      paymentTermDays: 30,
      email: "sales@gulf-oud.example",
      isActive: true,
    });
    const [entry] = await auditEntries("procurement.supplier.create");
    expect(entry?.entityType).toBe("supplier");
    expect(entry?.entityId).toBe(id);
  });

  it("checks the tax number against the supplier's own country", async () => {
    const saudi = await errorOf(createSupplier(procurementSa, supplierInput({ taxRegistrationNo: "123456789" })));
    expect(saudi).toBeInstanceOf(ValidationError);
    expect(saudi.fieldErrors?.taxRegistrationNo?.[0]).toMatch(/^validation\.taxNumberFormat/);
    // An Egyptian supplier of the Saudi entity uses the Egyptian 9-digit format.
    await createSupplier(
      procurementSa,
      supplierInput({ code: "SUP-EG", supplierCountryCode: "EG", taxRegistrationNo: "123-456-789" }),
    );
    expect((await db.supplier.findUniqueOrThrow({ where: { code: "SUP-EG" } })).taxRegistrationNo).toBe("123456789");
    // A French supplier: generic alphanumeric rule.
    await createSupplier(
      procurementSa,
      supplierInput({
        code: "SUP-FR",
        supplierCountryCode: "FR",
        taxRegistrationNo: "fr 12 345678901",
        currencyCode: "SAR",
      }),
    );
    expect((await db.supplier.findUniqueOrThrow({ where: { code: "SUP-FR" } })).taxRegistrationNo).toBe(
      "FR12345678901",
    );
  });

  it("requires credit days for NET terms only, and enforces it in the database too", async () => {
    const missing = await errorOf(createSupplier(procurementSa, supplierInput({ paymentTermDays: "" })));
    expect(missing.fieldErrors?.paymentTermDays?.[0]).toMatch(/^validation\.paymentTermDays/);
    const tooLong = await errorOf(createSupplier(procurementSa, supplierInput({ paymentTermDays: "400" })));
    expect(tooLong).toBeInstanceOf(ValidationError);
    const { id } = await createSupplier(
      procurementSa,
      supplierInput({ paymentTerms: "PREPAID", paymentTermDays: "45" }),
    );
    expect((await db.supplier.findUniqueOrThrow({ where: { id } })).paymentTermDays).toBeNull();
    await expect(
      db.$executeRaw`UPDATE "suppliers" SET "payment_terms" = 'NET', "payment_term_days" = NULL WHERE "id" = ${id}::uuid`,
    ).rejects.toThrow(/suppliers_payment_term_days/);
  });

  it("rejects duplicate codes and duplicate tax numbers within an entity, but allows the tax number in another entity", async () => {
    await createSupplier(procurementSa, supplierInput());
    const code = await errorOf(createSupplier(procurementSa, supplierInput({ taxRegistrationNo: "" })));
    expect(code).toBeInstanceOf(ConflictError);
    expect(code.messageKey).toBe("errors.conflict.code");
    const tax = await errorOf(createSupplier(procurementSa, supplierInput({ code: "SUP-002" })));
    expect(tax.messageKey).toBe("errors.conflict.taxNumber");
    await createSupplier(
      f.superAdmin,
      supplierInput({ code: "SUP-003", legalEntityId: egEntityId, currencyCode: "EGP" }),
    );
    // Suppliers without a tax number never collide.
    await createSupplier(procurementSa, supplierInput({ code: "SUP-004", taxRegistrationNo: "" }));
    await createSupplier(procurementSa, supplierInput({ code: "SUP-005", taxRegistrationNo: "" }));
  });

  it("keeps the buying entity fixed and audits only real changes", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    await updateSupplier(procurementSa, id, {
      ...supplierInput({ nameEn: "Gulf Oud Trading", paymentTerms: "ON_DELIVERY" }),
      legalEntityId: egEntityId,
    });
    const supplier = await db.supplier.findUniqueOrThrow({ where: { id } });
    expect(supplier.legalEntityId).toBe(f.legalEntitySaId);
    expect(supplier.paymentTermDays).toBeNull();
    const [entry] = await auditEntries("procurement.supplier.update");
    expect(entry?.after).toMatchObject({ nameEn: "Gulf Oud Trading", paymentTerms: "ON_DELIVERY" });
    expect(entry?.after).not.toHaveProperty("code");
    await updateSupplier(procurementSa, id, supplierInput({ nameEn: "Gulf Oud Trading", paymentTerms: "ON_DELIVERY" }));
    expect(await auditEntries("procurement.supplier.update")).toHaveLength(1);
  });

  it("refuses inactive buying entities and deactivates suppliers softly", async () => {
    await db.legalEntity.update({ where: { id: egEntityId }, data: { isActive: false } });
    const inactive = await errorOf(
      createSupplier(f.superAdmin, supplierInput({ legalEntityId: egEntityId, currencyCode: "EGP" })),
    );
    expect(inactive).toBeInstanceOf(InvalidStateError);
    const { id } = await createSupplier(procurementSa, supplierInput());
    await setSupplierActive(procurementSa, id, { isActive: false });
    expect((await db.supplier.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
    expect(await auditEntries("procurement.supplier.deactivate")).toHaveLength(1);
    const linking = await errorOf(addSupplierProduct(procurementSa, id, productInput()));
    expect(linking.messageKey).toBe("errors.invalidState.inactiveReference");
  });
});

describe("supplier authorization and scope", () => {
  it("lets only holders of suppliers.view read and suppliers.manage write", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    expect(await errorOf(listSuppliers(f.catalogManager, {}))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(getSupplier(f.cashier, id))).toBeInstanceOf(ForbiddenError);
    // The accountant can read suppliers but not change them.
    expect((await listSuppliers(accountant, {})).total).toBe(1);
    expect((await getSupplier(accountant, id)).code).toBe("SUP-001");
    expect(await errorOf(updateSupplier(accountant, id, supplierInput()))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(createSupplier(accountant, supplierInput({ code: "X-1" })))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(addSupplierContact(f.saManager, id, { name: "X", isPrimary: false }))).toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("limits COUNTRY- and LEGAL_ENTITY-scoped staff to their own suppliers", async () => {
    const sa = await createSupplier(procurementEntity, supplierInput());
    const eg = await createSupplier(
      procurementEg,
      supplierInput({ code: "SUP-EG", legalEntityId: egEntityId, currencyCode: "EGP", taxRegistrationNo: "" }),
    );
    expect(await errorOf(createSupplier(procurementEg, supplierInput({ code: "SUP-X" })))).toBeInstanceOf(
      ForbiddenError,
    );

    const codes = async (ctx: ServiceContext) => (await listSuppliers(ctx, {})).rows.map((row) => row.code).sort();
    expect(await codes(procurementSa)).toEqual(["SUP-001"]);
    expect(await codes(procurementEntity)).toEqual(["SUP-001"]);
    expect(await codes(procurementEg)).toEqual(["SUP-EG"]);
    expect(await codes(f.superAdmin)).toEqual(["SUP-001", "SUP-EG"]);
    // A business manager assigned to a store holds suppliers.view at STORE scope, which covers no supplier.
    const storeManager = contextFor(
      await createStaff("store.manager@test.local", "business_manager", { type: "STORE", storeId: f.storeId }),
    );
    expect(await codes(storeManager)).toEqual([]);

    expect(await errorOf(getSupplier(procurementSa, eg.id))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(updateSupplier(procurementEntity, eg.id, supplierInput()))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(setSupplierActive(procurementEg, sa.id, { isActive: false }))).toBeInstanceOf(ForbiddenError);
    expect(await errorOf(getSupplierHistory(procurementEg, sa.id))).toBeInstanceOf(ForbiddenError);

    expect((await supplierEntityOptions(procurementSa)).map((entity) => entity.code)).toEqual(["TEST-SA"]);
    expect((await supplierEntityOptions(accountant)).length).toBe(0);
  });

  it("searches by code, name or tax number and filters by status and entity", async () => {
    await createSupplier(procurementSa, supplierInput());
    const other = await createSupplier(
      procurementSa,
      supplierInput({ code: "SUP-002", nameEn: "Amber House", nameAr: "بيت العنبر", taxRegistrationNo: "" }),
    );
    await setSupplierActive(procurementSa, other.id, { isActive: false });
    const codes = async (query: Record<string, unknown>) =>
      (await listSuppliers(procurementSa, query)).rows.map((row) => row.code);
    expect(await codes({ q: "amber" })).toEqual(["SUP-002"]);
    expect(await codes({ q: "عود" })).toEqual(["SUP-001"]);
    expect(await codes({ q: "3000000" })).toEqual(["SUP-001"]);
    expect(await codes({ status: "inactive" })).toEqual(["SUP-002"]);
    expect(await codes({ entity: egEntityId })).toEqual([]);
  });
});

describe("supplier contacts", () => {
  it("keeps exactly one primary contact and never writes e-mail or phone to the audit log", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    const first = await addSupplierContact(procurementSa, id, {
      name: "Khalid",
      jobTitle: "Sales",
      email: "khalid@gulf-oud.example",
      phone: "+966500000000",
      isPrimary: false,
    });
    // The first contact becomes primary automatically.
    expect((await db.supplierContact.findUniqueOrThrow({ where: { id: first.id } })).isPrimary).toBe(true);
    const second = await addSupplierContact(procurementSa, id, { name: "Mona", isPrimary: true });
    const primaries = await db.supplierContact.findMany({ where: { supplierId: id, isPrimary: true } });
    expect(primaries.map((contact) => contact.id)).toEqual([second.id]);

    await updateSupplierContact(procurementSa, first.id, {
      name: "Khalid",
      jobTitle: "Sales",
      email: "k@gulf-oud.example",
      phone: "+966500000000",
      isPrimary: true,
    });
    expect(
      (await db.supplierContact.findMany({ where: { supplierId: id, isPrimary: true } })).map((c) => c.id),
    ).toEqual([first.id]);
    const [update] = await auditEntries("procurement.supplier_contact.update");
    expect(update?.after).toMatchObject({ changedFields: ["email", "isPrimary"] });

    await removeSupplierContact(procurementSa, first.id);
    expect(await db.supplierContact.count({ where: { supplierId: id } })).toBe(1);
    const entries = await db.auditLog.findMany({ where: { action: { startsWith: "procurement.supplier_contact" } } });
    expect(entries).toHaveLength(4);
    const serialized = JSON.stringify(entries.map((entry) => [entry.before, entry.after, entry.summary]));
    expect(serialized).not.toContain("gulf-oud.example");
    expect(serialized).not.toContain("+966500000000");
  });
});

describe("supplier products", () => {
  it("links a variant by SKU or barcode with the supplier's code and a dated last cost in the supplier's currency", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    const { id: linkId } = await addSupplierProduct(procurementSa, id, productInput());
    const row = await db.supplierProduct.findUniqueOrThrow({ where: { id: linkId } });
    expect(row.variantId).toBe(variantId);
    expect(row.supplierSku).toBe("GOT-ROI 100");
    expect(row.lastCostAmount?.toFixed(2)).toBe("120.50");
    expect(row.lastCostCurrency).toBe("SAR");
    expect(row.lastCostAt).toBeInstanceOf(Date);
    expect((await auditEntries("procurement.supplier_product.create"))[0]?.after).toMatchObject({
      sku: "TEST-ROI-100",
      lastCostAmount: "120.50",
    });

    const other = await createSupplier(procurementSa, supplierInput({ code: "SUP-002", taxRegistrationNo: "" }));
    await addSupplierProduct(
      procurementSa,
      other.id,
      productInput({ variantCode: "4006381333931", lastCostAmount: "" }),
    );
    const byBarcode = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: other.id } });
    expect(byBarcode.variantId).toBe(variantId);
    expect(byBarcode.lastCostAmount).toBeNull();
    expect(byBarcode.lastCostCurrency).toBeNull();
  });

  it("rejects unknown variants, duplicates and excess precision", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    const unknown = await errorOf(addSupplierProduct(procurementSa, id, productInput({ variantCode: "NOPE-1" })));
    expect(unknown.fieldErrors?.variantCode?.[0]).toBe("validation.variantNotFound");
    const precise = await errorOf(addSupplierProduct(procurementSa, id, productInput({ lastCostAmount: "10.005" })));
    expect(precise).toBeInstanceOf(ValidationError);
    await addSupplierProduct(procurementSa, id, productInput());
    const sameVariant = await errorOf(addSupplierProduct(procurementSa, id, productInput({ supplierSku: "OTHER" })));
    expect(sameVariant.messageKey).toBe("errors.conflict.supplierVariant");

    const brand = await db.brand.findFirstOrThrow();
    const product = await db.product.create({
      data: { slug: "amber", brandId: brand.id, nameEn: "Amber", nameAr: "عنبر" },
    });
    await db.productVariant.create({ data: { productId: product.id, sku: "TEST-AMB-50" } });
    const sameCode = await errorOf(
      addSupplierProduct(procurementSa, id, productInput({ variantCode: "TEST-AMB-50", supplierSku: "GOT-ROI 100" })),
    );
    expect(sameCode.messageKey).toBe("errors.conflict.supplierSku");
  });

  it("re-dates a changed cost, keeps an unchanged one, and never relabels it when the supplier's currency changes", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    const { id: linkId } = await addSupplierProduct(procurementSa, id, productInput());
    const original = await db.supplierProduct.findUniqueOrThrow({ where: { id: linkId } });

    await updateSupplier(f.superAdmin, id, supplierInput({ currencyCode: "EGP" }));
    await updateSupplierProduct(procurementSa, linkId, {
      supplierSku: "GOT-ROI 100",
      supplierProductName: "Renamed",
      lastCostAmount: "120.5",
    });
    const unchanged = await db.supplierProduct.findUniqueOrThrow({ where: { id: linkId } });
    expect(unchanged.lastCostCurrency).toBe("SAR");
    expect(unchanged.lastCostAt?.getTime()).toBe(original.lastCostAt?.getTime());
    expect(unchanged.supplierProductName).toBe("Renamed");

    await updateSupplierProduct(procurementSa, linkId, {
      supplierSku: "GOT-ROI 100",
      supplierProductName: "Renamed",
      lastCostAmount: "2400",
    });
    const changed = await db.supplierProduct.findUniqueOrThrow({ where: { id: linkId } });
    expect(changed.lastCostAmount?.toFixed(2)).toBe("2400.00");
    expect(changed.lastCostCurrency).toBe("EGP");
    const updates = await auditEntries("procurement.supplier_product.update");
    expect(updates.at(-1)?.before).toMatchObject({ lastCostAmount: "120.50", lastCostCurrency: "SAR" });
    expect(updates.at(-1)?.after).toMatchObject({ lastCostAmount: "2400.00", lastCostCurrency: "EGP" });

    await updateSupplierProduct(procurementSa, linkId, {
      supplierSku: "GOT-ROI 100",
      supplierProductName: "Renamed",
      lastCostAmount: "",
    });
    const cleared = await db.supplierProduct.findUniqueOrThrow({ where: { id: linkId } });
    expect([cleared.lastCostAmount, cleared.lastCostCurrency, cleared.lastCostAt]).toEqual([null, null, null]);
    await expect(
      db.$executeRaw`UPDATE "supplier_products" SET "last_cost_amount" = 5 WHERE "id" = ${linkId}::uuid`,
    ).rejects.toThrow(/supplier_products_last_cost_consistency/);
  });

  it("deactivates supplier products and shows the full history on the supplier", async () => {
    const { id } = await createSupplier(procurementSa, supplierInput());
    const { id: linkId } = await addSupplierProduct(procurementSa, id, productInput());
    await setSupplierProductActive(procurementSa, linkId, { isActive: false });
    expect((await db.supplierProduct.findUniqueOrThrow({ where: { id: linkId } })).isActive).toBe(false);
    const history = await getSupplierHistory(accountant, id);
    expect(history.map((entry) => entry.action)).toEqual([
      "procurement.supplier_product.deactivate",
      "procurement.supplier_product.create",
      "procurement.supplier.create",
    ]);
    expect(history[0]?.actorName).toBe("buyer.sa");
  });
});
