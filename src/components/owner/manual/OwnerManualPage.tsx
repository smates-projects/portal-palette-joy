import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApproveManualSection, useManual, useTasks } from "@/lib/api/hooks";
import type { ManualSection, ManualSectionStatus, VisibleTaskStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buildManualSections } from "../logic";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, primaryButtonCls, ProgressBar, Stat, ToneBadge, type Tone } from "../shared";

const MAX_VERSIONS = 5;
const MAX_ACTIVITY = 5;
const SECTION_TONE: Record<ManualSectionStatus, Tone> = {
  not_started: "neutral",
  drafting: "info",
  in_review: "review",
  approved: "success",
};

/**
 * Manual of the owner's own business. Each section shows what it says and what feeds it: the catalog tasks of this
 * business. An approved task is already part of the manual, the others are pending. The owner approves a section
 * once all of its tasks are approved.
 */
export function OwnerManualPage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const manualQ = useManual();
  const tasksQ = useTasks();
  const approve = useApproveManualSection();
  const [showAllVersions, setShowAllVersions] = useState(false);
  /** Section waiting for the confirmation dialog. */
  const [confirming, setConfirming] = useState<ManualSection | null>(null);

  const manual = manualQ.data;
  const views = manual ? buildManualSections(manual.sections, tasksQ.data ?? []) : [];
  const versions = manual?.versions ?? [];
  const shownVersions = showAllVersions ? versions : versions.slice(0, MAX_VERSIONS);
  const activity = (manual?.activity ?? []).slice(0, MAX_ACTIVITY);

  const confirmApproval = () => {
    if (!confirming) return;
    const section = confirming;
    approve.mutate(section.id, {
      onSuccess: () => {
        setConfirming(null);
        toast.success(t("owner_extra.manual.t_approved", { section: section.title }));
      },
      onError: () => toast.error(t("owner_extra.manual.t_approve_error")),
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <PageHeader question={t("owner_extra.manual.question")} />

      {manualQ.isError || tasksQ.isError ? (
        <ErrorState onRetry={() => { void manualQ.refetch(); void tasksQ.refetch(); }} />
      ) : manualQ.isLoading || tasksQ.isLoading ? (
        <LoadingState rows={4} />
      ) : !manual || manual.sections.length === 0 ? (
        <EmptyState title={t("owner_extra.manual.empty_title")} hint={t("owner_extra.manual.empty_hint")} />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            {views.map(({ section, tasks, included, ready }) => (
              <Panel
                key={section.id}
                title={section.title}
                aside={<ToneBadge tone={SECTION_TONE[section.status]}>{t(`owner_extra.manual.status_${section.status}`)}</ToneBadge>}
              >
                <div className="flex items-center gap-3 px-4 pb-3">
                  <div className="flex-1">
                    <ProgressBar pct={section.pct} label={t("owner_extra.manual.progress_label", { section: section.title })} />
                  </div>
                  <span className="font-display text-sm font-semibold tabular-nums">{section.pct}%</span>
                </div>

                {section.body && (
                  <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
                    {section.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                )}

                {tasks.length === 0 ? (
                  <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.manual.no_tasks")}</p>
                ) : (
                  <>
                    <p className="border-t border-border px-4 pt-3 text-xs text-muted-foreground">
                      {t("owner_extra.manual.included_count", { included, total: tasks.length })}
                    </p>
                    <ul className="divide-y divide-border">
                      {tasks.map((task) => (
                        <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link to="/tareas/$taskId" params={{ taskId: task.id }} className="text-sm hover:underline">
                              <span className="font-display tabular-nums text-muted-foreground">{task.code}</span> · {task.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {task.status === "accepted" ? t("owner_extra.manual.task_included") : t("owner_extra.manual.task_pending")}
                            </p>
                          </div>
                          <StatusBadge status={task.status as VisibleTaskStatus} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {section.status !== "approved" && tasks.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                    <p className="text-sm">{ready ? t("owner_extra.manual.ready_hint") : t("owner_extra.manual.not_ready_hint")}</p>
                    {ready && (
                      <button onClick={() => setConfirming(section)} disabled={approve.isPending} className={primaryButtonCls}>
                        {t("owner_extra.manual.approve")}
                      </button>
                    )}
                  </div>
                )}
              </Panel>
            ))}
          </div>

          <aside className="h-fit space-y-4">
            <Stat
              label={t("owner_extra.manual.current_version")}
              value={manual.current_version ?? t("owner_extra.manual.no_version")}
              hint={t("owner_extra.manual.completion", { pct: manual.completion_pct })}
            />
            <Panel title={t("owner_extra.manual.history")}>
              {versions.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.manual.history_empty")}</p>
              ) : (
                <>
                  <ul className="divide-y divide-border border-t border-border">
                    {shownVersions.map((v) => (
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
            <Panel title={t("owner_extra.manual.activity")}>
              {activity.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.manual.activity_empty")}</p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {activity.map((e) => (
                    <li key={e.id} className="px-4 py-3">
                      <p className="text-sm">{t("owner_extra.manual.activity_approved", { section: e.section_title })}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(e.created_at, lng)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("owner_extra.manual.confirm_title", { section: confirming?.title ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("owner_extra.manual.confirm_body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("owner_extra.manual.confirm_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={approve.isPending}
              onClick={(e) => {
                // Keep the dialog open until the approval is saved; it closes in onSuccess.
                e.preventDefault();
                confirmApproval();
              }}
            >
              {t("owner_extra.manual.confirm_action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
