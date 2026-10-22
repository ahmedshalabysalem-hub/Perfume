import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { TableCard } from "@/components/admin/list-controls";
import { NoAccess, PageHeader } from "@/components/admin/page-parts";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { initLocale, metadataLocale } from "@/i18n/params";
import { INSPECTION_TRANSITIONS } from "@/lib/inventory/batches";
import { localized } from "@/lib/utils";
import { getAdminPageActor } from "@/server/auth/page-guard";
import { getRequestMeta } from "@/server/context";
import { db } from "@/server/db";
import { getBatch } from "@/server/modules/inventory/batches.service";
import { isUuid } from "@/server/validation";
import { StockStatusBadge } from "../../stock-status-badge";
import { EligibilityBadge, ExpiryText, InspectionBadge, LotLabel } from "../batch-badges";
import { BatchDetailsForm, BatchStatusForm, BatchVerificationForm } from "./batch-forms";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/inventory/batches/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await metadataLocale(params), namespace: "batches" });
  return { title: t("detailTitle") };
}

export default async function BatchPage({ params }: PageProps<"/[locale]/admin/inventory/batches/[id]">) {
  const locale = await initLocale(params);
  const actor = await getAdminPageActor("inventory.view");
  if (!actor) return <NoAccess />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = { actor, meta: await getRequestMeta() };
  const result = await getBatch(ctx, id.toLowerCase());
  if (!result) notFound();
  const { batch, variant } = result;

  const t = await getTranslations("batches");
  const inventory = await getTranslations("inventory");
  const typeLabels = await getTranslations("movementType");
  const format = await getFormatter();
  const suppliers = result.canManage
    ? await db.supplier.findMany({
        where: { legalEntity: { code: batch.legalEntity.code } },
        orderBy: { code: "asc" },
        select: { id: true, code: true, nameEn: true, nameAr: true },
      })
    : [];
  const dateOnly = (value: string | null) =>
    value ? format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : "—";
  const yesNo = (value: boolean | null) => (value === null ? "—" : value ? t("check.PASS") : t("check.FAIL"));

  const facts: Array<[string, React.ReactNode]> = [
    [
      t("fields.company"),
      `${batch.legalEntity.code} · ${localized(locale, batch.legalEntity.legalNameAr, batch.legalEntity.legalNameEn)}`,
    ],
    [
      t("fields.lot"),
      batch.lotNumber || batch.isLegacy ? <LotLabel lotNumber={batch.lotNumber} isLegacy={batch.isLegacy} /> : "—",
    ],
    [t("fields.manufacturedOn"), dateOnly(batch.manufacturedOn)],
    [
      t("fields.expiresOn"),
      <ExpiryText
        key="expiry"
        expiresOn={batch.expiresOn}
        precision={batch.expiryPrecision}
        state={batch.expiryState}
      />,
    ],
    [
      t("fields.supplier"),
      batch.supplier
        ? `${batch.supplier.code} · ${localized(locale, batch.supplier.nameAr, batch.supplier.nameEn)}`
        : "—",
    ],
    [t("fields.detailsComplete"), batch.detailsComplete ? t("complete") : t("incomplete")],
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={t("detailHeading", { sku: variant.sku })}
        description={
          <>
            {localized(locale, variant.product.nameAr, variant.product.nameEn)}
            {" · "}
            <LotLabel lotNumber={batch.lotNumber} isLegacy={batch.isLegacy} />
          </>
        }
        actions={
          <Link href="/admin/inventory/batches" className={buttonVariants({ variant: "outline" })}>
            {t("title")}
          </Link>
        }
      />
      {batch.isLegacy && batch.verificationResult === "NONE" ? (
        <Alert variant="warning" className="mb-4" data-testid="legacy-awaiting-verification">
          {t("legacyAwaiting")}
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.batch")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("sections.status")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("fields.inspection")}</dt>
              <dd data-testid="batch-inspection">
                <InspectionBadge status={batch.inspectionStatus} />
              </dd>
              <dt className="text-muted-foreground">{t("fields.sale")}</dt>
              <dd data-testid="batch-eligibility">
                <EligibilityBadge eligibility={batch.eligibility} />
              </dd>
              <dt className="text-muted-foreground">{t("fields.statusReason")}</dt>
              <dd>
                {batch.statusReason ?? "—"}
                {batch.statusChangedAt ? (
                  <span className="block text-xs text-muted-foreground">
                    {batch.statusChangedBy ?? inventory("system")} · {format.dateTime(batch.statusChangedAt, "short")}
                  </span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">{t("fields.verification")}</dt>
              <dd data-testid="batch-verification" data-result={batch.verificationResult}>
                {t(`verification.${batch.verificationResult}`)}
                {batch.verifiedAt ? (
                  <span className="block text-xs text-muted-foreground">
                    {t("fields.physicalCheck")}: {yesNo(batch.physicalCheckOk)} · {t("fields.labelCheck")}:{" "}
                    {yesNo(batch.labelCheckOk)}
                    <br />
                    {batch.verifiedBy ?? inventory("system")} · {format.dateTime(batch.verifiedAt, "short")}
                    {batch.verificationNotes ? (
                      <>
                        <br />
                        {batch.verificationNotes}
                      </>
                    ) : null}
                  </span>
                ) : null}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{inventory("balances")}</CardTitle>
        </CardHeader>
        <CardContent>
          {result.balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">{inventory("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{inventory("columns.warehouse")}</TableHead>
                  <TableHead>{inventory("columns.status")}</TableHead>
                  <TableHead className="text-end">{inventory("columns.onHand")}</TableHead>
                  <TableHead className="text-end">{inventory("columns.reserved")}</TableHead>
                  <TableHead className="text-end">{inventory("columns.availableForSale")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.balances.map((balance) => (
                  <TableRow
                    key={`${balance.warehouse.id}:${balance.status}`}
                    data-testid="batch-balance-row"
                    data-status={balance.status}
                  >
                    <TableCell className="text-sm">
                      <span className="ltr-value font-mono text-xs">{balance.warehouse.code}</span>{" "}
                      <span className="text-muted-foreground">
                        {localized(locale, balance.warehouse.nameAr, balance.warehouse.nameEn)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StockStatusBadge status={balance.status} />
                    </TableCell>
                    <TableCell className="text-end tabular-nums" data-testid="batch-on-hand">
                      {balance.onHand}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground tabular-nums">{balance.reserved}</TableCell>
                    <TableCell className="text-end font-medium tabular-nums" data-testid="batch-available-for-sale">
                      {balance.availableForSale}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {result.canManage && batch.inspectionStatus !== "REJECTED" ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.verify")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BatchVerificationForm
                batchId={batch.id}
                version={batch.version}
                isLegacy={batch.isLegacy}
                expiryRecorded={batch.expiryBasis === "RECORDED"}
                allowNotApplicable={!variant.trackExpiry}
                canQuarantine={batch.inspectionStatus !== "QUARANTINED"}
                canReject={INSPECTION_TRANSITIONS[batch.inspectionStatus].includes("REJECTED")}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.decision")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BatchStatusForm
                batchId={batch.id}
                version={batch.version}
                allowed={INSPECTION_TRANSITIONS[batch.inspectionStatus].filter(
                  (s): s is "RELEASED" | "QUARANTINED" | "REJECTED" => s !== "PENDING_INSPECTION",
                )}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("sections.details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <BatchDetailsForm
                batchId={batch.id}
                version={batch.version}
                isLegacy={batch.isLegacy}
                current={{
                  lotNumber: batch.lotNumber,
                  manufacturedOn: batch.manufacturedOn,
                  expiresOn:
                    batch.expiresOn && batch.expiryPrecision === "MONTH"
                      ? batch.expiresOn.slice(0, 7)
                      : batch.expiresOn,
                  supplierId: batch.supplier?.id ?? null,
                }}
                suppliers={suppliers.map((s) => ({
                  value: s.id,
                  label: `${s.code} · ${localized(locale, s.nameAr, s.nameEn)}`,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <h2 className="mb-3 text-lg font-semibold">{inventory("movements")}</h2>
      {result.movements.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">{inventory("noMovements")}</p>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{inventory("columns.postedAt")}</TableHead>
                <TableHead>{inventory("columns.type")}</TableHead>
                <TableHead>{inventory("columns.warehouse")}</TableHead>
                <TableHead>{inventory("columns.status")}</TableHead>
                <TableHead className="text-end">{inventory("columns.quantity")}</TableHead>
                <TableHead className="text-end">{inventory("columns.balanceAfter")}</TableHead>
                <TableHead>{inventory("columns.reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.movements.map((movement) => (
                <TableRow key={movement.id} data-testid="batch-movement-row" data-type={movement.type}>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {format.dateTime(movement.postedAt, "short")}
                  </TableCell>
                  <TableCell className="text-sm">{typeLabels(movement.type)}</TableCell>
                  <TableCell className="ltr-value font-mono text-xs">{movement.warehouse.code}</TableCell>
                  <TableCell>
                    <StockStatusBadge status={movement.status} />
                  </TableCell>
                  <TableCell
                    className={`text-end font-medium tabular-nums ${movement.quantity < 0 ? "text-destructive" : "text-success"}`}
                  >
                    <span className="ltr-value">
                      {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{movement.balanceAfter}</TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">{movement.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {result.history.length > 0 ? (
        <>
          <h2 className="mt-6 mb-3 text-lg font-semibold">{t("sections.history")}</h2>
          <TableCard>
            <Table>
              <TableBody>
                {result.history.map((entry) => (
                  <TableRow key={entry.id} data-testid="batch-history-row" data-action={entry.action}>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {format.dateTime(entry.occurredAt, "short")}
                    </TableCell>
                    <TableCell className="text-sm">{entry.actorName ?? inventory("system")}</TableCell>
                    <TableCell className="text-sm">{entry.summary}</TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">{entry.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </>
      ) : null}
    </div>
  );
}
