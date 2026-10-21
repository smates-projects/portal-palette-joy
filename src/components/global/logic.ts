import type { AreaBottleneck, NetworkSummary, OfficeSummary, StructureDetail, StructureNode, StructureTree } from "@/lib/api/network-types";
import type { AreaCode, Business, Organization, TaskWithComputed } from "@/lib/api/types";
import { AREAS, type Health } from "@/lib/tasks/owner";
import { buildAttention, type AttentionItem, type MatrixRow } from "@/lib/tasks/sm";

/** Home lists show this many rows and then "Ver todo". */
export const MAX_HOME_ITEMS = 5;

const SEVERITY: Record<Health, number> = { grey: 0, green: 1, amber: 2, red: 3 };

/** Worst light of a list; grey when the list is empty. */
export const worstHealth = (healths: Health[]): Health => healths.reduce<Health>((w, h) => (SEVERITY[h] > SEVERITY[w] ? h : w), "grey");

export const healthRank = (h: Health) => SEVERITY[h];

// ---------- Home: office cards ----------

export interface OfficeCard {
  summary: OfficeSummary;
  health: Health;
  overdue: number;
  /** The business and area with the most overdue tasks; null when nothing is overdue. */
  worst: { business_name: string; area: AreaCode; overdue: number } | null;
}

/** One card per office, worst health first, then name. Rows are the matrix of the businesses in the program. */
export function buildOfficeCards(offices: OfficeSummary[], rows: MatrixRow[]): OfficeCard[] {
  return offices
    .map((summary) => {
      const mine = rows.filter((r) => r.business.office_id === summary.office.id);
      let worst: OfficeCard["worst"] = null;
      for (const row of mine)
        for (const cell of row.cells)
          if (cell.overdue > (worst?.overdue ?? 0)) worst = { business_name: row.business.name, area: cell.area, overdue: cell.overdue };
      return { summary, health: worstHealth(mine.map((r) => r.health)), overdue: summary.stats.overdue_tasks, worst };
    })
    .sort((a, b) => SEVERITY[b.health] - SEVERITY[a.health] || a.summary.office.name.localeCompare(b.summary.office.name));
}

// ---------- Home: needs attention ----------

export interface NetworkAttentionItem extends AttentionItem {
  business_name: string;
  office_name: string;
}

/** Overdue, stale and long-blocked tasks of the whole network, each with its business and office. */
export function buildNetworkAttention(tasks: TaskWithComputed[], businesses: Business[], offices: Organization[]): NetworkAttentionItem[] {
  const inProgram = new Map(businesses.filter((b) => b.status === "in_program").map((b) => [b.id, b]));
  const open = tasks.filter((t) => t.status !== "cancelled" && inProgram.has(t.business_id));
  return buildAttention(open, open).map((item) => {
    const business = inProgram.get(item.task.business_id);
    return {
      ...item,
      business_name: business?.name ?? "",
      office_name: offices.find((o) => o.id === business?.office_id)?.name ?? "",
    };
  });
}

// ---------- Home: where the network gets stuck ----------

/** Areas ordered worst first: most overdue tasks, then most businesses in red, then area code. */
export const sortBottlenecks = (rows: AreaBottleneck[]): AreaBottleneck[] =>
  [...rows].sort((a, b) => b.overdue - a.overdue || b.red_businesses - a.red_businesses || a.area.localeCompare(b.area));

export interface StuckBusiness {
  business: Business;
  overdue: number;
}

/**
 * "¿Dónde se traba la red?" for the office in "Viendo": the API answers the whole network (with a breakdown by
 * office), so one office keeps its own overdue count and its red businesses come from the scoped matrix. The red
 * count never goes past the businesses in program ("2 de 0" cannot happen).
 */
