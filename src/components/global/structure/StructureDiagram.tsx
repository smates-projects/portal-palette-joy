import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/format";
import type { AreaCode } from "@/lib/api/types";
import { AreaTag } from "@/components/AreaTag";
import { DOT } from "@/components/office/shared";
import { descendantCount, initialsOf, type DiagramNode } from "../logic";
import { OfficeStatusBadge } from "../shared";
import { centerOn, fitCamera, panBy, scaleAfterWheel, zoomAround, ZOOM_STEP, type Camera, type Point, type Size } from "./camera";

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

const CARD_WIDTH = 208;
const INVESTOR_WIDTH = 184;
/** Space between a business card and its investor, crossed by the dashed connector. */
const INVESTOR_GAP = 28;
/** A pointer that moves less than this many pixels is a click, not a drag. */
const DRAG_THRESHOLD = 4;
const KEY_PAN_STEP = 60;

/** Person line of a card: small initials square and the full name. */
function Person({ name }: { name: string }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 text-xs text-foreground">
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] bg-muted text-[10px] font-semibold text-muted-foreground">{initialsOf(name)}</span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

/** Eyebrow of an area card: a small square in the area color, the code and the area name ("B3 Finanzas"). */
function AreaEyebrow({ area }: { area: AreaCode }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <AreaTag area={area} />
    </span>
  );
}

