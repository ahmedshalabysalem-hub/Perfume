"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { ActivationToggle } from "@/components/admin/activation-toggle";
import { FormDialog } from "@/components/admin/form-dialog";
import { SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { categorySchema } from "@/lib/schemas/catalog";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import { createCategoryAction, setCategoryActiveAction, updateCategoryAction } from "./actions";

type Values = z.input<typeof categorySchema>;
export type CategoryOption = { id: string; parentId: string | null; nameEn: string; nameAr: string; depth: number; isActive: boolean };
export type CategoryFormValues = {
  slug: string;
  parentId: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  sortOrder: string;
};

const EMPTY: CategoryFormValues = { slug: "", parentId: "", nameEn: "", nameAr: "", descriptionEn: "", descriptionAr: "", sortOrder: "0" };

/** Ids of a category and all of its descendants (cannot be chosen as its parent). */
function subtreeIds(categories: CategoryOption[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        grew = true;
      }
    }
  }
  return ids;
}

function CategoryForm({
  categoryId,
  defaults,
  categories,
  onDone,
}: {
  categoryId?: string;
  defaults: CategoryFormValues;
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const t = useTranslations("categories");
  const common = useTranslations("common");
  const locale = useLocale();
  const form = useForm<Values>({ resolver: formResolver(categorySchema), defaultValues: defaults });
  const submit = useActionSubmit(form.setError);
  const excluded = categoryId ? subtreeIds(categories, categoryId) : new Set<string>();
  const parentOptions = categories
    .filter((category) => !excluded.has(category.id) && (category.isActive || category.id === defaults.parentId))
    .map((category) => ({
      value: category.id,
      label: `${"— ".repeat(category.depth)}${localized(locale, category.nameAr, category.nameEn)}`,
    }));

  const onSubmit = form.handleSubmit(async (values) => {
    const result = categoryId
      ? await submit(() => updateCategoryAction(categoryId, values), t("updated"))
      : await submit(() => createCategoryAction(values), t("created"));
    if (result !== null) onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="category-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="nameEn" label={common("nameEn")} required dir="ltr" />
        <TextInput form={form} name="nameAr" label={common("nameAr")} required dir="rtl" />
      </div>
      <SelectInput form={form} name="parentId" label={t("parent")} options={parentOptions} placeholder={t("noParent")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="slug" label={common("slug")} description={common("slugHint")} dir="ltr" />
        <TextInput form={form} name="sortOrder" label={common("sortOrder")} inputMode="numeric" dir="ltr" />
      </div>
      <TextAreaInput form={form} name="descriptionEn" label={common("descriptionEn")} dir="ltr" rows={2} />
      <TextAreaInput form={form} name="descriptionAr" label={common("descriptionAr")} dir="rtl" rows={2} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

export function NewCategoryButton({ categories }: { categories: CategoryOption[] }) {
  const t = useTranslations("categories");
  return (
    <FormDialog trigger={<><Plus /> {t("new")}</>} title={t("createTitle")} wide testId="new-category">
      {(close) => <CategoryForm defaults={EMPTY} categories={categories} onDone={close} />}
    </FormDialog>
  );
}

export function CategoryRowActions({
  id,
  isActive,
  defaults,
  categories,
}: {
  id: string;
  isActive: boolean;
  defaults: CategoryFormValues;
  categories: CategoryOption[];
}) {
  const t = useTranslations("categories");
  const common = useTranslations("common");
  return (
    <div className="flex justify-end gap-2">
      <FormDialog trigger={<><Pencil /> {common("edit")}</>} title={t("editTitle")} variant="outline" size="sm" wide>
        {(close) => <CategoryForm categoryId={id} defaults={defaults} categories={categories} onDone={close} />}
      </FormDialog>
      <ActivationToggle
        isActive={isActive}
        setActive={(active) => setCategoryActiveAction(id, active)}
        deactivateConfirm={t("deactivateConfirm")}
        activatedMessage={t("activated")}
        deactivatedMessage={t("deactivated")}
      />
    </div>
  );
}
