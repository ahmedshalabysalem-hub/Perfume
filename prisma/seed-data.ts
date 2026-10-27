/**
 * Development seed data. Everything here is fictional: organisations, brands
 * and products do not represent real companies. Registration and tax numbers
 * are left empty on purpose — real values must come from the business.
 *
 * Barcodes are either internal Code 128 values (prefix "PF") or EAN-13 codes
 * from the GS1 prefix 952, which GS1 reserves for demonstrations and examples.
 */

export const CURRENCIES = [
  { code: "SAR", nameEn: "Saudi Riyal", nameAr: "ريال سعودي", symbolEn: "SAR", symbolAr: "ر.س", minorUnits: 2 },
  { code: "EGP", nameEn: "Egyptian Pound", nameAr: "جنيه مصري", symbolEn: "EGP", symbolAr: "ج.م", minorUnits: 2 },
] as const;

export const COUNTRIES = [
  {
    code: "SA",
    nameEn: "Saudi Arabia",
    nameAr: "المملكة العربية السعودية",
    currencyCode: "SAR",
    defaultLocale: "ar",
    timezone: "Asia/Riyadh",
    phoneCode: "+966",
  },
  {
    code: "EG",
    nameEn: "Egypt",
    nameAr: "مصر",
    currencyCode: "EGP",
    defaultLocale: "ar",
    timezone: "Africa/Cairo",
    phoneCode: "+20",
  },
] as const;

export const LEGAL_ENTITIES = [
  {
    code: "DEMO-SA",
    countryCode: "SA",
    legalNameEn: "Demo Fragrance Trading Company (KSA)",
    legalNameAr: "شركة العطور التجريبية للتجارة (السعودية)",
    tradeNameEn: "Maison Demo",
    tradeNameAr: "ميزون ديمو",
    city: "Riyadh",
  },
  {
    code: "DEMO-EG",
    countryCode: "EG",
    legalNameEn: "Demo Fragrance Egypt LLC",
    legalNameAr: "شركة العطور التجريبية مصر ذ.م.م",
    tradeNameEn: "Maison Demo Egypt",
    tradeNameAr: "ميزون ديمو مصر",
    city: "Cairo",
  },
] as const;

export const STORES = [
  {
    code: "SA-ONLINE",
    legalEntityCode: "DEMO-SA",
    type: "ONLINE",
    nameEn: "Online Store — Saudi Arabia",
    nameAr: "المتجر الإلكتروني — السعودية",
    timezone: "Asia/Riyadh",
    currencyCode: "SAR",
    city: null,
    fulfilmentWarehouseCode: "SA-RUH-WH1",
  },
  {
    code: "SA-RUH-01",
    legalEntityCode: "DEMO-SA",
    type: "RETAIL",
    nameEn: "Riyadh Boutique",
    nameAr: "بوتيك الرياض",
    timezone: "Asia/Riyadh",
    currencyCode: "SAR",
    city: "Riyadh",
  },
  {
    code: "EG-ONLINE",
    legalEntityCode: "DEMO-EG",
    type: "ONLINE",
    nameEn: "Online Store — Egypt",
    nameAr: "المتجر الإلكتروني — مصر",
    timezone: "Africa/Cairo",
    currencyCode: "EGP",
    city: null,
    fulfilmentWarehouseCode: "EG-CAI-WH1",
  },
] as const;

export const WAREHOUSES = [
  {
    code: "SA-RUH-WH1",
    legalEntityCode: "DEMO-SA",
    nameEn: "Riyadh Main Warehouse",
    nameAr: "مستودع الرياض الرئيسي",
    timezone: "Asia/Riyadh",
    city: "Riyadh",
  },
  {
    code: "EG-CAI-WH1",
    legalEntityCode: "DEMO-EG",
    nameEn: "Cairo Warehouse",
    nameAr: "مستودع القاهرة",
    timezone: "Africa/Cairo",
    city: "Cairo",
  },
] as const;

