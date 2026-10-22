"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormDialog } from "@/components/admin/form-dialog";
import { CheckboxInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { supplierContactSchema } from "@/lib/schemas/procurement";
import type { z } from "@/lib/validation/zod";
import { addSupplierContactAction, removeSupplierContactAction, updateSupplierContactAction } from "../actions";

export type ContactDto = {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

type Values = z.input<typeof supplierContactSchema>;

function ContactForm({
  supplierId,
  contact,
  onDone,
}: {
  supplierId: string;
  contact?: ContactDto;
  onDone: () => void;
}) {
  const t = useTranslations("suppliers");
  const common = useTranslations("common");
  const form = useForm<Values>({
    resolver: formResolver(supplierContactSchema),
    defaultValues: {
      name: contact?.name ?? "",
      jobTitle: contact?.jobTitle ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      isPrimary: contact?.isPrimary ?? false,
    },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = contact
      ? await submit(() => updateSupplierContactAction(contact.id, values), t("contactSaved"))
      : await submit(() => addSupplierContactAction(supplierId, values), t("contactSaved"));
    if (result !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="contact-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="name" label={t("contactName")} required />
        <TextInput form={form} name="jobTitle" label={t("jobTitle")} />
        <TextInput form={form} name="email" label={t("email")} type="email" dir="ltr" />
        <TextInput form={form} name="phone" label={t("phone")} type="tel" dir="ltr" />
      </div>
      <CheckboxInput form={form} name="isPrimary" label={t("primaryContact")} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="contact-form-submit">
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

export function ContactsPanel({
  supplierId,
  contacts,
  canEdit,
}: {
  supplierId: string;
  contacts: ContactDto[];
  canEdit: boolean;
}) {
  const t = useTranslations("suppliers");
  const common = useTranslations("common");
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("contactsHint")}</p>
        {canEdit ? (
          <FormDialog
            trigger={
              <>
                <Plus /> {t("addContact")}
              </>
            }
            title={t("addContact")}
            wide
            testId="add-contact"
          >
            {(close) => <ContactForm supplierId={supplierId} onDone={close} />}
          </FormDialog>
        ) : null}
      </div>
      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noContacts")}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border" data-testid="contact-list">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="grid gap-1">
                <p className="flex items-center gap-2 font-medium">
                  {contact.name}
                  {contact.isPrimary ? <Badge variant="outline">{t("primary")}</Badge> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[contact.jobTitle, contact.email, contact.phone].filter(Boolean).map((part, index) => (
                    <span key={index} className={index > 0 ? "ltr-value" : undefined}>
                      {index > 0 ? " · " : null}
                      {part}
                    </span>
                  ))}
                </p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-2">
                  <FormDialog
                    trigger={<Pencil aria-label={common("edit")} />}
                    title={t("editContact")}
                    variant="ghost"
                    size="icon-sm"
                    wide
                  >
                    {(close) => <ContactForm supplierId={supplierId} contact={contact} onDone={close} />}
                  </FormDialog>
                  <ConfirmAction
                    trigger={t("removeContact")}
                    title={t("removeContact")}
                    description={t("removeContactConfirm")}
                    confirmLabel={t("removeContact")}
                    successMessage={t("contactRemoved")}
                    variant="destructive"
                    action={() => removeSupplierContactAction(contact.id)}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
