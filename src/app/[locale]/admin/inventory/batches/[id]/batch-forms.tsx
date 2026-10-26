"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import type { BatchInspectionStatusValue } from "@/lib/inventory/batches";
import {
  batchDetailsSchema,
  batchStatusChangeSchema,
  batchVerificationSchema,
  type StockStatusValue,
} from "@/lib/schemas/inventory";
import type { z } from "@/lib/validation/zod";
import { changeBatchStatusAction, correctBatchDetailsAction, verifyBatchAction } from "../../actions";

// The version is the one the page was rendered with; the page re-renders with
// the new version after each decision, so a stale tab gets a conflict.

type VerificationValues = z.input<typeof batchVerificationSchema>;

/** Record a physical-condition and label check. It never releases the batch (DR-010). */
export function BatchVerificationForm({
  batchId,
  version,
  isLegacy,
  expiryRecorded,
  allowNotApplicable,
  canQuarantine,
  canReject,
}: {
  batchId: string;
  version: number;
  isLegacy: boolean;
  expiryRecorded: boolean;
  allowNotApplicable: boolean;
  canQuarantine: boolean;
  canReject: boolean;
}) {
  const t = useTranslations("batches");
  const common = useTranslations("common");
  const form = useForm<VerificationValues>({
    resolver: formResolver(batchVerificationSchema),
    defaultValues: {
      batchId,
      version,
      physicalCheckOk: "",
      labelCheckOk: "",
      notes: "",
      expiryOutcome: expiryRecorded ? "DATE" : "UNKNOWN",
      expiresOn: "",
      lotNumber: "",
      onFailure: "",
      reason: "",
    },
  });
  const submit = useActionSubmit(form.setError);
  const [physical, label, outcome] = useWatch({
    control: form.control,
    name: ["physicalCheckOk", "labelCheckOk", "expiryOutcome"],
  });
  const failed = physical === "FAIL" || label === "FAIL";
  const checkOptions = [
    { value: "PASS", label: t("check.PASS") },
    { value: "FAIL", label: t("check.FAIL") },
  ];
  const outcomes = [
    { value: "DATE", label: t("expiryOutcome.DATE") },
    ...(expiryRecorded ? [] : [{ value: "UNKNOWN", label: t("expiryOutcome.UNKNOWN") }]),
    ...(allowNotApplicable && !expiryRecorded
      ? [{ value: "NOT_APPLICABLE", label: t("expiryOutcome.NOT_APPLICABLE") }]
      : []),
  ];

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submit(() => verifyBatchAction({ ...values, version }), t("verified"));
    if (result !== null) form.reset({ ...form.getValues(), notes: "", reason: "" });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" data-testid="batch-verify-form">
      <p className="text-xs text-muted-foreground">{t("verifyHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput
          form={form}
          name="physicalCheckOk"
          label={t("fields.physicalCheck")}
          required
          placeholder={common("selectPlaceholder")}
          options={checkOptions}
        />
        <SelectInput
          form={form}
          name="labelCheckOk"
          label={t("fields.labelCheck")}
          required
          placeholder={common("selectPlaceholder")}
          options={checkOptions}
        />
      </div>
      <SelectInput form={form} name="expiryOutcome" label={t("fields.expiryOutcome")} required options={outcomes} />
      {outcome === "DATE" ? (
        <TextInput
          form={form}
          name="expiresOn"
          label={t("fields.expiresOn")}
          description={t("fields.labelDateHint")}
          required
          dir="ltr"
          placeholder="YYYY-MM-DD / YYYY-MM"
        />
      ) : null}
      {isLegacy ? <TextInput form={form} name="lotNumber" label={t("fields.lotFound")} dir="ltr" /> : null}
      {failed ? (
        <SelectInput
          form={form}
          name="onFailure"
          label={t("fields.onFailure")}
          required
          placeholder={common("selectPlaceholder")}
          options={[
            ...(canQuarantine ? [{ value: "QUARANTINED", label: t("inspection.QUARANTINED") }] : []),
            ...(canReject ? [{ value: "REJECTED", label: t("inspection.REJECTED") }] : []),
          ]}
        />
      ) : null}
      <TextAreaInput form={form} name="notes" label={t("fields.notes")} />
      <TextAreaInput form={form} name="reason" label={t("fields.reason")} required />
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="batch-verify-submit">
          {form.formState.isSubmitting ? common("saving") : t("verify")}
        </Button>
      </div>
    </form>
  );
}

type StatusValues = z.input<typeof batchStatusChangeSchema>;

/** Units of this batch per stock status, shown in the decision confirmation. */
export type BatchStockSummary = Array<{ status: string; onHand: number }>;

/**
 * Release, quarantine or reject: separate, explicit decisions with a reason (DR-002, DR-004).
 * A validated decision is applied only after a confirmation that names its effect; the
 * rules themselves stay in the service.
 */
export function BatchStatusForm({
  batchId,
  version,
  allowed,
  stock,
  releasable,
}: {
  batchId: string;
  version: number;
  allowed: Array<Exclude<BatchInspectionStatusValue, "PENDING_INSPECTION">>;
  stock: BatchStockSummary;
  /** Quarantined units a release would move back to sellable (DR-011). */
  releasable: number;
}) {
  const t = useTranslations("batches");
  const common = useTranslations("common");
  const stockLabels = useTranslations("stockStatus");
  const form = useForm<StatusValues>({
    resolver: formResolver(batchStatusChangeSchema),
    defaultValues: { batchId, version, status: undefined, reason: "" },
  });
  const submit = useActionSubmit(form.setError);
  const [pendingDecision, setPendingDecision] = useState<StatusValues | null>(null);
  const [applying, startApplying] = useTransition();
  const onSubmit = form.handleSubmit((values) => setPendingDecision(values));
  const apply = () =>
    startApplying(async () => {
      if (!pendingDecision) return;
      const result = await submit(() => changeBatchStatusAction({ ...pendingDecision, version }), t("statusChanged"));
      setPendingDecision(null);
      if (result !== null) form.reset({ batchId, version, status: undefined, reason: "" });
    });
  if (allowed.length === 0) return <p className="text-sm text-muted-foreground">{t("noDecision")}</p>;
  const decision = pendingDecision?.status as (typeof allowed)[number] | undefined;
  const quarantined = stock.find((row) => row.status === "QUARANTINED")?.onHand ?? 0;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" data-testid="batch-status-form">
      <p className="text-xs text-muted-foreground">{t("decisionHint")}</p>
      <SelectInput
        form={form}
        name="status"
        label={t("fields.decision")}
        required
        placeholder={common("selectPlaceholder")}
        options={allowed.map((status) => ({ value: status, label: t(`decision.${status}`) }))}
      />
      <TextAreaInput form={form} name="reason" label={t("fields.reason")} required />
      <div className="flex justify-end">
        <Button type="submit" disabled={applying} data-testid="batch-status-submit">
          {t("applyDecision")}
        </Button>
      </div>
      <AlertDialog
        open={pendingDecision !== null}
        onOpenChange={(open) => !open && !applying && setPendingDecision(null)}
      >
        <AlertDialogContent data-testid="batch-decision-confirm">
          <AlertDialogTitle>
            {decision ? t("confirmDecision.title", { decision: t(`decision.${decision}`) }) : null}
          </AlertDialogTitle>
          <AlertDialogDescription>{decision ? t(`confirmDecision.effect.${decision}`) : null}</AlertDialogDescription>
          {stock.length > 0 ? (
            <div className="grid gap-1 text-sm">
              <p className="font-medium">{t("confirmDecision.currentStock")}</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {stock.map((row) => (
                  <li key={row.status}>
                    {stockLabels(row.status as StockStatusValue)}:{" "}
                    <span className="font-medium text-foreground tabular-nums">{row.onHand}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {decision === "RELEASED" && quarantined > 0 ? (
            <ul className="grid gap-1 text-sm" data-testid="batch-release-effect">
              <li>
                {t("confirmDecision.releasable")}: <span className="font-medium tabular-nums">{releasable}</span>
              </li>
              {quarantined > releasable ? (
                <li>
                  {t("confirmDecision.staysHeld")}:{" "}
                  <span className="font-medium tabular-nums">{quarantined - releasable}</span>
                </li>
              ) : null}
            </ul>
          ) : null}
          {pendingDecision?.reason ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{t("fields.reason")}: </span>
              {pendingDecision.reason}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={applying}>{common("cancel")}</AlertDialogCancel>
            <Button
              variant={decision === "RELEASED" ? "default" : "destructive"}
              type="button"
              disabled={applying}
              onClick={apply}
              data-testid="batch-decision-confirm-apply"
            >
              {applying ? common("saving") : t(`decision.${decision ?? "RELEASED"}`)}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

type DetailsValues = z.input<typeof batchDetailsSchema>;

/** Correct dates, supplier and (LEGACY only) the lot number, with a reason (DR-005). */
export function BatchDetailsForm({
  batchId,
  version,
  isLegacy,
  current,
  suppliers,
}: {
  batchId: string;
  version: number;
  isLegacy: boolean;
  current: {
    lotNumber: string | null;
    manufacturedOn: string | null;
    expiresOn: string | null;
    supplierId: string | null;
  };
  suppliers: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("batches");
  const common = useTranslations("common");
  const defaults = {
    batchId,
    version,
    lotNumber: current.lotNumber ?? "",
    manufacturedOn: current.manufacturedOn ?? "",
    expiresOn: current.expiresOn ?? "",
    supplierId: current.supplierId ?? "",
    reason: "",
  };
  const form = useForm<DetailsValues>({ resolver: formResolver(batchDetailsSchema), defaultValues: defaults });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submit(() => correctBatchDetailsAction({ ...values, version }), t("detailsSaved"));
    if (result !== null) form.reset({ ...form.getValues(), reason: "" });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3" data-testid="batch-details-form">
      <TextInput
        form={form}
        name="lotNumber"
        label={t("fields.lot")}
        description={isLegacy ? undefined : t("lotFixed")}
        disabled={!isLegacy}
        dir="ltr"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          form={form}
          name="manufacturedOn"
          label={t("fields.manufacturedOn")}
          dir="ltr"
          placeholder="YYYY-MM-DD"
        />
        <TextInput
          form={form}
          name="expiresOn"
          label={t("fields.expiresOn")}
          description={t("fields.labelDateHint")}
          dir="ltr"
          placeholder="YYYY-MM-DD / YYYY-MM"
        />
      </div>
      <SelectInput
        form={form}
        name="supplierId"
        label={t("fields.supplier")}
        placeholder={t("noSupplier")}
        options={suppliers}
      />
      <TextAreaInput form={form} name="reason" label={t("fields.reason")} required />
      <div className="flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="batch-details-submit">
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}
