"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { localized } from "@/lib/utils";
import { updateProductNotesAction } from "../actions";
import type { NoteOption } from "./types";

type Layers = { top: string[]; heart: string[]; base: string[] };
const LAYERS = [
  ["top", "TOP"],
  ["heart", "HEART"],
  ["base", "BASE"],
] as const;

export function NotesForm({
  productId,
  notes,
  initial,
  readOnly,
}: {
  productId: string;
  notes: NoteOption[];
  initial: Layers;
  readOnly: boolean;
}) {
  const t = useTranslations("products");
  const layerLabels = useTranslations("noteLayer");
  const common = useTranslations("common");
  const locale = useLocale();
  const [value, setValue] = useState<Layers>(initial);
  const [pending, startTransition] = useTransition();
  const submit = useActionSubmit();

  const toggle = (layer: keyof Layers, id: string, checked: boolean) =>
    setValue((current) => ({
      ...current,
      [layer]: checked ? [...current[layer], id] : current[layer].filter((noteId) => noteId !== id),
    }));

  return (
    <div className="grid gap-4" data-testid="notes-form">
      <p className="text-sm text-muted-foreground">{t("notesHint")}</p>
      <div className="grid gap-4 md:grid-cols-3">
        {LAYERS.map(([layer, label]) => (
          <fieldset key={layer} disabled={readOnly} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">{layerLabels(label)}</legend>
            <div className="max-h-64 overflow-y-auto">
              {notes
                .filter((note) => note.isActive || value[layer].includes(note.id))
                .map((note) => (
                  <label key={note.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={value[layer].includes(note.id)}
                      onChange={(event) => toggle(layer, note.id, event.target.checked)}
                    />
                    {localized(locale, note.nameAr, note.nameEn)}
                  </label>
                ))}
            </div>
          </fieldset>
        ))}
      </div>
      {readOnly ? null : (
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(
                async () => void (await submit(() => updateProductNotesAction(productId, value), t("notesSaved"))),
              )
            }
          >
            {pending ? common("saving") : common("save")}
          </Button>
        </div>
      )}
    </div>
  );
}
