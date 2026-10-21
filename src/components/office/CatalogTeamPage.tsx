import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search, UserPlus } from "lucide-react";
import { useBusinesses, useCatalog, useCurrentUser, useOrganizations, useTasks, useUsersWithInactive } from "@/lib/api/hooks";
import type { AreaCode, Organization, User } from "@/lib/api/types";
import { canManageFirms, isActiveUser, isOfficeAdmin } from "@/lib/accounts/permissions";
import { AREAS } from "@/lib/tasks/owner";
import { buildAreaFirmSlots, buildFirmCards, buildTeamRows, firmForArea, type FirmCard } from "@/lib/tasks/office";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountHistorySheet, AdminTag, linkBtn, primaryBtn, secondaryBtn, UserStatusBadge, userStatus } from "@/components/accounts/shared";
import { DeactivatePersonDialog, InvitePersonDialog, PersonActions } from "@/components/accounts/AccountDialogs";
import { DeactivateFirmDialog, FirmFormDialog, FirmHistorySheet } from "./FirmDialogs";
import { firmName } from "./shared";

import type { CatalogSearch, CatalogTab } from "@/lib/tasks/catalog-search";
export type { CatalogSearch, CatalogTab };

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-surface p-6 text-sm">
      <p className="font-medium">{t("tasks.error_title")}</p>
      <p className="mt-1 text-muted-foreground">{t("tasks.error_body")}</p>
      <button onClick={onRetry} className="mt-3 text-link hover:underline">{t("tasks.retry")}</button>
    </div>
  );
}
const Loading = () => <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}</div>;

