"use client";

import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormDialog } from "@/components/admin/form-dialog";
import { setBrandActiveAction } from "./actions";
import { BrandForm, EMPTY_BRAND, type BrandFormValues } from "./brand-form";

export function NewBrandButton() {
  const t = useTranslations("brands");
  return (
    <FormDialog
      trigger={
        <>
          <Plus /> {t("new")}
        </>
      }
      title={t("createTitle")}
      wide
      testId="new-brand"
    >
      {(close) => <BrandForm defaults={EMPTY_BRAND} onDone={close} />}
    </FormDialog>
  );
}

export function BrandRowActions({
  id,
  isActive,
  defaults,
}: {
  id: string;
  isActive: boolean;
  defaults: BrandFormValues;
}) {
  const t = useTranslations("brands");
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
        {(close) => <BrandForm brandId={id} defaults={defaults} onDone={close} />}
      </FormDialog>
      {isActive ? (
        <ConfirmAction
          trigger={common("deactivate")}
          title={common("areYouSure")}
          description={t("deactivateConfirm")}
          confirmLabel={common("deactivate")}
          successMessage={t("deactivated")}
          variant="destructive"
          action={() => setBrandActiveAction(id, false)}
        />
      ) : (
        <ConfirmAction
          trigger={common("activate")}
          title={common("areYouSure")}
          description={common("activateConfirm")}
          confirmLabel={common("activate")}
          successMessage={t("activated")}
          action={() => setBrandActiveAction(id, true)}
        />
      )}
    </div>
  );
}
