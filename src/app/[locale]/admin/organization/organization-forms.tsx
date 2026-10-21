"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { ActivationToggle } from "@/components/admin/activation-toggle";
import { FormDialog } from "@/components/admin/form-dialog";
import { CheckboxInput, SelectInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import {
  countryUpdateSchema,
  legalEntityCreateSchema,
  legalEntityUpdateSchema,
  STORE_TYPES,
  storeCreateSchema,
  storeUpdateSchema,
  warehouseCreateSchema,
  warehouseUpdateSchema,
} from "@/lib/schemas/organization";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import {
  createLegalEntityAction,
  createStoreAction,
  createWarehouseAction,
  setLegalEntityActiveAction,
  setStoreActiveAction,
  setWarehouseActiveAction,
  updateCountryAction,
  updateLegalEntityAction,
  updateStoreAction,
  updateWarehouseAction,
} from "./actions";

type EntityOption = { id: string; code: string; nameEn: string; nameAr: string; countryCode: string; timezone: string };
type CountryOption = { code: string; nameEn: string; nameAr: string };

function FormFooter({ submitting, onCancel }: { submitting: boolean; onCancel: () => void }) {
  const common = useTranslations("common");
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        {common("cancel")}
      </Button>
      <Button type="submit" disabled={submitting}>
        {submitting ? common("saving") : common("save")}
      </Button>
    </div>
  );
}

// ─── Countries ───────────────────────────────────────────────────────────────

type CountryValues = z.input<typeof countryUpdateSchema>;

export function EditCountryButton({
  code,
  defaults,
  currencyCode,
}: {
  code: string;
  defaults: CountryValues;
  currencyCode: string;
}) {
  const t = useTranslations("organization");
  const common = useTranslations("common");
  return (
    <FormDialog
      trigger={
        <>
          <Pencil /> {common("edit")}
        </>
      }
      title={`${t("editTitle")} · ${code}`}
      variant="outline"
      size="sm"
    >
      {(close) => <CountryForm code={code} defaults={defaults} currencyCode={currencyCode} onDone={close} />}
    </FormDialog>
  );
}

function CountryForm({
  code,
  defaults,
  currencyCode,
  onDone,
}: {
  code: string;
  defaults: CountryValues;
  currencyCode: string;
  onDone: () => void;
}) {
  const t = useTranslations("organization");
  const common = useTranslations("common");
  const form = useForm<CountryValues>({ resolver: formResolver(countryUpdateSchema), defaultValues: defaults });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    if ((await submit(() => updateCountryAction(code, values), t("saved"))) !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="nameEn" label={common("nameEn")} required dir="ltr" />
        <TextInput form={form} name="nameAr" label={common("nameAr")} required dir="rtl" />
        <TextInput form={form} name="timezone" label={t("timezone")} required dir="ltr" />
        <SelectInput
          form={form}
          name="defaultLocale"
          label={t("defaultLocale")}
          options={[
            { value: "ar", label: common("arabic") },
            { value: "en", label: common("english") },
          ]}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("currency")}: <span className="ltr-value font-medium">{currencyCode}</span> — {t("currencyLockedHint")}
      </p>
      <CheckboxInput form={form} name="pricesIncludeTax" label={t("pricesIncludeTax")} />
      <CheckboxInput form={form} name="isActive" label={t("marketActive")} />
      <FormFooter submitting={form.formState.isSubmitting} onCancel={onDone} />
    </form>
  );
}

// ─── Legal entities ──────────────────────────────────────────────────────────

type LegalEntityValues = z.input<typeof legalEntityCreateSchema>;
export type LegalEntityDefaults = Omit<LegalEntityValues, never> & Record<string, unknown>;

