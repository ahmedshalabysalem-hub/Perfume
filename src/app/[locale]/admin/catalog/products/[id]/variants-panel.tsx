"use client";

import { Boxes, Pencil, Plus, Printer, Tags, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormDialog } from "@/components/admin/form-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { CheckboxInput, SelectInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { useTranslateMessage } from "@/components/forms/use-translate-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { detectGtinType } from "@/lib/barcode";
import { formatMoney } from "@/lib/money";
import { BARCODE_SOURCES, BARCODE_TYPES, variantPricesSchema, variantSchema } from "@/lib/schemas/catalog";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import {
  changeVariantStatusAction,
  createVariantAction,
  setVariantPricesAction,
  suggestInternalBarcodeAction,
  updateVariantAction,
} from "../actions";
import type { MarketDto, VariantDto } from "./types";

type VariantValues = z.input<typeof variantSchema>;
type PricesValues = z.input<typeof variantPricesSchema>;

function variantDefaults(variant?: VariantDto): VariantValues {
  return {
    sku: variant?.sku ?? "",
    barcode: variant?.barcode ?? "",
    barcodeType: (variant?.barcodeType ?? "") as VariantValues["barcodeType"],
    barcodeSource: (variant?.barcodeSource ?? "") as VariantValues["barcodeSource"],
    nameEn: variant?.nameEn ?? "",
    nameAr: variant?.nameAr ?? "",
    sizeMl: variant?.sizeMl ?? "",
    weightGrams: variant?.weightGrams?.toString() ?? "",
    isTester: variant?.isTester ?? false,
    trackInventory: variant?.trackInventory ?? true,
    trackBatches: variant?.trackBatches ?? true,
    trackExpiry: variant?.trackExpiry ?? false,
    sortOrder: variant?.sortOrder?.toString() ?? "0",
  };
}

