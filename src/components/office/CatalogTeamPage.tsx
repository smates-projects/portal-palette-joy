import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useBusinesses, useCatalog, useCurrentUser, useOrganizations, useTasks, useUsers } from "@/lib/api/hooks";
import { AREAS } from "@/lib/tasks/owner";
import { buildFirmCards, buildTeamRows, firmForArea } from "@/lib/tasks/office";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { firmName } from "./shared";

export type CatalogTab = "catalog" | "firms" | "team";
export interface CatalogSearch { tab?: CatalogTab; q?: string }
export const validateCatalogSearch = (raw: Record<string, unknown>): CatalogSearch => {
  const s: CatalogSearch = {};
  if (raw["tab"] === "firms" || raw["tab"] === "team") s.tab = raw["tab"];
  if (typeof raw["q"] === "string" && raw["q"]) s.q = raw["q"];
  return s;
};

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

/** Catálogo y equipo (SM): read-only catalog, the office's firms and its people. */
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
                  <span className="text-xs text-muted-foreground">{t("office.cat.goes_to")}: {firmName(t, firm)} · {t("office.cat.tasks", { count: inArea.length })}</span>
                </div>
                <ul className="divide-y divide-border">
                  {inArea.map((e) => (
                    <li key={e.code} className="grid gap-1 px-4 py-3 md:grid-cols-[64px_1fr]">
                      <span className="font-display text-xs font-semibold tabular-nums">{e.code}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{t("office.cat.acceptance")}:</span> {e.acceptance}</p>
                        <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{t("office.cat.applies")}:</span> {e.applies}</p>
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

function FirmsTab() {
  const { t } = useTranslation();
  const orgsQ = useOrganizations();
  const usersQ = useUsers();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  if (orgsQ.isError || usersQ.isError || tasksQ.isError || bizQ.isError)
    return <ErrorBox onRetry={() => { void orgsQ.refetch(); void usersQ.refetch(); void tasksQ.refetch(); void bizQ.refetch(); }} />;
  if (orgsQ.isLoading || usersQ.isLoading || tasksQ.isLoading || bizQ.isLoading) return <Loading />;
  const cards = buildFirmCards(orgsQ.data ?? [], usersQ.data ?? [], tasksQ.data ?? [], bizQ.data ?? []);
  if (!cards.length) return <p className="rounded-md border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">{t("office.cat.firms_empty")}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <article key={c.firm.id} className="rounded-md border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold">{firmName(t, c.firm)}</h2>
            <span className="shrink-0 rounded-[4px] border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{c.internal ? t("office.cat.internal") : t("office.cat.external")}</span>
          </div>
          {c.firm.specialty && <p className="mt-1 text-xs text-muted-foreground">{c.firm.specialty}</p>}
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">{t("office.cat.contact")}</dt>
              <dd>{[c.firm.email, c.firm.phone, c.firm.city].filter(Boolean).join(" · ")}</dd>
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
        </article>
      ))}
    </div>
  );
}

function TeamTab() {
  const { t } = useTranslation();
  const me = useCurrentUser().data;
  const usersQ = useUsers();
  const tasksQ = useTasks();
  const bizQ = useBusinesses();
  if (usersQ.isError || tasksQ.isError || bizQ.isError) return <ErrorBox onRetry={() => { void usersQ.refetch(); void tasksQ.refetch(); void bizQ.refetch(); }} />;
  if (usersQ.isLoading || tasksQ.isLoading || bizQ.isLoading || !me) return <Loading />;
  const rows = buildTeamRows(usersQ.data ?? [], me.organization_id ?? "", tasksQ.data ?? [], bizQ.data ?? []);
  if (!rows.length) return <p className="rounded-md border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">{t("office.cat.team_empty")}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">{t("office.cat.col_person")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("office.cat.col_role")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("office.cat.col_supervises")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("office.cat.col_booking")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.user.id}>
              <td className="px-4 py-3"><span className="block font-medium">{r.user.full_name}</span><span className="block text-xs text-muted-foreground">{r.user.email}</span></td>
              <td className="px-3 py-3">{r.user.title ?? "—"}</td>
              <td className="px-3 py-3">{r.supervises.length ? r.supervises.map((b) => b.name).join(", ") : <span className="text-muted-foreground">{t("office.cat.supervises_none")}</span>}</td>
              <td className={cn("px-3 py-3", r.has_booking_url ? "text-status-success-fg" : "text-muted-foreground")}>{r.has_booking_url ? t("office.cat.booking_yes") : t("office.cat.booking_no")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
