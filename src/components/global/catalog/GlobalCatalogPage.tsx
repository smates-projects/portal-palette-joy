import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  useAddCatalogItem,
  useArchiveCatalogItem,
  useCatalogAdmin,
  useCatalogHistory,
  useRestoreCatalogItem,
  useUpdateCatalogItem,
  useUsers,
} from "@/lib/api/hooks";
import type { CatalogAdminItem } from "@/lib/api/network-types";
import { AREAS } from "@/lib/tasks/owner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyBox, ErrorBox, GlobalHeader, HistoryList, type HistoryEntry } from "../shared";
import { ArchiveCatalogDialog, CatalogItemDialog } from "./CatalogDialogs";
import { changedFields, previousValues, toInput } from "./form";

/** Catálogo del Método 180: only SM Global edits it. Tasks are added, edited and archived, never deleted. */
export function GlobalCatalogPage() {
  const { t } = useTranslation();
  const catalogQ = useCatalogAdmin();
  const historyQ = useCatalogHistory();
  const usersQ = useUsers();
  const add = useAddCatalogItem();
  const update = useUpdateCatalogItem();
  const archive = useArchiveCatalogItem();
  const restore = useRestoreCatalogItem();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CatalogAdminItem | "new" | null>(null);
  const [archiving, setArchiving] = useState<CatalogAdminItem | null>(null);
  const fail = () => toast.error(t("global.t_error"));

  const header = <GlobalHeader question={t("global.catalog.question")} />;
  if (catalogQ.isError)
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => void catalogQ.refetch()} /></div>
      </div>
    );

  const all = catalogQ.data ?? [];
  const needle = query.trim().toLowerCase();
  const items = all.filter((e) => (showArchived || !e.archived) && (!needle || e.code.toLowerCase().includes(needle) || e.name.toLowerCase().includes(needle)));
  const archivedCount = all.filter((e) => e.archived).length;

  // History reads like the rest of the app: who did what, when, and what changed.
  const authorName = (id: string) => usersQ.data?.find((u) => u.id === id)?.full_name ?? "";
  const show = (field: string, value: string | number | null) =>
    value === null || value === ""
      ? t("global.history.empty")
      : field === "priority"
        ? t(`global.catalog.priority.${value}`)
        : field === "start_day" || field === "due_day"
          ? t("global.catalog.day", { day: value })
          : String(value);
  const entries: HistoryEntry[] = (historyQ.data ?? []).map((c) => ({
    id: c.id,
    when: c.created_at,
    author: authorName(c.actor_user_id),
    title: t(`global.catalog.history.${c.kind}`, { code: c.code, name: all.find((x) => x.code === c.code)?.name ?? "" }),
    lines: c.changes.map((x) => t("global.history.change", { field: t(`global.catalog.fields.${x.field}`), from: show(x.field, x.from), to: show(x.field, x.to) })),
    note: c.note,
  }));

  const save = (form: Parameters<typeof toInput>[0], note: string) => {
    const input = toInput(form);
    if (editing === "new") {
      add.mutate(input, {
        onSuccess: (item) => { toast.success(t("global.catalog.t_added", { code: item.code })); setEditing(null); },
        onError: fail,
      });
      return;
    }
    if (!editing) return;
    const item = editing;
    const patch = changedFields(item, input);
    if (Object.keys(patch).length === 0) { setEditing(null); return; }
    update.mutate({ code: item.code, patch, note: note || null }, {
      onSuccess: () => {
        setEditing(null);
        toast.success(t("global.catalog.t_edited", { code: item.code }), {
          action: { label: t("global.undo"), onClick: () => update.mutate({ code: item.code, patch: previousValues(item, patch) }, { onError: fail }) },
        });
      },
      onError: fail,
    });
  };

  const doArchive = (item: CatalogAdminItem, reason: string) =>
    archive.mutate({ code: item.code, reason }, {
      onSuccess: () => {
        setArchiving(null);
        toast.success(t("global.catalog.t_archived", { code: item.code }), {
          action: { label: t("global.undo"), onClick: () => restore.mutate(item.code, { onError: fail }) },
        });
      },
      onError: fail,
    });
  const doRestore = (item: CatalogAdminItem) =>
    restore.mutate(item.code, { onSuccess: () => toast.success(t("global.catalog.t_restored", { code: item.code })), onError: fail });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>{header}</div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-display text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {t("global.catalog.add")}
        </button>
      </div>
      <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">{t("global.catalog.notice")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("office.cat.search")} aria-label={t("office.cat.search")}
            className="h-8 w-72 rounded-md border border-input bg-surface pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        {archivedCount > 0 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-primary" />
            {t("global.catalog.show_archived", { count: archivedCount })}
          </label>
        )}
      </div>

      <div className="mt-4">
        {catalogQ.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}</div>
        ) : items.length === 0 ? (
          <EmptyBox
            title={needle ? t("global.catalog.empty_search_title", { q: query }) : t("global.catalog.empty_title")}
            body={needle ? t("global.catalog.empty_search_body") : t("global.catalog.empty_body")}
          />
        ) : (
          <div className="space-y-4">
            {AREAS.map((area) => {
              const inArea = items.filter((e) => e.area_code === area);
              if (!inArea.length) return null;
              return (
                <section key={area} className="rounded-md border border-border bg-surface">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold"><span className="font-display">{area}</span> {t(`areas.${area}`)}</h2>
                    <span className="text-xs text-muted-foreground">{t("office.cat.tasks", { count: inArea.length })}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {inArea.map((e) => (
                      <li key={e.code} className={cn("grid gap-3 px-4 py-3 md:grid-cols-[64px_1fr_auto]", e.archived && "bg-muted/40")}>
                        <span className="font-display text-xs font-semibold tabular-nums">{e.code}</span>
                        <div className="min-w-0">
                          <p className={cn("text-sm font-medium", e.archived && "text-muted-foreground")}>
                            {e.name}
                            {e.archived && <span className="ml-2 inline-flex rounded-[4px] border border-status-neutral-border bg-status-neutral-bg px-1.5 py-0.5 align-middle text-xs font-medium text-status-neutral-fg">{t("global.catalog.archived")}</span>}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{t("office.cat.acceptance")}:</span> {e.acceptance}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{t("global.catalog.firm")}:</span> {e.owner || t("global.history.empty")}
                            {" · "}<span className="font-medium text-foreground">{t("office.cat.applies")}:</span> {e.applies || t("global.history.empty")}
                            {" · "}<span className="font-medium text-foreground">{t("global.catalog.window")}:</span>{" "}
                            {e.start_day === null && e.due_day === null
                              ? t("global.catalog.window_default")
                              : t("global.catalog.window_value", { start: e.start_day ?? "?", due: e.due_day ?? "?" })}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          {e.archived ? (
                            <button onClick={() => doRestore(e)} disabled={restore.isPending} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">{t("global.catalog.restore")}</button>
                          ) : (
                            <>
                              <button onClick={() => setEditing(e)} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">{t("global.catalog.edit")}</button>
                              <button onClick={() => setArchiving(e)} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">{t("global.catalog.archive_action")}</button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {historyQ.isError ? (
        <div className="mt-6"><ErrorBox onRetry={() => void historyQ.refetch()} /></div>
      ) : (
        <HistoryList title={t("global.catalog.history_title")} entries={entries} empty={t("global.catalog.history_empty")} />
      )}

      {editing && (
        <CatalogItemDialog
          item={editing === "new" ? null : editing}
          defaultArea="B1"
          pending={add.isPending || update.isPending}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {archiving && (
        <ArchiveCatalogDialog item={archiving} pending={archive.isPending} onClose={() => setArchiving(null)} onConfirm={(reason) => doArchive(archiving, reason)} />
      )}
    </div>
  );
}
