import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateFirmInput } from "../types";
import { createHttpOrganizationsRepository } from "./organizations";
import {
  IDS,
  dataResponse,
  organizationFixture,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const setup = () => createHttpOrganizationsRepository(testClient());

const FIRM_INPUT: CreateFirmInput = {
  office_id: IDS.office,
  name: "Delta Contadores",
  area: "B3",
  internal: false,
  specialty: "Finanzas y fiscal",
  contact_name: "Pedro Delta",
  email: "pedro@delta.com",
  phone: null,
  city: "Miami",
  first_person: { full_name: "Pedro Delta", email: "pedro@delta.com", title: null },
};

const firmEvent = {
  id: IDS.event,
  organization_id: IDS.firm,
  kind: "replaced",
  actor_user_id: IDS.andrea,
  created_at: "2026-10-01T12:00:00.000Z",
  other_organization_id: IDS.newFirm,
  body: "transfer",
  moved_tasks: 0,
};

describe("http organizations", () => {
  it("list: GET /organizations", async () => {
    const { calls } = stubFetch(dataResponse([organizationFixture()]));
    expect(await setup().list()).toEqual([organizationFixture()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/organizations" });
  });

  it("get: GET /organizations/{id}, null on 404", async () => {
    const { calls } = stubFetch(
      dataResponse(organizationFixture()),
      problemResponse(404, "not_found"),
    );
    const repo = setup();
    expect((await repo.get(IDS.firm))?.name).toBe("Estudio Pérez");
    expect(await repo.get(IDS.newFirm)).toBeNull();
    expect(calls.map((c) => c.path)).toEqual([
      `/organizations/${IDS.firm}`,
      `/organizations/${IDS.newFirm}`,
    ]);
  });

  it("createFirm: POST /firms with the firm and its first person (idempotent)", async () => {
    const created = organizationFixture({ id: IDS.newFirm, name: "Delta Contadores", area: "B3" });
    const { calls } = stubFetch(dataResponse(created, 201));
    expect(await setup().createFirm(FIRM_INPUT)).toEqual(created);
    expect(calls[0]).toMatchObject({ method: "POST", path: "/firms", body: FIRM_INPUT });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("createFirm leaves office_id out when not given (an office admin always gets its own)", async () => {
    const { calls } = stubFetch(dataResponse(organizationFixture(), 201));
    const { office_id: _office, ...withoutOffice } = FIRM_INPUT;
    await setup().createFirm(withoutOffice);
    expect(calls[0]?.body).toEqual(withoutOffice);
  });

  it("updateFirm: PATCH /firms/{id} with the patch", async () => {
    const { calls } = stubFetch(dataResponse(organizationFixture({ phone: "+1 305 555 0199" })));
    expect((await setup().updateFirm(IDS.firm, { phone: "+1 305 555 0199" })).phone).toBe(
      "+1 305 555 0199",
    );
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: `/firms/${IDS.firm}`,
      body: { phone: "+1 305 555 0199" },
    });
  });

  it("replaceFirm: POST /firms/{id}/replace with the new firm plus open_tasks, answers the new firm", async () => {
    const created = organizationFixture({ id: IDS.newFirm, name: "Delta Contadores" });
    const { calls } = stubFetch(dataResponse(created, 201));
    expect((await setup().replaceFirm(IDS.firm, FIRM_INPUT, "transfer")).id).toBe(IDS.newFirm);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/firms/${IDS.firm}/replace`,
      body: { ...FIRM_INPUT, open_tasks: "transfer" },
    });
  });

  it("deactivateFirm: POST /firms/{id}/deactivate with the reason", async () => {
    const { calls } = stubFetch(
      dataResponse(organizationFixture({ firm_status: "inactive", deactivation_reason: "Cerró" })),
    );
    expect((await setup().deactivateFirm(IDS.firm, "Cerró")).firm_status).toBe("inactive");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/firms/${IDS.firm}/deactivate`,
      body: { reason: "Cerró" },
    });
  });

  it("listFirmEvents: one firm or every firm in scope", async () => {
    const { calls } = stubFetch(dataResponse([firmEvent]), dataResponse([]));
    const repo = setup();
    expect(await repo.listFirmEvents(IDS.firm)).toEqual([firmEvent]);
    expect(await repo.listFirmEvents()).toEqual([]);
    expect(calls.map((c) => c.path)).toEqual([`/firms/${IDS.firm}/events`, "/firm-events"]);
  });
});