export const CONCENTRATIONS = [
  { code: "EXTRAIT", nameEn: "Extrait de Parfum", nameAr: "إكستريه دو بارفان", sortOrder: 10 },
  { code: "EDP", nameEn: "Eau de Parfum", nameAr: "أو دو بارفان", sortOrder: 20 },
  { code: "EDT", nameEn: "Eau de Toilette", nameAr: "أو دو تواليت", sortOrder: 30 },
  { code: "EDC", nameEn: "Eau de Cologne", nameAr: "أو دو كولونيا", sortOrder: 40 },
  { code: "PERFUME_OIL", nameEn: "Perfume Oil", nameAr: "دهن عطري", sortOrder: 50 },
  { code: "BODY_MIST", nameEn: "Body Mist", nameAr: "معطر الجسم", sortOrder: 60 },
] as const;

export const FAMILIES = [
  { code: "OUD", nameEn: "Oud", nameAr: "عودي", sortOrder: 10 },
  { code: "AMBER", nameEn: "Amber / Oriental", nameAr: "عنبري / شرقي", sortOrder: 20 },
  { code: "FLORAL", nameEn: "Floral", nameAr: "زهري", sortOrder: 30 },
  { code: "WOODY", nameEn: "Woody", nameAr: "خشبي", sortOrder: 40 },
  { code: "FRESH", nameEn: "Fresh / Citrus", nameAr: "منعش / حمضي", sortOrder: 50 },
  { code: "MUSK", nameEn: "Musk", nameAr: "مسكي", sortOrder: 60 },
  { code: "GOURMAND", nameEn: "Gourmand", nameAr: "حلو (غورماند)", sortOrder: 70 },
  { code: "AROMATIC", nameEn: "Aromatic", nameAr: "عطري (أروماتيك)", sortOrder: 80 },
] as const;

export const NOTES = [
  { slug: "oud", nameEn: "Oud", nameAr: "عود" },
  { slug: "taif-rose", nameEn: "Taif Rose", nameAr: "ورد طائفي" },
  { slug: "saffron", nameEn: "Saffron", nameAr: "زعفران" },
  { slug: "amber", nameEn: "Amber", nameAr: "عنبر" },
  { slug: "white-musk", nameEn: "White Musk", nameAr: "مسك أبيض" },
  { slug: "sandalwood", nameEn: "Sandalwood", nameAr: "صندل" },
  { slug: "bergamot", nameEn: "Bergamot", nameAr: "برغموت" },
  { slug: "vanilla", nameEn: "Vanilla", nameAr: "فانيليا" },
  { slug: "jasmine", nameEn: "Jasmine", nameAr: "ياسمين" },
  { slug: "patchouli", nameEn: "Patchouli", nameAr: "باتشولي" },
  { slug: "cardamom", nameEn: "Cardamom", nameAr: "هيل" },
  { slug: "leather", nameEn: "Leather", nameAr: "جلد" },
  { slug: "vetiver", nameEn: "Vetiver", nameAr: "فيتيفر" },
  { slug: "frankincense", nameEn: "Frankincense", nameAr: "لبان" },
  { slug: "orange-blossom", nameEn: "Orange Blossom", nameAr: "زهر البرتقال" },
  { slug: "pink-pepper", nameEn: "Pink Pepper", nameAr: "فلفل وردي" },
  { slug: "cedarwood", nameEn: "Cedarwood", nameAr: "خشب الأرز" },
  { slug: "tonka-bean", nameEn: "Tonka Bean", nameAr: "حبوب التونكا" },
] as const;

/** Category tree: parents first. */
export const CATEGORIES = [
  { slug: "perfumes", parent: null, nameEn: "Perfumes", nameAr: "العطور", sortOrder: 10 },
  {
    slug: "oriental-perfumes",
    parent: "perfumes",
    nameEn: "Oriental Perfumes",
    nameAr: "العطور الشرقية",
    sortOrder: 11,
  },
  { slug: "floral-perfumes", parent: "perfumes", nameEn: "Floral Perfumes", nameAr: "العطور الزهرية", sortOrder: 12 },
  { slug: "fresh-perfumes", parent: "perfumes", nameEn: "Fresh Perfumes", nameAr: "العطور المنعشة", sortOrder: 13 },
  { slug: "perfume-oils", parent: null, nameEn: "Perfume Oils", nameAr: "الدهون العطرية", sortOrder: 20 },
  { slug: "gift-sets", parent: null, nameEn: "Gift Sets", nameAr: "مجموعات الهدايا", sortOrder: 30 },
  { slug: "body-and-hair", parent: null, nameEn: "Body & Hair Mists", nameAr: "معطرات الجسم والشعر", sortOrder: 40 },
] as const;