function LegalEntityForm({
  id,
  defaults,
  countries,
  onDone,
}: {
  id?: string;
  defaults: LegalEntityValues;
  countries: CountryOption[];
  onDone: () => void;
}) {
  const t = useTranslations("organization");
  const common = useTranslations("common");
  const locale = useLocale();
  const form = useForm<LegalEntityValues>({
    resolver: formResolver(
      id ? (legalEntityUpdateSchema as unknown as typeof legalEntityCreateSchema) : legalEntityCreateSchema,
    ),
    defaultValues: defaults,
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = id
      ? await submit(() => updateLegalEntityAction(id, values), t("saved"))
      : await submit(() => createLegalEntityAction(values), t("saved"));
    if (result !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="code" label={common("code")} required dir="ltr" />
        <SelectInput
          form={form}
          name="countryCode"
          label={common("country")}
          required
          disabled={!!id}
          description={id ? t("countryLockedHint") : undefined}
          options={countries.map((country) => ({
            value: country.code,
            label: localized(locale, country.nameAr, country.nameEn),
          }))}
        />
        <TextInput form={form} name="legalNameEn" label={t("legalNameEn")} required dir="ltr" />
        <TextInput form={form} name="legalNameAr" label={t("legalNameAr")} required dir="rtl" />
        <TextInput form={form} name="tradeNameEn" label={t("tradeNameEn")} dir="ltr" />
        <TextInput form={form} name="tradeNameAr" label={t("tradeNameAr")} dir="rtl" />
        <TextInput form={form} name="commercialRegistrationNo" label={t("commercialRegistrationNo")} dir="ltr" />
        <TextInput form={form} name="taxRegistrationNo" label={t("taxRegistrationNo")} dir="ltr" />
        <TextInput form={form} name="addressLine1" label={t("addressLine1")} />
        <TextInput form={form} name="addressLine2" label={t("addressLine2")} />
        <TextInput form={form} name="city" label={t("city")} />
        <TextInput form={form} name="district" label={t("district")} />
        <TextInput form={form} name="postalCode" label={t("postalCode")} dir="ltr" />
        <TextInput form={form} name="buildingNumber" label={t("buildingNumber")} dir="ltr" />
        <TextInput form={form} name="email" label={t("email")} type="email" dir="ltr" />
        <TextInput form={form} name="phone" label={t("phone")} type="tel" dir="ltr" />
      </div>
      <FormFooter submitting={form.formState.isSubmitting} onCancel={onDone} />
    </form>
  );
}

const EMPTY_ENTITY: LegalEntityValues = {
  code: "",
  countryCode: "SA",
  legalNameEn: "",
  legalNameAr: "",
  tradeNameEn: "",
  tradeNameAr: "",
  commercialRegistrationNo: "",
  taxRegistrationNo: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  district: "",
  postalCode: "",
  buildingNumber: "",
  email: "",
  phone: "",
};

export function NewLegalEntityButton({ countries }: { countries: CountryOption[] }) {
  const t = useTranslations("organization");
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("newLegalEntity")}
        </>
      }
      title={t("newLegalEntity")}
      wide
    >
      {(close) => (
        <LegalEntityForm
          defaults={{ ...EMPTY_ENTITY, countryCode: countries[0]?.code ?? "SA" }}
          countries={countries}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

export function LegalEntityRowActions({
  id,
  isActive,
  defaults,
  countries,
}: {
  id: string;
  isActive: boolean;
  defaults: LegalEntityValues;
  countries: CountryOption[];
}) {
  const t = useTranslations("organization");
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
        wide
      >
        {(close) => <LegalEntityForm id={id} defaults={defaults} countries={countries} onDone={close} />}
      </FormDialog>
      <Toggle isActive={isActive} setActive={(active) => setLegalEntityActiveAction(id, active)} />
    </div>
  );
}

function Toggle({
  isActive,
  setActive,
}: {
  isActive: boolean;
  setActive: (active: boolean) => ReturnType<typeof setStoreActiveAction>;
}) {
  const t = useTranslations("organization");
  return (
    <ActivationToggle
      isActive={isActive}
      setActive={setActive}
      deactivateConfirm={t("deactivateConfirm")}
      activatedMessage={t("activated")}
      deactivatedMessage={t("deactivated")}
    />
  );
}

// ─── Stores & warehouses ─────────────────────────────────────────────────────

type StoreValues = z.input<typeof storeCreateSchema>;
type WarehouseValues = z.input<typeof warehouseCreateSchema>;

function LocationFields({
  form,
  entities,
  locked,
  extra,
}: {
  form: ReturnType<typeof useForm<StoreValues>> | ReturnType<typeof useForm<WarehouseValues>>;
  entities: EntityOption[];
  locked: boolean;
  extra?: ReactNode;
}) {
  const t = useTranslations("organization");
  const common = useTranslations("common");
  const locale = useLocale();
  const typed = form as ReturnType<typeof useForm<WarehouseValues>>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput form={typed} name="code" label={common("code")} required dir="ltr" />
      <SelectInput
        form={typed}
        name="legalEntityId"
        label={t("legalEntity")}
        required
        disabled={locked}
        description={locked ? t("countryLockedHint") : undefined}
        placeholder={common("selectPlaceholder")}
        options={entities.map((entity) => ({
          value: entity.id,
          label: `${entity.code} · ${localized(locale, entity.nameAr, entity.nameEn)} (${entity.countryCode})`,
        }))}
      />
      <TextInput form={typed} name="nameEn" label={common("nameEn")} required dir="ltr" />
      <TextInput form={typed} name="nameAr" label={common("nameAr")} required dir="rtl" />
      <TextInput form={typed} name="timezone" label={t("timezone")} required dir="ltr" />
      <TextInput form={typed} name="city" label={t("city")} />
      <TextInput form={typed} name="addressLine1" label={t("addressLine1")} className="sm:col-span-2" />
      {extra}
    </div>
  );
}

function StoreForm({
  id,
  defaults,
  entities,
  onDone,
}: {
  id?: string;
  defaults: StoreValues;
  entities: EntityOption[];
  onDone: () => void;
}) {
  const t = useTranslations("organization");
  const form = useForm<StoreValues>({
    resolver: formResolver(id ? (storeUpdateSchema as unknown as typeof storeCreateSchema) : storeCreateSchema),
    defaultValues: defaults,
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = id
      ? await submit(() => updateStoreAction(id, values), t("saved"))
      : await submit(() => createStoreAction(values), t("saved"));
    if (result !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <LocationFields
        form={form}
        entities={entities}
        locked={!!id}
        extra={
          <>
            <SelectInput
              form={form}
              name="type"
              label={t("storeType")}
              required
              options={STORE_TYPES.map((type) => ({ value: type, label: t(`storeTypes.${type}`) }))}
            />
            <TextInput form={form} name="phone" label={t("phone")} type="tel" dir="ltr" />
            <TextInput form={form} name="email" label={t("email")} type="email" dir="ltr" />
          </>
        }
      />
      <FormFooter submitting={form.formState.isSubmitting} onCancel={onDone} />
    </form>
  );
}

function WarehouseForm({
  id,
  defaults,
  entities,
  onDone,
}: {
  id?: string;
  defaults: WarehouseValues;
  entities: EntityOption[];
  onDone: () => void;
}) {
  const t = useTranslations("organization");
  const form = useForm<WarehouseValues>({
    resolver: formResolver(
      id ? (warehouseUpdateSchema as unknown as typeof warehouseCreateSchema) : warehouseCreateSchema,
    ),
    defaultValues: defaults,
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = id
      ? await submit(() => updateWarehouseAction(id, values), t("saved"))
      : await submit(() => createWarehouseAction(values), t("saved"));
    if (result !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <LocationFields form={form} entities={entities} locked={!!id} />
      <FormFooter submitting={form.formState.isSubmitting} onCancel={onDone} />
    </form>
  );
}

export function NewStoreButton({ entities }: { entities: EntityOption[] }) {
  const t = useTranslations("organization");
  const first = entities[0];
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("newStore")}
        </>
      }
      title={t("newStore")}
      wide
    >
      {(close) => (
        <StoreForm
          entities={entities}
          onDone={close}
          defaults={{
            code: "",
            legalEntityId: first?.id ?? "",
            type: "RETAIL",
            nameEn: "",
            nameAr: "",
            timezone: first?.timezone ?? "Asia/Riyadh",
            addressLine1: "",
            city: "",
            phone: "",
            email: "",
          }}
        />
      )}
    </FormDialog>
  );
}

export function StoreRowActions({
  id,
  isActive,
  defaults,
  entities,
}: {
  id: string;
  isActive: boolean;
  defaults: StoreValues;
  entities: EntityOption[];
}) {
  const t = useTranslations("organization");
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
        wide
      >
        {(close) => <StoreForm id={id} defaults={defaults} entities={entities} onDone={close} />}
      </FormDialog>
      <Toggle isActive={isActive} setActive={(active) => setStoreActiveAction(id, active)} />
    </div>
  );
}

export function NewWarehouseButton({ entities }: { entities: EntityOption[] }) {
  const t = useTranslations("organization");
  const first = entities[0];
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("newWarehouse")}
        </>
      }
      title={t("newWarehouse")}
      wide
    >
      {(close) => (
        <WarehouseForm
          entities={entities}
          onDone={close}
          defaults={{
            code: "",
            legalEntityId: first?.id ?? "",
            nameEn: "",
            nameAr: "",
            timezone: first?.timezone ?? "Asia/Riyadh",
            addressLine1: "",
            city: "",
          }}
        />
      )}
    </FormDialog>
  );
}

export function WarehouseRowActions({
  id,
  isActive,
  defaults,
  entities,
}: {
  id: string;
  isActive: boolean;
  defaults: WarehouseValues;
  entities: EntityOption[];
}) {
  const t = useTranslations("organization");
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
        wide
      >
        {(close) => <WarehouseForm id={id} defaults={defaults} entities={entities} onDone={close} />}
      </FormDialog>
      <Toggle isActive={isActive} setActive={(active) => setWarehouseActiveAction(id, active)} />
    </div>
  );
}
