"use client";

import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { Field } from "@/components/forms/field";
import { SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { AUDIENCES, PRODUCT_TYPES, productSchema } from "@/lib/schemas/catalog";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import { createProductAction, updateProductAction } from "./actions";

type Values = z.input<typeof productSchema>;

export type Option = { id: string; nameEn: string; nameAr: string; isActive: boolean };
export type CategoryOption = Option & { depth: number };

export type ProductFormOptions = {
  brands: Option[];
  categories: CategoryOption[];
  concentrations: Option[];
  families: Option[];
};

export type ProductFormDefaults = {
  brandId: string;
  type: (typeof PRODUCT_TYPES)[number];
  slug: string;
  nameEn: string;
  nameAr: string;
  shortDescriptionEn: string;
  shortDescriptionAr: string;
  descriptionEn: string;
  descriptionAr: string;
  audience: "" | (typeof AUDIENCES)[number];
  concentrationId: string;
  fragranceFamilyId: string;
  categoryIds: string[];
  primaryCategoryId: string;
  launchYear: string;
  countryOfOriginCode: string;
  manufacturerName: string;
};

export const EMPTY_PRODUCT: ProductFormDefaults = {
  brandId: "",
  type: "FRAGRANCE",
  slug: "",
  nameEn: "",
  nameAr: "",
  shortDescriptionEn: "",
  shortDescriptionAr: "",
  descriptionEn: "",
  descriptionAr: "",
  audience: "",
  concentrationId: "",
  fragranceFamilyId: "",
  categoryIds: [],
  primaryCategoryId: "",
  launchYear: "",
  countryOfOriginCode: "",
  manufacturerName: "",
};

/** Active options plus the currently selected one (which may have been retired). */
function selectable(options: Option[], current: string, locale: string) {
  return options
    .filter((option) => option.isActive || option.id === current)
    .map((option) => ({ value: option.id, label: localized(locale, option.nameAr, option.nameEn) }));
}

function CategoryPicker({
  form,
  categories,
  disabled,
}: {
  form: UseFormReturn<Values>;
  categories: CategoryOption[];
  disabled?: boolean;
}) {
  const t = useTranslations("products.fields");
  const locale = useLocale();
  const selected = (useWatch({ control: form.control, name: "categoryIds" }) ?? []) as string[];
  const error = form.formState.errors.categoryIds?.message;
  const toggle = (id: string, checked: boolean) => {
    const next = checked ? [...selected, id] : selected.filter((value) => value !== id);
    form.setValue("categoryIds", next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    if (!checked && form.getValues("primaryCategoryId") === id)
      form.setValue("primaryCategoryId", "", { shouldDirty: true });
  };
  return (
    <Field id="categoryIds" label={t("categories")} error={error}>
      <div
        id="categoryIds"
        role="group"
        className="max-h-56 overflow-y-auto rounded-md border bg-card p-2"
        data-field="categoryIds"
      >
        {categories
          .filter((category) => category.isActive || selected.includes(category.id))
          .map((category) => (
            <label
              key={category.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              style={{ paddingInlineStart: `${0.5 + category.depth * 1.25}rem` }}
            >
              <Checkbox
                checked={selected.includes(category.id)}
                disabled={disabled}
                onChange={(event) => toggle(category.id, event.target.checked)}
                data-category={category.nameEn}
              />
              {localized(locale, category.nameAr, category.nameEn)}
            </label>
          ))}
      </div>
    </Field>
  );
}

export function ProductForm({
  productId,
  defaults,
  options,
  readOnly = false,
}: {
  productId?: string;
  defaults: ProductFormDefaults;
  options: ProductFormOptions;
  readOnly?: boolean;
}) {
  const t = useTranslations("products");
  const common = useTranslations("common");
  const typeLabels = useTranslations("productType");
  const audienceLabels = useTranslations("audience");
  const locale = useLocale();
  const router = useRouter();
  const form = useForm<Values>({ resolver: formResolver(productSchema), defaultValues: defaults });
  const submit = useActionSubmit(form.setError);
  const categoryIds = (useWatch({ control: form.control, name: "categoryIds" }) ?? []) as string[];

  const onSubmit = form.handleSubmit(async (values) => {
    if (productId) {
      const result = await submit(() => updateProductAction(productId, values), t("updated"));
      if (result !== null) form.reset(values);
      return;
    }
    const result = await submit(() => createProductAction(values), t("created"));
    if (result) router.push(`/admin/catalog/products/${result.id}`);
  });

  const primaryOptions = options.categories
    .filter((category) => categoryIds.includes(category.id))
    .map((category) => ({ value: category.id, label: localized(locale, category.nameAr, category.nameEn) }));

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" data-testid="product-form">
      <fieldset disabled={readOnly} className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput form={form} name="nameEn" label={common("nameEn")} required dir="ltr" />
          <TextInput form={form} name="nameAr" label={common("nameAr")} required dir="rtl" />
          <SelectInput
            form={form}
            name="brandId"
            label={t("fields.brand")}
            required
            options={selectable(options.brands, defaults.brandId, locale)}
            placeholder={common("selectPlaceholder")}
          />
          <SelectInput
            form={form}
            name="type"
            label={t("fields.type")}
            required
            options={PRODUCT_TYPES.map((type) => ({ value: type, label: typeLabels(type) }))}
          />
          <SelectInput
            form={form}
            name="audience"
            label={t("fields.audience")}
            options={AUDIENCES.map((audience) => ({ value: audience, label: audienceLabels(audience) }))}
            placeholder={common("notSet")}
          />
          <TextInput form={form} name="slug" label={common("slug")} description={common("slugHint")} dir="ltr" />
          <SelectInput
            form={form}
            name="concentrationId"
            label={t("fields.concentration")}
            options={selectable(options.concentrations, defaults.concentrationId, locale)}
            placeholder={common("notSet")}
          />
          <SelectInput
            form={form}
            name="fragranceFamilyId"
            label={t("fields.family")}
            options={selectable(options.families, defaults.fragranceFamilyId, locale)}
            placeholder={common("notSet")}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <CategoryPicker form={form} categories={options.categories} disabled={readOnly} />
          <SelectInput
            form={form}
            name="primaryCategoryId"
            label={t("fields.primaryCategory")}
            options={primaryOptions}
            placeholder={common("notSet")}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <TextAreaInput
            form={form}
            name="shortDescriptionEn"
            label={t("fields.shortDescriptionEn")}
            dir="ltr"
            rows={2}
          />
          <TextAreaInput
            form={form}
            name="shortDescriptionAr"
            label={t("fields.shortDescriptionAr")}
            dir="rtl"
            rows={2}
          />
          <TextAreaInput form={form} name="descriptionEn" label={common("descriptionEn")} dir="ltr" rows={5} />
          <TextAreaInput form={form} name="descriptionAr" label={common("descriptionAr")} dir="rtl" rows={5} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <TextInput form={form} name="launchYear" label={t("fields.launchYear")} inputMode="numeric" dir="ltr" />
          <TextInput
            form={form}
            name="countryOfOriginCode"
            label={t("fields.countryOfOrigin")}
            dir="ltr"
            placeholder="FR"
          />
          <TextInput form={form} name="manufacturerName" label={t("fields.manufacturer")} />
        </div>
      </fieldset>

      {readOnly ? null : (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="submit" disabled={form.formState.isSubmitting} data-testid="product-form-submit">
            {form.formState.isSubmitting ? common("saving") : productId ? common("save") : common("create")}
          </Button>
        </div>
      )}
    </form>
  );
}
