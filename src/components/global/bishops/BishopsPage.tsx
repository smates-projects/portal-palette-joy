import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useFrameworkAgreements, useLeads, useUsers } from "@/lib/api/hooks";
import { bishopCounts, bishopRows, ceoFirstName, matchesName, type BishopCounts, type BishopRow } from "@/lib/bishops/status";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/accounts/shared";
import { EmptyBox, ErrorBox, GlobalHeader, ListSkeleton } from "../shared";
import { MAX_HOME_ITEMS } from "../logic";
import { BishopPrimaryAction, BishopStateChip } from "./shared";

const COUNTERS: (keyof BishopCounts)[] = ["awaiting_sm", "invited", "active", "investing"];

/**
 * Bishops (SM Global): every Bishop in one list with the state of the framework agreement and the one thing to do
 * about it. Bishops talk only to headquarters, so this screen is not scoped by office. Who needs the CEO's
 * signature comes first.
 */
export function BishopsPage() {
  const { t, i18n } = useTranslation();
  const usersQ = useUsers();
  const contractsQ = useFrameworkAgreements();
  const leadsQ = useLeads();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<keyof BishopCounts | null>(null);
  const [all, setAll] = useState(false);
  const contracts = contractsQ.data ?? [];
  const header = (
    <>
      <GlobalHeader question={t("global.bishops.question")} />
      <p className="mt-2 text-sm text-muted-foreground">{t("global.bishops.hint", { ceo: ceoFirstName(contracts) ?? t("global.bishops.corporate") })}</p>
    </>
  );
  const shell = (body: ReactNode) => <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{header}<div className="mt-6">{body}</div></div>;

  if (usersQ.isError || contractsQ.isError || leadsQ.isError)
    return shell(<ErrorBox onRetry={() => { void usersQ.refetch(); void contractsQ.refetch(); void leadsQ.refetch(); }} />);
  if (usersQ.isLoading || contractsQ.isLoading || leadsQ.isLoading) return shell(<ListSkeleton rows={4} />);

  const rows = bishopRows(usersQ.data ?? [], contracts, leadsQ.data ?? []);
  const counts = bishopCounts(rows);
  const visible = rows.filter((r) => matchesName(r, query) && (!filter || r.state === filter));
  const shown = all ? visible : visible.slice(0, MAX_HOME_ITEMS);
  const lng = i18n.language;

  return shell(
    <>
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {COUNTERS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={filter === k}
                onClick={() => { setFilter(filter === k ? null : k); setAll(false); }}
                className={cn(
                  "rounded-[4px] border bg-surface px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === k ? "border-primary" : "border-border",
                )}
              >
                <span className={cn("block text-2xl font-semibold tabular-nums", k === "awaiting_sm" && counts[k] > 0 && "text-status-warning-fg")}>{counts[k]}</span>
                <span className="block text-sm text-muted-foreground">{t(`global.bishops.count_${k}`)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("global.bishops.filter_hint")}</p>

          <label className="relative mt-4 block w-full sm:max-w-xs">
            <span className="sr-only">{t("global.bishops.search_label")}</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setAll(false); }} placeholder={t("global.bishops.search_placeholder")} className={cn(inputCls, "pl-8")} />
          </label>
        </>
      )}

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyBox title={t("global.bishops.empty_title")} body={t("global.bishops.empty_body")} />
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface p-8 text-sm">
            <p className="font-medium">{t("global.bishops.empty_filtered_title")}</p>
            <p className="mt-1 text-muted-foreground">{t("global.bishops.empty_filtered_body")}</p>
            <button onClick={() => { setQuery(""); setFilter(null); }} className="mt-3 text-link hover:underline">{t("global.bishops.filter_clear")}</button>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-surface">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>{t("global.bishops.col_bishop")}</span>
              <span>{t("global.bishops.col_state")}</span>
              <span>{t("global.bishops.col_date")}</span>
              <span className="text-right">{t("global.bishops.col_action")}</span>
            </div>
            <ul className="divide-y divide-border" aria-label={t("pages.bishops.title")}>
              {shown.map((r) => <BishopListRow key={r.user.id} row={r} lng={lng} />)}
            </ul>
            {visible.length > MAX_HOME_ITEMS && (
              <button onClick={() => setAll((v) => !v)} className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-link hover:underline">
                {all ? t("global.home.see_less") : t("sm.see_all", { count: visible.length })}
              </button>
            )}
          </div>
        )}
      </div>
    </>,
  );
}

function BishopListRow({ row, lng }: { row: BishopRow; lng: string }) {
  const { t } = useTranslation();
  const bishopSigned = row.contract?.signers.some((s) => s.party === "bishop" && (s.status === "signed" || !!s.signed_at));
  return (
    <li data-testid="bishop-row" className="grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-3">
      <div className="min-w-0">
        <Link to="/bishops/$userId" params={{ userId: row.user.id }} className="font-medium hover:underline">{row.user.full_name}</Link>
        <span className="block break-all text-xs text-muted-foreground">{row.user.email}</span>
      </div>
      <div className="flex flex-col gap-1">
        <BishopStateChip state={row.state} />
        {row.state === "awaiting_sm" && <span className="text-xs text-muted-foreground">{t(bishopSigned ? "global.bishops.bishop_signed" : "global.bishops.bishop_not_signed")}</span>}
      </div>
      <span className="text-xs text-muted-foreground">{row.date ? t(`global.bishops.date.${row.state}`, { date: formatDate(row.date, lng) }) : t("app.no_data")}</span>
      <div className="md:text-right"><BishopPrimaryAction row={row} /></div>
    </li>
  );
}
