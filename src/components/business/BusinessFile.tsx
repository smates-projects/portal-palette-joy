import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import {
  useBusinessMilestones, useBusinessSnapshot, useBusinesses, useCurrentUser, useFranchisability, useOrganizations, useProfileChangeRequests, useResolveProfileChange, useRules, useTasks, useUsers, useVersions,
} from "@/lib/api/hooks";
import type { AssessmentSnapshot, Business, BusinessMilestone, ProfileChangeRequest, TaskWithComputed } from "@/lib/api/types";
import { inputCls } from "@/components/accounts/shared";
import { missingWork } from "@/lib/business/file";
import { existingSummary } from "@/lib/leads/prevalidation";
import { buildAreaCards, expectedFranchisePct, franchiseHealth } from "@/lib/tasks/office";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DOT, TEXT, firmName } from "@/components/office/shared";
import { AssessmentResult, KnowHow } from "@/components/pipeline/AssessmentResult";
import { CalendarPlus } from "lucide-react";
import { SecondaryButton } from "@/components/tasks/detail/dialogs";
import { ScheduleMeetingDialog } from "@/components/calendar/ScheduleMeetingDialog";

/** Items per list of "Qué le falta" before "y N más". */
const MAX_ITEMS = 5;

/**
 * Ficha del negocio in five parts: who it is, how it arrived (assessment kept when it entered the program), how it
 * is doing today, what is missing, and the activity. SM office team and SM Global (read only) see all five; the
 * owner gets parts 1, 3 and 4 without the assessment score ("owner"). Partner firms never get here.
 */
