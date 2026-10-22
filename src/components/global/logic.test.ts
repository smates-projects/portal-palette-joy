import { describe, expect, it } from "vitest";
import type { AreaBottleneck, OfficeSummary, StructureNode, StructureTree } from "@/lib/api/network-types";
import type { Business } from "@/lib/api/types";
import type { MatrixRow } from "@/lib/tasks/sm";
import { buildDiagramTree, buildStructureView, collapsibleIds, descendantCount, diagramSearch, expandableIds, filterTree, initialsOf, officeHealth, scopeBottlenecks, scopeCounters, sortBottlenecks, stuckBusinesses, worstHealth, type TreeNode } from "./logic";

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

describe("Viendo on the Global home", () => {
  it("one office keeps its own overdue tasks and red businesses, never more red than businesses in program", () => {
    const network = { ...bottleneck("B6", 9, 4), by_office: [{ office_id: "o1", office_name: "Miami", open: 2, overdue: 3 }] };
    const rows = [row(business("a", "Alfa"), "red", 3)];
    expect(scopeBottlenecks([network], "o1", rows)[0]).toMatchObject({ overdue: 3, red_businesses: 1, open: 2 });
    expect(scopeBottlenecks([network], "o2", rows)[0]).toMatchObject({ overdue: 0, by_office: [] });
    expect(scopeBottlenecks([network], null, [])[0]?.red_businesses).toBe(0);
  });
  it("the counters add up the offices in view; conversion only for one office", () => {
    const summary = { offices: 3, programs: 9, leads_this_month: 20, conversion_month: 15, ready_to_franchise: 2 };
    const office = (leads: number, conversion: number | null, ready: number) =>
      ({ stats: { leads_this_month: leads, conversion_month: conversion, ready_to_franchise: ready } }) as unknown as OfficeSummary;
    expect(scopeCounters(summary, [], false, 0)).toEqual({ offices: 3, programs: 9, leads_month: 20, conversion: 15, ready: 2 });
    expect(scopeCounters(summary, [office(4, 25, 1)], true, 2)).toEqual({ offices: 1, programs: 2, leads_month: 4, conversion: 25, ready: 1 });
    expect(scopeCounters(summary, [], true, 0)).toEqual({ offices: 0, programs: 0, leads_month: 0, conversion: null, ready: 0 });
  });
});

