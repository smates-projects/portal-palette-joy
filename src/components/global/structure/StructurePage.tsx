import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useStructure } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { expandableIds, filterTree, buildStructureView, type TreeNode } from "../logic";
import { BusinessSheet, EmptyBox, ErrorBox, GlobalHeader, HealthBadge } from "../shared";

const INDENT_PX = 20;

/** Estructura: SM Global, its offices, the businesses in the program, the franchises and the partner firms of each office. */
export function StructurePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const structureQ = useStructure();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const view: TreeNode | null = structureQ.data ? buildStructureView(structureQ.data, (key, options) => String(t(key, options ?? {}))) : null;

  const header = <GlobalHeader question={t("global.structure.question")} />;
  if (structureQ.isError)
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        {header}
        <div className="mt-6"><ErrorBox onRetry={() => void structureQ.refetch()} /></div>
      </div>
    );
  if (!view)
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        {header}
        <div className="mt-6 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}</div>
      </div>
    );

  const searching = query.trim() !== "";
  const shown = filterTree(view, query);
  // While searching, everything that matched is open so the match is visible.
  const open = searching && shown ? new Set(expandableIds(shown)) : expanded ?? new Set([view.id, ...view.children.map((c) => c.id)]);
  const allIds = expandableIds(view);
  const allOpen = allIds.every((id) => open.has(id));
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev ?? open);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openNode = (node: TreeNode) => {
    if (node.kind === "office") void navigate({ to: "/oficinas/$officeId", params: { officeId: node.id } });
    else if (node.kind === "business") setBusinessId(node.id);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = open.has(node.id);
    const clickable = node.kind === "office" || node.kind === "business";
    return (
      <li key={node.id} role="none">
        <div role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-level={depth + 1} className="flex items-center gap-2 border-b border-border px-3 py-2" style={{ paddingLeft: 12 + depth * INDENT_PX }}>
          {hasChildren ? (
            <button onClick={() => toggle(node.id)} aria-label={t(isOpen ? "global.structure.collapse" : "global.structure.expand", { name: node.name })} className="rounded-[4px] p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {clickable ? (
              <button onClick={() => openNode(node)} className="text-left text-sm font-medium hover:underline">{node.name}</button>
            ) : (
              <span className={cn("text-sm", node.kind === "group" ? "font-semibold" : "font-medium")}>{node.name}</span>
            )}
            {node.datum && <span className="block text-xs text-muted-foreground">{node.datum}</span>}
          </div>
          {/* Grey means "does not apply"; a node with nothing to measure yet (e.g. a new office) shows no badge. */}
          {node.health && node.health !== "grey" && <HealthBadge health={node.health} />}
        </div>
        {hasChildren && isOpen && <ul role="group">{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {header}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("global.structure.search")}
            aria-label={t("global.structure.search")}
            className="h-8 w-72 rounded-md border border-input bg-surface pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <button
          onClick={() => setExpanded(allOpen ? new Set([view.id]) : new Set(allIds))}
          disabled={searching}
          className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {allOpen ? t("global.structure.collapse_all") : t("global.structure.expand_all")}
        </button>
      </div>

      <div className="mt-4">
        {!shown ? (
          <EmptyBox title={t("global.structure.empty_search_title", { q: query })} body={t("global.structure.empty_search_body")} />
        ) : (
          <ul role="tree" aria-label={t("global.structure.question")} className="overflow-hidden rounded-md border border-border bg-surface [&>li>div:first-child]:bg-muted/50 [&_li:last-child>div]:border-b-0">
            {renderNode(shown, 0)}
          </ul>
        )}
      </div>

      <BusinessSheet businessId={businessId} onClose={() => setBusinessId(null)} />
    </div>
  );
}