export const BRANDS = [
  {
    slug: "qamar-atelier",
    nameEn: "Qamar Atelier",
    nameAr: "أتيليه قمر",
    countryOfOriginCode: "SA",
    descriptionEn: "Fictional demo house of modern oud and rose compositions.",
    descriptionAr: "دار عطور تجريبية للعود والورد بأسلوب عصري.",
  },
  {
    slug: "nile-and-sand",
    nameEn: "Nile & Sand",
    nameAr: "نيل ورمال",
    countryOfOriginCode: "EG",
    descriptionEn: "Fictional demo brand inspired by Egyptian botanicals.",
    descriptionAr: "علامة تجريبية مستوحاة من النباتات المصرية.",
  },
  {
    slug: "maison-lumiere-demo",
    nameEn: "Maison Lumière (Demo)",
    nameAr: "ميزون لوميير (تجريبي)",
    countryOfOriginCode: "FR",
    descriptionEn: "Fictional demo brand for French-style eaux de parfum.",
    descriptionAr: "علامة تجريبية لعطور بطابع فرنسي.",
  },
] as const;

type SeedPrice = { country: "SA" | "EG"; amount: string; compareAt?: string };

type SeedVariant = {
  sku: string;
  sizeMl: string | null;
  nameEn?: string;
  nameAr?: string;
  isTester?: boolean;
  /** "gs1-demo" → EAN-13 in the GS1 952 demonstration range; "internal" → Code 128. */
  barcode: { kind: "gs1-demo"; body: string } | { kind: "internal"; value: string } | null;
  trackExpiry?: boolean;
  prices: SeedPrice[];
};

export type SeedProduct = {
  slug: string;
  brand: string;
  type: "FRAGRANCE" | "GIFT_SET" | "BODY_CARE";
  status: "PUBLISHED" | "DRAFT";
  nameEn: string;
  nameAr: string;
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  descriptionEn: string;
  descriptionAr: string;
  audience: "MEN" | "WOMEN" | "UNISEX" | null;
  concentration: string | null;
  family: string | null;
  categories: string[];
  primaryCategory: string;
  notes: { top: string[]; heart: string[]; base: string[] };
  launchYear: number | null;
  variants: SeedVariant[];
};

