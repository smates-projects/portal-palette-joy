import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpRulesRepository } from "./rules";
import { IDS, dataResponse, problemResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => {
  const client = testClient();
  return { client, rules: createHttpRulesRepository(client) };
};

/** PlatformRulesSchema as SM sees it, with the API's own flag. */
const apiRules = (overrides: Record<string, unknown> = {}) => ({
  franchisability_goal: 80,
  required_task_codes: ["B1-01"],
  area_amber_days: 5,
  franchisability_amber_tolerance: 10,
  document_review_days: 5,
  intake_documents: [
    {
      id: IDS.member,
      name: "Estados de cuenta bancarios",
      required: true,
      only_if_llc: false,
      verified_hint: "Ventas del último año",
      archived: false,
    },
  ],
  program_amount: 150000,
  assessment_area_map: { finances: ["B3"] },
  program_start_requires_full_funds: true,
  ...overrides,
});

const { program_start_requires_full_funds: _flag, ...frontRules } = apiRules();

describe("http rules", () => {
  it("get: GET /rules, the ETag kept, without the API's program_start_requires_full_funds", async () => {
    const { calls } = stubFetch(dataResponse(apiRules(), 200, { ETag: '"3"' }));
    const { rules, client } = setup();
    const result = await rules.get();
    expect(result).toEqual(frontRules);
    expect(result).not.toHaveProperty("program_start_requires_full_funds");
    expect(calls[0]).toMatchObject({ method: "GET", path: "/rules" });
    expect(client.etags.get("/rules")).toBe('"3"');
  });

  it("get: without money access program_amount stays absent", async () => {
    const { program_amount: _amount, ...withoutMoney } = apiRules();
    stubFetch(dataResponse(withoutMoney));
    const result = await setup().rules.get();
    expect(result).not.toHaveProperty("program_amount");
    expect(result.program_amount).toBeUndefined();
  });

  it("get: the eligibility rule, the documents note and the help of each document come through", async () => {
    const help = { what: "Muestra que tu empresa existe.", counts: ["Certificado de Sunbiz"], tip: "Sirve una foto." };
    const withHelp = apiRules({
      eligibility: { min_annual_revenue: 300_000 },
      intake_help_text: "No hace falta un documento armado.",
      intake_documents: [{ ...apiRules().intake_documents[0], help }],
    });
    stubFetch(dataResponse(withHelp));
    const result = await setup().rules.get();
    expect(result).toMatchObject({ eligibility: { min_annual_revenue: 300_000 }, intake_help_text: "No hace falta un documento armado." });
    expect(result.intake_documents[0]?.help).toEqual(help);
  });

  it("get: without the eligibility rule the field stays absent (the default applies)", async () => {
    stubFetch(dataResponse(apiRules()));
    expect(await setup().rules.get()).not.toHaveProperty("eligibility");
  });

  it("update: PATCH /rules carries eligibility.min_annual_revenue", async () => {
    const { calls } = stubFetch(
      dataResponse(apiRules(), 200, { ETag: '"3"' }),
      dataResponse(apiRules({ eligibility: { min_annual_revenue: 300_000 } }), 200, { ETag: '"4"' }),
    );
    const result = await setup().rules.update({ eligibility: { min_annual_revenue: 300_000 } }, null);
    expect(result.eligibility).toEqual({ min_annual_revenue: 300_000 });
    expect(calls[1]).toMatchObject({ method: "PATCH", path: "/rules", body: { eligibility: { min_annual_revenue: 300_000 }, note: null } });
  });

  it("bilingual contracts: contracts.governing_language comes through and PATCH /rules carries it; absent stays absent", async () => {
    const { calls } = stubFetch(
      dataResponse(apiRules({ contracts: { governing_language: "en" } }), 200, { ETag: '"3"' }),
      dataResponse(apiRules({ contracts: { governing_language: "es" } }), 200, { ETag: '"4"' }),
      dataResponse(apiRules()),
    );
    const { rules } = setup();
    expect((await rules.get()).contracts).toEqual({ governing_language: "en" });
    expect((await rules.update({ contracts: { governing_language: "es" } }, null)).contracts).toEqual({ governing_language: "es" });
    expect(calls[1]).toMatchObject({ method: "PATCH", path: "/rules", body: { contracts: { governing_language: "es" }, note: null } });
    expect(await rules.get()).not.toHaveProperty("contracts");
  });

  it("update: reads the rules for the ETag, then PATCH /rules with If-Match, the changes and the note", async () => {
    const { calls } = stubFetch(
      dataResponse(apiRules(), 200, { ETag: '"3"' }),
      dataResponse(apiRules({ franchisability_goal: 85 }), 200, { ETag: '"4"' }),
    );
    const { rules, client } = setup();
    expect(await rules.update({ franchisability_goal: 85 }, "Meta 2027")).toMatchObject({
      franchisability_goal: 85,
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /rules", "PATCH /rules"]);
    expect(calls[1]?.headers["If-Match"]).toBe('"3"');
    expect(calls[1]?.body).toEqual({ franchisability_goal: 85, note: "Meta 2027" });
    expect(client.etags.get("/rules")).toBe('"4"');
  });

  it("update: a known ETag goes straight to PATCH; no note is null; a stale one is precondition_failed", async () => {
    const { calls } = stubFetch(problemResponse(412, "precondition_failed"));
    const { rules, client } = setup();
    client.etags.set("/rules", '"2"');
    await expect(rules.update({ area_amber_days: 7 })).rejects.toThrow("precondition_failed");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers["If-Match"]).toBe('"2"');
    expect(calls[0]?.body).toEqual({ area_amber_days: 7, note: null });
  });

  it("listHistory: GET /rules/history", async () => {
    const change = {
      id: IDS.event,
      actor_user_id: IDS.marilyn,
      created_at: "2026-10-18T12:00:00.000Z",
      changes: [{ field: "franchisability_goal", from: 80, to: 85 }],
      note: "Meta 2027",
    };
    const { calls } = stubFetch(dataResponse([change]));
    expect(await setup().rules.listHistory()).toEqual([change]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/rules/history" });
  });
});
