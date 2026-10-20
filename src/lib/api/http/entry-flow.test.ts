// Adapters of the revised entry outside leads and documents: the office signature, the new rules and the Bishop's
// "presented" line.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpNetworkRepository } from "./network";
import { createHttpRulesRepository } from "./rules";
import { createHttpBishopRepository } from "./bishop";
import { IDS, dataResponse, emptyResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FILE_ID = IDS.zone;
const UPLOAD_URL = "https://storage.test/quarantine/sig?X-Amz-Signature=sig";
const presigned = () => dataResponse({ file_id: FILE_ID, upload_url: UPLOAD_URL, headers: { "Content-Type": "image/png" }, expires_at: "2026-10-19T12:05:00.000Z" }, 201);

describe("http entry flow adapters", () => {
  it("setOfficeSignature: uploads the PNG (context contract_signature), then PATCH /offices/{id}/signature { file_id }", async () => {
    const office = { id: IDS.office, name: "SM Miami", kind: "sm", signature_file_id: FILE_ID };
    const { calls } = stubFetch(presigned(), emptyResponse(200), dataResponse({ id: FILE_ID, status: "pending" }, 202), dataResponse(office));
    const file = new File([new Uint8Array([137, 80, 78, 71])], "firma.png", { type: "image/png" });
    expect(await createHttpNetworkRepository(testClient()).setOfficeSignature(IDS.office, file)).toEqual(office);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}`,
      `POST /files/${FILE_ID}/complete`,
      `PATCH /offices/${IDS.office}/signature`,
    ]);
    expect(calls[0]?.body).toMatchObject({ context: "contract_signature", original_name: "firma.png" });
    expect(calls[3]?.body).toEqual({ file_id: FILE_ID });
  });

  it("setOfficeSignature: a name without the file is invalid_file, without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(createHttpNetworkRepository(testClient()).setOfficeSignature(IDS.office, { name: "firma.png" })).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });

  it("rules: the four entry rules pass through GET and PATCH (with If-Match)", async () => {
    const base = {
      franchisability_goal: 85, required_task_codes: [], area_amber_days: 7, franchisability_amber_tolerance: 10, document_review_days: 15, intake_documents: [],
    };
    const flow = { opportunity_visibility: "presented", oa_waiting_days: 7, require_expansion_meeting: true, nda_auto_signed_by_sm: true };
    const { calls } = stubFetch(dataResponse(base, 200, { ETag: '"1"' }), dataResponse({ ...base, ...flow, oa_waiting_days: 10 }, 200, { ETag: '"2"' }));
    const rules = createHttpRulesRepository(testClient());
    // Absent from the API: absent here too (the defaults of lib/leads/entry-flow apply).
    expect(await rules.get()).toEqual(base);
    expect(await rules.update({ oa_waiting_days: 10 })).toEqual({ ...base, ...flow, oa_waiting_days: 10 });
    expect(calls[1]).toMatchObject({ method: "PATCH", path: "/rules", body: { oa_waiting_days: 10, note: null } });
    expect(calls[1]?.headers["If-Match"]).toBe('"1"');
  });

  it("bishop: presented_at reaches the opportunity when the API sends it", async () => {
    const opportunity = {
      id: IDS.request, lead_id: IDS.request, phase: "available", industry: "construction", city: "Miami", state: "FL", business_name: null, owner_name: null,
      investment: 150000, share_year1_pct: 50, share_stable_pct: 22, score: 81, band: "high", review: null, decision: "none", decided_at: null,
      presented_at: "2026-10-14T12:00:00Z", owner_email: "nunca@ejemplo.com",
    };
    stubFetch(dataResponse([opportunity]));
    const [o] = await createHttpBishopRepository(testClient()).listOpportunities();
    expect(o?.presented_at).toBe("2026-10-14T12:00:00Z");
    expect(JSON.stringify(o)).not.toContain("nunca@ejemplo.com");
  });
});