export const PRODUCTS: SeedProduct[] = [
  {
    slug: "royal-oud-intense",
    brand: "qamar-atelier",
    type: "FRAGRANCE",
    status: "PUBLISHED",
    nameEn: "Royal Oud Intense",
    nameAr: "عود ملكي إنتنس",
    shortDescriptionEn: "Smoky oud wrapped in saffron and Taif rose.",
    shortDescriptionAr: "عود مدخّن يحتضنه الزعفران والورد الطائفي.",
    descriptionEn:
      "A rich extrait that opens with saffron and bergamot, settles into Taif rose and aged oud, and dries down to amber, musk and sandalwood.",
    descriptionAr:
      "عطر مركّز يفتتح بالزعفران والبرغموت، ثم يستقر على الورد الطائفي والعود المعتّق، وينتهي بالعنبر والمسك والصندل.",
    audience: "UNISEX",
    concentration: "EXTRAIT",
    family: "OUD",
    categories: ["perfumes", "oriental-perfumes"],
    primaryCategory: "oriental-perfumes",
    notes: { top: ["saffron", "bergamot"], heart: ["taif-rose", "oud"], base: ["amber", "white-musk", "sandalwood"] },
    launchYear: 2025,
    variants: [
      {
        sku: "QA-ROI-50",
        sizeMl: "50",
        barcode: { kind: "gs1-demo", body: "952000010001" },
        prices: [
          { country: "SA", amount: "650.00" },
          { country: "EG", amount: "7900.00" },
        ],
      },
      {
        sku: "QA-ROI-100",
        sizeMl: "100",
        barcode: { kind: "gs1-demo", body: "952000010002" },
        prices: [
          { country: "SA", amount: "980.00", compareAt: "1150.00" },
          { country: "EG", amount: "11500.00" },
        ],
      },
    ],
  },
  {
    slug: "taif-rose-eau-de-parfum",
    brand: "qamar-atelier",
    type: "FRAGRANCE",
    status: "PUBLISHED",
    nameEn: "Taif Rose Eau de Parfum",
    nameAr: "ورد طائفي أو دو بارفان",
    shortDescriptionEn: "Dewy Taif rose with jasmine and soft musk.",
    shortDescriptionAr: "ورد طائفي ندي مع الياسمين والمسك الناعم.",
    descriptionEn: "A luminous floral built around Taif rose, lifted by pink pepper and softened with white musk.",
    descriptionAr: "عطر زهري مضيء يتمحور حول الورد الطائفي، يرفعه الفلفل الوردي ويليّنه المسك الأبيض.",
    audience: "WOMEN",
    concentration: "EDP",
    family: "FLORAL",
    categories: ["perfumes", "floral-perfumes"],
    primaryCategory: "floral-perfumes",
    notes: { top: ["pink-pepper", "bergamot"], heart: ["taif-rose", "jasmine"], base: ["white-musk", "cedarwood"] },
    launchYear: 2024,
    variants: [
      {
        sku: "QA-TRE-30",
        sizeMl: "30",
        barcode: { kind: "internal", value: "PF0000000101" },
        prices: [
          { country: "SA", amount: "295.00" },
          { country: "EG", amount: "3600.00" },
        ],
      },
      {
        sku: "QA-TRE-75",
        sizeMl: "75",
        barcode: { kind: "internal", value: "PF0000000102" },
        prices: [
          { country: "SA", amount: "540.00" },
          { country: "EG", amount: "6500.00" },
        ],
      },
    ],
  },
  {
    slug: "desert-vetiver",
    brand: "nile-and-sand",
    type: "FRAGRANCE",
    status: "PUBLISHED",
    nameEn: "Desert Vetiver",
    nameAr: "فيتيفر الصحراء",
    shortDescriptionEn: "Dry vetiver, cardamom and cedar.",
    shortDescriptionAr: "فيتيفر جاف مع الهيل وخشب الأرز.",
    descriptionEn: "An aromatic woody scent with a cardamom opening and a dry vetiver and leather base.",
    descriptionAr: "عطر خشبي أروماتيكي يفتتح بالهيل وتستقر قاعدته على الفيتيفر الجاف والجلد.",
    audience: "MEN",
    concentration: "EDT",
    family: "WOODY",
    categories: ["perfumes", "fresh-perfumes"],
    primaryCategory: "fresh-perfumes",
    notes: { top: ["cardamom", "bergamot"], heart: ["vetiver", "cedarwood"], base: ["leather", "tonka-bean"] },
    launchYear: 2023,
    variants: [
      {
        sku: "NS-DVT-100",
        sizeMl: "100",
        barcode: { kind: "gs1-demo", body: "952000020001" },
        prices: [
          { country: "SA", amount: "420.00" },
          { country: "EG", amount: "4950.00" },
        ],
      },
      {
        sku: "NS-DVT-100-T",
        sizeMl: "100",
        nameEn: "100 ml Tester",
        nameAr: "100 مل (تستر)",
        isTester: true,
        barcode: { kind: "internal", value: "PF0000000201" },
        prices: [{ country: "SA", amount: "360.00" }],
      },
    ],
  },
  {
    slug: "musk-al-tahara-oil",
    brand: "nile-and-sand",
    type: "FRAGRANCE",
    status: "PUBLISHED",
    nameEn: "Musk Al Tahara Perfume Oil",
    nameAr: "دهن مسك الطهارة",
    shortDescriptionEn: "Clean white musk perfume oil, alcohol-free.",
    shortDescriptionAr: "دهن مسك أبيض نقي خالٍ من الكحول.",
    descriptionEn:
      "A concentrated, alcohol-free perfume oil of clean white musk with a soft vanilla trail. Available in Saudi Arabia only.",
    descriptionAr: "دهن عطري مركّز خالٍ من الكحول من المسك الأبيض النقي مع لمسة فانيليا ناعمة. متوفر في السعودية فقط.",
    audience: "UNISEX",
    concentration: "PERFUME_OIL",
    family: "MUSK",
    categories: ["perfume-oils"],
    primaryCategory: "perfume-oils",
    notes: { top: ["bergamot"], heart: ["white-musk"], base: ["vanilla", "sandalwood"] },
    launchYear: 2022,
    variants: [
      {
        sku: "NS-MAT-12",
        sizeMl: "12",
        barcode: { kind: "internal", value: "PF0000000301" },
        trackExpiry: true,
        prices: [{ country: "SA", amount: "85.00" }],
      },
    ],
  },
  {
    slug: "amber-nights-gift-set",
    brand: "maison-lumiere-demo",
    type: "GIFT_SET",
    status: "PUBLISHED",
    nameEn: "Amber Nights Gift Set",
    nameAr: "مجموعة ليالي العنبر",
    shortDescriptionEn: "Eau de parfum, body mist and travel spray.",
    shortDescriptionAr: "أو دو بارفان ومعطر للجسم وعبوة سفر.",
    descriptionEn:
      "A gift box with Amber Nights eau de parfum (100 ml), matching body mist (75 ml) and a 10 ml travel spray.",
    descriptionAr: "علبة هدايا تضم أو دو بارفان ليالي العنبر (100 مل) ومعطر جسم مطابق (75 مل) وعبوة سفر 10 مل.",
    audience: "UNISEX",
    concentration: "EDP",
    family: "AMBER",
    categories: ["gift-sets"],
    primaryCategory: "gift-sets",
    notes: { top: ["orange-blossom"], heart: ["amber", "frankincense"], base: ["vanilla", "patchouli"] },
    launchYear: 2025,
    variants: [
      {
        sku: "ML-ANG-SET",
        sizeMl: null,
        nameEn: "Gift set",
        nameAr: "مجموعة هدية",
        barcode: { kind: "internal", value: "PF0000000401" },
        prices: [
          { country: "SA", amount: "720.00" },
          { country: "EG", amount: "8400.00" },
        ],
      },
    ],
  },
  {
    slug: "citrus-breeze",
    brand: "maison-lumiere-demo",
    type: "FRAGRANCE",
    status: "DRAFT",
    nameEn: "Citrus Breeze",
    nameAr: "نسيم الحمضيات",
    shortDescriptionEn: "Work in progress — not yet priced.",
    shortDescriptionAr: "قيد الإعداد — لم يُسعّر بعد.",
    descriptionEn: "Draft product used to demonstrate unpublished catalogue items.",
    descriptionAr: "منتج مسودة لعرض عناصر الكتالوج غير المنشورة.",
    audience: "UNISEX",
    concentration: "EDT",
    family: "FRESH",
    categories: ["perfumes", "fresh-perfumes"],
    primaryCategory: "fresh-perfumes",
    notes: { top: ["bergamot"], heart: ["orange-blossom"], base: ["white-musk"] },
    launchYear: null,
    variants: [{ sku: "ML-CBR-50", sizeMl: "50", barcode: null, prices: [] }],
  },
];

