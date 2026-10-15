import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOT } from "@/components/office/shared";
import { descendantCount, initialsOf, type DiagramNode } from "../logic";
import { OfficeStatusBadge } from "../shared";

interface DiagramContext {
  /** Nodes the user collapsed. */
  collapsed: Set<string>;
  /** Nodes opened by the search so a match is visible, even if the user collapsed them. */
  forcedOpen: Set<string>;
  /** Nodes whose name matches the search. */
  matches: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (node: DiagramNode) => void;
}

/** Vertical line, the building block of the elbow connectors. */
const LINE = "w-px bg-border";

/** Person line of an office or business card: small initials square and the full name. */
function Person({ name }: { name: string }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 text-xs text-foreground">
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-muted text-[10px] font-semibold text-muted-foreground">{initialsOf(name)}</span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function CardBody({ node }: { node: DiagramNode }) {
  const { t } = useTranslation();
  const detail = node.detail;
  const datum = "mt-1 block text-xs text-muted-foreground";

  if (node.kind === "global")
    return (
      <>
        <span className="block text-sm font-semibold">{node.name}</span>
        <span className="mt-1 block text-xs text-primary-foreground/80">
          {t("global.structure.global_datum", { count: node.children.length })} · {t("global.structure.diagram.businesses", { count: node.businesses })}
        </span>
      </>
    );

  const office = detail?.kind === "office" ? detail : null;
  const business = detail?.kind === "business" ? detail : null;
  const franchise = detail?.kind === "franchise" ? detail : null;
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(`global.structure.diagram.kind_${node.kind}`)}</span>
        {office && office.status !== "operating" && <OfficeStatusBadge status={office.status} />}
      </span>
      <span className="mt-0.5 block break-words text-sm font-medium">{node.name}</span>
      {office && (
        <>
          {office.city && <span className={datum}>{office.city}</span>}
          {office.manager_name && <Person name={office.manager_name} />}
          <span className={datum}>{t("global.structure.office_datum", { count: office.programs })}</span>
          <span className={datum}>{t("global.structure.diagram.firms", { count: node.firms })}</span>
          {office.missing_areas.length > 0 && (
            <span className="mt-1 block text-xs font-medium text-status-warning-fg">
              {t("global.structure.diagram.missing_firm", { areas: office.missing_areas.map((a) => t(`areas.${a}`)).join(", ") })}
            </span>
          )}
        </>
      )}
      {business && (
        <>
          {business.owner_name && <Person name={business.owner_name} />}
          {business.status === "in_program" ? (
            <>
              {business.program_day !== null && <span className={datum}>{t("global.structure.day", { day: business.program_day })}</span>}
              {node.franchisability && <span className={datum}>{t("global.structure.franchisability", { pct: node.franchisability.value, expected: node.franchisability.expected })}</span>}
            </>
          ) : (
            <span className={datum}>{t("global.structure.franchises_count", { count: node.children.length })}</span>
          )}
        </>
      )}
      {franchise && (
        <>
          <span className={datum}>{franchise.city}</span>
          <span className={datum}>{t(`global.structure.franchise_status.${franchise.status}`)}</span>
        </>
      )}
    </>
  );
}

/** One box of the org chart. Offices and businesses are buttons (they open their detail); the rest are plain boxes. */
function DiagramCard({ node, ctx }: { node: DiagramNode; ctx: DiagramContext }) {
  const { t } = useTranslation();
  const isGlobal = node.kind === "global";
  const clickable = node.kind === "office" || node.kind === "business";
  // Grey means "does not apply": a node with nothing to measure gets no strip.
  const stripped = !isGlobal && node.health && node.health !== "grey";
  const className = cn(
    "relative block w-[208px] overflow-hidden rounded-[4px] border px-3 pb-2.5 text-left",
    isGlobal ? "border-primary bg-primary pb-3.5 pt-2.5 text-primary-foreground" : "border-border bg-surface pt-3",
    clickable && "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ctx.matches.has(node.id) && "outline outline-2 outline-offset-2 outline-gold",
  );
  const decoration = (
    <>
      {stripped && node.health && <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", DOT[node.health])} />}
      {isGlobal && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-gold" />}
    </>
  );

  if (!clickable)
    return (
      <div className={className}>
        {decoration}
        <CardBody node={node} />
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => ctx.onOpen(node)}
      aria-label={node.health ? t("global.structure.diagram.card_label", { name: node.name, health: t(`global.health.${node.health}`) }) : node.name}
      className={className}
    >
      {decoration}
      <CardBody node={node} />
    </button>
  );
}

/**
 * A card with its subtree. Connectors are plain 1px lines: a stub down from the parent, a horizontal bar across the
 * children (drawn by each child from its own centre to the side that has a sibling) and a stub into each child.
 */
function DiagramBranch({ node, ctx }: { node: DiagramNode; ctx: DiagramContext }) {
  const { t } = useTranslation();
  const hasChildren = node.children.length > 0;
  const isOpen = !ctx.collapsed.has(node.id) || ctx.forcedOpen.has(node.id);
  const last = node.children.length - 1;

  return (
    <div className="flex flex-col items-center">
      <DiagramCard node={node} ctx={ctx} />
      {hasChildren && (
        <>
          <span aria-hidden className={cn(LINE, "h-2")} />
          <button
            type="button"
            onClick={() => ctx.onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={t(isOpen ? "global.structure.collapse" : "global.structure.expand", { name: node.name })}
            className="inline-flex h-5 min-w-6 items-center justify-center gap-0.5 rounded-[4px] border border-border bg-surface px-1 text-[11px] font-medium tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <><ChevronDown className="h-3 w-3" />+{descendantCount(node)}</>}
          </button>
        </>
      )}
      {hasChildren && isOpen && (
        <>
          <span aria-hidden className={cn(LINE, "h-3")} />
          <ul className="flex items-start">
            {node.children.map((child, i) => (
              <li key={child.id} className="relative flex flex-col items-center px-2 pt-4">
                <span aria-hidden className={cn(LINE, "absolute left-1/2 top-0 h-4 -translate-x-1/2")} />
                {last > 0 && <span aria-hidden className={cn("absolute top-0 h-px bg-border", i === 0 ? "left-1/2 right-0" : i === last ? "left-0 right-1/2" : "inset-x-0")} />}
                <DiagramBranch node={child} ctx={ctx} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Org chart of the network, top down. Sits in a panel that scrolls sideways when the tree is wider than the screen. */
export function StructureDiagram({ root, ...ctx }: { root: DiagramNode } & DiagramContext) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  // A tree wider than the panel opens centred on SM Global instead of at its left edge.
  useEffect(() => {
    const el = panel.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);
  return (
    <div ref={panel} className="overflow-x-auto rounded-md border border-border bg-surface px-6 py-8" role="group" aria-label={t("global.structure.question")}>
      <div className="mx-auto w-max">
        <DiagramBranch node={root} ctx={ctx} />
      </div>
    </div>
  );
}
