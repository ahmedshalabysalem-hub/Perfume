"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { productContentSchema } from "@/lib/schemas/catalog";
import type { z } from "@/lib/validation/zod";
import { updateProductContentAction } from "../actions";

type Values = z.input<typeof productContentSchema>;
export type ContentDefaults = Record<keyof Values, string>;

export function ContentForm({
  productId,
  defaults,
  readOnly,
}: {
  productId: string;
  defaults: ContentDefaults;
  readOnly: boolean;
}) {
  const t = useTranslations("products");
  const common = useTranslations("common");
  const form = useForm<Values>({ resolver: formResolver(productContentSchema), defaultValues: defaults });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submit(() => updateProductContentAction(productId, values), t("updated"));
    if (result !== null) form.reset(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-2">
        <TextAreaInput form={form} name="ingredientsEn" label={t("fields.ingredientsEn")} dir="ltr" rows={4} />
        <TextAreaInput form={form} name="ingredientsAr" label={t("fields.ingredientsAr")} dir="rtl" rows={4} />
        <TextAreaInput form={form} name="warningsEn" label={t("fields.warningsEn")} dir="ltr" rows={3} />
        <TextAreaInput form={form} name="warningsAr" label={t("fields.warningsAr")} dir="rtl" rows={3} />
        <TextAreaInput form={form} name="storageInstructionsEn" label={t("fields.storageEn")} dir="ltr" rows={2} />
        <TextAreaInput form={form} name="storageInstructionsAr" label={t("fields.storageAr")} dir="rtl" rows={2} />
        <TextInput form={form} name="seoTitleEn" label={t("fields.seoTitleEn")} dir="ltr" />
        <TextInput form={form} name="seoTitleAr" label={t("fields.seoTitleAr")} dir="rtl" />
        <TextAreaInput form={form} name="seoDescriptionEn" label={t("fields.seoDescriptionEn")} dir="ltr" rows={2} />
        <TextAreaInput form={form} name="seoDescriptionAr" label={t("fields.seoDescriptionAr")} dir="rtl" rows={2} />
      </fieldset>
      {readOnly ? null : (
        <div className="flex justify-end border-t pt-4">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? common("saving") : common("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
