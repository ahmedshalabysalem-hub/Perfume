"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { ActivationToggle } from "@/components/admin/activation-toggle";
import { FormDialog } from "@/components/admin/form-dialog";
import { TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { fragranceNoteSchema, lookupSchema } from "@/lib/schemas/catalog";
import type { z } from "@/lib/validation/zod";
import type { AttributeKind } from "@/server/modules/catalog/attributes.service";
import { createAttributeAction, setAttributeActiveAction, updateAttributeAction } from "./actions";

export type AttributeFormValues = { key: string; nameEn: string; nameAr: string; sortOrder: string };
type NoteValues = z.input<typeof fragranceNoteSchema>;
type LookupValues = z.input<typeof lookupSchema>;

function AttributeForm({
  kind,
  id,
  defaults,
  onDone,
}: {
  kind: AttributeKind;
  id?: string;
  defaults: AttributeFormValues;
  onDone: () => void;
}) {
  const t = useTranslations("attributes");
  const common = useTranslations("common");
  const isNote = kind === "note";
  const noteForm = useForm<NoteValues>({
    resolver: formResolver(fragranceNoteSchema),
    defaultValues: { slug: defaults.key, nameEn: defaults.nameEn, nameAr: defaults.nameAr },
  });
  const lookupForm = useForm<LookupValues>({
    resolver: formResolver(lookupSchema),
    defaultValues: {
      code: defaults.key,
      nameEn: defaults.nameEn,
      nameAr: defaults.nameAr,
      sortOrder: defaults.sortOrder,
    },
  });
  const noteSubmit = useActionSubmit(noteForm.setError);
  const lookupSubmit = useActionSubmit(lookupForm.setError);

  const save = async (values: NoteValues | LookupValues, submit: typeof noteSubmit) => {
    const result = id
      ? await submit(() => updateAttributeAction(kind, id, values), t("updated"))
      : await submit(() => createAttributeAction(kind, values), t("created"));
    if (result !== null) onDone();
  };

  const footer = (submitting: boolean) => (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onDone}>
        {common("cancel")}
      </Button>
      <Button type="submit" disabled={submitting}>
        {submitting ? common("saving") : common("save")}
      </Button>
    </div>
  );

  if (isNote) {
    return (
      <form onSubmit={noteForm.handleSubmit((values) => save(values, noteSubmit))} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput form={noteForm} name="nameEn" label={common("nameEn")} required dir="ltr" />
          <TextInput form={noteForm} name="nameAr" label={common("nameAr")} required dir="rtl" />
        </div>
        <TextInput form={noteForm} name="slug" label={common("slug")} description={common("slugHint")} dir="ltr" />
        {footer(noteForm.formState.isSubmitting)}
      </form>
    );
  }
  return (
    <form onSubmit={lookupForm.handleSubmit((values) => save(values, lookupSubmit))} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={lookupForm} name="nameEn" label={common("nameEn")} required dir="ltr" />
        <TextInput form={lookupForm} name="nameAr" label={common("nameAr")} required dir="rtl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={lookupForm} name="code" label={common("code")} required dir="ltr" placeholder="EDP" />
        <TextInput form={lookupForm} name="sortOrder" label={common("sortOrder")} inputMode="numeric" dir="ltr" />
      </div>
      {footer(lookupForm.formState.isSubmitting)}
    </form>
  );
}

export function NewAttributeButton({ kind }: { kind: AttributeKind }) {
  const t = useTranslations("attributes");
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("new")}
        </>
      }
      title={t("createTitle")}
      testId={`new-${kind}`}
    >
      {(close) => (
        <AttributeForm kind={kind} defaults={{ key: "", nameEn: "", nameAr: "", sortOrder: "0" }} onDone={close} />
      )}
    </FormDialog>
  );
}

export function AttributeRowActions({
  kind,
  id,
  isActive,
  defaults,
}: {
  kind: AttributeKind;
  id: string;
  isActive: boolean;
  defaults: AttributeFormValues;
}) {
  const t = useTranslations("attributes");
  const common = useTranslations("common");
  return (
    <div className="flex justify-end gap-2">
      <FormDialog
        trigger={
          <>
            <Pencil /> {common("edit")}
          </>
        }
        title={t("editTitle")}
        variant="outline"
        size="sm"
      >
        {(close) => <AttributeForm kind={kind} id={id} defaults={defaults} onDone={close} />}
      </FormDialog>
      <ActivationToggle
        isActive={isActive}
        setActive={(active) => setAttributeActiveAction(kind, id, active)}
        deactivateConfirm={t("deactivateConfirm")}
        activatedMessage={t("activated")}
        deactivatedMessage={t("deactivated")}
      />
    </div>
  );
}
