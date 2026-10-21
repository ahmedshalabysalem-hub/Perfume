"use client";

import { useCallback } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import type { ActionError, ActionResult } from "@/server/actions/result";
import { useTranslateMessage } from "./use-translate-message";

/**
 * Submit helper for forms backed by Server Actions: shows a translated toast,
 * pushes server-side field errors into React Hook Form, and returns the data
 * on success (or null on failure).
 */
export function useActionSubmit<TValues extends FieldValues>(setError?: UseFormSetError<TValues>) {
  const translate = useTranslateMessage();

  const reportError = useCallback(
    (error: ActionError) => {
      if (setError && error.fieldErrors) {
        for (const [path, messages] of Object.entries(error.fieldErrors)) {
          if (path === "_form" || messages.length === 0) continue;
          setError(path as Path<TValues>, { type: "server", message: messages[0] });
        }
      }
      toast.error(translate(error.messageKey, error.params));
    },
    [setError, translate],
  );

  return useCallback(
    async <TData>(call: () => Promise<ActionResult<TData>>, successMessage?: string): Promise<TData | null> => {
      try {
        const result = await call();
        if (!result.ok) {
          reportError(result.error);
          return null;
        }
        if (successMessage) toast.success(successMessage);
        return result.data;
      } catch {
        // Network failures or a stale deployment ("Failed to find Server Action").
        toast.error(translate("errors.network"));
        return null;
      }
    },
    [reportError, translate],
  );
}
