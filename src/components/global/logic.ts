import type { AreaBottleneck, OfficeSummary, StructureNode, StructureTree } from "@/lib/api/network-types";
import type { AreaCode, Business, Franchisability, Organization, TaskWithComputed } from "@/lib/api/types";
import type { Health } from "@/lib/tasks/owner";
import { expectedFranchisePct } from "@/lib/tasks/office";
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

export interface StructureFacts {
  /** Matrix rows of the businesses in the program. */
  rows: MatrixRow[];
  businesses: Business[];
  franchisability: Franchisability[];
  consultantNames: Map<string, string>;
  /** Overdue tasks per firm id. */
  firmOverdue: Map<string, number>;
  firmArea: Map<string, AreaCode | null>;
}

/** Builds the displayed tree: offices hold three groups (businesses in the program, franchises, partner firms). */
export function buildStructureView(tree: StructureTree, facts: StructureFacts, t: Translate): TreeNode {
  const businessOf = (id: string) => facts.businesses.find((b) => b.id === id);

  const businessNode = (node: StructureNode): TreeNode => {
    const business = businessOf(node.id);
    const row = facts.rows.find((r) => r.business.id === node.id);
    const f = facts.franchisability.find((x) => x.business_id === node.id);
    const parts: string[] = [];
    if (business && business.status === "in_program") {
      parts.push(t("global.structure.day", { day: business.program_day }));
      if (f) parts.push(t("global.structure.franchisability", { pct: f.franchisability_pct, expected: expectedFranchisePct(business.program_day, f.franchisability_goal) }));
      const consultant = business.consultant_id ? facts.consultantNames.get(business.consultant_id) : undefined;
      parts.push(consultant ?? t("global.structure.no_consultant"));
    } else if (business) {
      parts.push(t("global.structure.franchises_count", { count: node.children.length }));
    }
    return { id: node.id, kind: "business", name: node.name, datum: parts.join(" · "), health: row?.health ?? null, children: node.children.map(franchiseNode) };
  };
  const franchiseNode = (node: StructureNode): TreeNode => ({
    id: node.id, kind: "franchise", name: node.name, datum: node.detail ? t(`global.structure.franchise_status.${node.detail}`) : null, health: null, children: [],
  });
  const firmNode = (node: StructureNode): TreeNode => {
    const area = facts.firmArea.get(node.id) ?? null;
    const overdue = facts.firmOverdue.get(node.id) ?? 0;
    return {
      id: node.id, kind: "firm", name: node.name,
      datum: [area ? t(`firmWhat.${area}`) : null, t("global.structure.overdue", { count: overdue })].filter(Boolean).join(" · "),
      health: overdue > 0 ? "red" : "green", children: [],
    };
  };
  const group = (office: StructureNode, key: string, label: string, datum: string | null, children: TreeNode[]): TreeNode => ({
    id: `${office.id}:${key}`, kind: "group", name: label, datum, health: null, children,
  });

  const officeNode = (office: StructureNode): TreeNode => {
    const inProgram = office.children.filter((c) => c.kind === "business" && businessOf(c.id)?.status === "in_program");
    const franchisors = office.children.filter((c) => c.kind === "business" && businessOf(c.id)?.status === "franchisor");
    const firms = office.children.filter((c) => c.kind === "firm");
    const rows = facts.rows.filter((r) => r.business.office_id === office.id);
    const ready = facts.franchisability.filter((f) => f.is_ready && inProgram.some((c) => c.id === f.business_id)).length;
    const open = franchisors.reduce((n, c) => n + c.children.filter((x) => x.detail === "operating").length, 0);
    return {
      id: office.id, kind: "office", name: office.name,
      datum: t("global.structure.office_datum", { count: inProgram.length }),
      health: rows.length ? worstHealth(rows.map((r) => r.health)) : "grey",
      children: [
        group(office, "programs", t("global.structure.group_programs"), null, inProgram.map(businessNode)),
        group(office, "franchises", t("global.structure.group_franchises"), t("global.structure.franchise_level", { ready, open }), franchisors.map(businessNode)),
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

// ---------- Offices ----------

/** Office light from the health counts of its businesses: the worst one present; grey with no program. */
export function officeHealth(health: { red: number; amber: number; green: number }): Health {
  return health.red > 0 ? "red" : health.amber > 0 ? "amber" : health.green > 0 ? "green" : "grey";
}
