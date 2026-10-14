import { describe, expect, it } from "vitest";
import type { AreaBottleneck, StructureTree } from "@/lib/api/network-types";
import type { Business, Franchisability } from "@/lib/api/types";
import type { MatrixRow } from "@/lib/tasks/sm";
import { buildStructureView, expandableIds, filterTree, officeHealth, sortBottlenecks, stuckBusinesses, worstHealth, type StructureFacts, type TreeNode } from "./logic";

const business = (id: string, name: string, status: Business["status"] = "in_program"): Business => ({
  id, name, industry: "services", city: "Miami", state: "FL", owner_user_id: "u", status,
  program_start_date: "2026-08-01", program_day: 60, office_id: "o1", consultant_id: null,
});
const row = (b: Business, areaHealth: "red" | "green", overdue: number): MatrixRow => ({
  business: b,
  cells: [{ area: "B6", health: areaHealth, open: 3, overdue }],
  health: areaHealth,
});
const bottleneck = (area: AreaBottleneck["area"], overdue: number, red: number): AreaBottleneck => ({
  area, open: 5, overdue, blocked: 0, waiting_owner: 0, red_businesses: red, by_office: [],
});
// Fake translator: returns the key and the values, enough to check what the tree says.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

describe("worstHealth", () => {
  it("returns the worst light and grey for an empty list", () => {
    expect(worstHealth(["green", "amber", "red"])).toBe("red");
    expect(worstHealth(["green", "amber"])).toBe("amber");
    expect(worstHealth([])).toBe("grey");
  });
  it("reads the office light from its health counts", () => {
    expect(officeHealth({ red: 1, amber: 2, green: 0 })).toBe("red");
    expect(officeHealth({ red: 0, amber: 0, green: 3 })).toBe("green");
    expect(officeHealth({ red: 0, amber: 0, green: 0 })).toBe("grey");
  });
});

describe("sortBottlenecks", () => {
  it("orders areas worst first and keeps ties stable by area code", () => {
    const sorted = sortBottlenecks([bottleneck("B3", 0, 0), bottleneck("B6", 7, 3), bottleneck("B2", 7, 2), bottleneck("B1", 7, 3)]);
    expect(sorted.map((b) => b.area)).toEqual(["B1", "B6", "B2", "B3"]);
  });
  it("does not change the list it receives", () => {
    const input = [bottleneck("B3", 0, 0), bottleneck("B6", 7, 3)];
    sortBottlenecks(input);
    expect(input.map((b) => b.area)).toEqual(["B3", "B6"]);
  });
});

describe("stuckBusinesses", () => {
  it("lists only businesses with the area in red, most overdue first", () => {
    const rows = [row(business("a", "Alfa"), "red", 2), row(business("b", "Beta"), "green", 0), row(business("c", "Gamma"), "red", 5)];
    expect(stuckBusinesses(rows, "B6").map((s) => [s.business.name, s.overdue])).toEqual([["Gamma", 5], ["Alfa", 2]]);
    expect(stuckBusinesses(rows, "B1")).toEqual([]);
  });
});

describe("structure tree", () => {
  const tree: StructureTree = {
    root: {
      id: "g", kind: "global", name: "SM Global", detail: null,
      children: [{
        id: "o1", kind: "office", name: "SM Miami", detail: "Miami, FL",
        children: [
          { id: "b1", kind: "business", name: "Vossler", detail: null, children: [] },
          { id: "b2", kind: "business", name: "Bimbo Tacos", detail: null, children: [{ id: "f1", kind: "franchise", name: "Bimbo Sur", detail: "operating", children: [] }] },
          { id: "p1", kind: "firm", name: "Estudio Pérez", detail: "B6", children: [] },
        ],
      }],
    },
    counts: { offices: 1, businesses: 1, franchisors: 1, franchises: 1, firms: 1 },
  };
  const businesses = [business("b1", "Vossler"), business("b2", "Bimbo Tacos", "franchisor")];
  const franchisability: Franchisability[] = [{ business_id: "b1", franchisability_pct: 24, franchisability_goal: 85, required_task_codes: [], missing_required: [], is_ready: false }];
  const facts: StructureFacts = {
    rows: [row(businesses[0]!, "red", 3)],
    businesses,
    franchisability,
    consultantNames: new Map(),
    firmOverdue: new Map([["p1", 2]]),
    firmArea: new Map([["p1", "B6"]]),
  };
  const view = buildStructureView(tree, facts, t);
  const find = (node: TreeNode, id: string): TreeNode | undefined => (node.id === id ? node : node.children.map((c) => find(c, id)).find(Boolean));

  it("groups businesses in the program, franchises and partner firms under each office", () => {
    const office = view.children[0]!;
    expect(office.children.map((c) => c.name)).toEqual(["global.structure.group_programs", "global.structure.group_franchises", "global.structure.group_firms"]);
    expect(find(office, "o1:programs")?.children.map((c) => c.name)).toEqual(["Vossler"]);
    expect(find(office, "o1:franchises")?.children.map((c) => c.name)).toEqual(["Bimbo Tacos"]);
    expect(find(office, "o1:firms")?.children.map((c) => c.name)).toEqual(["Estudio Pérez"]);
  });

  it("shows the franchise level counts from real data and the health of each node", () => {
    expect(find(view, "o1:franchises")?.datum).toContain('"ready":0,"open":1');
    expect(find(view, "b1")?.health).toBe("red");
    expect(find(view, "o1")?.health).toBe("red");
    expect(find(view, "p1")?.health).toBe("red");
    expect(find(view, "b1")?.datum).toContain('"expected":28');
  });

  it("keeps a match with its ancestors and drops the rest", () => {
    const filtered = filterTree(view, "vossler")!;
    expect(find(filtered, "b1")).toBeDefined();
    expect(find(filtered, "b2")).toBeUndefined();
    expect(find(filtered, "p1")).toBeUndefined();
    expect(find(filtered, "o1")).toBeDefined();
  });

  it("matches without caring about case and keeps the children of a match", () => {
    const filtered = filterTree(view, "BIMBO TACOS")!;
    expect(find(filtered, "f1")).toBeDefined();
  });

  it("does not match on group names and returns null when nothing matches", () => {
    expect(filterTree(view, "zzz")).toBeNull();
    expect(filterTree(view, "global.structure.group")).toBeNull();
    expect(filterTree(view, "  ")).toBe(view);
  });

  it("lists every node that can be expanded", () => {
    expect(expandableIds(view).sort()).toEqual(["b2", "g", "o1", "o1:firms", "o1:franchises", "o1:programs"].sort());
  });
});
