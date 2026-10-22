"use client";

import { Pencil, Plus } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { ActivationToggle } from "@/components/admin/activation-toggle";
import { FormDialog } from "@/components/admin/form-dialog";
import { ActiveBadge } from "@/components/admin/status-badge";
import { TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { supplierProductCreateSchema, supplierProductUpdateSchema } from "@/lib/schemas/procurement";
import { localized } from "@/lib/utils";
import type { z } from "@/lib/validation/zod";
import { addSupplierProductAction, setSupplierProductActiveAction, updateSupplierProductAction } from "../actions";

export type SupplierProductDto = {
  id: string;
  productId: string;
  productNameEn: string;
  productNameAr: string;
  variantLabel: string | null;
  sku: string;
  barcode: string | null;
  supplierSku: string;
  supplierProductName: string | null;
  lastCostAmount: string | null;
  lastCostCurrency: string | null;
  /** ISO timestamp. */
  lastCostAt: string | null;
  isActive: boolean;
};

type CreateValues = z.input<typeof supplierProductCreateSchema>;

function SupplierProductForm({
  supplierId,
  row,
  currencyCode,
  onDone,
}: {
  supplierId: string;
  row?: SupplierProductDto;
  currencyCode: string;
  onDone: () => void;
}) {
  const t = useTranslations("suppliers");
  const common = useTranslations("common");
  const form = useForm<CreateValues>({
    resolver: formResolver(
      row
        ? (supplierProductUpdateSchema as unknown as typeof supplierProductCreateSchema)
        : supplierProductCreateSchema,
    ),
    defaultValues: {
      variantCode: row?.sku ?? "",
      supplierSku: row?.supplierSku ?? "",
      supplierProductName: row?.supplierProductName ?? "",
      lastCostAmount: row?.lastCostAmount ?? "",
    },
  });
  const submit = useActionSubmit(form.setError);
  const onSubmit = form.handleSubmit(async (values) => {
    let result;
    if (row) {
      const { variantCode: _variantCode, ...rest } = values;
      result = await submit(() => updateSupplierProductAction(row.id, rest), t("productSaved"));
    } else {
      result = await submit(() => addSupplierProductAction(supplierId, values), t("productSaved"));
    }
    if (result !== null) onDone();
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="supplier-product-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          form={form}
          name="variantCode"
          label={t("variantCode")}
          description={row ? t("variantLockedHint") : t("variantCodeHint")}
          required
          disabled={!!row}
          dir="ltr"
        />
        <TextInput form={form} name="supplierSku" label={t("supplierSku")} required dir="ltr" />
        <TextInput form={form} name="supplierProductName" label={t("supplierProductName")} />
        <TextInput
          form={form}
          name="lastCostAmount"
          label={t("lastCostIn", { currency: currencyCode })}
          description={t("lastCostHint")}
          inputMode="decimal"
          dir="ltr"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {common("cancel")}
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="supplier-product-form-submit">
          {form.formState.isSubmitting ? common("saving") : common("save")}
        </Button>
      </div>
    </form>
  );
}

export function SupplierProductsPanel({
  supplierId,
  rows,
  currencyCode,
  canEdit,
  canAdd,
}: {
  supplierId: string;
  rows: SupplierProductDto[];
  currencyCode: string;
  canEdit: boolean;
  /** False for inactive suppliers. */
  canAdd: boolean;
}) {
  const t = useTranslations("suppliers");
  const common = useTranslations("common");
  const locale = useLocale();
  const format = useFormatter();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">{t("productsHint")}</p>
        {canEdit && canAdd ? (
          <FormDialog
            trigger={
              <>
                <Plus /> {t("addProduct")}
              </>
            }
            title={t("addProduct")}
            wide
            testId="add-supplier-product"
          >
            {(close) => <SupplierProductForm supplierId={supplierId} currencyCode={currencyCode} onDone={close} />}
          </FormDialog>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("noProducts")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ourProduct")}</TableHead>
                <TableHead>{t("supplierSku")}</TableHead>
                <TableHead>{t("lastCost")}</TableHead>
                <TableHead>{common("status")}</TableHead>
                {canEdit ? <TableHead className="text-end">{common("actions")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="supplier-product-row" data-sku={row.sku}>
                  <TableCell>
                    <Link href={`/admin/catalog/products/${row.productId}`} className="font-medium hover:underline">
                      {localized(locale, row.productNameAr, row.productNameEn)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      <span className="ltr-value font-mono">{row.sku}</span>
                      {row.variantLabel ? ` · ${row.variantLabel}` : null}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="ltr-value font-mono text-xs">{row.supplierSku}</p>
                    {row.supplierProductName ? (
                      <p className="text-xs text-muted-foreground">{row.supplierProductName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {row.lastCostAmount && row.lastCostCurrency ? (
                      <>
                        <p className="ltr-value tabular-nums" data-testid="last-cost">
                          {formatMoney(row.lastCostAmount, row.lastCostCurrency, locale)}
                        </p>
                        {row.lastCostAt ? (
                          <p className="text-xs text-muted-foreground">
                            {format.dateTime(new Date(row.lastCostAt), "short")}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{common("notSet")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={row.isActive} />
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <FormDialog
                          trigger={<Pencil aria-label={common("edit")} />}
                          title={t("editProduct")}
                          variant="ghost"
                          size="icon-sm"
                          wide
                        >
                          {(close) => (
                            <SupplierProductForm
                              supplierId={supplierId}
                              row={row}
                              currencyCode={currencyCode}
                              onDone={close}
                            />
                          )}
                        </FormDialog>
                        <ActivationToggle
                          isActive={row.isActive}
                          setActive={(active) => setSupplierProductActiveAction(row.id, active)}
                          deactivateConfirm={t("deactivateProductConfirm")}
                          activatedMessage={t("activated")}
                          deactivatedMessage={t("deactivated")}
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
