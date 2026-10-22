"use client";

import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { SelectInput, TextAreaInput, TextInput } from "@/components/forms/inputs";
import { formResolver } from "@/components/forms/resolver";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { openingBalanceSchema, STOCK_STATUSES } from "@/lib/schemas/inventory";
import type { z } from "@/lib/validation/zod";
import { postOpeningBalanceAction } from "../../actions";

type Values = z.input<typeof openingBalanceSchema>;

export type OpeningBalanceWarehouse = { id: string; label: string; currencyCode: string };

export function OpeningBalanceForm({ warehouses }: { warehouses: OpeningBalanceWarehouse[] }) {
  const t = useTranslations("inventory");
  const statusLabels = useTranslations("stockStatus");
  const common = useTranslations("common");
  const form = useForm<Values>({
    resolver: formResolver(openingBalanceSchema),
    defaultValues: {
      variantCode: "",
      warehouseId: warehouses.length === 1 ? warehouses[0]!.id : "",
      status: "SELLABLE",
      quantity: "",
      unitCost: "",
      reason: "",
      lotNumber: "",
      manufacturedOn: "",
      expiresOn: "",
    },
  });
  const submit = useActionSubmit(form.setError);
  const warehouseId = useWatch({ control: form.control, name: "warehouseId" });
  const currency = warehouses.find((warehouse) => warehouse.id === warehouseId)?.currencyCode;

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submit(() => postOpeningBalanceAction(values), t("posted"));
    if (result === null) return;
    // Keep warehouse, status and reason for the next line of a go-live count.
    form.reset({
      ...values,
      variantCode: "",
      quantity: "",
      unitCost: "",
      lotNumber: "",
      manufacturedOn: "",
      expiresOn: "",
    });
    form.setFocus("variantCode");
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" data-testid="opening-balance-form">
      <TextInput
        form={form}
        name="variantCode"
        label={t("fields.variantCode")}
        description={t("fields.variantCodeHint")}
        required
        dir="ltr"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          form={form}
          name="warehouseId"
          label={t("fields.warehouse")}
          required
          placeholder={common("selectPlaceholder")}
          options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.label }))}
        />
        <SelectInput
          form={form}
          name="status"
          label={t("fields.status")}
          required
          options={STOCK_STATUSES.map((status) => ({ value: status, label: statusLabels(status) }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput form={form} name="quantity" label={t("fields.quantity")} required inputMode="numeric" dir="ltr" />
        <TextInput
          form={form}
          name="unitCost"
          label={currency ? t("fields.unitCost", { currency }) : t("fields.unitCostAny")}
          description={t("fields.unitCostHint")}
          required
          inputMode="decimal"
          dir="ltr"
        />
      </div>
      <fieldset className="grid gap-4 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{t("fields.batch")}</legend>
        <p className="text-xs text-muted-foreground">{t("fields.batchHint")}</p>
        <TextInput form={form} name="lotNumber" label={t("fields.lotNumber")} dir="ltr" />
        <div className="grid gap-4 sm:grid-cols-2">
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
            description={t("fields.expiresOnHint")}
            dir="ltr"
            placeholder="YYYY-MM-DD / YYYY-MM"
          />
        </div>
      </fieldset>
      <TextAreaInput
        form={form}
        name="reason"
        label={t("fields.reason")}
        description={t("fields.reasonPlaceholder")}
        required
      />
      <div className="flex justify-end gap-2">
        <Link
          href="/admin/inventory/stock"
          className="inline-flex items-center px-3 text-sm underline-offset-4 hover:underline"
        >
          {common("back")}
        </Link>
        <Button type="submit" disabled={form.formState.isSubmitting} data-testid="opening-balance-submit">
          {form.formState.isSubmitting ? common("saving") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
