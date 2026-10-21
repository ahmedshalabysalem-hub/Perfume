import "server-only";
import type { ServiceContext } from "@/server/context";
import { flattenTree } from "./categories.service";
import { getProductFormOptions } from "./products.service";

/** Serializable option lists for the product editor (categories ordered as a tree). */
export async function productEditorOptions(ctx: ServiceContext) {
  const options = await getProductFormOptions(ctx);
  return {
    brands: options.brands,
    concentrations: options.concentrations,
    families: options.families,
    notes: options.notes,
    categories: flattenTree(options.categories),
    countries: options.countries.map((country) => ({
      code: country.code,
      nameEn: country.nameEn,
      nameAr: country.nameAr,
      currencyCode: country.currencyCode,
      minorUnits: country.currency.minorUnits,
      pricesIncludeTax: country.pricesIncludeTax,
      isActive: country.isActive,
    })),
  };
}

export type ProductEditorOptions = Awaited<ReturnType<typeof productEditorOptions>>;