describe("structure tree", () => {
  // The data layer already computed health, franchisability and facts; the builder only arranges and words them.
  const node = (n: Pick<StructureNode, "id" | "kind" | "name"> & Partial<StructureNode>): StructureNode => ({ health: null, franchisability: null, detail: null, children: [], ...n });
  const tree: StructureTree = {
    root: node({
      id: "g", kind: "global", name: "SM Global",
      children: [node({
        id: "o1", kind: "office", name: "SM Miami", health: "red",
        detail: { kind: "office", status: "operating", programs: 1, ready_to_franchise: 0, operating_franchises: 1, city: "Miami, FL", manager_name: "Nicolás Rey", missing_areas: ["B1"] },
        children: [
          node({ id: "b1", kind: "business", name: "Vossler", health: "red", franchisability: { value: 24, expected: 28 }, detail: { kind: "business", status: "in_program", program_day: 60, consultant_name: null, owner_name: "Ana Vossler" } }),
          node({
            id: "b2", kind: "business", name: "Bimbo Remodelaciones", detail: { kind: "business", status: "franchisor", program_day: null, consultant_name: null, owner_name: null },
            children: [
              node({ id: "f1", kind: "franchise", name: "Bimbo Sur", detail: { kind: "franchise", status: "operating", city: "Doral, FL", franchisee_name: "Luisa Gómez" } }),
              node({ id: "i1", kind: "investor", name: "Jefferson Paula", detail: { kind: "investor", invested: 150000, share_pct: 50 } }),
            ],
          }),
          node({ id: "p1", kind: "firm", name: "Estudio Pérez", health: "red", detail: { kind: "firm", area: "B6", overdue_tasks: 2, specialty: "Derecho corporativo", contact_name: "Lucía Pérez" } }),
        ],
      })],
    }),
    counts: { offices: 1, businesses: 1, franchisors: 1, franchises: 1, firms: 1 },
  };
  const view = buildStructureView(tree, t);
  const find = (node: TreeNode, id: string): TreeNode | undefined => (node.id === id ? node : node.children.map((c) => find(c, id)).find(Boolean));

  it("groups businesses in the program, franchises and partner firms under each office", () => {
    const office = view.children[0]!;
    expect(office.children.map((c) => c.name)).toEqual(["global.structure.group_programs", "global.structure.group_franchises", "global.structure.group_firms"]);
    expect(find(office, "o1:programs")?.children.map((c) => c.name)).toEqual(["Vossler"]);
    expect(find(office, "o1:franchises")?.children.map((c) => c.name)).toEqual(["Bimbo Remodelaciones"]);
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
    const filtered = filterTree(view, "BIMBO REMODELACIONES")!;
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

  describe("diagram", () => {
    const diagram = buildDiagramTree(tree, t);
    const office = diagram.children[0]!;
    const firmsGroup = office.children.find((c) => c.id === "o1:firms")!;

    it("groups the businesses of an office under a label and keeps the franchises below their business", () => {
      expect(office.children.map((c) => [c.kind, c.name])).toEqual([
        ["group", "global.structure.group_programs"],
        ["group", "global.structure.group_franchisors"],
        ["group", "global.structure.group_firms"],
      ]);
      expect(office.children[0]!.children.map((c) => c.name)).toEqual(["Vossler"]);
      const bimbo = office.children[1]!.children[0]!;
      expect(bimbo.children.map((c) => c.name)).toEqual(["Bimbo Sur"]);
      expect(diagram.businesses).toBe(1);
    });

    it("hangs the investor beside its business, not in the reporting line", () => {
      const bimbo = office.children[1]!.children[0]!;
      expect(bimbo.investors.map((i) => [i.kind, i.name, i.detail])).toEqual([["investor", "Jefferson Paula", { kind: "investor", invested: 150000, share_pct: 50 }]]);
      expect(bimbo.children.some((c) => c.kind === "investor")).toBe(false);
    });

    it("lists one card per area: the firm where there is one, a placeholder where there is none", () => {
      expect(firmsGroup.stacked).toBe(true);
      expect(firmsGroup.children.map((c) => [c.kind, c.area])).toEqual([
        ["gap", "B1"], ["gap", "B2"], ["gap", "B3"], ["gap", "B4"], ["gap", "B5"], ["firm", "B6"],
      ]);
      expect(firmsGroup.children[5]!.name).toBe("Estudio Pérez");
    });

    it("leaves the group labels out of the search and out of the count of hidden boxes", () => {
      expect(diagramSearch(diagram, "global.structure").matches.size).toBe(0);
      expect(diagramSearch(diagram, "b1").matches.size).toBe(0);
      expect(descendantCount(office)).toBe(1 + 1 + 1 + 6);
    });
    it("takes up to two initials from a person's name", () => {
      expect(initialsOf("Ana María Vossler")).toBe("AV");
      expect(initialsOf("  luciano ")).toBe("L");
      expect(initialsOf("")).toBe("");
    });

    it("counts everything hidden below a node and lists the nodes that can collapse", () => {
      expect(descendantCount(diagram)).toBe(10);
      expect(descendantCount(office.children[1]!.children[0]!)).toBe(1);
      // The list of firms is always open, so it is not collapsible.
      expect(collapsibleIds(diagram)).toEqual(["g", "o1", "o1:programs", "o1:franchisors", "b2"]);
    });

    it("finds matches and the ancestors to open, and nothing for an empty search", () => {
      const { matches, ancestors } = diagramSearch(diagram, "BIMBO sur");
      expect([...matches]).toEqual(["f1"]);
      expect([...ancestors].sort()).toEqual(["b2", "g", "o1", "o1:franchisors"]);
      expect(diagramSearch(diagram, "  ").matches.size).toBe(0);
      expect(diagramSearch(diagram, "zzz").ancestors.size).toBe(0);
    });
  });
});
