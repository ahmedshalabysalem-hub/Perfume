"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { brandSchema } from "@/lib/schemas/catalog";
import type { z } from "@/lib/validation/zod";
import { createBrandAction, updateBrandAction } from "./actions";

type Values = z.input<typeof brandSchema>;

export type BrandFormValues = {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  countryOfOriginCode: string;
  websiteUrl: string;
};

export const EMPTY_BRAND: BrandFormValues = {
  slug: "",
  nameEn: "",
  nameAr: "",
  descriptionEn: "",
  descriptionAr: "",
  countryOfOriginCode: "",
  websiteUrl: "",
};

export function BrandForm({
  brandId,
  defaults,
  onDone,
}: {
  brandId?: string;
  defaults: BrandFormValues;
  onDone: () => void;
}) {
  const t = useTranslations("brands");
  const common = useTranslations("common");
  const form = useForm<Values>({ resolver: formResolver(brandSchema), defaultValues: defaults });
  const submit = useActionSubmit(form.setError);

  const onSubmit = form.handleSubmit(async (values) => {
    const result = brandId
      ? await submit(() => updateBrandAction(brandId, values), t("updated"))
      : await submit(() => createBrandAction(values), t("created"));
    if (result !== null) onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="brand-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="nameEn" label={common("nameEn")} required dir="ltr" />
        <TextInput form={form} name="nameAr" label={common("nameAr")} required dir="rtl" />
      </div>
      <TextInput form={form} name="slug" label={common("slug")} description={common("slugHint")} dir="ltr" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="countryOfOriginCode" label={t("countryOfOrigin")} dir="ltr" placeholder="FR" />
        <TextInput
          form={form}
          name="websiteUrl"
          label={t("website")}
          dir="ltr"
          type="url"
          inputMode="url"
          placeholder="https://"
        />
      </div>
      <TextAreaInput form={form} name="descriptionEn" label={common("descriptionEn")} dir="ltr" />
      <TextAreaInput form={form} name="descriptionAr" label={common("descriptionAr")} dir="rtl" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="brand-form-submit">
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}
