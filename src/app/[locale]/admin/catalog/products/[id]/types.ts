// Serializable shapes passed from the product page (server) to its client panels.

export type MarketDto = {
  code: string;
  nameEn: string;
  nameAr: string;
  currencyCode: string;
  minorUnits: number;
  pricesIncludeTax: boolean;
  isActive: boolean;
  /** Whether the current user may change prices in this market. */
  editable: boolean;
};

export type PriceDto = {
  countryCode: string;
  currencyCode: string;
  amount: string;
  compareAtAmount: string | null;
  isActive: boolean;
};

export type VariantDto = {
  id: string;
  sku: string;
  barcode: string | null;
  barcodeType: string | null;
  barcodeSource: string | null;
  nameEn: string | null;
  nameAr: string | null;
  sizeMl: string | null;
  weightGrams: number | null;
  isTester: boolean;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  trackInventory: boolean;
  trackBatches: boolean;
  trackExpiry: boolean;
  sortOrder: number;
  prices: PriceDto[];
};

export type ImageDto = {
  id: string;
  url: string;
  altEn: string | null;
  altAr: string | null;
  width: number | null;
  height: number | null;
};

export type ComplianceDto = {
  id: string;
  countryCode: string;
  authority: string;
  referenceType: string;
  referenceNumber: string | null;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED" | "NOT_REQUIRED";
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  editable: boolean;
};

export type NoteOption = { id: string; nameEn: string; nameAr: string; isActive: boolean };