export function BusinessFile({ businessId, variant }: { businessId: string; variant: "sm" | "owner" }) {
  const { t, i18n } = useTranslation();
  const owner = variant === "owner";
  const bizQ = useBusinesses();
  const tasksQ = useTasks();
  const versionsQ = useVersions();
  const orgsQ = useOrganizations();
  const usersQ = useUsers();
  const rulesQ = useRules();
  const fQ = useFranchisability(businessId);
  const snapQ = useBusinessSnapshot(owner ? undefined : businessId);
  const business = bizQ.data?.find((b) => b.id === businessId);
  const me = useCurrentUser().data;
  const [scheduling, setScheduling] = useState(false);

  const queries = [bizQ, tasksQ, versionsQ, orgsQ, usersQ, rulesQ, snapQ];
  if (queries.some((q) => q.isError))
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-sm">
        <p className="font-medium">{t("business_file.error")}</p>
        <button onClick={() => queries.forEach((q) => void q.refetch())} className="mt-2 text-link hover:underline">{t("tasks.retry")}</button>
      </div>
    );
  if (queries.some((q) => q.isLoading) || fQ.isLoading)
    return <div className="space-y-3"><Skeleton className="h-32 rounded-md" /><Skeleton className="h-40 rounded-md" /><Skeleton className="h-32 rounded-md" /></div>;
  if (!business) return <p className="text-sm text-muted-foreground">{t("global.business.not_found")}</p>;

  const tasks = (tasksQ.data ?? []).filter((x) => x.business_id === business.id && x.status !== "cancelled");
  const snapshot = snapQ.data ?? null;
  // Calendar v2: the owner meets the consultant; SM meets the owner (and the consultant when it is someone else).
  const guests = (owner ? [business.consultant_id] : [business.owner_user_id, business.consultant_id])
    .map((id) => usersQ.data?.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u && u.id !== me?.id)
    .map((u) => ({ user_id: u.id, name: u.full_name }));
  return (
    <div className="space-y-6">
      {guests.length > 0 && (
        <ScheduleMeetingDialog open={scheduling} onOpenChange={setScheduling} context={{ kind: "business", business_id: business.id }} participants={guests} />
      )}
      {/* Parts 1-3 are render helpers (not components) so they read the queries above without remounting. */}
      {WhoItIs({ business, snapshot, tasks, owner })}
      {!owner && <ProfileChanges businessId={business.id} readOnly={me?.role === "sm_global"} />}
      {!owner && HowItArrived({ snapshot })}
      {HowItIsDoing({ business, tasks, owner })}
      <WhatIsMissing tasks={tasks} requiredCodes={fQ.data?.required_task_codes ?? rulesQ.data?.required_task_codes ?? []} snapshot={snapshot} owner={owner} />
      {!owner && <Activity businessId={business.id} />}
    </div>
  );

  // ---------- 1. Quién es ----------
  function WhoItIs(p: { business: Business; snapshot: AssessmentSnapshot | null; tasks: TaskWithComputed[]; owner: boolean }) {
    const user = (id: string | null) => (id ? usersQ.data?.find((u) => u.id === id) : undefined);
    const s = p.snapshot;
    const cards = buildAreaCards(p.business.id, p.tasks, versionsQ.data ?? [], orgsQ.data ?? [], undefined, rulesQ.data?.area_amber_days);
    const none = t("business_file.no_data");
    return (
      <Part title={t(p.owner ? "business_file.who_title_owner" : "business_file.who_title")}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Fact label={t("business_file.owner")} value={user(p.business.owner_user_id)?.full_name ?? s?.contact.name ?? none} />
          <Fact label={t("business_file.contact")} value={s ? <><span className="block truncate">{s.contact.email}</span><span className="block tabular-nums">{s.contact.phone}</span></> : none} />
          <Fact label={t("business_file.industry")} value={s ? `${t(`pipeline.industries.${s.business.industry}`, { defaultValue: p.business.industry_label ?? "" })} · ${s.business.activity}` : (i18n.language === "en" ? p.business.industry_label_en : undefined) ?? p.business.industry_label ?? none} />
          <Fact label={t("business_file.place")} value={t("office.biz.location", { city: p.business.city, state: p.business.state })} />
          <Fact label={t("business_file.years")} value={s ? t(`pipeline.years_ranges.${s.business.years_range}`) : none} />
          <Fact label={t("business_file.team")} value={s ? t(`pipeline.team_ranges.${s.business.team_range}`) : none} />
          <Fact label={t("business_file.revenue")} value={s ? t(`pipeline.revenue_ranges.${s.business.revenue_range}`) : none} />
          <Fact label={t("business_file.margin")} value={s ? t(`pipeline.margin_ranges.${s.business.margin_range ?? "unknown"}`) : none} />
          <Fact label={t("business_file.consultant")} value={user(p.business.consultant_id)?.full_name ?? t("office.biz.no_consultant")} />
        </dl>
        {guests.length > 0 && (
          <div className="mt-3">
            <SecondaryButton onClick={() => setScheduling(true)}>
              <CalendarPlus className="h-3.5 w-3.5" />
              {t(p.owner ? "calendar.schedule_with_consultant" : "calendar.schedule")}
            </SecondaryButton>
          </div>
        )}
        <p className="mt-4 text-xs font-medium text-muted-foreground">{t("business_file.firms")}</p>
        <ul className="mt-1.5 divide-y divide-border rounded-md border border-border text-sm">
          {cards.map((c) => (
            <li key={c.area} className="flex items-center gap-3 px-3 py-2">
              <span className="w-7 shrink-0 font-display text-xs font-semibold">{c.area}</span>
              <span className="w-28 shrink-0 truncate text-muted-foreground">{t(`areas.${c.area}`)}</span>
              <span className="min-w-0 flex-1 truncate">{c.firm ? firmName(t, c.firm) : t("office.biz.area_firm_none")}</span>
            </li>
          ))}
        </ul>
        {s?.know_how_example && <div className="mt-4"><KnowHow text={s.know_how_example} /></div>}
      </Part>
    );
  }

  // ---------- 2. Cómo llegó ----------
  function HowItArrived({ snapshot: s }: { snapshot: AssessmentSnapshot | null }) {
    return (
      <Part title={t("business_file.how_title")} tag={t("business_file.at_entry")}>
        {s ? (
          <>
            <AssessmentResult result={s.result} submittedAt={s.submitted_at} />
            <p className="mt-2 text-xs text-muted-foreground">{t("business_file.snapshot_taken", { date: formatDate(s.taken_at, i18n.language) })}</p>
          </>
        ) : (
          <Empty>{t("business_file.no_snapshot")}</Empty>
        )}
      </Part>
    );
  }

  // ---------- 3. Cómo va hoy ----------
  function HowItIsDoing(p: { business: Business; tasks: TaskWithComputed[]; owner: boolean }) {
    const f = fQ.data;
    const cards = buildAreaCards(p.business.id, p.tasks, versionsQ.data ?? [], orgsQ.data ?? [], undefined, rulesQ.data?.area_amber_days);
    const accepted = p.tasks.filter((x) => x.status === "accepted").length;
    const ex = existingSummary(p.tasks);
    const toValidate = p.tasks.filter((x) => x.pre_validation === "pending").length;
    // The light and the program length as the API computes them (franchisability and business); the demo derives them.
    const health = f ? f.health ?? franchiseHealth(f, p.business.program_day, rulesQ.data?.franchisability_amber_tolerance, rulesQ.data?.program_length_days) : null;
    const programLength = f?.program_length_days ?? p.business.program_length_days ?? rulesQ.data?.program_length_days;
    return (
      <Part title={t(p.owner ? "business_file.today_title_owner" : "business_file.today_title")}>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("business_file.program")}</p>
            <p className="mt-0.5 font-display font-semibold tabular-nums">{t("business_file.day", { day: p.business.program_day, total: programLength ?? "…" })}</p>
            {programLength && (
              <div className="mt-1 h-1.5 rounded-[2px] border border-border bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={programLength} aria-valuenow={p.business.program_day}>
                <div className="h-full bg-gold" style={{ width: `${Math.min(100, (p.business.program_day / programLength) * 100)}%` }} />
              </div>
            )}
          </div>
          <div className="col-span-1">
            <p className="text-xs text-muted-foreground">{t("business_file.progress")}</p>
            {f && health ? (
              <p className="mt-0.5 flex items-center gap-1.5" title={t(`office.biz.franchise_health.${health}`, { points: rulesQ.data?.franchisability_amber_tolerance ?? "…" })}>
                <span className={cn("h-2 w-2 rounded-full", DOT[health])} />
                <span className="font-display font-semibold tabular-nums">{t("business_file.progress_value", { pct: f.franchisability_pct, expected: f.expected_pct ?? expectedFranchisePct(p.business.program_day, f.franchisability_goal, programLength) })}</span>
              </p>
            ) : <p className="mt-0.5 text-muted-foreground">{t("business_file.no_data")}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("business_file.approved")}</p>
            <p className="mt-0.5 font-display font-semibold tabular-nums">{t("business_file.approved_value", { count: accepted, total: p.tasks.length })}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("business_file.existing")}</p>
            <p className="mt-0.5 font-display font-semibold tabular-nums">{ex.count}</p>
            {toValidate > 0 && <p className="text-xs text-status-warning-fg">{t("business_file.to_validate", { count: toValidate })}</p>}
          </div>
        </div>
        {ex.count > 0 && (
          <p className="mt-3 rounded-[4px] border border-status-success-border bg-status-success-bg px-3 py-2 text-sm text-status-success-fg">
            {t(p.owner ? "entry.existing_owner" : "entry.existing_sm", { count: ex.count, pct: ex.pct })}
          </p>
        )}
        <ul className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.area} className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-md border border-border px-3 py-2 text-sm">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[c.health])} />
              <span className="font-display text-xs font-semibold">{c.area}</span>
              <span className="min-w-0 break-words">{t(`areas.${c.area}`)}</span>
              <span className={cn("col-start-3 text-xs leading-snug", TEXT[c.health])}>{t(`sm.health.${c.health}`)}</span>
            </li>
          ))}
        </ul>
      </Part>
    );
  }
}

