import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useCurrentUser, useFranchises, useManual, usePublishManual } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { nextManualVersion } from "../logic";
import { EmptyState, ErrorState, Field, LoadingState, PageHeader, Panel, primaryButtonCls, Stat, textareaCls } from "../shared";

const MAX_VERSIONS = 5;

/** Mi franquiciadora: pick the approved manual sections, write what changed and publish a new version to the franchises. */
export function FranchisorPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const businessId = useCurrentUser().data?.business_id ?? undefined;
  const manualQ = useManual(businessId);
  const franchisesQ = useFranchises(businessId);
  const publish = usePublishManual();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);

  const manual = manualQ.data;
  const franchiseCount = manual?.franchises_following ?? franchisesQ.data?.length ?? 0;
  const next = nextManualVersion(manual?.current_version ?? null);
  const versions = manual?.versions ?? [];
  const canPublish = selected.length > 0 && note.trim().length > 0;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const doPublish = () => {
    if (!businessId) return;
    publish.mutate(
      { businessId, note: note.trim(), section_ids: selected },
      {
        onSuccess: () => {
          toast.success(t("owner_extra.franchisor.t_published", { version: next, count: franchiseCount }));
          setSelected([]);
          setNote("");
          setConfirming(false);
        },
        onError: () => {
          toast.error(t("owner_extra.common.t_error"));
          setConfirming(false);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.franchisor.question")} />

      {manualQ.isError || franchisesQ.isError ? (
        <ErrorState onRetry={() => { void manualQ.refetch(); void franchisesQ.refetch(); }} />
      ) : manualQ.isLoading || franchisesQ.isLoading ? (
        <LoadingState rows={3} />
      ) : !manual || manual.sections.length === 0 ? (
        <EmptyState title={t("owner_extra.franchisor.empty_title")} hint={t("owner_extra.franchisor.empty_hint")} />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel title={t("owner_extra.franchisor.publish_title")} aside={t("owner_extra.franchisor.publish_hint", { version: next })}>
            <fieldset className="border-t border-border">
              <legend className="sr-only">{t("owner_extra.franchisor.sections")}</legend>
              <ul className="divide-y divide-border">
                {manual.sections.map((s) => {
                  const approved = s.status === "approved";
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                          checked={selected.includes(s.id)}
                          disabled={!approved}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{s.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {approved
                              ? s.published_in
                                ? t("owner_extra.franchisor.published_in", { version: s.published_in })
                                : t("owner_extra.franchisor.never_published")
                              : t("owner_extra.franchisor.not_approved", { pct: s.pct })}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className="space-y-3 border-t border-border p-4">
              <Field label={t("owner_extra.franchisor.note")}>
                <textarea className={textareaCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("owner_extra.franchisor.note_example")} />
              </Field>
              <button className={primaryButtonCls} disabled={!canPublish || publish.isPending} onClick={() => setConfirming(true)}>
                {t("owner_extra.franchisor.publish", { version: next })}
              </button>
              {!canPublish && <p className="text-xs text-muted-foreground">{t("owner_extra.franchisor.publish_needs")}</p>}
            </div>
          </Panel>

          <aside className="h-fit space-y-4">
            <Stat
              label={t("owner_extra.franchisor.current_version")}
              value={manual.current_version ?? t("owner_extra.franchisor.no_version")}
              hint={t("owner_extra.franchisor.following", { count: franchiseCount })}
            />
            <Panel title={t("owner_extra.franchisor.history")}>
              {versions.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.franchisor.history_empty")}</p>
              ) : (
                <>
                  <ul className="divide-y divide-border border-t border-border">
                    {(showAllVersions ? versions : versions.slice(0, MAX_VERSIONS)).map((v) => (
                      <li key={v.id} className="px-4 py-3">
                        <p className="flex items-baseline justify-between gap-2">
                          <span className="font-display text-sm font-semibold">{v.version}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(v.published_at, lng)}</span>
                        </p>
                        <p className="mt-0.5 text-sm">{v.note}</p>
                        {v.section_titles.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{v.section_titles.join(", ")}</p>}
                      </li>
                    ))}
                  </ul>
                  {versions.length > MAX_VERSIONS && (
                    <button onClick={() => setShowAllVersions((x) => !x)} className="w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:bg-muted">
                      {showAllVersions ? t("owner_extra.common.show_less") : t("owner_extra.common.see_all", { count: versions.length })}
                    </button>
                  )}
                </>
              )}
            </Panel>
          </aside>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("owner_extra.franchisor.confirm_title", { version: next })}</AlertDialogTitle>
            <AlertDialogDescription>{t("owner_extra.franchisor.confirm_body", { sections: selected.length, count: franchiseCount })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("owner_extra.common.cancel")}</AlertDialogCancel>
            <button className={primaryButtonCls} disabled={publish.isPending} onClick={doPublish}>
              {publish.isPending ? t("owner_extra.common.saving") : t("owner_extra.franchisor.confirm_publish", { version: next })}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
