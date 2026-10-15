import type { AreaBottleneck, OfficeSummary, StructureDetail, StructureNode, StructureTree } from "@/lib/api/network-types";
import type { AreaCode, Business, Organization, TaskWithComputed } from "@/lib/api/types";
import type { Health } from "@/lib/tasks/owner";
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
    const parts: string[] = [];
    if (detail?.status === "in_program") {
      if (detail.program_day !== null) parts.push(t("global.structure.day", { day: detail.program_day }));
      if (node.franchisability) parts.push(t("global.structure.franchisability", { pct: node.franchisability.value, expected: node.franchisability.expected }));
      parts.push(detail.consultant_name ?? t("global.structure.no_consultant"));
    } else if (detail) {
      parts.push(t("global.structure.franchises_count", { count: node.children.length }));
    }
    return { id: node.id, kind: "business", name: node.name, datum: parts.join(" · "), health: node.health, children: node.children.map(franchiseNode) };
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
 * A box of the org chart. Partner firms are not boxes: an office keeps their count and the areas still without a firm.
 * Level 1 is SM Global, 2 the offices, 3 the businesses of each office, 4 the franchises of the business that franchised.
 */
export interface DiagramNode {
  id: string;
  kind: "global" | "office" | "business" | "franchise";
  name: string;
  health: Health | null;
  franchisability: StructureNode["franchisability"];
  detail: StructureDetail | null;
  /** Office only: partner firms of the office. */
  firms: number;
  /** Global only: businesses in the program of the whole network. */
  businesses: number;
  children: DiagramNode[];
}

/** Org chart tree from the structure the data layer returns. Firms are dropped as nodes and counted on their office. */
export function buildDiagramTree(tree: StructureTree): DiagramNode {
  const toNode = (node: StructureNode): DiagramNode => {
    const children = node.children.filter((c) => c.kind !== "firm");
    return {
      id: node.id,
      kind: node.kind === "firm" ? "business" : node.kind,
      name: node.name,
      health: node.health,
      franchisability: node.franchisability,
      detail: node.detail,
      firms: node.children.length - children.length,
      businesses: node.kind === "global" ? tree.counts.businesses : 0,
      children: children.map(toNode),
    };
  };
  return toNode(tree.root);
}

/** Up to two initials of a person's name: "Ana María Vossler" gives "AV". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** Boxes hidden below a node, at any depth: the "+3" of a collapsed card. */
export function descendantCount(node: DiagramNode): number {
  return node.children.reduce((sum, c) => sum + 1 + descendantCount(c), 0);
}

/** Ids of the nodes that have children (the ones that can be collapsed). */
export function collapsibleIds(node: DiagramNode): string[] {
  return node.children.length ? [node.id, ...node.children.flatMap(collapsibleIds)] : [];
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
    const own = node.name.toLowerCase().includes(needle);
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
