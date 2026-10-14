import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useBusinessEvents, useBusinesses, useCurrentUser, useFranchisabilityMany, useOrganizations, useSetBusinessConsultant, useTasks, useUsers, useVersions } from "@/lib/api/hooks";
import { formatDateTime } from "@/lib/format";
import { buildAreaCards, buildBusinessRows, filterBusinessRows, type BusinessRow, type BusinessesSearch } from "@/lib/tasks/office";
import type { Health } from "@/lib/tasks/owner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DOT, TEXT, firmName } from "./shared";

const ALL = "__all";

/** Negocios (SM): every business of the office in the program, worst health first. */
export function BusinessesPage({ search }: { search: BusinessesSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const usersQ = useUsers();
  const orgsQ = useOrganizations();
  const versionsQ = useVersions();
  const franchiseQ = useFranchisabilityMany((bizQ.data ?? []).map((b) => b.id));

  const set = (patch: Partial<BusinessesSearch>) =>
    void navigate({ to: "/negocios", search: (prev: BusinessesSearch) => ({ ...prev, ...patch }), replace: true });

  const header = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sm.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("pages.businesses.subtitle")}</h1>
    </>
  );
  const isError = tasksQ.isError || bizQ.isError || usersQ.isError || orgsQ.isError || versionsQ.isError;
  const loading = tasksQ.isLoading || bizQ.isLoading || usersQ.isLoading || orgsQ.isLoading || versionsQ.isLoading || franchiseQ.isLoading;

  if (isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6 rounded-md border border-border bg-surface p-6 text-sm">
          <p className="font-medium">{t("tasks.error_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("tasks.error_body")}</p>
          <button onClick={() => { void tasksQ.refetch(); void bizQ.refetch(); void usersQ.refetch(); void orgsQ.refetch(); void versionsQ.refetch(); }} className="mt-3 text-link hover:underline">
            {t("tasks.retry")}
          </button>
        </div>
      </div>
    );

  const tasks = tasksQ.data ?? [];
  const rows = buildBusinessRows(bizQ.data ?? [], tasks, versionsQ.data ?? [], usersQ.data ?? [], franchiseQ.data);
  const visible = filterBusinessRows(rows, search);
  const consultants = [...new Map(rows.flatMap((r) => (r.consultant ? [[r.consultant.id, r.consultant] as const] : []))).values()];
  const industries = [...new Set(rows.map((r) => r.business.industry))].sort();
  const selected = rows.find((r) => r.business.id === search.biz);
  const hasFilters = !!(search.consultant || search.health || search.industry);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {header}

      {loading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-8 w-96" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-border bg-surface p-8 text-sm">
          <p className="font-medium">{t("office.biz.empty_title")}</p>
          <p className="mt-1 text-muted-foreground">{t("office.biz.empty_body")}</p>
          <Link to="/embudo" className="mt-3 inline-block text-link hover:underline">{t("pages.pipeline.title")}</Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Select value={search.consultant ?? ALL} onValueChange={(v) => set({ consultant: v === ALL ? undefined : v })}>
              <SelectTrigger aria-label={t("office.biz.filter_consultant")} className={cn("h-8 w-auto min-w-44 gap-2 bg-surface text-sm", search.consultant && "border-ring")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("office.biz.all_consultants")}</SelectItem>
                {consultants.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={search.health ?? ALL} onValueChange={(v) => set({ health: v === ALL ? undefined : (v as Health) })}>
              <SelectTrigger aria-label={t("office.biz.filter_health")} className={cn("h-8 w-auto min-w-44 gap-2 bg-surface text-sm", search.health && "border-ring")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("office.biz.all_health")}</SelectItem>
                {(["red", "amber", "green"] as const).map((h) => (
                  <SelectItem key={h} value={h}>
                    <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", DOT[h])} />{t(`sm.health.${h}`)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={search.industry ?? ALL} onValueChange={(v) => set({ industry: v === ALL ? undefined : v })}>
              <SelectTrigger aria-label={t("office.biz.filter_industry")} className={cn("h-8 w-auto min-w-44 gap-2 bg-surface text-sm", search.industry && "border-ring")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("office.biz.all_industries")}</SelectItem>
                {industries.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters && (
              <button onClick={() => set({ consultant: undefined, health: undefined, industry: undefined })} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-link hover:bg-accent/60">
                <X className="h-3.5 w-3.5" />{t("office.biz.clear")}
              </button>
            )}
            <span className="ml-auto text-sm text-muted-foreground">{t("office.biz.count", { count: visible.length })}</span>
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t("office.biz.col_business")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("office.biz.col_program")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("office.biz.col_approved")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("office.biz.col_franchise")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("office.biz.col_consultant")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("office.biz.col_areas")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t("office.biz.filtered_empty")}</td></tr>
                ) : (
                  visible.map((r) => (
                    <tr
                      key={r.business.id}
                      tabIndex={0}
                      aria-label={t("office.biz.open_business", { name: r.business.name })}
                      onClick={() => set({ biz: r.business.id })}
                      onKeyDown={(e) => e.key === "Enter" && set({ biz: r.business.id })}
                      className={cn("cursor-pointer hover:bg-muted/60 focus-visible:bg-accent/40 focus-visible:outline-none", search.biz === r.business.id && "bg-accent/60")}
                    >
                      <td className="px-4 py-3"><BusinessCell row={r} /></td>
                      <td className="px-3 py-3"><ProgramBar day={r.business.program_day} /></td>
                      <td className="px-3 py-3">
                        <span className="font-display font-semibold tabular-nums">{r.accepted_pct}%</span>
                        <span className="block text-xs text-muted-foreground">{t("office.biz.approved_of", { accepted: r.accepted, total: r.total })}</span>
                      </td>
                      <td className="px-3 py-3"><FranchiseCell row={r} /></td>
                      <td className="px-3 py-3">{r.consultant?.full_name ?? <span className="text-muted-foreground">{t("office.biz.no_consultant")}</span>}</td>
                      <td className="px-3 py-3"><AreaDots row={r} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && set({ biz: undefined })}>
        <SheetContent className="w-full overflow-y-auto bg-surface p-0 sm:max-w-xl">
          {selected && <BusinessProfile row={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BusinessCell({ row }: { row: BusinessRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[row.health])} title={t(`sm.health.${row.health}`)} />
      <span className="min-w-0">
        <span className="block font-medium">{row.business.name}</span>
        <span className="block text-xs text-muted-foreground">
          {row.owner ? t("office.biz.owner", { name: row.owner.full_name }) : ""} · {row.business.industry} · {row.business.city}
        </span>
      </span>
    </div>
  );
}

function ProgramBar({ day }: { day: number }) {
  const { t } = useTranslation();
  return (
    <div className="w-32">
      <span className="text-xs tabular-nums">{t("sm.program_day", { day })}</span>
      <div className="mt-1 h-1.5 rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={180} aria-valuenow={day}>
        <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, (day / 180) * 100)}%` }} />
      </div>
    </div>
  );
}

function FranchiseCell({ row }: { row: BusinessRow }) {
  const { t } = useTranslation();
  const f = row.franchise;
  if (!f || !row.franchise_health || row.franchise_expected === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div title={t(`office.biz.franchise_health.${row.franchise_health}`)}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", DOT[row.franchise_health])} />
        <span className="font-display font-semibold tabular-nums">{t("office.biz.franchise_value", { pct: f.franchisability_pct, expected: row.franchise_expected })}</span>
        {f.is_ready && <ReadyBadge />}
      </span>
      <span className={cn("block text-xs", f.missing_required.length ? TEXT.amber : "text-muted-foreground")}>
        {f.missing_required.length
          ? t("office.biz.missing", { count: f.missing_required.length, codes: f.missing_required.join(", ") })
          : t("office.biz.missing_none")}
      </span>
    </div>
  );
}

function ReadyBadge() {
  const { t } = useTranslation();
  return <span className="rounded-[4px] border border-success/40 bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">{t("office.biz.ready")}</span>;
}

function AreaDots({ row }: { row: BusinessRow }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1.5">
      {row.areas.map((a) => (
        <span key={a.area} className={cn("h-2.5 w-2.5 rounded-full", DOT[a.health])} title={`${a.area} ${t(`areas.${a.area}`)}: ${t(`sm.health.${a.health}`)}`} aria-label={`${t(`areas.${a.area}`)}: ${t(`sm.health.${a.health}`)}`} />
      ))}
    </span>
  );
}

function BusinessProfile({ row }: { row: BusinessRow }) {
  const { t } = useTranslation();
  const tasksQ = useTasks();
  const versionsQ = useVersions();
  const orgsQ = useOrganizations();
  const cards = buildAreaCards(row.business.id, tasksQ.data ?? [], versionsQ.data ?? [], orgsQ.data ?? []);
  const b = row.business;
  return (
    <div>
      <div className="border-b border-border p-6">
        <SheetTitle className="flex items-center gap-2 text-xl font-semibold">
          <span className={cn("h-2.5 w-2.5 rounded-full", DOT[row.health])} title={t(`sm.health.${row.health}`)} />
          {b.name}
        </SheetTitle>
        <SheetDescription className="mt-1 text-sm text-muted-foreground">
          {row.owner ? t("office.biz.owner", { name: row.owner.full_name }) : ""} · {b.industry} · {t("office.biz.location", { city: b.city, state: b.state })}
        </SheetDescription>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">{t("office.biz.col_program")}</p><ProgramBar day={b.program_day} /></div>
          <div>
            <p className="text-xs text-muted-foreground">{t("office.biz.col_approved")}</p>
            <span className="font-display font-semibold tabular-nums">{row.accepted_pct}%</span>
            <span className="block text-xs text-muted-foreground">{t("office.biz.approved_of", { accepted: row.accepted, total: row.total })}</span>
          </div>
          <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("office.biz.col_franchise")}</p><FranchiseCell row={row} /></div>
          <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("office.biz.consultant_label")}</p><ConsultantPicker row={row} /></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild size="sm"><Link to="/tareas" search={{ business: b.id, sup: "all" }}>{t("office.biz.see_tasks")}</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/red" search={{ biz: b.id }}>{t("office.biz.see_network")}</Link></Button>
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-sm font-semibold">{t("office.biz.areas_title")}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.area} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", DOT[c.health])} />
                <span className="font-display text-xs font-semibold">{c.area}</span>
                <span className="text-sm font-medium">{t(`areas.${c.area}`)}</span>
              </div>
              <p className={cn("mt-0.5 text-xs", TEXT[c.health])}>{t(`sm.health.${c.health}`)}</p>
              <p className="mt-2 truncate text-xs text-muted-foreground">{c.firm ? firmName(t, c.firm) : t("office.biz.area_firm_none")}</p>
              <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
                <div><dt className="text-muted-foreground">{t("office.biz.area_open")}</dt><dd className="font-display font-semibold tabular-nums">{c.open}</dd></div>
                <div><dt className="text-muted-foreground">{t("office.biz.area_overdue")}</dt><dd className={cn("font-display font-semibold tabular-nums", c.overdue > 0 && TEXT.red)}>{c.overdue}</dd></div>
                <div><dt className="text-muted-foreground">{t("office.biz.area_accepted")}</dt><dd className="font-display font-semibold tabular-nums">{c.accepted}</dd></div>
              </dl>
            </div>
          ))}
        </div>
        <BusinessActivity businessId={b.id} />
      </div>
    </div>
  );
}

function ConsultantPicker({ row }: { row: BusinessRow }) {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const users = useUsers().data ?? [];
  const setConsultant = useSetBusinessConsultant();
  const team = users.filter((u) => u.role === "sm_team" && u.organization_id === row.business.office_id);
  if (me?.role !== "sm_team") return <>{row.consultant?.full_name ?? t("office.biz.no_consultant")}</>;
  return (
    <Select
      value={row.business.consultant_id ?? undefined}
      disabled={setConsultant.isPending}
      onValueChange={(userId) =>
        setConsultant.mutate(
          { businessId: row.business.id, userId },
          {
            onSuccess: () => toast.success(t("office.biz.consultant_changed", { name: team.find((u) => u.id === userId)?.full_name ?? "" })),
            onError: () => toast.error(t("office.biz.consultant_error")),
          },
        )
      }
    >
      <SelectTrigger aria-label={t("office.biz.change_consultant")} className="mt-0.5 h-8 w-full max-w-60 bg-surface text-sm">
        <SelectValue placeholder={t("office.biz.no_consultant")} />
      </SelectTrigger>
      <SelectContent>
        {team.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function BusinessActivity({ businessId }: { businessId: string }) {
  const { t, i18n } = useTranslation();
  const eventsQ = useBusinessEvents(businessId);
  const users = useUsers().data ?? [];
  const name = (id: string | null) => (id ? users.find((u) => u.id === id)?.full_name : null) ?? t("office.biz.no_consultant");
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">{t("office.biz.activity_title")}</h3>
      {eventsQ.isLoading ? (
        <Skeleton className="mt-3 h-10 w-full" />
      ) : eventsQ.isError ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("tasks.error_title")} <button onClick={() => void eventsQ.refetch()} className="text-link hover:underline">{t("tasks.retry")}</button></p>
      ) : !eventsQ.data?.length ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("office.biz.activity_empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {eventsQ.data.map((e) => (
            <li key={e.id} className="text-sm">
              {t("office.biz.event_consultant_changed", { actor: name(e.actor_user_id).split(" ")[0], from: name(e.from_user_id), to: name(e.to_user_id) })}
              <span className="block text-xs text-muted-foreground">{formatDateTime(e.created_at, i18n.language)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