function CardBody({ node }: { node: DiagramNode }) {
  const { t, i18n } = useTranslation();
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

  if (node.kind === "gap" && node.area)
    // B1 Estrategia is covered by the office itself: it is not a missing firm.
    return (
      <>
        <AreaEyebrow area={node.area} />
        <span className={cn("mt-1 block text-sm font-medium", node.area === "B1" ? "text-foreground" : "text-status-warning-fg")}>
          {node.area === "B1" ? t("global.structure.diagram.own_team") : t("global.structure.diagram.gap_firm", { area: `${node.area} ${t(`areas.${node.area}`)}` })}
        </span>
      </>
    );

  const office = detail?.kind === "office" ? detail : null;
  const business = detail?.kind === "business" ? detail : null;
  const franchise = detail?.kind === "franchise" ? detail : null;
  const firm = detail?.kind === "firm" ? detail : null;
  const investor = detail?.kind === "investor" ? detail : null;
  return (
    <>
      <span className="flex items-center justify-between gap-2">
        {node.kind === "firm" && node.area ? (
          <AreaEyebrow area={node.area} />
        ) : (
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(`global.structure.diagram.kind_${node.kind}`)}</span>
        )}
        {office && office.status !== "operating" && <OfficeStatusBadge status={office.status} />}
      </span>
      <span className="mt-0.5 block break-words text-sm font-medium">{node.name}</span>
      {office && (
        <>
          {office.city && <span className={datum}>{office.city}</span>}
          {office.manager_name && <Person name={office.manager_name} />}
          <span className={datum}>{t("global.structure.office_datum", { count: office.programs })}</span>
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
          {franchise.franchisee_name && <Person name={franchise.franchisee_name} />}
          <span className={datum}>{franchise.city}</span>
          <span className={datum}>{t(`global.structure.franchise_status.${franchise.status}`)}</span>
        </>
      )}
      {firm && (
        <>
          {firm.specialty && <span className={cn(datum, "line-clamp-2")}>{firm.specialty}</span>}
          {firm.contact_name && <Person name={firm.contact_name} />}
          <span className={cn("mt-1 block text-xs", firm.overdue_tasks > 0 ? "font-medium text-status-danger-fg" : "text-muted-foreground")}>
            {t("global.structure.overdue", { count: firm.overdue_tasks })}
          </span>
        </>
      )}
      {investor && (
        <>
          <span className={datum}>{t("global.structure.diagram.investor_amount", { amount: formatUsd(investor.invested, i18n.language) })}</span>
          <span className={datum}>{t("global.structure.diagram.investor_share", { pct: investor.share_pct })}</span>
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
  const common = cn(ctx.matches.has(node.id) && "outline outline-2 outline-offset-2 outline-gold");

  if (node.kind === "group")
    return (
      <div data-node-id={node.id} className={cn("rounded-[4px] border border-border bg-muted px-3 py-1.5 text-center text-xs font-semibold text-foreground", node.stacked ? "min-w-[208px] self-stretch" : "w-[208px]")}>
        {node.name}
      </div>
    );

  const className = cn(
    "relative block overflow-hidden rounded-[4px] border px-3 pb-2.5 text-left",
    node.kind === "investor" ? "w-[184px]" : "w-[208px]",
    isGlobal ? "border-primary bg-primary pb-3.5 pt-2.5 text-primary-foreground" : "bg-surface pt-3",
    !isGlobal && (node.kind === "gap" ? "border-dashed border-muted-foreground/60 bg-transparent" : "border-border"),
    clickable && "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    common,
  );
  const decoration = (
    <>
      {stripped && node.health && <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", DOT[node.health])} />}
      {isGlobal && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-gold" />}
    </>
  );

  if (!clickable)
    return (
      <div data-node-id={node.id} className={className}>
        {decoration}
        <CardBody node={node} />
      </div>
    );
  return (
    <button
      type="button"
      data-node-id={node.id}
      onClick={() => ctx.onOpen(node)}
      aria-label={node.health ? t("global.structure.diagram.card_label", { name: node.name, health: t(`global.health.${node.health}`) }) : node.name}
      className={className}
    >
      {decoration}
      <CardBody node={node} />
    </button>
  );
}

/** A business card with its investors beside it: the dashed line is not part of the reporting line. */
function CardWithInvestors({ node, ctx }: { node: DiagramNode; ctx: DiagramContext }) {
  if (node.investors.length === 0) return <DiagramCard node={node} ctx={ctx} />;
  return (
    <div className="relative">
      <DiagramCard node={node} ctx={ctx} />
      <div className="absolute top-0 flex flex-col gap-2" style={{ left: `calc(100% + ${INVESTOR_GAP}px)` }}>
        {node.investors.map((investor) => (
          <div key={investor.id} className="relative">
            <span aria-hidden className="absolute top-6 border-t border-dashed border-muted-foreground" style={{ left: -INVESTOR_GAP, width: INVESTOR_GAP }} />
            <DiagramCard node={investor} ctx={ctx} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A card with its subtree. Connectors are plain 1px lines: a stub down from the parent, a horizontal bar across the
 * children (drawn by each child from its own centre to the side that has a sibling) and a stub into each child.
 * A stacked node (the firms of an office) lists its children one under the other along a vertical line instead.
 */
function DiagramBranch({ node, ctx, onToggle }: { node: DiagramNode; ctx: DiagramContext; onToggle: (id: string) => void }) {
  const { t } = useTranslation();
  const hasChildren = node.children.length > 0;
  const isOpen = node.stacked || !ctx.collapsed.has(node.id) || ctx.forcedOpen.has(node.id);
  const last = node.children.length - 1;
  // The column keeps room on both sides so the card stays centered over its children and the investor fits.
  const reserved = node.investors.length > 0 ? CARD_WIDTH + 2 * (INVESTOR_GAP + INVESTOR_WIDTH) : undefined;

  return (
    <div className="flex flex-col items-center" style={{ minWidth: reserved }}>
      <CardWithInvestors node={node} ctx={ctx} />
      {hasChildren && !node.stacked && (
        <>
          <span aria-hidden className={cn(LINE, "h-2")} />
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={t(isOpen ? "global.structure.collapse" : "global.structure.expand", { name: node.name })}
            className="inline-flex h-5 min-w-6 items-center justify-center gap-0.5 rounded-[4px] border border-border bg-surface px-1 text-[11px] font-medium tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <><ChevronDown className="h-3 w-3" />+{descendantCount(node)}</>}
          </button>
        </>
      )}
      {hasChildren && isOpen && node.stacked && (
        <ul className="ml-3 flex flex-col pl-3">
          {node.children.map((child, i) => (
            <li key={child.id} className="relative pt-2">
              <span aria-hidden className={cn(LINE, "absolute -left-3 top-0", i === last ? "h-7" : "h-full")} />
              <span aria-hidden className="absolute -left-3 top-7 h-px w-3 bg-border" />
              <DiagramBranch node={child} ctx={ctx} onToggle={onToggle} />
            </li>
          ))}
        </ul>
      )}
      {hasChildren && isOpen && !node.stacked && (
        <>
          <span aria-hidden className={cn(LINE, "h-3")} />
          <ul className="flex items-start">
            {node.children.map((child, i) => (
              <li key={child.id} className="relative flex flex-col items-center px-2 pt-4">
                <span aria-hidden className={cn(LINE, "absolute left-1/2 top-0 h-4 -translate-x-1/2")} />
                {last > 0 && <span aria-hidden className={cn("absolute top-0 h-px bg-border", i === 0 ? "left-1/2 right-0" : i === last ? "left-0 right-1/2" : "inset-x-0")} />}
                <DiagramBranch node={child} ctx={ctx} onToggle={onToggle} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A point of the tree (the layer's own pixels, before zoom). */
interface Anchor extends Point {
  id: string;
}

const toolbarButton = "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 px-2 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * Org chart of the network, top down, inside a panel with a camera: it opens fitted to the panel, you drag to move and
 * Ctrl or Shift + wheel (or a pinch) to zoom. A plain wheel still scrolls the page.
 */
export function StructureDiagram({ root, ...ctx }: { root: DiagramNode } & DiagramContext) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  // Short ease only for discrete actions (buttons, keys, search); dragging and wheel follow the pointer without delay.
  const [animated, setAnimated] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The camera lives in a ref too, so several events between two renders (a pinch) add up.
  const cameraRef = useRef(camera);
  const renderedScale = useRef(1);
  // True once the user moved the camera: from then on a resize no longer re-fits.
  const moved = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const origin = useRef<Point | null>(null);
  const dragged = useRef(false);
  const suppressClick = useRef(false);
  // Position of a card in the layer before a collapse, to keep it still on screen afterwards.
  const anchor = useRef<Anchor | null>(null);
  const baseline = useRef<Anchor | null>(null);

  const apply = useCallback((next: Camera, withEase = false) => {
    cameraRef.current = next;
    setAnimated(withEase);
    setCamera(next);
  }, []);

  const panelSize = (): Size => ({ width: panelRef.current?.clientWidth ?? 0, height: panelRef.current?.clientHeight ?? 0 });
  const panelCenter = (): Point => ({ x: panelSize().width / 2, y: panelSize().height / 2 });
  const fit = (withEase: boolean) => {
    moved.current = false;
    apply(fitCamera({ width: contentRef.current?.offsetWidth ?? 0, height: contentRef.current?.offsetHeight ?? 0 }, panelSize()), withEase);
  };
  const move = (next: Camera, withEase = false) => {
    moved.current = true;
    apply(next, withEase);
  };
  const zoomTo = (scale: number) => move(zoomAround(cameraRef.current, scale, panelCenter()), true);

  /** Centre of a card in the layer's own pixels, whatever the zoom. */
  const worldCenterOf = useCallback((id: string): Point | null => {
    const layer = contentRef.current;
    const el = layer?.querySelector(`[data-node-id="${id}"]`);
    if (!layer || !el) return null;
    const a = layer.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { x: (b.left - a.left + b.width / 2) / renderedScale.current, y: (b.top - a.top + b.height / 2) / renderedScale.current };
  }, []);

  // Opens fitted, and follows the panel when it changes size (as long as the user has not moved the camera).
  useLayoutEffect(() => {
    fit(false);
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!moved.current) fit(false);
    });
    observer.observe(panel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit only reads refs
  }, []);

  useLayoutEffect(() => {
    renderedScale.current = camera.scale;
  }, [camera.scale]);

  // Expanding or collapsing changes the size of the tree: the card the user touched (or SM Global) stays where it was.
  useLayoutEffect(() => {
    const before = anchor.current ?? baseline.current;
    anchor.current = null;
    const now = before ? worldCenterOf(before.id) : null;
    if (before && now && (Math.abs(before.x - now.x) > 0.5 || Math.abs(before.y - now.y) > 0.5)) {
      const current = cameraRef.current;
      apply(panBy(current, (before.x - now.x) * current.scale, (before.y - now.y) * current.scale));
    }
    const rootCenter = worldCenterOf(root.id);
    baseline.current = rootCenter ? { id: root.id, ...rootCenter } : null;
  }, [root, ctx.collapsed, ctx.forcedOpen, worldCenterOf, apply]);

  // Searching centers the camera on the first match.
  const firstMatch = [...ctx.matches][0] ?? null;
  useEffect(() => {
    if (!firstMatch) return;
    const world = worldCenterOf(firstMatch);
    if (world) move(centerOn(world, Math.max(cameraRef.current.scale, 0.6), panelSize()), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the first match changes
  }, [firstMatch]);

  // Ctrl or Shift + wheel (and the trackpad pinch, which arrives as ctrl + wheel) zooms around the pointer.
  // It needs a native listener: React's wheel handlers are passive and cannot cancel the page scroll.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.shiftKey) return;
      e.preventDefault();
      const raw = e.deltaY || e.deltaX;
      const delta = e.deltaMode === 1 ? raw * 16 : raw;
      const rect = panel.getBoundingClientRect();
      const current = cameraRef.current;
      moved.current = true;
      apply(zoomAround(current, scaleAfterWheel(current.scale, delta), { x: e.clientX - rect.left - panel.clientLeft, y: e.clientY - rect.top - panel.clientTop }));
    };
    panel.addEventListener("wheel", onWheel, { passive: false });
    return () => panel.removeEventListener("wheel", onWheel);
  }, [apply]);

  const toggle = (id: string) => {
    const world = worldCenterOf(id);
    if (world) anchor.current = { id, ...world };
    ctx.onToggle(id);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-camera-ui]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      origin.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
    } else {
      // A second finger: it is a pinch, never a click.
      dragged.current = true;
      setDragging(true);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const next = { x: e.clientX, y: e.clientY };
    const current = cameraRef.current;
    if (pointers.current.size === 1) {
      if (!dragged.current) {
        if (!origin.current || Math.hypot(next.x - origin.current.x, next.y - origin.current.y) < DRAG_THRESHOLD) return;
        dragged.current = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      move(panBy(current, next.x - previous.x, next.y - previous.y));
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (!other) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const before = { x: (previous.x + other.x) / 2 - rect.left, y: (previous.y + other.y) / 2 - rect.top };
      const after = { x: (next.x + other.x) / 2 - rect.left, y: (next.y + other.y) / 2 - rect.top };
      const ratio = Math.hypot(next.x - other.x, next.y - other.y) / Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y));
      const zoomed = zoomAround(current, current.scale * ratio, before);
      move(panBy(zoomed, after.x - before.x, after.y - before.y));
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    }
    pointers.current.set(e.pointerId, next);
  };

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (pointers.current.size > 0) return;
    setDragging(false);
    // The click that follows a drag must not open a card.
    suppressClick.current = dragged.current;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const current = cameraRef.current;
    const pan: Record<string, [number, number]> = { ArrowLeft: [KEY_PAN_STEP, 0], ArrowRight: [-KEY_PAN_STEP, 0], ArrowUp: [0, KEY_PAN_STEP], ArrowDown: [0, -KEY_PAN_STEP] };
    const step = pan[e.key];
    if (step) move(panBy(current, step[0], step[1]), true);
    else if (e.key === "+" || e.key === "=") zoomTo(current.scale * ZOOM_STEP);
    else if (e.key === "-" || e.key === "_") zoomTo(current.scale / ZOOM_STEP);
    else if (e.key === "0") fit(true);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={t("global.structure.question")}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      className={cn(
        "relative h-[min(70vh,720px)] touch-none select-none overflow-hidden rounded-md border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <div
        ref={contentRef}
        className={cn("absolute left-0 top-0 w-max p-6", animated && "motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out")}
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`, transformOrigin: "0 0" }}
      >
        <DiagramBranch node={root} ctx={ctx} onToggle={toggle} />
      </div>

      <div data-camera-ui className="absolute right-3 top-3 flex cursor-default items-stretch divide-x divide-border overflow-hidden rounded-[4px] border border-border bg-surface">
        <button type="button" onClick={() => zoomTo(cameraRef.current.scale / ZOOM_STEP)} aria-label={t("global.structure.camera.zoom_out")} title={t("global.structure.camera.zoom_out")} className={toolbarButton}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="inline-flex min-w-12 items-center justify-center px-2 text-sm tabular-nums text-muted-foreground">{Math.round(camera.scale * 100)}%</span>
        <button type="button" onClick={() => zoomTo(cameraRef.current.scale * ZOOM_STEP)} aria-label={t("global.structure.camera.zoom_in")} title={t("global.structure.camera.zoom_in")} className={toolbarButton}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => fit(true)} aria-label={t("global.structure.camera.fit")} title={t("global.structure.camera.fit")} className={toolbarButton}>
          <Maximize className="h-4 w-4" />
          <span className="hidden sm:inline">{t("global.structure.camera.fit")}</span>
        </button>
        <button type="button" onClick={() => zoomTo(1)} aria-label={t("global.structure.camera.actual_size")} title={t("global.structure.camera.actual_size")} className={toolbarButton}>
          100%
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-[4px] border border-border bg-surface px-2 py-1 text-xs text-muted-foreground sm:block">{t("global.structure.camera.hint")}</p>
    </div>
  );
}
