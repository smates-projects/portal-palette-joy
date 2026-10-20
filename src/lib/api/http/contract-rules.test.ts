// HTTP adapters of the configurable entry contracts: the rules, the validation of a lead, who signs for SM Square and
// the names of the Strategic Mates companies in the platform rules.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ENTRY_CONTRACT_RULES } from "@/lib/leads/contract-rules";
import { createHttpContractRulesRepository } from "./contract-rules";
import { createHttpLeadsRepository } from "./leads";
import { createHttpRulesRepository } from "./rules";
import { createHttpUsersRepository } from "./users";
import { IDS, dataResponse, leadFixture, problemResponse, stubFetch, testClient, userFixture } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const binding = DEFAULT_ENTRY_CONTRACT_RULES.find((r) => r.code === "binding")!;
const { code: _code, active: _active, version: _version, ...input } = binding;

describe("http entry contract rules", () => {
  it("list: GET /entry-contract-rules; an older answer without deadline_days or blocks reads as none", async () => {
    const { deadline_days: _d, blocks: _b, ...older } = binding;
    const { calls } = stubFetch(dataResponse([older]));
    expect(await createHttpContractRulesRepository(testClient()).list()).toEqual([{ ...binding, deadline_days: 0, blocks: [] }]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/entry-contract-rules" });
  });

  it("add: POST with the rule and an Idempotency-Key", async () => {
    const { calls } = stubFetch(dataResponse(binding, 201));
    expect(await createHttpContractRulesRepository(testClient()).add(input)).toEqual(binding);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/entry-contract-rules", body: input });
    expect(calls[0]!.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("update: PATCH /{code} with the version as If-Match and the note", async () => {
    const { calls } = stubFetch(dataResponse({ ...binding, delay_days: 2, version: 4 }));
    expect(await createHttpContractRulesRepository(testClient()).update("binding", { delay_days: 2 }, 3, "Dos días")).toMatchObject({ delay_days: 2, version: 4 });
    expect(calls[0]).toMatchObject({ method: "PATCH", path: "/entry-contract-rules/binding", body: { delay_days: 2, note: "Dos días" } });
    expect(calls[0]!.headers["If-Match"]).toBe('"3"');
  });

  it("update: a stale version answers precondition_failed", async () => {
    stubFetch(problemResponse(412, "version_mismatch"));
    await expect(createHttpContractRulesRepository(testClient()).update("binding", { delay_days: 2 }, 1)).rejects.toThrow("precondition_failed");
  });

  it("archive (with or without a reason), restore and the history", async () => {
    const { calls } = stubFetch(problemResponse(409, "rule_in_use"), dataResponse({ ...binding, active: false }), dataResponse(binding), dataResponse([]));
    const repo = createHttpContractRulesRepository(testClient());
    await expect(repo.archive("binding")).rejects.toThrow("rule_in_use");
    expect(await repo.archive("binding", " Ya no aplica ")).toMatchObject({ active: false });
    await repo.restore("binding");
    expect(await repo.listHistory()).toEqual([]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /entry-contract-rules/binding/archive",
      "POST /entry-contract-rules/binding/archive",
      "POST /entry-contract-rules/binding/restore",
      "GET /entry-contract-rules/history",
    ]);
    expect(calls[0]!.body).toBeUndefined();
    expect(calls[1]!.body).toEqual({ reason: "Ya no aplica" });
  });
});

describe("http validation of a lead", () => {
  const LEAD = IDS.request;
  const validation = { status: "open", equity_owner: 60, equity_bishop: 30, equity_sm: 10, investment_amount: 150000, notes: null, sm_square_center: "SM Square Miami", sm_square_holder_user_id: IDS.andrea, closed_at: null, closed_by: null };
  const input = { equity_owner: 60, equity_bishop: 30, equity_sm: 10, investment_amount: 150000, notes: "  ", sm_square_center: " SM Square Miami ", sm_square_holder_user_id: IDS.andrea };

  it("saveValidation: PUT /leads/{id}/validation, trimmed texts; the lead back with its ETag", async () => {
    const lead = leadFixture({ stage: "accepted", validation });
    const { calls } = stubFetch(dataResponse(lead, 200, { ETag: '"8"' }));
    const client = testClient();
    expect(await createHttpLeadsRepository(client).saveValidation(LEAD, input)).toEqual(lead);
    expect(calls[0]).toMatchObject({
      method: "PUT", path: `/leads/${LEAD}/validation`,
      body: { equity_owner: 60, equity_bishop: 30, equity_sm: 10, investment_amount: 150000, notes: null, sm_square_center: "SM Square Miami", sm_square_holder_user_id: IDS.andrea },
    });
    expect(client.etags.get(`/leads/${LEAD}`)).toBe('"8"');
  });

  it("saveValidation: the API's invalid_split", async () => {
    stubFetch(problemResponse(422, "invalid_split"));
    await expect(createHttpLeadsRepository(testClient()).saveValidation(LEAD, { ...input, equity_owner: 80 })).rejects.toThrow("invalid_split");
  });

  it("closeValidation: POST /leads/{id}/validation/close; admin_only for a consultant", async () => {
    const lead = leadFixture({ stage: "accepted", validation: { ...validation, status: "closed" } });
    const { calls } = stubFetch(dataResponse(lead), problemResponse(403, "admin_only"));
    const leads = createHttpLeadsRepository(testClient());
    expect((await leads.closeValidation(LEAD)).validation).toMatchObject({ status: "closed" });
    await expect(leads.closeValidation(LEAD)).rejects.toThrow("admin_only");
    expect(calls[0]).toMatchObject({ method: "POST", path: `/leads/${LEAD}/validation/close` });
  });
});

describe("http signing entities and SM companies", () => {
  it("setSigningEntities: PATCH /users/{id}/signing-entities", async () => {
    const user = userFixture({ can_sign_sm_square: true, advisor_slug: "andrea" });
    const { calls } = stubFetch(dataResponse(user));
    expect(await createHttpUsersRepository(testClient()).setSigningEntities(IDS.andrea, { can_sign_sm_square: true })).toEqual(user);
    expect(calls[0]).toMatchObject({ method: "PATCH", path: `/users/${IDS.andrea}/signing-entities`, body: { can_sign_sm_square: true } });
  });

  it("rules: sm_entities pass through when the API sends them", async () => {
    const sm_entities = { corporate: { name: "Strategic Mates LLC" }, sm_square: { name: "SM Square" } };
    stubFetch(dataResponse({ franchisability_goal: 85, required_task_codes: [], area_amber_days: 7, franchisability_amber_tolerance: 10, document_review_days: 15, intake_documents: [], sm_entities }));
    expect((await createHttpRulesRepository(testClient()).get()).sm_entities).toEqual(sm_entities);
  });
});