/** Catálogo y equipo (SM): read-only catalog, the office's firms by area and its people. The office admin edits firms and team. */
export function CatalogTeamPage({ search }: { search: CatalogSearch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const set = (patch: Partial<CatalogSearch>) =>
    void navigate({ to: "/catalogo", search: (prev: CatalogSearch) => ({ ...prev, ...patch }), replace: true });
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("sm.for_role")}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t("pages.catalog.subtitle")}</h1>
      <Tabs value={search.tab ?? "catalog"} onValueChange={(v) => set({ tab: v === "catalog" ? undefined : (v as CatalogTab) })} className="mt-6">
        <TabsList>
          <TabsTrigger value="catalog">{t("office.cat.tab_catalog")}</TabsTrigger>
          <TabsTrigger value="firms">{t("office.cat.tab_firms")}</TabsTrigger>
          <TabsTrigger value="team">{t("office.cat.tab_team")}</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" className="mt-4"><CatalogTab q={search.q ?? ""} onQ={(q) => set({ q: q || undefined })} /></TabsContent>
        <TabsContent value="firms" className="mt-4"><FirmsTab /></TabsContent>
        <TabsContent value="team" className="mt-4"><TeamTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CatalogTab({ q, onQ }: { q: string; onQ: (q: string) => void }) {
  const { t } = useTranslation();
  const catQ = useCatalog();
  const orgsQ = useOrganizations();
  if (catQ.isError || orgsQ.isError) return <ErrorBox onRetry={() => { void catQ.refetch(); void orgsQ.refetch(); }} />;
  const needle = q.trim().toLowerCase();
  const items = (catQ.data ?? []).filter((e) => !needle || e.code.toLowerCase().includes(needle) || e.name.toLowerCase().includes(needle));
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => onQ(e.target.value)} placeholder={t("office.cat.search")} aria-label={t("office.cat.search")}
            className="h-8 w-72 rounded-md border border-input bg-surface pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <p className="rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("office.cat.note")}</p>
      </div>
      {catQ.isLoading || orgsQ.isLoading ? (
        <div className="mt-4"><Loading /></div>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">{t("office.cat.empty_search", { q })}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {AREAS.map((area) => {
            const inArea = items.filter((e) => e.area_code === area);
            if (!inArea.length) return null;
            const firm = firmForArea(area, orgsQ.data ?? []);
            return (
              <section key={area} className="rounded-md border border-border bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold"><span className="font-display">{area}</span> {t(`areas.${area}`)}</h2>
                  <span className="text-xs text-muted-foreground">{t("office.cat.goes_to")} {firmName(t, firm)} · {t("office.cat.tasks", { count: inArea.length })}</span>
                </div>
                <ul className="divide-y divide-border">
                  {inArea.map((e) => (
                    <li key={e.code} className="grid gap-1 px-4 py-3 md:grid-cols-[64px_1fr]">
                      <span className="font-display text-xs font-semibold tabular-nums">{e.code}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{t("office.cat.acceptance")}</span> {e.acceptance}</p>
                        <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{t("office.cat.applies")}</span> {e.applies}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

type FirmDialog = { kind: "create"; area: AreaCode } | { kind: "edit"; firm: Organization } | { kind: "replace"; firm: Organization; openTasks: number } | { kind: "deactivate"; firm: Organization } | null;

/** Firmas aliadas: one slot per area with the active firm (or "Sin firma") and, folded, the firms that came before. */
function FirmsTab() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const orgsQ = useOrganizations();
  const usersQ = useUsersWithInactive();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const [dialog, setDialog] = useState<FirmDialog>(null);
  const [history, setHistory] = useState<Organization | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  if (orgsQ.isError || usersQ.isError || tasksQ.isError || bizQ.isError)
    return <ErrorBox onRetry={() => { void orgsQ.refetch(); void usersQ.refetch(); void tasksQ.refetch(); void bizQ.refetch(); }} />;
  if (orgsQ.isLoading || usersQ.isLoading || tasksQ.isLoading || bizQ.isLoading || !me) return <Loading />;
  const orgs = orgsQ.data ?? [];
  const office = orgs.find((o) => o.kind === "sm" && o.id === me.organization_id) ?? null;
  const admin = !!office && canManageFirms(me, office.id).ok;
  const cards = buildFirmCards(orgs, usersQ.data ?? [], tasksQ.data ?? [], bizQ.data ?? []);
  const cardOf = (id: string) => cards.find((c) => c.firm.id === id);
  const slots = buildAreaFirmSlots(orgs);
  const previous = slots.flatMap((s) => s.previous);

  return (
    <>
      {admin ? (
        <p className="rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("office.firms.admin_note")}</p>
      ) : (
        <p className="rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t("office.firms.read_note")}</p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot) => {
          // B1 with no firm is done by the office's own team, as program generation does.
          const firm = slot.firm ?? (slot.area === "B1" && office ? office : null);
          const card = firm ? cardOf(firm.id) : undefined;
          return (
            <article key={slot.area} className={cn("rounded-md border bg-surface p-4", firm ? "border-border" : "border-dashed border-border")}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold"><span className="font-display">{slot.area}</span> {t(`areas.${slot.area}`)}</h2>
                {firm && card && (
                  <span className="shrink-0 rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{card.internal ? t("office.cat.internal") : t("office.cat.external")}</span>
                )}
              </div>
              {firm && card ? (
                <FirmBody card={card} />
              ) : (
                <div className="mt-3">
                  <p className="text-sm font-medium text-muted-foreground">{t("office.firms.none")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("office.firms.none_hint")}</p>
                </div>
              )}
              {admin && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                  {firm && firm.kind === "partner_firm" ? (
                    <>
                      <button className={linkBtn} onClick={() => setDialog({ kind: "edit", firm })}>{t("office.firms.edit")}</button>
                      <button className={linkBtn} onClick={() => setDialog({ kind: "replace", firm, openTasks: card?.open ?? 0 })}>{t("office.firms.replace")}</button>
                      <button className={linkBtn} onClick={() => setDialog({ kind: "deactivate", firm })}>{t("office.firms.deactivate")}</button>
                      <button className={linkBtn} onClick={() => setHistory(firm)}>{t("accounts.history_action")}</button>
                    </>
                  ) : (
                    <button className={secondaryBtn} onClick={() => setDialog({ kind: "create", area: slot.area })}>{t("office.firms.new")}</button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {previous.length > 0 && (
        <section className="mt-6 rounded-md border border-border bg-surface">
          <button onClick={() => setShowPrevious((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold" aria-expanded={showPrevious}>
            {t("office.firms.previous_title", { count: previous.length })}
            <span className="text-xs font-normal text-link">{showPrevious ? t("office.firms.previous_hide") : t("office.firms.previous_show")}</span>
          </button>
          {showPrevious && (
            <ul className="divide-y divide-border border-t border-border">
              {previous.map((p) => {
                const card = cardOf(p.id);
                const next = orgs.find((o) => o.id === p.replaced_by_id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-muted-foreground">{firmName(t, p)} <span className="ml-1 rounded-[4px] border border-status-neutral-border bg-status-neutral-bg px-1.5 py-0.5 text-[11px] font-medium text-status-neutral-fg">{t("office.firms.inactive")}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {next ? t("office.firms.replaced_by", { name: next.name }) : t("office.firms.retired")}
                        {card && card.open > 0 ? ` · ${t("office.cat.open_count", { count: card.open })}` : ""}
                      </p>
                    </div>
                    <button className={linkBtn} onClick={() => setHistory(p)}>{t("accounts.history_action")}</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {dialog?.kind === "create" && office && <FirmFormDialog mode={{ kind: "create", area: dialog.area, officeId: office.id }} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <FirmFormDialog mode={{ kind: "edit", firm: dialog.firm }} onClose={() => setDialog(null)} />}
      {dialog?.kind === "replace" && <FirmFormDialog mode={{ kind: "replace", firm: dialog.firm, openTasks: dialog.openTasks }} onClose={() => setDialog(null)} />}
      {dialog?.kind === "deactivate" && <DeactivateFirmDialog firm={dialog.firm} onClose={() => setDialog(null)} />}
      <FirmHistorySheet firm={history} onClose={() => setHistory(null)} />
    </>
  );
}

function FirmBody({ card: c }: { card: FirmCard }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="mt-1 text-sm font-medium">{firmName(t, c.firm)}</p>
      {c.firm.specialty && <p className="mt-1 text-xs text-muted-foreground">{c.firm.specialty}</p>}
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("office.cat.contact")}</dt>
          <dd>{[c.firm.contact_name, c.firm.email, c.firm.phone, c.firm.city].filter(Boolean).join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("office.cat.people")}</dt>
          <dd>{c.people.length ? c.people.map((p) => (p.title ? `${p.full_name} (${p.title})` : p.full_name)).join(", ") : t("office.cat.no_people")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("office.cat.works_in")}</dt>
          <dd>{c.businesses.length ? c.businesses.map((b) => b.name).join(", ") : t("office.cat.no_businesses")}</dd>
        </div>
      </dl>
      <p className="mt-3 flex gap-3 border-t border-border pt-3 text-xs">
        <span className="tabular-nums">{t("office.cat.open_count", { count: c.open })}</span>
        <span className={cn("tabular-nums", c.overdue > 0 ? "text-status-danger-fg" : "text-muted-foreground")}>{t("office.cat.overdue_count", { count: c.overdue })}</span>
      </p>
    </>
  );
}

/** Equipo SM: people of the office. The office admin invites, deactivates and reactivates. */
function TeamTab() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const usersQ = useUsersWithInactive();
  const orgsQ = useOrganizations();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [history, setHistory] = useState<User | null>(null);
  if (usersQ.isError || tasksQ.isError || bizQ.isError || orgsQ.isError) return <ErrorBox onRetry={() => { void usersQ.refetch(); void tasksQ.refetch(); void bizQ.refetch(); void orgsQ.refetch(); }} />;
  if (usersQ.isLoading || tasksQ.isLoading || bizQ.isLoading || orgsQ.isLoading || !me) return <Loading />;
  const admin = isOfficeAdmin(me);
  const rows = buildTeamRows(usersQ.data ?? [], me.organization_id ?? "", tasksQ.data ?? [], bizQ.data ?? [])
    .sort((a, b) => Number(!isActiveUser(a.user)) - Number(!isActiveUser(b.user)) || a.user.full_name.localeCompare(b.user.full_name));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-[4px] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">{t(admin ? "office.team.admin_note" : "office.team.read_note")}</p>
        {admin && <button className={primaryBtn} onClick={() => setInviting(true)}><UserPlus className="h-4 w-4" />{t("accounts.invite.title")}</button>}
      </div>
      {!rows.length ? (
        <p className="mt-4 rounded-md border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">{t("office.cat.team_empty")}</p>
      ) : (
        <>
        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-surface md:hidden">
          {rows.map((r) => (
            <li key={r.user.id} className={cn("space-y-2 px-4 py-3 text-sm", !isActiveUser(r.user) && "text-muted-foreground")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium"><span className="whitespace-nowrap">{r.user.full_name}</span>{r.user.is_admin && <AdminTag />}{r.user.id === me.id && <span className="text-xs font-normal text-muted-foreground">{t("profile.you")}</span>}</span>
                  <span className="block break-all text-xs text-muted-foreground">{r.user.email}</span>
                </div>
                <UserStatusBadge status={userStatus(r.user)} />
              </div>
              <div className="text-xs text-muted-foreground">{r.user.title ? `${r.user.title} · ` : ""}{r.supervises.length ? r.supervises.map((b) => b.name).join(", ") : t("office.cat.supervises_none")}</div>
              <div className={cn("text-xs", r.has_booking_url ? "text-status-success-fg" : "text-muted-foreground")}>{r.has_booking_url ? t("office.cat.booking_yes") : t("office.cat.booking_no")}</div>
              {admin && <PersonActions user={r.user} orgs={orgsQ.data ?? []} onDeactivate={setDeactivating} onHistory={setHistory} />}
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto rounded-md border border-border bg-surface md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t("office.cat.col_person")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("office.cat.col_role")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("office.cat.col_supervises")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("office.cat.col_booking")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("accounts.col_status")}</th>
                {admin && <th className="px-3 py-2 text-right font-medium">{t("accounts.col_actions")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.user.id} className={cn(!isActiveUser(r.user) && "text-muted-foreground")}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium"><span className="whitespace-nowrap">{r.user.full_name}</span>{r.user.is_admin && <AdminTag />}{r.user.id === me.id && <span className="text-xs font-normal text-muted-foreground">{t("profile.you")}</span>}</span>
                    <span className="block text-xs text-muted-foreground">{r.user.email}</span>
                  </td>
                  <td className="px-3 py-3">{r.user.title ?? <span className="text-xs text-muted-foreground">{t("app.no_data")}</span>}</td>
                  <td className="px-3 py-3">{r.supervises.length ? r.supervises.map((b) => b.name).join(", ") : <span className="text-muted-foreground">{t("office.cat.supervises_none")}</span>}</td>
                  <td className={cn("px-3 py-3", r.has_booking_url ? "text-status-success-fg" : "text-muted-foreground")}>{r.has_booking_url ? t("office.cat.booking_yes") : t("office.cat.booking_no")}</td>
                  <td className="px-3 py-3"><UserStatusBadge status={userStatus(r.user)} /></td>
                  {admin && <td className="whitespace-nowrap px-3 py-3"><PersonActions user={r.user} orgs={orgsQ.data ?? []} onDeactivate={setDeactivating} onHistory={setHistory} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <InvitePersonDialog open={inviting} onOpenChange={setInviting} fixedRole="sm_team" fixedOrganizationId={me.organization_id ?? undefined} />
      <DeactivatePersonDialog user={deactivating} onClose={() => setDeactivating(null)} />
      <AccountHistorySheet user={history} onClose={() => setHistory(null)} />
    </>
  );
}
