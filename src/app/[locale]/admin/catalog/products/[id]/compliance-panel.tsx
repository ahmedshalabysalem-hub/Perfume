"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormDialog } from "@/components/admin/form-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { COMPLIANCE_STATUSES, complianceSchema } from "@/lib/schemas/catalog";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import { addComplianceAction, removeComplianceAction, updateComplianceAction } from "../actions";
import type { ComplianceDto, MarketDto } from "./types";

type Values = z.input<typeof complianceSchema>;

function ComplianceForm({
  productId,
  entry,
  markets,
  onDone,
}: {
  productId: string;
  entry?: ComplianceDto;
  markets: MarketDto[];
  onDone: () => void;
}) {
  const t = useTranslations("compliance");
  const common = useTranslations("common");
  const statusLabels = useTranslations("status");
  const locale = useLocale();
  const form = useForm<Values>({
    resolver: formResolver(complianceSchema),
    defaultValues: {
      countryCode: entry?.countryCode ?? markets[0]?.code ?? "",
      authority: entry?.authority ?? "",
      referenceType: entry?.referenceType ?? "",
      referenceNumber: entry?.referenceNumber ?? "",
      status: entry?.status ?? "PENDING",
      issuedAt: entry?.issuedAt ?? "",
      expiresAt: entry?.expiresAt ?? "",
      notes: entry?.notes ?? "",
    },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = entry
      ? await submit(() => updateComplianceAction(entry.id, values), t("saved"))
      : await submit(() => addComplianceAction(productId, values), t("saved"));
    if (result !== null) onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          form={form}
          name="countryCode"
          label={common("country")}
          required
          options={markets.map((market) => ({ value: market.code, label: localized(locale, market.nameAr, market.nameEn) }))}
        />
        <SelectInput
          form={form}
          name="status"
          label={t("status")}
          required
          options={COMPLIANCE_STATUSES.map((status) => ({ value: status, label: statusLabels(status) }))}
        />
        <TextInput form={form} name="authority" label={t("authority")} required dir="ltr" placeholder="SFDA / EDA" />
        <TextInput form={form} name="referenceType" label={t("referenceType")} required />
        <TextInput form={form} name="referenceNumber" label={t("referenceNumber")} dir="ltr" />
        <div className="grid grid-cols-2 gap-3">
          <TextInput form={form} name="issuedAt" label={t("issuedAt")} type="date" dir="ltr" />
          <TextInput form={form} name="expiresAt" label={t("expiresAt")} type="date" dir="ltr" />
        </div>
      </div>
      <TextAreaInput form={form} name="notes" label={t("notes")} rows={2} />
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

export function CompliancePanel({
  productId,
  entries,
  markets,
  canAdd,
}: {
  productId: string;
  entries: ComplianceDto[];
  /** Markets in which the user may add references. */
  markets: MarketDto[];
  canAdd: boolean;
}) {
  const t = useTranslations("compliance");
  const common = useTranslations("common");
  const statusLabels = useTranslations("status");
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        {canAdd && markets.length > 0 ? (
          <FormDialog trigger={<><Plus /> {t("add")}</>} title={t("add")} wide>
            {(close) => <ComplianceForm productId={productId} markets={markets} onDone={close} />}
          </FormDialog>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="grid gap-1">
                <p className="font-medium">
                  <span className="ltr-value">{entry.countryCode}</span> · {entry.authority} · {entry.referenceType}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono ltr-value">{entry.referenceNumber ?? "—"}</span>
                  {entry.expiresAt ? ` · ${t("expiresAt")}: ${entry.expiresAt}` : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={entry.status} />
                <span className="sr-only">{statusLabels(entry.status)}</span>
                {entry.editable ? (
                  <>
                    <FormDialog trigger={<Pencil aria-label={common("edit")} />} title={t("title")} variant="ghost" size="icon-sm" wide>
                      {(close) => <ComplianceForm productId={productId} entry={entry} markets={markets} onDone={close} />}
                    </FormDialog>
                    <ConfirmAction
                      trigger={t("remove")}
                      title={t("remove")}
                      description={common("areYouSure")}
                      confirmLabel={t("remove")}
                      successMessage={t("removed")}
                      variant="destructive"
                      action={() => removeComplianceAction(entry.id)}
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
