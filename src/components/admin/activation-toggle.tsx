"use client";

import { useTranslations } from "next-intl";
import type { ActionResult } from "@/server/actions/result";
import { ConfirmAction } from "./confirm-action";

/** Activate / deactivate with confirmation. Deactivation is soft: history is kept. */
export function ActivationToggle({
  isActive,
  setActive,
  deactivateConfirm,
  activatedMessage,
  deactivatedMessage,
}: {
  isActive: boolean;
  setActive: (isActive: boolean) => Promise<ActionResult<unknown>>;
  deactivateConfirm: string;
  activatedMessage: string;
  deactivatedMessage: string;
}) {
  const common = useTranslations("common");
  return isActive ? (
    <ConfirmAction
      trigger={common("deactivate")}
      title={common("areYouSure")}
      description={deactivateConfirm}
      confirmLabel={common("deactivate")}
      successMessage={deactivatedMessage}
      variant="destructive"
      action={() => setActive(false)}
    />
  ) : (
    <ConfirmAction
      trigger={common("activate")}
      title={common("areYouSure")}
      description={common("activateConfirm")}
      confirmLabel={common("activate")}
      successMessage={activatedMessage}
      action={() => setActive(true)}
    />
  );
}
