// Shared between the server (filtering) and the client sidebar (rendering).

export type NavIcon =
  | "dashboard"
  | "products"
  | "brands"
  | "categories"
  | "notes"
  | "families"
  | "concentrations"
  | "stock"
  | "batches"
  | "orders"
  | "countries"
  | "legalEntities"
  | "stores"
  | "warehouses"
  | "suppliers"
  | "users"
  | "roles"
  | "audit";

export type NavLabel =
  | "dashboard"
  | "products"
  | "brands"
  | "categories"
  | "notes"
  | "families"
  | "concentrations"
  | "stock"
  | "batches"
  | "orders"
  | "countries"
  | "legalEntities"
  | "stores"
  | "warehouses"
  | "suppliers"
  | "users"
  | "roles"
  | "audit";

export type NavSection = {
  section: "overview" | "sales" | "catalog" | "inventory" | "procurement" | "organization" | "access";
  items: Array<{ href: string; label: NavLabel; icon: NavIcon }>;
};
