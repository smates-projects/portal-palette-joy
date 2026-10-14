import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useFranchiseeHome, useFranchiseeTasks, useManual, useSetFranchiseeTaskDone } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { EmptyBlock, ErrorBlock, LoadingBlocks, Panel, primaryButton, Screen, Tag } from "@/components/bishop/ui";

/**
 * Read-only manual of the franchisor. The data layer scopes it to the franchisor of this unit and to the sections
 * already published. Each section shows its text and the version that published it.
 */
export function FranchiseeManualPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const manualQ = useManual();
  const homeQ = useFranchiseeHome();
  const tasksQ = useFranchiseeTasks();
  const setDone = useSetFranchiseeTaskDone();

  if (manualQ.isError)
    return (
      <Screen ns="franchisee" screen="manual">
        <ErrorBlock title={t("franchisee.error")} retryLabel={t("franchisee.retry")} onRetry={() => void manualQ.refetch()} />
      </Screen>
    );
  if (manualQ.isLoading || !manualQ.data)
    return (
      <Screen ns="franchisee" screen="manual">
        <LoadingBlocks rows={2} />
      </Screen>
    );

  const manual = manualQ.data;
  const sections = manual.sections.filter((s) => s.published_in !== null);
  const current = manual.versions[0];
  const franchisor = homeQ.data?.franchisor_name;
  const readTask = (tasksQ.data ?? []).find((x) => x.kind === "manual_read" && !x.done);

  if (!current || sections.length === 0)
    return (
      <Screen ns="franchisee" screen="manual">
        <div className="mt-6"><EmptyBlock title={t("franchisee.manual.empty_title")} body={t("franchisee.manual.empty_body")} /></div>
      </Screen>
    );

  const markRead = () =>
    readTask &&
    setDone.mutate(
      { taskId: readTask.id, done: true },
      { onSuccess: () => toast.success(t("franchisee.manual.t_read")), onError: () => toast.error(t("franchisee.error_action")) },
    );

  return (
    <Screen ns="franchisee" screen="manual">
      <div className="mt-6 space-y-4">
        {/* Current version and what changed */}
        <Panel title={t("franchisee.manual.current_title")}>
          <div className="px-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-semibold tabular-nums">{current.version}</span>
              <Tag tone="success">{t("franchisee.manual.in_force")}</Tag>
              <span className="text-sm text-muted-foreground">{t("franchisee.manual.published", { date: formatDate(current.published_at, lng), franchisor: franchisor ?? "" })}</span>
            </div>
            <h3 className="mt-4 text-sm font-semibold">{t("franchisee.manual.what_changed")}</h3>
            <p className="mt-1 text-sm">{current.note}</p>
            {current.section_titles.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                {current.section_titles.map((title) => <li key={title}>{title}</li>)}
              </ul>
            )}
            {readTask && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3 text-sm text-status-warning-fg">
                <p className="font-medium">{t("franchisee.manual.unread", { version: current.version })}</p>
                <button disabled={setDone.isPending} onClick={markRead} className={primaryButton}>{t("franchisee.manual.mark_read")}</button>
              </div>
            )}
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Sections the franchisor already published */}
          <Panel title={t("franchisee.manual.sections_title")}>
            <ul className="divide-y divide-border border-t border-border">
              {sections.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{s.title}</h3>
                    <span className="text-xs text-muted-foreground">
                      {t("franchisee.manual.section_meta", { version: s.published_in, date: formatDate(s.updated_at, lng) })}
                    </span>
                  </div>
                  {s.body && (
                    <div className="mt-2 space-y-2 text-sm">
                      {s.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{t("franchisee.manual.read_only")}</p>
          </Panel>

          {/* Previous versions */}
          <Panel title={t("franchisee.manual.history_title")}>
            <ul className="divide-y divide-border border-t border-border">
              {manual.versions.map((v) => (
                <li key={v.id} className="px-4 py-3">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-display font-semibold tabular-nums">{v.version}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(v.published_at, lng)}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{v.note}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Screen>
  );
}