function VariantForm({ productId, variant, onDone }: { productId: string; variant?: VariantDto; onDone: () => void }) {
  const t = useTranslations("variants");
  const common = useTranslations("common");
  const typeLabels = useTranslations("barcodeType");
  const sourceLabels = useTranslations("barcodeSource");
  const form = useForm<VariantValues>({
    resolver: formResolver(variantSchema),
    defaultValues: variantDefaults(variant),
  });
  const submit = useActionSubmit(form.setError);
  const [generating, startGenerating] = useTransition();

  const onSubmit = form.handleSubmit(async (values) => {
    const result = variant
      ? await submit(() => updateVariantAction(variant.id, values), t("updated"))
      : await submit(() => createVariantAction(productId, values), t("created"));
    if (result !== null) onDone();
  });

  // A scanner types digits: infer the GTIN symbology so staff need not choose it.
  const barcodeField = form.register("barcode", {
    onBlur: (event: { target: { value: string } }) => {
      const detected = detectGtinType(event.target.value ?? "");
      if (detected && !form.getValues("barcodeType")) {
        form.setValue("barcodeType", detected);
        form.setValue("barcodeSource", "MANUFACTURER");
      }
    },
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="variant-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="sku" label={t("sku")} required dir="ltr" />
        <TextInput form={form} name="sizeMl" label={t("sizeMl")} inputMode="decimal" dir="ltr" />
        <TextInput form={form} name="nameEn" label={t("labelEn")} description={t("labelHint")} dir="ltr" />
        <TextInput form={form} name="nameAr" label={t("labelAr")} dir="rtl" />
      </div>
      <div className="grid gap-3 rounded-lg border p-3">
        <div className="grid gap-1.5">
          <label htmlFor="variant-barcode" className="text-sm font-medium">
            {t("barcode")}
          </label>
          <div className="flex gap-2">
            <Input id="variant-barcode" dir="ltr" autoComplete="off" {...barcodeField} data-field="barcode" />
            <Button
              type="button"
              variant="outline"
              disabled={generating}
              onClick={() =>
                startGenerating(async () => {
                  const result = await suggestInternalBarcodeAction();
                  if (result.ok) {
                    form.setValue("barcode", result.data, { shouldDirty: true });
                    form.setValue("barcodeType", "CODE_128");
                    form.setValue("barcodeSource", "INTERNAL");
                  }
                })
              }
            >
              <Wand2 /> {t("generateInternal")}
            </Button>
          </div>
          <BarcodeError form={form} />
          <p className="text-xs text-muted-foreground">{t("barcodeHint")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            form={form}
            name="barcodeType"
            label={t("barcodeType")}
            options={BARCODE_TYPES.map((type) => ({ value: type, label: typeLabels(type) }))}
            placeholder={t("noBarcode")}
          />
          <SelectInput
            form={form}
            name="barcodeSource"
            label={t("barcodeSource")}
            options={BARCODE_SOURCES.map((source) => ({ value: source, label: sourceLabels(source) }))}
            placeholder={t("noBarcode")}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="weightGrams" label={t("weightGrams")} inputMode="numeric" dir="ltr" />
        <TextInput form={form} name="sortOrder" label={common("sortOrder")} inputMode="numeric" dir="ltr" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxInput form={form} name="isTester" label={t("isTester")} />
        <CheckboxInput form={form} name="trackInventory" label={t("trackInventory")} />
        <CheckboxInput form={form} name="trackBatches" label={t("trackBatches")} />
        <CheckboxInput form={form} name="trackExpiry" label={t("trackExpiry")} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="variant-form-submit">
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

function BarcodeError({ form }: { form: ReturnType<typeof useForm<VariantValues>> }) {
  const translate = useTranslateMessage();
  const message = form.formState.errors.barcode?.message;
  return message ? (
    <p role="alert" className="text-xs font-medium text-destructive">
      {translate(message)}
    </p>
  ) : null;
}

function PricesForm({ variant, markets, onDone }: { variant: VariantDto; markets: MarketDto[]; onDone: () => void }) {
  const t = useTranslations("prices");
  const common = useTranslations("common");
  const locale = useLocale();
  const translate = useTranslateMessage();
  const rows = markets.filter(
    (market) => market.isActive || variant.prices.some((price) => price.countryCode === market.code),
  );
  const form = useForm<PricesValues>({
    resolver: formResolver(variantPricesSchema),
    defaultValues: {
      prices: rows.map((market) => {
        const current = variant.prices.find((price) => price.countryCode === market.code);
        return {
          countryCode: market.code,
          amount: current?.amount ?? "",
          compareAtAmount: current?.compareAtAmount ?? "",
          isActive: current?.isActive ?? true,
        };
      }),
    },
  });
  const submit = useActionSubmit(form.setError);
  const errors = form.formState.errors.prices;
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submit(() => setVariantPricesAction(variant.id, values), t("saved"));
    if (result !== null) onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="prices-form">
      {rows.map((market, index) => (
        <fieldset key={market.code} disabled={!market.editable} className="grid gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">
            {localized(locale, market.nameAr, market.nameEn)} · <span className="ltr-value">{market.currencyCode}</span>
          </legend>
          <p className="text-xs text-muted-foreground">
            {market.editable
              ? t("subtitle", { taxMode: market.pricesIncludeTax ? t("taxInclusive") : t("taxExclusive") })
              : t("notAllowed")}
          </p>
          <input type="hidden" {...form.register(`prices.${index}.countryCode`)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              {t("amount")} ({market.currencyCode})
              <Input
                inputMode="decimal"
                dir="ltr"
                {...form.register(`prices.${index}.amount`)}
                data-field={`price-${market.code}`}
              />
              {errors?.[index]?.amount?.message ? (
                <span role="alert" className="text-xs text-destructive">
                  {translate(errors[index]?.amount?.message)}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("compareAt")}
              <Input inputMode="decimal" dir="ltr" {...form.register(`prices.${index}.compareAtAmount`)} />
              {errors?.[index]?.compareAtAmount?.message ? (
                <span role="alert" className="text-xs text-destructive">
                  {translate(errors[index]?.compareAtAmount?.message)}
                </span>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">{t("compareAtHint")}</span>
              )}
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox {...form.register(`prices.${index}.isActive`)} /> {t("active")}
          </label>
        </fieldset>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="prices-form-submit">
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

export function VariantsPanel({
  productId,
  variants,
  markets,
  canEdit,
  canEditPrices,
  canViewStock,
}: {
  productId: string;
  variants: VariantDto[];
  markets: MarketDto[];
  canEdit: boolean;
  canEditPrices: boolean;
  canViewStock: boolean;
}) {
  const t = useTranslations("variants");
  const products = useTranslations("products");
  const common = useTranslations("common");
  const sourceLabels = useTranslations("barcodeSource");
  const typeLabels = useTranslations("barcodeType");
  const locale = useLocale();

  return (
    <div className="grid gap-4" data-testid="variants-panel">
      {canEdit ? (
        <div className="flex justify-end">
          <FormDialog
            trigger={
              <>
                <Plus /> {t("add")}
              </>
            }
            title={t("addTitle")}
            wide
            testId="add-variant"
          >
            {(close) => <VariantForm productId={productId} onDone={close} />}
          </FormDialog>
        </div>
      ) : null}
      {variants.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {products("noVariants")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sku")}</TableHead>
                <TableHead>{t("barcode")}</TableHead>
                <TableHead>{t("prices")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-end">{common("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((variant) => {
                const label =
                  localized(locale, variant.nameAr, variant.nameEn) ||
                  (variant.sizeMl ? t("ml", { size: Number(variant.sizeMl).toString() }) : "—");
                return (
                  <TableRow key={variant.id} data-testid="variant-row" data-sku={variant.sku}>
                    <TableCell>
                      <p className="ltr-value font-mono text-sm font-medium">{variant.sku}</p>
                      <p className="text-xs text-muted-foreground">
                        {label}
                        {variant.isTester ? (
                          <Badge variant="warning" className="ms-2">
                            {t("isTester")}
                          </Badge>
                        ) : null}
                      </p>
                    </TableCell>
                    <TableCell>
                      {variant.barcode ? (
                        <div>
                          <p className="ltr-value font-mono text-sm">{variant.barcode}</p>
                          <p className="text-xs text-muted-foreground">
                            {typeLabels(variant.barcodeType as (typeof BARCODE_TYPES)[number])} ·{" "}
                            {sourceLabels(variant.barcodeSource as (typeof BARCODE_SOURCES)[number])}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("noBarcode")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-0.5 text-sm">
                        {markets
                          .filter(
                            (market) =>
                              market.isActive || variant.prices.some((price) => price.countryCode === market.code),
                          )
                          .map((market) => {
                            const price = variant.prices.find((candidate) => candidate.countryCode === market.code);
                            return (
                              <p key={market.code} className="flex gap-2 whitespace-nowrap">
                                <span className="ltr-value w-6 text-xs font-semibold text-muted-foreground">
                                  {market.code}
                                </span>
                                {price ? (
                                  <span
                                    className={price.isActive ? "" : "text-muted-foreground line-through"}
                                    data-price={market.code}
                                  >
                                    {formatMoney(price.amount, price.currencyCode, locale, market.minorUnits)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{t("noPrice")}</span>
                                )}
                              </p>
                            );
                          })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={variant.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {canEditPrices ? (
                          <FormDialog
                            trigger={
                              <>
                                <Tags /> {t("editPrices")}
                              </>
                            }
                            title={`${t("editPrices")} · ${variant.sku}`}
                            variant="outline"
                            size="sm"
                            wide
                            testId={`edit-prices-${variant.sku}`}
                          >
                            {(close) => <PricesForm variant={variant} markets={markets} onDone={close} />}
                          </FormDialog>
                        ) : null}
                        {canEdit ? (
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
                            {(close) => <VariantForm productId={productId} variant={variant} onDone={close} />}
                          </FormDialog>
                        ) : null}
                        {canViewStock && variant.trackInventory ? (
                          <Link
                            href={`/admin/inventory/stock/${variant.id}`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                            data-testid={`variant-stock-${variant.sku}`}
                          >
                            <Boxes /> {t("stockLink")}
                          </Link>
                        ) : null}
                        {variant.barcode ? (
                          <Link
                            href={`/admin/catalog/variants/${variant.id}/label`}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            <Printer /> {t("printLabel")}
                          </Link>
                        ) : null}
                        {canEdit && variant.status !== "DISCONTINUED" ? (
                          <ConfirmAction
                            trigger={variant.status === "ACTIVE" ? t("deactivate") : t("reactivate")}
                            title={variant.status === "ACTIVE" ? t("deactivate") : t("reactivate")}
                            description={common("areYouSure")}
                            confirmLabel={common("confirm")}
                            successMessage={t("statusChanged")}
                            variant={variant.status === "ACTIVE" ? "destructive" : "outline"}
                            action={() =>
                              changeVariantStatusAction(variant.id, variant.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
