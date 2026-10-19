import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrandEvents, useBusinessBrand, useBusinesses, useCurrentUser, useResetBrand, useSetBrand, useUsersWithInactive } from "@/lib/api/hooks";
import type { BrandProposalUpload } from "@/lib/api/repositories";
import type { BrandEvent, BusinessBrand } from "@/lib/api/types";
import { BRAND_TASK_CODE, canResetBrand, canSetBrand } from "@/lib/brand/scope";
import { formatDateTime } from "@/lib/format";
import { linkBtn, primaryBtn, secondaryBtn } from "@/components/accounts/shared";
import { BrandCaptureSection } from "./BrandCaptureSection";
import { BrandPreview } from "./BrandPreview";

/**
 * "Tu marca" (owner, Mi negocio) and "Marca del negocio" (SM, business sheet). Shows the brand the portal uses,
 * where it came from (B5-13 or SM) and its history. SM can load it by hand; the owner or SM can go back to the SM brand.
 */
export function BrandPanel({ businessId, mode }: { businessId?: string; mode: "owner" | "sm" }) {
  const { t, i18n } = useTranslation();
  const me = useCurrentUser().data;
  const brandQ = useBusinessBrand(businessId);
  const eventsQ = useBrandEvents(businessId ?? me?.business_id ?? undefined);
  const bizQ = useBusinesses();
  const usersQ = useUsersWithInactive();
  const reset = useResetBrand();
  const [loading, setLoading] = useState(false);
  const business = bizQ.data?.find((b) => b.id === (businessId ?? me?.business_id));
  const brand = brandQ.data ?? null;
  const canSet = !!me && !!business && canSetBrand(me, business);
  const canReset = !!me && !!business && canResetBrand(me, business);
  const name = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id)?.full_name ?? "" : "");
  const fail = () => toast.error(t("brand.t_error"));
  const doReset = () => {
    if (!business) return;
    const prev = brand;
    reset.mutate(business.id, {
      onSuccess: () => toast.success(t("brand.t_reset"), prev && canSet ? { action: { label: t("brand.undo"), onClick: () => setBack(prev) } } : undefined),
      onError: fail,
    });
  };
  const setBrand = useSetBrand();
  const setBack = (prev: BusinessBrand) =>
    setBrand.mutate({ businessId: prev.business_id, palette: { primary_color: prev.primary_color, accent_color: prev.accent_color, font_family: prev.font_family, logo_file_name: prev.logo_file_name, logo_url: prev.logo_url } }, { onError: fail });
  const describe = (e: BrandEvent) => t(`brand.events.${e.kind}`, { actor: name(e.actor_user_id) });

  return (
    <section className="rounded-[4px] border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold">{t(mode === "owner" ? "brand.panel_title_owner" : "brand.panel_title_sm")}</h2>
        {brand && <span className="text-xs text-muted-foreground">{t(brand.source === "b5_13" ? "brand.source_b5_13" : "brand.source_sm", { version: brand.version ?? 1, date: formatDateTime(brand.applied_at, i18n.language) })}</span>}
      </div>
      <div className="border-t border-border p-4">
        {brandQ.isLoading || bizQ.isLoading ? (
          <Skeleton className="h-40 rounded-[4px]" />
        ) : brandQ.isError ? (
          <p className="text-sm text-status-danger-fg">{t("brand.t_error")}</p>
        ) : brand && business ? (
          <div className="space-y-3">
            <BrandPreview name={business.name} palette={brand} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <Swatch label={t("brand.primary")} color={brand.primary_color} />
              <Swatch label={t("brand.accent")} color={brand.accent_color} />
              <div><dt className="text-muted-foreground">{t("brand.font")}</dt><dd className="mt-0.5">{brand.font_family ?? t("brand.font_default")}</dd></div>
              <div>
                <dt className="text-muted-foreground">{t("brand.logo_file")}</dt>
                <dd className="mt-0.5 truncate">
                  {brand.logo_url ? (
                    // Shown on the primary color: most logos for a dark rail are white or light.
                    <span className="inline-flex h-10 items-center rounded-[4px] px-2" style={{ backgroundColor: brand.primary_color }}><img src={brand.logo_url} alt={brand.logo_file_name ?? ""} className="h-7 max-w-[8rem] object-contain" /></span>
                  ) : (
                    brand.logo_file_name ?? t("brand.no_logo")
                  )}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{t(mode === "owner" ? "brand.applies_to_owner" : "brand.applies_to_sm")}</p>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              {canSet && <button className={secondaryBtn} onClick={() => setLoading(true)}>{t("brand.load_manual")}</button>}
              {canReset && <button className={linkBtn} disabled={reset.isPending} onClick={doReset}>{t("brand.reset")}</button>}
            </div>
          </div>
        ) : (
          <div className="rounded-[4px] border border-dashed border-border p-4">
            <p className="text-sm font-medium">{t("brand.empty_title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t(mode === "owner" ? "brand.empty_owner" : "brand.empty_sm", { code: BRAND_TASK_CODE })}</p>
            {canSet && <button className={`${secondaryBtn} mt-3`} onClick={() => setLoading(true)}>{t("brand.load_manual")}</button>}
          </div>
        )}
      </div>
      {!!eventsQ.data?.length && (
        <div className="border-t border-border px-4 py-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("brand.history_title")}</h3>
          <ol className="mt-2 space-y-1.5 text-xs">
            {eventsQ.data.slice(0, 5).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                {e.palette && <span aria-hidden className="inline-flex gap-0.5"><span className="h-3 w-3 rounded-[2px] border border-border" style={{ backgroundColor: e.palette.primary_color }} /><span className="h-3 w-3 rounded-[2px] border border-border" style={{ backgroundColor: e.palette.accent_color }} /></span>}
                <span>{describe(e)}</span>
                <span className="text-muted-foreground">{formatDateTime(e.created_at, i18n.language)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {loading && business && <ManualBrandDialog businessId={business.id} businessName={business.name} current={brand} onClose={() => setLoading(false)} />}
    </section>
  );
}

function Swatch({ label, color }: { label: string; color: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 font-display tabular-nums"><span aria-hidden className="h-3.5 w-3.5 rounded-[2px] border border-border" style={{ backgroundColor: color }} />{color}</dd>
    </div>
  );
}

/** SM loads the brand by hand (the business already had one): palette, font and logo, with preview and contrast check. */
function ManualBrandDialog({ businessId, businessName, current, onClose }: { businessId: string; businessName: string; current: BusinessBrand | null; onClose: () => void }) {
  const { t } = useTranslation();
  const setBrand = useSetBrand();
  const [proposal, setProposal] = useState<BrandProposalUpload | null>(null);
  const initial: BrandProposalUpload | null = current ? { primary_color: current.primary_color, accent_color: current.accent_color, font_family: current.font_family, logo_file_name: current.logo_file_name, logo_url: current.logo_url, manual_file_name: current.manual_file_name ?? "" } : null;
  const submit = () => {
    if (!proposal) return;
    const { manual_file_name: _m, ...palette } = proposal;
    setBrand.mutate({ businessId, palette }, {
      onSuccess: () => { toast.success(t("brand.t_set", { name: businessName })); onClose(); },
      onError: () => toast.error(t("brand.t_error")),
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("brand.manual_dialog_title", { name: businessName })}</DialogTitle>
          <DialogDescription>{t("brand.manual_dialog_body")}</DialogDescription>
        </DialogHeader>
        <BrandCaptureSection businessName={businessName} value={initial} onChange={setProposal} mode="manual" />
        <DialogFooter>
          <button type="button" className={secondaryBtn} onClick={onClose}>{t("accounts.cancel")}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={!proposal || setBrand.isPending}>{t("brand.manual_confirm")}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
