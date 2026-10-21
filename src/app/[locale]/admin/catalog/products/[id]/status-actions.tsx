"use client";

import { useTranslations } from "next-intl";
import { ConfirmAction } from "@/components/admin/confirm-action";
import type { ProductStatusValue } from "@/lib/schemas/catalog";
import { changeProductStatusAction } from "../actions";

type ActionKey = "publish" | "unpublish" | "deactivate" | "reactivate" | "discontinue" | "toDraft";

function actionFor(from: ProductStatusValue, to: ProductStatusValue): ActionKey {
  if (to === "PUBLISHED") return "publish";
  if (to === "DISCONTINUED") return "discontinue";
  if (to === "DRAFT") return "toDraft";
  if (from === "PUBLISHED") return "unpublish";
  if (from === "DISCONTINUED") return "reactivate";
  return "deactivate";
}

/** Buttons for the transitions this user may perform (computed on the server). */
export function ProductStatusActions({
  productId,
  status,
  transitions,
}: {
  productId: string;
  status: ProductStatusValue;
  transitions: ProductStatusValue[];
}) {
  const t = useTranslations("products");
  const statusLabels = useTranslations("status");
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((target) => {
        const key = actionFor(status, target);
        return (
          <ConfirmAction
            key={target}
            trigger={t(`statusActions.${key}`)}
            title={t(`statusActions.${key}`)}
            description={t(`statusConfirm.${key}`)}
            confirmLabel={t(`statusActions.${key}`)}
            successMessage={t("statusChanged", { status: statusLabels(target) })}
            withReason={key === "discontinue" || key === "unpublish" || key === "deactivate"}
            variant={key === "publish" ? "gold" : key === "discontinue" ? "destructive" : "outline"}
            size="default"
            testId={`status-${key}`}
            action={(reason) => changeProductStatusAction(productId, target, reason)}
          />
        );
      })}
    </div>
  );
}