/** Mi negocio: the owner's own ficha (parts 1, 3 and 4, no assessment score), only while the program runs. */
export function OwnerBusinessFile() {
  const me = useCurrentUser().data;
  const inProgram = useBusinesses().data?.find((b) => b.id === me?.business_id)?.status === "in_program";
  if (!me?.business_id || !inProgram) return null;
  return (
    <div className="mt-6 rounded-md border border-border bg-surface p-4">
      <BusinessFile businessId={me.business_id} variant="owner" />
    </div>
  );
}

/** Inicio of the owner: "Ya tenías resueltas N tareas: arrancas con X% de avance" (only when there are some). */
export function ExistingWorkNote({ tasks }: { tasks: TaskWithComputed[] }) {
  const { t } = useTranslation();
  const ex = existingSummary(tasks);
  if (ex.count === 0) return null;
  return <p className="mt-3 rounded-[4px] border border-status-success-border bg-status-success-bg px-3 py-2 text-xs text-status-success-fg">{t("entry.existing_owner", { count: ex.count, pct: ex.pct })}</p>;
}

// ---------- 4. Qué le falta ----------
function WhatIsMissing(p: { tasks: TaskWithComputed[]; requiredCodes: string[]; snapshot: AssessmentSnapshot | null; owner: boolean }) {
  const { t, i18n } = useTranslation();
  const m = missingWork(p.tasks, p.requiredCodes, p.snapshot?.priorities ?? []);
  const nothing = !m.required.length && !m.overdue.length && !m.blocked.length && !m.open_priorities.length;
  const taskLine = (x: TaskWithComputed, extra?: string) => (
    <li key={x.id} className="flex items-baseline gap-2 py-1.5 text-sm">
      <span className="w-12 shrink-0 font-display text-xs font-semibold tabular-nums">{x.code}</span>
      <span className="min-w-0 flex-1 truncate">{x.name}</span>
      {extra && <span className="shrink-0 text-xs text-muted-foreground">{extra}</span>}
    </li>
  );
  return (
    <Part title={t(p.owner ? "business_file.missing_title_owner" : "business_file.missing_title")}>
      {nothing ? (
        <Empty>{t("business_file.missing_none")}</Empty>
      ) : (
        <div className="space-y-4">
          <Group title={t("business_file.required", { count: m.required.length })} total={m.required.length}>
            {m.required.slice(0, MAX_ITEMS).map((x) => taskLine(x))}
          </Group>
          <Group title={t("business_file.overdue", { count: m.overdue.length })} total={m.overdue.length} danger>
            {m.overdue.slice(0, MAX_ITEMS).map((x) => taskLine(x, t("business_file.due_on", { date: formatDate(x.due_date, i18n.language) })))}
          </Group>
          <Group title={t("business_file.blocked", { count: m.blocked.length })} total={m.blocked.length}>
            {m.blocked.slice(0, MAX_ITEMS).map((x) => taskLine(x))}
          </Group>
          <Group title={t("business_file.priorities", { count: m.open_priorities.length })} total={m.open_priorities.length}>
            {m.open_priorities.slice(0, MAX_ITEMS).map((x) => (
              <li key={x.text} className="flex items-baseline gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">{x.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{t("business_file.priority_open", { area: t(`areas.${x.area}`), count: x.open })}</span>
              </li>
            ))}
          </Group>
        </div>
      )}
    </Part>
  );
}

// ---------- 5. Actividad ----------
function Activity({ businessId }: { businessId: string }) {
  const { t, i18n } = useTranslation();
  const q = useBusinessMilestones(businessId);
  const describe = (e: BusinessMilestone) =>
    t(`business_file.m.${e.kind}`, { from: e.from ?? t("office.biz.no_consultant"), to: e.to ?? "", code: e.task_code ?? "", name: e.task_name ?? "" });
  return (
    <Part title={t("business_file.activity_title")}>
      {q.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : q.isError ? (
        <p className="text-sm text-muted-foreground">{t("business_file.error")} <button onClick={() => void q.refetch()} className="text-link hover:underline">{t("tasks.retry")}</button></p>
      ) : !q.data?.length ? (
        <Empty>{t("business_file.activity_empty")}</Empty>
      ) : (
        <ol className="space-y-2.5">
          {q.data.map((e) => (
            <li key={e.id} className="text-sm">
              <p>{describe(e)}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(e.at, i18n.language)}</p>
            </li>
          ))}
        </ol>
      )}
    </Part>
  );
}

