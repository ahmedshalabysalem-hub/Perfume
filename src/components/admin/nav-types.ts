// Shared between the server (filtering) and the client sidebar (rendering).

export type NavIcon =
  | "dashboard"
  | "products"
  | "brands"
  | "categories"
  | "notes"
  | "families"
  | "concentrations"
  | "countries"
  | "legalEntities"
  | "stores"
  | "warehouses"
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
  | "countries"
  | "legalEntities"
  | "stores"
  | "warehouses"
  | "users"
  | "roles"
  | "audit";

export type NavSection = {
  section: "overview" | "catalog" | "organization" | "access";
  items: Array<{ href: string; label: NavLabel; icon: NavIcon }>;
};