export function scopeBottlenecks(rows: AreaBottleneck[], officeId: string | null, matrix: MatrixRow[]): AreaBottleneck[] {
  const total = matrix.length;
  return rows.map((b) => {
    if (!officeId) return { ...b, red_businesses: Math.min(b.red_businesses, total) };
    const mine = b.by_office.find((o) => o.office_id === officeId);
    return {
      ...b,
      open: mine?.open ?? 0,
      overdue: mine?.overdue ?? 0,
      red_businesses: Math.min(stuckBusinesses(matrix, b.area).length, total),
      by_office: mine ? [mine] : [],
    };
  });
}

export interface HomeCounters {
  offices: number;
  programs: number;
  leads_month: number;
  conversion: number | null;
  ready: number;
}

/**
 * The Global home counters for "Viendo": the network summary as is, or the sum of the offices in view. Conversion is
 * a percentage, so it only stays when one office is in view (and it has one).
 */
export function scopeCounters(
  summary: Pick<NetworkSummary, "offices" | "programs" | "leads_this_month" | "conversion_month" | "ready_to_franchise">,
  offices: OfficeSummary[],
  scoped: boolean,
  programs: number,
): HomeCounters {
  if (!scoped)
    return { offices: summary.offices, programs: summary.programs, leads_month: summary.leads_this_month, conversion: summary.conversion_month, ready: summary.ready_to_franchise };
  const sum = (pick: (o: OfficeSummary) => number) => offices.reduce((n, o) => n + pick(o), 0);
  return {
    offices: offices.length,
    programs,
    leads_month: sum((o) => o.stats.leads_this_month),
    conversion: offices.length === 1 ? offices[0].stats.conversion_month : null,
    ready: sum((o) => o.stats.ready_to_franchise),
  };
}

/** Businesses of the matrix with the area in red, most overdue first. */
export function stuckBusinesses(rows: MatrixRow[], area: AreaCode): StuckBusiness[] {
  return rows
    .map((r) => ({ business: r.business, cell: r.cells.find((c) => c.area === area) }))
    .filter((x) => x.cell?.health === "red")
    .map((x) => ({ business: x.business, overdue: x.cell?.overdue ?? 0 }))
    .sort((a, b) => b.overdue - a.overdue || a.business.name.localeCompare(b.business.name));
}

// ---------- Structure tree ----------

/** Translator the tree builder needs; the page passes i18next's t. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface TreeNode {
  id: string;
  kind: StructureNode["kind"] | "group";
  name: string;
  /** One key datum, already translated. */
  datum: string | null;
  health: Health | null;
  children: TreeNode[];
}

/**
 * Builds the displayed tree from the structure the data layer returns (health, franchisability and facts of every
 * node are already computed there). Offices hold three groups: businesses in the program, franchises and partner firms.
 */
