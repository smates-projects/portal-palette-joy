import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, X } from "lucide-react";
import { useFranchise } from "@/lib/api/hooks";
import type { ReportStatus, TicketState } from "@/lib/api/types";
import { formatDate, formatRelativeDate, formatUsd } from "@/lib/format";
import { EmptyState, ErrorState, formatMonth, LoadingState, PageHeader, Panel, ProgressBar, Stat, ToneBadge, type Tone } from "../shared";

const REPORT_TONE: Record<ReportStatus, Tone> = { due: "warning", submitted: "review", paid: "success" };
const TICKET_TONE: Record<TicketState, Tone> = { open: "warning", answered: "info", closed: "neutral" };

/** One franchise: franchisee, monthly reports, standards checklist, consultations, tasks and team. */
export function FranchiseDetailPage({ franchiseId }: { franchiseId: string }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const detailQ = useFranchise(franchiseId);
  const detail = detailQ.data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link to="/franquicias" className="mb-3 inline-flex items-center gap-1 text-sm text-link hover:underline">
        <ArrowLeft className="h-4 w-4" />
        {t("owner_extra.franchise_detail.back")}
      </Link>
      <PageHeader question={t("owner_extra.franchise_detail.question")} />

      {detailQ.isError ? (
        <ErrorState onRetry={() => void detailQ.refetch()} />
      ) : detailQ.isLoading ? (
        <LoadingState rows={3} />
      ) : !detail ? (
        <EmptyState title={t("owner_extra.franchise_detail.not_found_title")} hint={t("owner_extra.franchise_detail.not_found_hint")} />
      ) : (
        <div className="mt-6 space-y-4">
          <section className="rounded-[4px] border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{detail.franchise.name}</h2>
              <ToneBadge tone={detail.franchise.status === "operating" ? "success" : "info"}>
                {t(`owner_extra.franchises.status_${detail.franchise.status}`)}
              </ToneBadge>
            </div>
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Info label={t("owner_extra.franchise_detail.franchisee")} value={`${detail.franchisee.full_name}`} />
              <Info label={t("owner_extra.franchise_detail.place")} value={`${detail.franchise.city}, ${detail.franchise.state}`} />
              <Info
                label={detail.franchise.status === "opening" ? t("owner_extra.franchise_detail.opens_on") : t("owner_extra.franchise_detail.opened_on")}
                value={formatDate(detail.franchise.opening_date, lng)}
              />
              <Info label={t("owner_extra.franchise_detail.manual")} value={detail.franchise.manual_version} />
            </dl>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label={detail.franchise.status === "opening" ? t("owner_extra.franchises.standards_opening") : t("owner_extra.franchises.standards_operating")}
              value={`${detail.franchise.compliance_pct}%`}
              hint={<ProgressBar pct={detail.franchise.compliance_pct} label={t("owner_extra.franchises.standards_label", { name: detail.franchise.name })} />}
            />
            <Stat label={t("owner_extra.franchise_detail.last_sales")} value={detail.franchise.last_sales === null ? "-" : formatUsd(detail.franchise.last_sales, lng)} />
            <Stat label={t("owner_extra.franchise_detail.open_tickets")} value={detail.franchise.open_tickets} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("owner_extra.franchise_detail.reports")}>
              {detail.reports.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.franchise_detail.reports_empty")}</p>
              ) : (
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th scope="col" className="px-4 py-2 font-medium">{t("owner_extra.numbers.col_month")}</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">{t("owner_extra.franchises.col_sales")}</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">{t("owner_extra.franchises.col_royalty")}</th>
                        <th scope="col" className="px-4 py-2 font-medium">{t("owner_extra.franchises.col_status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {detail.reports.map((r) => (
                        <tr key={r.id}>
                          <th scope="row" className="px-4 py-2 text-left font-normal">{formatMonth(r.month, lng)}</th>
                          <td className="px-4 py-2 text-right">{r.gross_sales === null ? "-" : formatUsd(r.gross_sales, lng)}</td>
                          <td className="px-4 py-2 text-right">{r.royalty_amount === null ? "-" : formatUsd(r.royalty_amount, lng)}</td>
                          <td className="px-4 py-2"><ToneBadge tone={REPORT_TONE[r.status]}>{t(`owner_extra.franchises.report_${r.status}`)}</ToneBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title={detail.franchise.status === "opening" ? t("owner_extra.franchise_detail.checklist_opening") : t("owner_extra.franchise_detail.checklist_standards")}>
              {detail.checklist.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.franchise_detail.checklist_empty")}</p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {detail.checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {item.ok ? <Check className="h-4 w-4 shrink-0 text-status-success-fg" aria-hidden /> : <X className="h-4 w-4 shrink-0 text-status-danger-fg" aria-hidden />}
                      <span className="flex-1">{item.item}</span>
                      <span className="text-xs text-muted-foreground">{item.ok ? t("owner_extra.franchise_detail.met") : t("owner_extra.franchise_detail.not_met")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={t("owner_extra.franchise_detail.tickets")}>
              {detail.tickets.length === 0 ? (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.franchise_detail.tickets_empty")}</p>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {detail.tickets.map((ticket) => (
                    <li key={ticket.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <p className="min-w-0 flex-1 text-sm font-medium">
                          <span className="font-display tabular-nums text-muted-foreground">{ticket.code}</span> · {ticket.subject}
                        </p>
                        <ToneBadge tone={TICKET_TONE[ticket.state]}>{t(`owner_extra.franchise_detail.ticket_${ticket.state}`)}</ToneBadge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{ticket.body}</p>
                      {ticket.response && <p className="mt-1 border-l-2 border-border pl-3 text-sm">{ticket.response}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title={t("owner_extra.franchise_detail.tasks")}>
                {detail.tasks.length === 0 ? (
                  <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.franchise_detail.tasks_empty")}</p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {detail.tasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                        <p className={task.done ? "min-w-0 flex-1 text-sm text-muted-foreground line-through" : "min-w-0 flex-1 text-sm"}>{task.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground" title={formatDate(task.due_date, lng)}>
                          {task.done ? t("owner_extra.franchise_detail.task_done") : formatRelativeDate(task.due_date, lng)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title={t("owner_extra.franchise_detail.team")}>
                {detail.team.length === 0 ? (
                  <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{t("owner_extra.franchise_detail.team_empty")}</p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {detail.team.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{m.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{[m.role, m.email].filter(Boolean).join(" · ")}</p>
                        </div>
                        <ToneBadge tone={m.state === "active" ? "success" : "warning"}>{t(`owner_extra.business.member_${m.state}`)}</ToneBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