/** Demo staff accounts (development only). */
export const DEMO_STAFF = [
  {
    email: "catalog@perfume.local",
    name: "Catalogue Manager (Demo)",
    role: "catalog_manager",
    scope: { type: "GLOBAL" as const },
  },
  {
    email: "manager.sa@perfume.local",
    name: "KSA Business Manager (Demo)",
    role: "business_manager",
    scope: { type: "COUNTRY" as const, countryCode: "SA" },
  },
  {
    email: "procurement.sa@perfume.local",
    name: "KSA Procurement (Demo)",
    role: "procurement_staff",
    scope: { type: "COUNTRY" as const, countryCode: "SA" },
  },
  {
    email: "cashier.riyadh@perfume.local",
    name: "Riyadh Cashier (Demo)",
    role: "cashier",
    scope: { type: "STORE" as const, storeCode: "SA-RUH-01" },
  },
];

/** Fictional supplier; no tax number so no registration is ever implied. */
export const SUPPLIERS = [
  {
    code: "DEMO-SUP-01",
    legalEntityCode: "DEMO-SA",
    nameEn: "Demo Oud Distribution Co.",
    nameAr: "شركة توزيع العود التجريبية",
    supplierCountryCode: "SA",
    paymentTerms: "NET" as const,
    paymentTermDays: 30,
    currencyCode: "SAR",
    city: "Jeddah",
    contacts: [{ name: "Demo Purchasing Desk", jobTitle: "Sales", isPrimary: true }],
    products: [
      { sku: "QA-ROI-50", supplierSku: "DOD-ROI-050", lastCostAmount: "95.00" },
      { sku: "QA-ROI-100", supplierSku: "DOD-ROI-100", lastCostAmount: "160.00" },
    ],
  },
];
