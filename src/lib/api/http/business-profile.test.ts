import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import { createHttpBusinessProfileRepository } from "./business-profile";
import {
  IDS,
  dataResponse,
  meFixture,
  problemResponse,
  stubFetch,
  testClient,
  userFixture,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CARLA = userFixture({
  id: IDS.carla,
  role: "business_owner",
  organization_id: null,
  business_id: IDS.business,
  is_admin: false,
});

/** Signed in as the owner, as after a login (no GET /me needed). */
const asOwner = () => {
  const client = testClient();
  client.setSession(CARLA as User);
  return createHttpBusinessProfileRepository(client);
};

const profile = {
  business_id: IDS.business,
  legal_name: "Vossler Construction LLC",
  industry: "construction",
  address: "100 Main St",
  city: "Orlando",
  state: "FL",
  phone: "+1 407 555 0100",
  email: "info@vossler.com",
  website: null,
  years_operating: 8,
  employees: 14,
};

const changeRequest = {
  id: IDS.request,
  business_id: IDS.business,
  field: "address",
  current_value: "100 Main St",
  new_value: "200 Oak Ave",
  reason: "Nos mudamos",
  status: "pending",
  requested_by_user_id: IDS.carla,
  created_at: "2026-10-10T12:00:00.000Z",
  resolved_by_user_id: null,
  resolved_at: null,
  resolution_note: null,
};

const member = {
  id: IDS.member,
  owner_id: IDS.carla,
  name: "Ana Ruiz",
  role: "Administración",
  email: "ana@vossler.com",
  state: "invited",
  user_id: null,
};

describe("http business profile", () => {
  it("get: the owner's own business from the session; GET /businesses/{id}/profile", async () => {
    const { calls } = stubFetch(dataResponse(profile));
    expect(await asOwner().get()).toEqual(profile);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/profile` });
  });

  it("get: asks GET /me when no session was read yet; null without a business or on 404", async () => {
    const { calls } = stubFetch(dataResponse(meFixture()), problemResponse(404, "not_found"));
    const repo = createHttpBusinessProfileRepository(testClient());
    expect(await repo.get()).toBeNull();
    expect(await repo.get(IDS.business)).toBeNull();
    expect(calls.map((c) => c.path)).toEqual(["/me", `/businesses/${IDS.business}/profile`]);
  });

  it("update: PATCH the own profile; locked_field comes through", async () => {
    const { calls } = stubFetch(
      dataResponse({ ...profile, phone: "+1 407 555 0199" }),
      problemResponse(422, "locked_field"),
    );
    const repo = asOwner();
    expect((await repo.update({ phone: "+1 407 555 0199" })).phone).toBe("+1 407 555 0199");
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: `/businesses/${IDS.business}/profile`,
      body: { phone: "+1 407 555 0199" },
    });
    await expect(repo.update({ legal_name: "Otro" })).rejects.toThrow("locked_field");
  });

  it("update without an own business is forbidden, without calling", async () => {
    const client = testClient();
    client.setSession(userFixture() as User);
    const { calls } = stubFetch();
    await expect(
      createHttpBusinessProfileRepository(client).update({ phone: "1" }),
    ).rejects.toThrow("forbidden");
    expect(calls).toHaveLength(0);
  });

  it("requestChange: POST /businesses/{own}/profile/change-requests", async () => {
    const { calls } = stubFetch(dataResponse(changeRequest, 201));
    const input = { field: "address" as const, new_value: "200 Oak Ave", reason: "Nos mudamos" };
    expect(await asOwner().requestChange(input)).toEqual(changeRequest);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/businesses/${IDS.business}/profile/change-requests`,
      body: input,
    });
  });

  it("listChangeRequests: given business or own", async () => {
    const { calls } = stubFetch(dataResponse([changeRequest]), dataResponse([]));
    const repo = asOwner();
    expect(await repo.listChangeRequests()).toEqual([changeRequest]);
    await repo.listChangeRequests(IDS.newFirm);
    expect(calls.map((c) => c.path)).toEqual([
      `/businesses/${IDS.business}/profile/change-requests`,
      `/businesses/${IDS.newFirm}/profile/change-requests`,
    ]);
  });

  it("resolveChangeRequest: POST /profile-change-requests/{id}/resolve with status and note", async () => {
    const applied = { ...changeRequest, status: "applied", resolution_note: "Listo" };
    const { calls } = stubFetch(dataResponse(applied));
    expect(await asOwner().resolveChangeRequest(IDS.request, "applied", "Listo")).toEqual(applied);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/profile-change-requests/${IDS.request}/resolve`,
      body: { status: "applied", note: "Listo" },
    });
  });

  it("listTeam: GET /businesses/{id}/team", async () => {
    const { calls } = stubFetch(dataResponse([member]));
    expect(await asOwner().listTeam()).toEqual([member]);
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/team` });
  });

  it("inviteMember: POST /businesses/{own}/team/invite", async () => {
    const { calls } = stubFetch(dataResponse(member, 201));
    const input = { name: "Ana Ruiz", role: "Administración", email: "ana@vossler.com" };
    expect(await asOwner().inviteMember(input)).toEqual(member);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/businesses/${IDS.business}/team/invite`,
      body: input,
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("makeOwner: POST /team-members/{id}/make-owner", async () => {
    const { calls } = stubFetch(dataResponse({ ...member, state: "active", user_id: IDS.lucia }));
    expect((await asOwner().makeOwner(IDS.member)).state).toBe("active");
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/team-members/${IDS.member}/make-owner`,
    });
  });
});