function Part({ title, tag, children }: { title: string; tag?: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {tag && <span className="rounded-[4px] border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{tag}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * Owner requests to change verified data (legal name, address, city, state). The office applies or rejects them
 * after checking the supporting document; SM Global only reads. Shown only when there is something to show.
 */
function ProfileChanges({ businessId, readOnly }: { businessId: string; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const q = useProfileChangeRequests(businessId);
  const usersQ = useUsers();
  const resolve = useResolveProfileChange();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const requests = q.data ?? [];
  if (requests.length === 0) return null;
  const name = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const act = (r: ProfileChangeRequest, status: "applied" | "rejected") =>
    resolve.mutate({ id: r.id, status, note: notes[r.id] ?? null }, {
      onSuccess: () => toast.success(t(status === "applied" ? "business_file.t_change_applied" : "business_file.t_change_rejected")),
      onError: () => toast.error(t("tasks.t_error")),
    });
  const tone: Record<ProfileChangeRequest["status"], string> = {
    pending: "border-status-warning-border bg-status-warning-bg text-status-warning-fg",
    applied: "border-status-success-border bg-status-success-bg text-status-success-fg",
    rejected: "border-status-neutral-border bg-status-neutral-bg text-status-neutral-fg",
  };
  return (
    <Part title={t("business_file.changes_title")}>
      <p className="text-xs text-muted-foreground">{t("business_file.changes_hint")}</p>
      <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
        {requests.map((r) => (
          <li key={r.id} className="space-y-2 px-3 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t(`owner_extra.business.${r.field}`)}</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 break-words">
                  <span className="text-muted-foreground line-through">{r.current_value}</span>
                  <span aria-hidden className="text-muted-foreground">→</span>
                  <span className="font-medium">{r.new_value}</span>
                </p>
              </div>
              <span className={cn("shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium", tone[r.status])}>{t(`owner_extra.business.status_${r.status}`)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("business_file.change_requested_by", { name: name(r.requested_by_user_id), date: formatDateTime(r.created_at, i18n.language) })} · {t("business_file.change_reason", { reason: r.reason })}</p>
            {r.status === "pending" && !readOnly && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <input className={cn(inputCls, "h-8 min-w-[12rem] flex-1 text-xs")} placeholder={t("business_file.change_note")} value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                <button type="button" disabled={resolve.isPending} onClick={() => act(r, "applied")} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{t("business_file.change_apply")}</button>
                <button type="button" disabled={resolve.isPending} onClick={() => act(r, "rejected")} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">{t("business_file.change_reject")}</button>
              </div>
            )}
            {r.resolution_note && <p className="text-xs text-muted-foreground">{r.resolution_note}</p>}
          </li>
        ))}
      </ul>
    </Part>
  );
}

function Group({ title, total, danger, children }: { title: string; total: number; danger?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div>
      <p className={cn("text-xs font-medium", danger ? "text-status-danger-fg" : "text-muted-foreground")}>{title}</p>
      <ul className="mt-1 divide-y divide-border">{children}</ul>
      {total > MAX_ITEMS && <p className="mt-1 text-xs text-muted-foreground">{t("business_file.more", { count: total - MAX_ITEMS })}</p>}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{children}</p>;
}
