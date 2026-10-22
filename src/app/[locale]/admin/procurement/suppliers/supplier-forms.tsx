"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ActivationToggle } from "@/components/admin/activation-toggle";
import { FormDialog } from "@/components/admin/form-dialog";
import { SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { PAYMENT_TERMS, supplierCreateSchema, supplierUpdateSchema } from "@/lib/schemas/procurement";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import { createSupplierAction, setSupplierActiveAction, updateSupplierAction } from "./actions";

export type SupplierValues = z.input<typeof supplierCreateSchema>;
export type EntityOption = {
  id: string;
  code: string;
  countryCode: string;
  legalNameEn: string;
  legalNameAr: string;
  currencyCode: string;
};

export function SupplierForm({
  id,
  defaults,
  entities,
  currencies,
  readOnly = false,
  onDone,
}: {
  /** Absent when creating. */
  id?: string;
  defaults: SupplierValues;
  entities: EntityOption[];
  currencies: string[];
  readOnly?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("suppliers");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const form = useForm<SupplierValues>({
    resolver: formResolver(
      id ? (supplierUpdateSchema as unknown as typeof supplierCreateSchema) : supplierCreateSchema,
    ),
    defaultValues: defaults,
  });
  const submit = useActionSubmit(form.setError);
  const paymentTerms = useWatch({ control: form.control, name: "paymentTerms" });

  const onSubmit = form.handleSubmit(async (values) => {
    if (id) {
      const { legalEntityId: _legalEntityId, ...rest } = values;
      if ((await submit(() => updateSupplierAction(id, rest), t("saved"))) !== null) onDone?.();
      return;
    }
    const result = await submit(() => createSupplierAction(values), t("saved"));
    if (result) {
      onDone?.();
      router.push(`/admin/procurement/suppliers/${result.id}`);
    }
  });

  // Default the purchasing currency to the buying entity's currency when creating.
  const legalEntityId = useWatch({ control: form.control, name: "legalEntityId" });
  useEffect(() => {
    if (id) return;
    const entity = entities.find((option) => option.id === legalEntityId);
    if (entity) form.setValue("currencyCode", entity.currencyCode);
  }, [id, legalEntityId, entities, form]);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="supplier-form">
      <fieldset disabled={readOnly} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput form={form} name="code" label={common("code")} required dir="ltr" placeholder="SUP-001" />
          <SelectInput
            form={form}
            name="legalEntityId"
            label={t("legalEntity")}
            required
            disabled={!!id}
            description={id ? t("legalEntityLockedHint") : t("legalEntityHint")}
            placeholder={common("selectPlaceholder")}
            options={entities.map((entity) => ({
              value: entity.id,
              label: `${entity.code} · ${localized(locale, entity.legalNameAr, entity.legalNameEn)} (${entity.countryCode})`,
            }))}
          />
          <TextInput form={form} name="nameEn" label={t("nameEn")} required dir="ltr" />
          <TextInput form={form} name="nameAr" label={t("nameAr")} required dir="rtl" />
          <TextInput
            form={form}
            name="supplierCountryCode"
            label={t("supplierCountry")}
            description={t("supplierCountryHint")}
            required
            dir="ltr"
            placeholder="SA"
          />
          <TextInput
            form={form}
            name="taxRegistrationNo"
            label={t("taxRegistrationNo")}
            description={t("taxRegistrationNoHint")}
            dir="ltr"
          />
          <TextInput form={form} name="commercialRegistrationNo" label={t("commercialRegistrationNo")} dir="ltr" />
          <SelectInput
            form={form}
            name="currencyCode"
            label={t("currency")}
            required
            options={currencies.map((code) => ({ value: code, label: code }))}
          />
          <SelectInput
            form={form}
            name="paymentTerms"
            label={t("paymentTerms")}
            required
            options={PAYMENT_TERMS.map((terms) => ({ value: terms, label: t(`terms.${terms}`) }))}
          />
          {paymentTerms === "NET" ? (
            <TextInput
              form={form}
              name="paymentTermDays"
              label={t("paymentTermDays")}
              required
              inputMode="numeric"
              dir="ltr"
              placeholder="30"
            />
          ) : (
            <div aria-hidden="true" />
          )}
          <TextInput form={form} name="email" label={t("email")} type="email" dir="ltr" />
          <TextInput form={form} name="phone" label={t("phone")} type="tel" dir="ltr" />
          <TextInput form={form} name="websiteUrl" label={t("website")} type="url" dir="ltr" />
          <TextInput form={form} name="city" label={t("city")} />
          <TextInput form={form} name="addressLine1" label={t("address")} className="sm:col-span-2" />
        </div>
        <TextAreaInput form={form} name="notes" label={t("notes")} rows={3} />
      </fieldset>
      {readOnly ? null : (
        <div className="flex justify-end gap-2">
          {onDone && !id ? (
            <Button type="button" variant="outline" onClick={onDone}>
              {common("cancel")}
            </Button>
          ) : null}
          <Button type="submit" disabled={form.formState.isSubmitting} data-testid="supplier-form-submit">
            {form.formState.isSubmitting ? common("saving") : common("save")}
          </Button>
        </div>
      )}
    </form>
  );
}

export function NewSupplierButton({ entities, currencies }: { entities: EntityOption[]; currencies: string[] }) {
  const t = useTranslations("suppliers");
  const first = entities[0];
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("new")}
        </>
      }
      title={t("new")}
      wide
      testId="new-supplier"
    >
      {(close) => (
        <SupplierForm
          entities={entities}
          currencies={currencies}
          onDone={close}
          defaults={{
            code: "",
            legalEntityId: first?.id ?? "",
            nameEn: "",
            nameAr: "",
            supplierCountryCode: first?.countryCode ?? "SA",
            taxRegistrationNo: "",
            commercialRegistrationNo: "",
            paymentTerms: "NET",
            paymentTermDays: "30",
            currencyCode: first?.currencyCode ?? currencies[0] ?? "",
            email: "",
            phone: "",
            websiteUrl: "",
            addressLine1: "",
            city: "",
            notes: "",
          }}
        />
      )}
    </FormDialog>
  );
}

export function SupplierStatusToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const t = useTranslations("suppliers");
  return (
    <ActivationToggle
      isActive={isActive}
      setActive={(active) => setSupplierActiveAction(id, active)}
      deactivateConfirm={t("deactivateConfirm")}
      activatedMessage={t("activated")}
      deactivatedMessage={t("deactivated")}
    />
  );
}
