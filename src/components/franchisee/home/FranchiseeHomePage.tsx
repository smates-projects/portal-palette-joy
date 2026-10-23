import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Circle } from "lucide-react";
import { todayIso } from "@/lib/clock";
import { useFranchiseeChecklist, useFranchiseeHome, useFranchiseeTasks, useFranchiseeTickets, useSetFranchiseeTaskDone } from "@/lib/api/hooks";
import type { FranchiseTask, TicketState } from "@/lib/api/types";
import { formatDate, formatRelativeDate, formatUsd } from "@/lib/format";
import { formatMonth } from "@/components/bishop/portfolio/recovery";
import { ErrorBlock, LoadingBlocks, Metric, Panel, primaryButton, ProgressBar, Screen, secondaryButton, Tag, type Tone } from "@/components/bishop/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { NewTicketDialog } from "./NewTicketDialog";

const MAX_ITEMS = 5;
const TICKET_TONE: Record<TicketState, Tone> = { open: "warning", answered: "success", closed: "neutral" };

/** Home of a franchisee: sales and royalty of the month, standards, the manual version and what he has to do. */
export function FranchiseeHomePage() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const homeQ = useFranchiseeHome();
  const tasksQ = useFranchiseeTasks();
  const checklistQ = useFranchiseeChecklist();
  const ticketsQ = useFranchiseeTickets();
  const setDone = useSetFranchiseeTaskDone();
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllChecklist, setShowAllChecklist] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);

  if (homeQ.isError)
    return (
      <Screen ns="franchisee" screen="home">
        <ErrorBlock title={t("franchisee.error")} retryLabel={t("franchisee.retry")} onRetry={() => void homeQ.refetch()} />
      </Screen>
    );
  if (homeQ.isLoading || !homeQ.data)
    return (
      <Screen ns="franchisee" screen="home">
        <LoadingBlocks />
      </Screen>
    );

  const home = homeQ.data;
  const { franchise } = home;
  const lastReport = franchise.last_report;
  const opening = franchise.status === "opening";
  const openTasks = (tasksQ.data ?? []).filter((x) => !x.done);
  const shownTasks = showAllTasks ? openTasks : openTasks.slice(0, MAX_ITEMS);
  // Pending checklist items come first: they are what he has to work on.
  const checklist = [...(checklistQ.data ?? [])].sort((a, b) => Number(a.ok) - Number(b.ok));
  const shownChecklist = showAllChecklist ? checklist : checklist.slice(0, MAX_ITEMS);
  const tickets = ticketsQ.data ?? [];
  const shownTickets = showAllTickets ? tickets : tickets.slice(0, MAX_ITEMS);

  const markDone = (task: FranchiseTask, done: boolean) =>
    setDone.mutate(
      { taskId: task.id, done },
      {
        onSuccess: () =>
          done
            ? toast.success(t("franchisee.home.t_task_done"), { action: { label: t("franchisee.undo"), onClick: () => markDone(task, false) } })
            : toast.success(t("franchisee.home.t_task_undone")),
        onError: () => toast.error(t("franchisee.error_action")),
      },
    );

  /** Report and manual tasks have a screen where they are done; the rest are ticked here. */
  const taskLink = (task: FranchiseTask) => (task.kind === "report" ? "/pagos" : task.kind === "manual_read" ? "/manual" : null);

  return (
    <Screen ns="franchisee" screen="home">
      <div className="mt-6 space-y-4">
        <p className="text-sm text-muted-foreground">{t("franchisee.home.intro", { name: franchise.name, franchisor: home.franchisor_name })}</p>

        {/* 1. Numbers of the month */}
        <section className="grid overflow-hidden rounded-md border border-border bg-surface md:grid-cols-4">
          <Metric
            label={t("franchisee.home.sales")}
            value={lastReport?.gross_sales != null ? formatUsd(lastReport.gross_sales, lng) : t("franchisee.home.no_report")}
            sub={lastReport ? formatMonth(lastReport.month, lng) : t("franchisee.home.no_report_sub")}
          />
          <Metric
            label={t("franchisee.home.royalty", { pct: home.royalty_pct ?? franchise.royalty_pct ?? "-" })}
            value={lastReport?.royalty_amount != null ? formatUsd(lastReport.royalty_amount, lng) : t("franchisee.home.no_report")}
            sub={lastReport ? t("franchisee.home.royalty_sub", { pct: home.marketing_fund_pct ?? franchise.marketing_fund_pct ?? "-" }) : undefined}
          />
          <Metric
            label={t(opening ? "franchisee.home.opening_pct" : "franchisee.home.standards")}
            value={`${home.compliance_pct}%`}
            sub={<ProgressBar value={home.compliance_pct} label={t(opening ? "franchisee.home.opening_pct" : "franchisee.home.standards")} />}
          />
          <Metric
            label={t("franchisee.home.manual")}
            value={home.manual_version}
            badge={home.manual_unread ? <Tag tone="warning">{t("franchisee.home.manual_new")}</Tag> : undefined}
            sub={home.manual_unread ? t("franchisee.home.manual_unread_sub") : t("franchisee.home.manual_read_sub")}
          />
        </section>

        {/* 2. Alerts: new manual version and next report */}
        {home.manual_unread && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-3 text-sm text-status-warning-fg">
            <p className="font-medium">{t("franchisee.home.manual_alert", { version: home.manual_version })}</p>
            <Link to="/manual" className={primaryButton}>{t("franchisee.home.manual_alert_action")}</Link>
          </div>
        )}
        {home.next_report && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm">
            <p>
              {t("franchisee.home.next_report", { month: formatMonth(home.next_report.month, lng) })}{" "}
              <span className={home.next_report.due_date < todayIso() ? "text-status-danger-fg" : "text-muted-foreground"} title={formatDate(home.next_report.due_date, lng)}>
                {t("franchisee.home.next_report_due", { when: formatRelativeDate(home.next_report.due_date, lng) })}
              </span>
            </p>
            <Link to="/pagos" className={primaryButton}>{t("franchisee.home.send_report")}</Link>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 3. Your move */}
          <Panel title={t("franchisee.home.tasks_title")} action={openTasks.length > 0 ? <span className="text-xs text-muted-foreground">{t("franchisee.home.tasks_count", { count: openTasks.length })}</span> : undefined}>
            {tasksQ.isError ? (
              <p className="mx-4 mb-4 text-sm">{t("franchisee.error")} <button onClick={() => void tasksQ.refetch()} className="text-link hover:underline">{t("franchisee.retry")}</button></p>
            ) : tasksQ.isLoading ? (
              <p className="mx-4 mb-4 text-sm text-muted-foreground">{t("franchisee.loading")}</p>
            ) : openTasks.length === 0 ? (
              <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("franchisee.home.tasks_empty")}</p>
            ) : (
              <>
                <ul className="divide-y divide-border border-t border-border">
                  {shownTasks.map((task) => {
                    const link = taskLink(task);
                    const late = task.due_date < todayIso();
                    return (
                      <li key={task.id} className="flex items-center gap-3 px-4 py-3">
                        <Checkbox
                          id={`task-${task.id}`}
                          aria-label={t("franchisee.home.mark_done", { title: task.title })}
                          disabled={setDone.isPending}
                          onCheckedChange={() => markDone(task, true)}
                        />
                        <div className="min-w-0 flex-1">
                          <label htmlFor={`task-${task.id}`} className="block text-sm font-medium">{task.title}</label>
                          <p className={late ? "text-xs text-status-danger-fg" : "text-xs text-muted-foreground"} title={formatDate(task.due_date, lng)}>
                            {formatRelativeDate(task.due_date, lng)}
                          </p>
                        </div>
                        {link && <Link to={link} className="shrink-0 text-sm text-link hover:underline">{t(`franchisee.home.task_go_${task.kind}`)}</Link>}
                      </li>
                    );
                  })}
                </ul>
                {openTasks.length > MAX_ITEMS && (
                  <button onClick={() => setShowAllTasks((x) => !x)} className="w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:bg-muted">
                    {showAllTasks ? t("franchisee.show_less") : t("franchisee.see_all", { count: openTasks.length })}
                  </button>
                )}
              </>
            )}
          </Panel>

          {/* 4. Standards or opening checklist */}
          <Panel title={t(opening ? "franchisee.home.checklist_opening" : "franchisee.home.checklist_standards")}>
            {checklistQ.isError ? (
              <p className="mx-4 mb-4 text-sm">{t("franchisee.error")} <button onClick={() => void checklistQ.refetch()} className="text-link hover:underline">{t("franchisee.retry")}</button></p>
            ) : checklistQ.isLoading ? (
              <p className="mx-4 mb-4 text-sm text-muted-foreground">{t("franchisee.loading")}</p>
            ) : checklist.length === 0 ? (
              <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("franchisee.home.checklist_empty")}</p>
            ) : (
              <>
                <p className="px-4 pb-3 text-xs text-muted-foreground">{t("franchisee.home.checklist_summary", { ok: checklist.filter((c) => c.ok).length, total: checklist.length })}</p>
                <ul className="divide-y divide-border border-t border-border">
                  {shownChecklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      {item.ok ? <Check className="h-4 w-4 shrink-0 text-status-success-fg" aria-hidden /> : <Circle className="h-4 w-4 shrink-0 text-status-warning-fg" aria-hidden />}
                      <span className="flex-1">{item.item}</span>
                      <Tag tone={item.ok ? "success" : "warning"}>{t(item.ok ? "franchisee.home.item_ok" : "franchisee.home.item_pending")}</Tag>
                    </li>
                  ))}
                </ul>
                {checklist.length > MAX_ITEMS && (
                  <button onClick={() => setShowAllChecklist((x) => !x)} className="w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:bg-muted">
                    {showAllChecklist ? t("franchisee.show_less") : t("franchisee.see_all", { count: checklist.length })}
                  </button>
                )}
              </>
            )}
          </Panel>
        </div>

        {/* 5. Support tickets */}
        <Panel
          title={t("franchisee.home.tickets_title")}
          action={<button onClick={() => setTicketOpen(true)} className={secondaryButton}>{t("franchisee.home.new_ticket")}</button>}
        >
          {ticketsQ.isError ? (
            <p className="mx-4 mb-4 text-sm">{t("franchisee.error")} <button onClick={() => void ticketsQ.refetch()} className="text-link hover:underline">{t("franchisee.retry")}</button></p>
          ) : ticketsQ.isLoading ? (
            <p className="mx-4 mb-4 text-sm text-muted-foreground">{t("franchisee.loading")}</p>
          ) : tickets.length === 0 ? (
            <p className="mx-4 mb-4 rounded-md border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">{t("franchisee.home.tickets_empty")}</p>
          ) : (
            <>
              <ul className="divide-y divide-border border-t border-border">
                {shownTickets.map((ticket) => (
                  <li key={ticket.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-xs tabular-nums text-muted-foreground">{ticket.code}</span>
                      <span className="text-sm font-medium">{ticket.subject}</span>
                      <Tag tone={TICKET_TONE[ticket.state]}>{t(`franchisee.home.ticket_state_${ticket.state}`)}</Tag>
                      <span className="ml-auto text-xs text-muted-foreground">{formatDate(ticket.created_at, lng)}</span>
                    </div>
                    {ticket.response && (
                      <p className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{t("franchisee.home.ticket_answer", { franchisor: home.franchisor_name })}</span> {ticket.response}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {tickets.length > MAX_ITEMS && (
                <button onClick={() => setShowAllTickets((x) => !x)} className="w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:bg-muted">
                  {showAllTickets ? t("franchisee.show_less") : t("franchisee.see_all", { count: tickets.length })}
                </button>
              )}
            </>
          )}
        </Panel>
      </div>

      <NewTicketDialog open={ticketOpen} onOpenChange={setTicketOpen} />
    </Screen>
  );
}