export function buildStructureView(tree: StructureTree, t: Translate): TreeNode {
  const businessStatus = (node: StructureNode) => (node.detail?.kind === "business" ? node.detail.status : null);

  const businessNode = (node: StructureNode): TreeNode => {
    const detail = node.detail?.kind === "business" ? node.detail : null;
    const franchises = node.children.filter((c) => c.kind === "franchise");
    const parts: string[] = [];
    if (detail?.status === "in_program") {
      if (detail.program_day !== null) parts.push(t("global.structure.day", { day: detail.program_day }));
      if (node.franchisability) parts.push(t("global.structure.franchisability", { pct: node.franchisability.value, expected: node.franchisability.expected }));
      parts.push(detail.consultant_name ?? t("global.structure.no_consultant"));
    } else if (detail) {
      parts.push(t("global.structure.franchises_count", { count: franchises.length }));
    }
    return { id: node.id, kind: "business", name: node.name, datum: parts.join(" · "), health: node.health, children: franchises.map(franchiseNode) };
  };
  const franchiseNode = (node: StructureNode): TreeNode => ({
    id: node.id, kind: "franchise", name: node.name, datum: node.detail?.kind === "franchise" ? t(`global.structure.franchise_status.${node.detail.status}`) : null, health: null, children: [],
  });
  const firmNode = (node: StructureNode): TreeNode => {
    const detail = node.detail?.kind === "firm" ? node.detail : null;
    return {
      id: node.id, kind: "firm", name: node.name,
      datum: [detail?.area ? t(`firmWhat.${detail.area}`) : null, t("global.structure.overdue", { count: detail?.overdue_tasks ?? 0 })].filter(Boolean).join(" · "),
      health: node.health, children: [],
    };
  };
  const group = (office: StructureNode, key: string, label: string, datum: string | null, children: TreeNode[]): TreeNode => ({
    id: `${office.id}:${key}`, kind: "group", name: label, datum, health: null, children,
  });

  const officeNode = (office: StructureNode): TreeNode => {
    const detail = office.detail?.kind === "office" ? office.detail : null;
    const inProgram = office.children.filter((c) => c.kind === "business" && businessStatus(c) === "in_program");
    const franchisors = office.children.filter((c) => c.kind === "business" && businessStatus(c) === "franchisor");
    const firms = office.children.filter((c) => c.kind === "firm");
    return {
      id: office.id, kind: "office", name: office.name,
      datum: t("global.structure.office_datum", { count: detail?.programs ?? inProgram.length }),
      health: office.health,
      children: [
        group(office, "programs", t("global.structure.group_programs"), null, inProgram.map(businessNode)),
        group(office, "franchises", t("global.structure.group_franchises"), t("global.structure.franchise_level", { ready: detail?.ready_to_franchise ?? 0, open: detail?.operating_franchises ?? 0 }), franchisors.map(businessNode)),
        group(office, "firms", t("global.structure.group_firms"), null, firms.map(firmNode)),
      ],
    };
  };

  return { id: tree.root.id, kind: "global", name: tree.root.name, datum: t("global.structure.global_datum", { count: tree.counts.offices }), health: null, children: tree.root.children.map(officeNode) };
}

/**
 * Keeps the nodes whose name matches the search and the ancestors of those nodes.
 * A node that matches keeps all its children, so you can see what hangs from it.
 */
export function filterTree(node: TreeNode, query: string): TreeNode | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return node;
  if (node.kind !== "group" && node.name.toLowerCase().includes(needle)) return node;
  const children = node.children.map((c) => filterTree(c, needle)).filter((c): c is TreeNode => c !== null);
  return children.length ? { ...node, children } : null;
}

/** Ids of every node that has children, used by "Expandir todo". */
export function expandableIds(node: TreeNode): string[] {
  return node.children.length ? [node.id, ...node.children.flatMap(expandableIds)] : [];
}

// ---------- Structure diagram ----------

/**
 * A box of the org chart. Level 1 is SM Global, 2 the offices. Each office holds small group labels ("group") with its
 * businesses and its partner firms: one card per firm and one placeholder ("gap") per area that has none.
 * Below a business hang the franchises that follow the reporting line; its investors sit beside it (`investors`).
 */
export interface DiagramNode {
  id: string;
  kind: "global" | "office" | "group" | "business" | "franchise" | "firm" | "gap" | "investor";
  name: string;
  health: Health | null;
  franchisability: StructureNode["franchisability"];
  detail: StructureDetail | null;
  /** Firm and gap: the area of the card. */
  area: AreaCode | null;
  /** The children are drawn as a vertical list under the node instead of side by side (the firms of an office). */
  stacked: boolean;
  /** Business only: Bishop investors, drawn beside it with a dashed connector, not as children. */
  investors: DiagramNode[];
  /** Global only: businesses in the program of the whole network. */
  businesses: number;
  children: DiagramNode[];
}

/**
 * Org chart tree from the structure the data layer returns. `t` writes the names of the group labels.
 * An area without firm becomes a placeholder, except B1 (Estrategia), which the office covers with its own team.
 */
