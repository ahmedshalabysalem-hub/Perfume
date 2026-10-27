/**
 * Permission catalogue — the single source of truth for permission keys.
 * `npm run db:sync-rbac` (also run by the seed) upserts these into the
 * `permissions` table and refreshes system-role grants.
 *
 * `available: false` marks permissions reserved for modules that are not yet
 * implemented; granting them has no effect until the module ships. They are
 * declared now so role definitions are stable across phases.
 */
export type PermissionDefinition = {
  key: string;
  module: string;
  en: string;
  ar: string;
  sensitive?: boolean;
  available: boolean;
};

const definitions = [
  // Back office
  {
    key: "admin.access",
    module: "admin",
    en: "Access the back office",
    ar: "الدخول إلى لوحة الإدارة",
    available: true,
  },
  { key: "dashboard.view", module: "admin", en: "View dashboard KPIs", ar: "عرض مؤشرات لوحة التحكم", available: true },

  // Catalogue
  {
    key: "products.view",
    module: "catalog",
    en: "View products and variants",
    ar: "عرض المنتجات والأصناف",
    available: true,
  },
  {
    key: "products.create",
    module: "catalog",
    en: "Create products and variants",
    ar: "إنشاء المنتجات والأصناف",
    available: true,
  },
  {
    key: "products.update",
    module: "catalog",
    en: "Edit products and variants",
    ar: "تعديل المنتجات والأصناف",
    available: true,
  },
  {
    key: "products.publish",
    module: "catalog",
    en: "Publish and unpublish products",
    ar: "نشر المنتجات وإلغاء نشرها",
    available: true,
  },
  {
    key: "products.prices.update",
    module: "catalog",
    en: "Manage market prices (scoped by country)",
    ar: "إدارة أسعار الأسواق (حسب الدولة)",
    available: true,
  },
  {
    key: "products.compliance.manage",
    module: "catalog",
    en: "Manage product regulatory references",
    ar: "إدارة المراجع التنظيمية للمنتجات",
    available: true,
  },
  {
    key: "catalog.brands.manage",
    module: "catalog",
    en: "Manage brands",
    ar: "إدارة العلامات التجارية",
    available: true,
  },
  {
    key: "catalog.categories.manage",
    module: "catalog",
    en: "Manage categories",
    ar: "إدارة التصنيفات",
    available: true,
  },
  {
    key: "catalog.attributes.manage",
    module: "catalog",
    en: "Manage fragrance notes, families and concentrations",
    ar: "إدارة النوتات والعائلات العطرية والتركيزات",
    available: true,
  },

  // Organisation & access
  {
    key: "organization.view",
    module: "organization",
    en: "View countries, legal entities, stores and warehouses",
    ar: "عرض الدول والكيانات القانونية والمتاجر والمستودعات",
    available: true,
  },
  {
    key: "organization.manage",
    module: "organization",
    en: "Manage countries, legal entities, stores and warehouses",
    ar: "إدارة الدول والكيانات القانونية والمتاجر والمستودعات",
    sensitive: true,
    available: true,
  },
  {
    key: "users.view",
    module: "access",
    en: "View staff users and role assignments",
    ar: "عرض المستخدمين وأدوارهم",
    available: true,
  },
  {
    key: "users.manage",
    module: "access",
    en: "Create staff users, assign roles, reset passwords",
    ar: "إنشاء المستخدمين وتعيين الأدوار وإعادة تعيين كلمات المرور",
    sensitive: true,
    available: true,
  },
  {
    key: "audit.view",
    module: "access",
    en: "View the audit log",
    ar: "عرض سجل التدقيق",
    sensitive: true,
    available: true,
  },

  // Inventory (Phase 2)
  {
    key: "inventory.view",
    module: "inventory",
    en: "View stock levels and movements",
    ar: "عرض المخزون وحركاته",
    available: true,
  },
  {
    key: "inventory.receive",
    module: "inventory",
    en: "Receive goods into stock",
    ar: "استلام البضائع في المخزون",
    available: false,
  },
  {
    key: "inventory.adjust.request",
    module: "inventory",
    en: "Request stock adjustments",
    ar: "طلب تسويات المخزون",
    available: false,
  },
  {
    key: "inventory.adjust.approve",
    module: "inventory",
    en: "Approve stock adjustments and enter opening balances",
    ar: "اعتماد تسويات المخزون وإدخال الأرصدة الافتتاحية",
    sensitive: true,
    available: true,
  },
  {
    key: "inventory.transfer",
    module: "inventory",
    en: "Transfer stock between warehouses",
    ar: "نقل المخزون بين المستودعات",
    available: false,
  },
  { key: "inventory.count", module: "inventory", en: "Perform stock counts", ar: "إجراء الجرد", available: false },
  {
    key: "inventory.batches.manage",
    module: "inventory",
    en: "Verify, release, quarantine and reject batches and correct batch details",
    ar: "التحقق من التشغيلات وإجازتها وإيقافها للفحص ورفضها وتصحيح بياناتها",
    sensitive: true,
    available: true,
  },

  // Procurement (Phase 2)
  {
    key: "suppliers.view",
    module: "procurement",
    en: "View suppliers, contacts and supplier products",
    ar: "عرض الموردين وجهات الاتصال ومنتجات الموردين",
    available: true,
  },
  {
    key: "suppliers.manage",
    module: "procurement",
    en: "Manage suppliers, contacts and supplier products",
    ar: "إدارة الموردين وجهات الاتصال ومنتجات الموردين",
    available: true,
  },
  {
    key: "purchases.view",
    module: "procurement",
    en: "View purchase orders",
    ar: "عرض أوامر الشراء",
    available: false,
  },
  {
    key: "purchases.create",
    module: "procurement",
    en: "Create purchase orders",
    ar: "إنشاء أوامر الشراء",
    available: false,
  },
  {
    key: "purchases.approve",
    module: "procurement",
    en: "Approve purchase orders",
    ar: "اعتماد أوامر الشراء",
    sensitive: true,
    available: false,
  },

  // Sales & customers (Phase 3+)
  { key: "orders.view", module: "sales", en: "View orders", ar: "عرض الطلبات", available: true },
  { key: "orders.create", module: "sales", en: "Create orders", ar: "إنشاء الطلبات", available: false },
  {
    key: "orders.update",
    module: "sales",
    en: "Progress orders through fulfilment",
    ar: "متابعة تنفيذ الطلبات",
    available: true,
  },
  {
    key: "orders.cancel",
    module: "sales",
    en: "Cancel orders",
    ar: "إلغاء الطلبات",
    sensitive: true,
    available: true,
  },
  {
    key: "customers.view",
    module: "crm",
    en: "View customer profiles and order contact details",
    ar: "عرض ملفات العملاء وبيانات التواصل في الطلبات",
    available: true,
  },
  {
    key: "customers.manage",
    module: "crm",
    en: "Edit customer profiles and notes",
    ar: "تعديل ملفات العملاء والملاحظات",
    available: false,
  },
  {
    key: "customers.export",
    module: "crm",
    en: "Export or anonymise customer data",
    ar: "تصدير بيانات العملاء أو إخفاء هويتهم",
    sensitive: true,
    available: false,
  },

  // Payments (Phase 4)
  {
    key: "payments.verify",
    module: "payments",
    en: "Verify bank transfers and COD collections",
    ar: "التحقق من التحويلات والتحصيل عند الاستلام",
    sensitive: true,
    available: false,
  },
  {
    key: "payments.refund.request",
    module: "payments",
    en: "Request refunds",
    ar: "طلب المبالغ المستردة",
    available: false,
  },
  {
    key: "payments.refund.approve",
    module: "payments",
    en: "Approve refunds",
    ar: "اعتماد المبالغ المستردة",
    sensitive: true,
    available: false,
  },

  // POS (Phase 4/6)
  { key: "pos.sell", module: "pos", en: "Sell at the point of sale", ar: "البيع في نقطة البيع", available: false },
  {
    key: "pos.session.manage",
    module: "pos",
    en: "Open, close and reconcile cashier sessions",
    ar: "فتح وإغلاق ومطابقة جلسات الكاشير",
    sensitive: true,
    available: false,
  },
  {
    key: "pos.discount.override",
    module: "pos",
    en: "Apply manual POS discounts",
    ar: "تطبيق خصومات يدوية في نقطة البيع",
    sensitive: true,
    available: false,
  },

  // Finance (Phase 5)
  {
    key: "accounting.view",
    module: "accounting",
    en: "View accounting records",
    ar: "عرض السجلات المحاسبية",
    available: false,
  },
  {
    key: "accounting.post",
    module: "accounting",
    en: "Post journal entries",
    ar: "ترحيل القيود اليومية",
    sensitive: true,
    available: false,
  },
  { key: "expenses.manage", module: "accounting", en: "Record expenses", ar: "تسجيل المصروفات", available: false },
  {
    key: "reports.view",
    module: "reports",
    en: "View operational reports",
    ar: "عرض التقارير التشغيلية",
    available: false,
  },
  {
    key: "reports.financial.view",
    module: "reports",
    en: "View financial reports",
    ar: "عرض التقارير المالية",
    sensitive: true,
    available: false,
  },

  // Marketing (Phase 6)
  {
    key: "marketing.manage",
    module: "marketing",
    en: "Manage coupons, promotions and campaigns",
    ar: "إدارة القسائم والعروض والحملات",
    available: false,
  },
  {
    key: "loyalty.manage",
    module: "marketing",
    en: "Adjust loyalty points",
    ar: "تعديل نقاط الولاء",
    sensitive: true,
    available: false,
  },
  {
    key: "reviews.moderate",
    module: "marketing",
    en: "Moderate product reviews",
    ar: "مراجعة تقييمات المنتجات",
    available: false,
  },

  // Integrations (Phase 7)
  {
    key: "integrations.manage",
    module: "integrations",
    en: "Manage integrations and API clients",
    ar: "إدارة التكاملات وعملاء الواجهات البرمجية",
    sensitive: true,
    available: false,
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof definitions)[number]["key"];

export const PERMISSIONS: readonly PermissionDefinition[] = definitions;

export const PERMISSION_KEYS: readonly PermissionKey[] = definitions.map((d) => d.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
