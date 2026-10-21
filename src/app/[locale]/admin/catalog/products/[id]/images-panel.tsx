"use client";

import { Star, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { useActionSubmit } from "@/components/forms/use-action-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import { makePrimaryImageAction, removeProductImageAction, uploadProductImageAction } from "../actions";
import type { ImageDto } from "./types";

const MAX_BYTES = 5 * 1024 * 1024;

export function ImagesPanel({ productId, images, canEdit }: { productId: string; images: ImageDto[]; canEdit: boolean }) {
  const t = useTranslations("images");
  const common = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const submit = useActionSubmit();

  return (
    <div className="grid gap-6">
      {canEdit ? (
        <form
          ref={formRef}
          className="grid gap-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const file = data.get("file");
            if (!(file instanceof File) || file.size === 0) return toast.error(t("invalidFile"));
            if (file.size > MAX_BYTES) return toast.error(t("tooLarge"));
            startTransition(async () => {
              const result = await submit(() => uploadProductImageAction(productId, data), t("uploaded"));
              if (result !== null) {
                formRef.current?.reset();
                setFileName(null);
              }
            });
          }}
        >
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium">
              {t("upload")}
              <Input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
                data-testid="image-file"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("altEn")}
              <Input name="altEn" dir="ltr" maxLength={200} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t("altAr")}
              <Input name="altAr" dir="rtl" maxLength={200} />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || !fileName} data-testid="image-upload">
              <Upload /> {pending ? t("uploading") : t("upload")}
            </Button>
          </div>
        </form>
      ) : null}

      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.id} className="overflow-hidden rounded-xl border bg-card" data-testid="product-image">
              <div className="relative aspect-square bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of a stored image */}
                <img src={image.url} alt={image.altEn ?? ""} className="size-full object-cover" />
                {index === 0 ? (
                  <Badge variant="gold" className="absolute start-2 top-2 bg-card">
                    {t("primary")}
                  </Badge>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex justify-between gap-1 p-2">
                  {index > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startTransition(async () => void (await submit(() => makePrimaryImageAction(image.id))))}
                    >
                      <Star /> {t("makePrimary")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <ConfirmAction
                    trigger={<Trash2 aria-label={t("remove")} />}
                    title={t("remove")}
                    description={t("removeConfirm")}
                    confirmLabel={t("remove")}
                    successMessage={t("removed")}
                    variant="destructive"
                    size="icon-sm"
                    action={() => removeProductImageAction(image.id)}
                  />
                </div>
              ) : null}
              <span className="sr-only">{common("view")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