export function buildDiagramTree(tree: StructureTree, t: Translate): DiagramNode {
  const make = (node: StructureNode, kind: DiagramNode["kind"], children: DiagramNode[] = []): DiagramNode => ({
    id: node.id,
    kind,
    name: node.name,
    health: node.health,
    franchisability: node.franchisability,
    detail: node.detail,
    area: node.detail?.kind === "firm" ? node.detail.area : null,
    stacked: false,
    investors: [],
    businesses: node.kind === "global" ? tree.counts.businesses : 0,
    children,
  });
  const group = (id: string, name: string, children: DiagramNode[], stacked = false): DiagramNode => ({
    id, kind: "group", name, health: null, franchisability: null, detail: null, area: null, stacked, investors: [], businesses: 0, children,
  });
  const gap = (office: StructureNode, area: AreaCode): DiagramNode => ({
    id: `${office.id}:gap:${area}`, kind: "gap", name: area, health: null, franchisability: null, detail: null, area, stacked: false, investors: [], businesses: 0, children: [],
  });

  const businessNode = (node: StructureNode): DiagramNode => ({
    ...make(node, "business", node.children.filter((c) => c.kind === "franchise").map((c) => make(c, "franchise"))),
    investors: node.children.filter((c) => c.kind === "investor").map((c) => make(c, "investor")),
  });

  const officeNode = (office: StructureNode): DiagramNode => {
    const status = (n: StructureNode) => (n.detail?.kind === "business" ? n.detail.status : null);
    const businesses = office.children.filter((c) => c.kind === "business");
    const firms = office.children.filter((c) => c.kind === "firm");
    const firmOf = (area: AreaCode) => firms.find((f) => f.detail?.kind === "firm" && f.detail.area === area);
    const slots = AREAS.map((area) => {
      const firm = firmOf(area);
      return firm ? make(firm, "firm") : gap(office, area);
    });
    const withoutArea = firms.filter((f) => f.detail?.kind === "firm" && f.detail.area === null).map((f) => make(f, "firm"));
    const groups = [
      { key: "programs", nodes: businesses.filter((b) => status(b) === "in_program") },
      { key: "franchisors", nodes: businesses.filter((b) => status(b) !== "in_program") },
    ]
      .filter((g) => g.nodes.length > 0)
      .map((g) => group(`${office.id}:${g.key}`, t(`global.structure.group_${g.key}`), g.nodes.map(businessNode)));
    return make(office, "office", [...groups, group(`${office.id}:firms`, t("global.structure.group_firms"), [...slots, ...withoutArea], true)]);
  };

  return make(tree.root, "global", tree.root.children.map(officeNode));
}
/** Up to two initials of a person's name: "Ana María Vossler" gives "AV". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** Boxes hidden below a node, at any depth: the "+3" of a collapsed card. Group labels are not counted. */
export function descendantCount(node: DiagramNode): number {
  return node.children.reduce((sum, c) => sum + (c.kind === "group" ? 0 : 1) + descendantCount(c), 0);
}

/** Ids of the nodes that have children and can be collapsed (a stacked list, like the firms, is always open). */
export function collapsibleIds(node: DiagramNode): string[] {
  const below = node.children.flatMap(collapsibleIds);
  return node.children.length && !node.stacked ? [node.id, ...below] : below;
}

/**
 * Search in the diagram: `matches` are the nodes whose name contains the text (to outline them) and `ancestors`
 * are the nodes above a match (to open them so the match is visible). Both are empty with an empty search.
 */
export function diagramSearch(root: DiagramNode, query: string): { matches: Set<string>; ancestors: Set<string> } {
  const needle = query.trim().toLowerCase();
  const matches = new Set<string>();
  const ancestors = new Set<string>();
  if (!needle) return { matches, ancestors };
  const visit = (node: DiagramNode): boolean => {
    // Group labels and placeholders are not names of the network: they never match.
    const own = node.kind !== "group" && node.kind !== "gap" && node.name.toLowerCase().includes(needle);
    if (own) matches.add(node.id);
    const below = node.children.map(visit).some(Boolean);
    if (below) ancestors.add(node.id);
    return own || below;
  };
  visit(root);
  return { matches, ancestors };
}

// ---------- Offices ----------

/** Office light from the health counts of its businesses: the worst one present; grey with no program. */
export function officeHealth(health: { red: number; amber: number; green: number }): Health {
  return health.red > 0 ? "red" : health.amber > 0 ? "amber" : health.green > 0 ? "green" : "grey";
}
