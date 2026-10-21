import "server-only";
import type { NavSection } from "@/components/admin/nav-types";
import type { UserActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import type { PermissionKey } from "@/server/rbac/permissions";

type NavDefinition = {
  section: NavSection["section"];
  items: Array<NavSection["items"][number] & { permission: PermissionKey }>;
};

const NAVIGATION: NavDefinition[] = [
  {
    section: "overview",
    items: [{ href: "/admin", label: "dashboard", icon: "dashboard", permission: "dashboard.view" }],
  },
  {
    section: "catalog",
    items: [
      { href: "/admin/catalog/products", label: "products", icon: "products", permission: "products.view" },
      { href: "/admin/catalog/brands", label: "brands", icon: "brands", permission: "products.view" },
      { href: "/admin/catalog/categories", label: "categories", icon: "categories", permission: "products.view" },
      { href: "/admin/catalog/notes", label: "notes", icon: "notes", permission: "products.view" },
      { href: "/admin/catalog/families", label: "families", icon: "families", permission: "products.view" },
      { href: "/admin/catalog/concentrations", label: "concentrations", icon: "concentrations", permission: "products.view" },
    ],
  },
  {
    section: "organization",
    items: [
      { href: "/admin/organization/countries", label: "countries", icon: "countries", permission: "organization.view" },
      { href: "/admin/organization/legal-entities", label: "legalEntities", icon: "legalEntities", permission: "organization.view" },
      { href: "/admin/organization/stores", label: "stores", icon: "stores", permission: "organization.view" },
      { href: "/admin/organization/warehouses", label: "warehouses", icon: "warehouses", permission: "organization.view" },
    ],
  },
  {
    section: "access",
    items: [
      { href: "/admin/access/users", label: "users", icon: "users", permission: "users.view" },
      { href: "/admin/access/roles", label: "roles", icon: "roles", permission: "users.view" },
      { href: "/admin/access/audit", label: "audit", icon: "audit", permission: "audit.view" },
    ],
  },
];

/**
 * Navigation visible to this actor. Hiding links is a convenience only:
 * every page and action enforces its own permission on the server.
 */
export function navigationFor(actor: UserActor): NavSection[] {
  return NAVIGATION.map((section) => ({
    section: section.section,
    items: section.items
      .filter((item) => can(actor, item.permission, item.permission === "audit.view" ? "global" : "any"))
      .map(({ permission: _permission, ...item }) => item),
  })).filter((section) => section.items.length > 0);
}
