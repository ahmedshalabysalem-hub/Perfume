import type { ScopeType } from "@/generated/prisma/enums";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions";

export type SystemRoleDefinition = {
  key: string;
  en: string;
  ar: string;
  descriptionEn: string;
  descriptionAr: string;
  /** Scopes at which the role may be assigned. */
  scopes: ScopeType[];
  permissions: readonly PermissionKey[];
};

const CATALOG_EDITOR: PermissionKey[] = [
  "products.view",
  "products.create",
  "products.update",
  "products.publish",
  "products.prices.update",
  "products.compliance.manage",
  "catalog.brands.manage",
  "catalog.categories.manage",
  "catalog.attributes.manage",
];

/**
 * System roles. Their permission sets are owned by code and re-synchronised by
 * `npm run db:sync-rbac`; they cannot be edited from the UI. Additional custom
 * roles can be created in the database.
 */
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    key: "super_admin",
    en: "Super Admin",
    ar: "مدير النظام",
    descriptionEn: "Full access to every module. Assign sparingly.",
    descriptionAr: "صلاحية كاملة على جميع الوحدات. يُمنح بحذر.",
    scopes: ["GLOBAL"],
    permissions: PERMISSION_KEYS,
  },
  {
    key: "business_manager",
    en: "Business / Store Manager",
    ar: "مدير الأعمال / المتجر",
    descriptionEn: "Runs a business unit: catalogue, prices, operations and approvals within scope.",
    descriptionAr: "يدير وحدة العمل: الكتالوج والأسعار والعمليات والاعتمادات ضمن نطاقه.",
    scopes: ["GLOBAL", "COUNTRY", "LEGAL_ENTITY", "STORE"],
    permissions: [
      "admin.access",
      "dashboard.view",
      ...CATALOG_EDITOR,
      "organization.view",
      "users.view",
      "audit.view",
      "inventory.view",
      "inventory.adjust.approve",
      "purchases.view",
      "purchases.approve",
      "orders.view",
      "orders.update",
      "orders.cancel",
      "customers.view",
      "payments.refund.approve",
      "pos.session.manage",
      "pos.discount.override",
      "reports.view",
      "reports.financial.view",
    ],
  },
  {
    key: "catalog_manager",
    en: "Catalogue Manager",
    ar: "مدير الكتالوج",
    descriptionEn: "Maintains products, variants, barcodes, prices and catalogue reference data.",
    descriptionAr: "يدير المنتجات والأصناف والباركود والأسعار وبيانات الكتالوج المرجعية.",
    scopes: ["GLOBAL", "COUNTRY"],
    permissions: ["admin.access", "dashboard.view", ...CATALOG_EDITOR],
  },
  {
    key: "sales_staff",
    en: "Sales Staff",
    ar: "موظف المبيعات",
    descriptionEn: "Creates and follows up customer orders.",
    descriptionAr: "ينشئ طلبات العملاء ويتابعها.",
    scopes: ["GLOBAL", "COUNTRY", "STORE"],
    permissions: ["admin.access", "dashboard.view", "products.view", "orders.view", "orders.create", "orders.update", "customers.view"],
  },
  {
    key: "inventory_manager",
    en: "Inventory Manager",
    ar: "مدير المخزون",
    descriptionEn: "Oversees stock, counts, transfers and approves adjustments.",
    descriptionAr: "يشرف على المخزون والجرد والتحويلات ويعتمد التسويات.",
    scopes: ["GLOBAL", "COUNTRY", "LEGAL_ENTITY", "WAREHOUSE"],
    permissions: [
      "admin.access",
      "dashboard.view",
      "products.view",
      "organization.view",
      "inventory.view",
      "inventory.receive",
      "inventory.adjust.request",
      "inventory.adjust.approve",
      "inventory.transfer",
      "inventory.count",
      "purchases.view",
      "reports.view",
    ],
  },
  {
    key: "warehouse_staff",
    en: "Warehouse Staff",
    ar: "موظف المستودع",
    descriptionEn: "Receives goods, counts stock and requests adjustments.",
    descriptionAr: "يستلم البضائع ويجرد المخزون ويطلب التسويات.",
    scopes: ["WAREHOUSE"],
    permissions: ["admin.access", "products.view", "inventory.view", "inventory.receive", "inventory.adjust.request", "inventory.count"],
  },
  {
    key: "procurement_staff",
    en: "Procurement Staff",
    ar: "موظف المشتريات",
    descriptionEn: "Manages suppliers and raises purchase orders.",
    descriptionAr: "يدير الموردين ويصدر أوامر الشراء.",
    scopes: ["GLOBAL", "COUNTRY", "LEGAL_ENTITY"],
    permissions: ["admin.access", "dashboard.view", "products.view", "suppliers.manage", "purchases.view", "purchases.create", "inventory.view"],
  },
  {
    key: "accountant",
    en: "Accountant",
    ar: "محاسب",
    descriptionEn: "Records expenses, verifies payments and posts journal entries.",
    descriptionAr: "يسجل المصروفات ويتحقق من المدفوعات ويرحّل القيود.",
    scopes: ["GLOBAL", "COUNTRY", "LEGAL_ENTITY"],
    permissions: [
      "admin.access",
      "dashboard.view",
      "organization.view",
      "orders.view",
      "payments.verify",
      "accounting.view",
      "accounting.post",
      "expenses.manage",
      "reports.view",
      "reports.financial.view",
    ],
  },
  {
    key: "marketing_staff",
    en: "Marketing Staff",
    ar: "موظف التسويق",
    descriptionEn: "Runs promotions, coupons, campaigns and review moderation.",
    descriptionAr: "يدير العروض والقسائم والحملات ومراجعة التقييمات.",
    scopes: ["GLOBAL", "COUNTRY"],
    permissions: ["admin.access", "dashboard.view", "products.view", "marketing.manage", "reviews.moderate", "reports.view"],
  },
  {
    key: "customer_support",
    en: "Customer Support",
    ar: "خدمة العملاء",
    descriptionEn: "Assists customers with orders, returns and refund requests.",
    descriptionAr: "يساعد العملاء في الطلبات والمرتجعات وطلبات الاسترداد.",
    scopes: ["GLOBAL", "COUNTRY", "STORE"],
    permissions: ["admin.access", "products.view", "orders.view", "customers.view", "customers.manage", "payments.refund.request"],
  },
  {
    key: "cashier",
    en: "Cashier",
    ar: "كاشير",
    descriptionEn: "Sells at the point of sale in an assigned store.",
    descriptionAr: "يبيع في نقطة البيع في متجر محدد.",
    scopes: ["STORE"],
    permissions: ["admin.access", "products.view", "pos.sell", "customers.view"],
  },
  {
    key: "customer",
    en: "Customer",
    ar: "عميل",
    descriptionEn: "Storefront customer account. Grants no back-office access.",
    descriptionAr: "حساب عميل في المتجر الإلكتروني. لا يمنح أي صلاحية إدارية.",
    scopes: ["GLOBAL"],
    permissions: [],
  },
];

export const SUPER_ADMIN_ROLE_KEY = "super_admin";
