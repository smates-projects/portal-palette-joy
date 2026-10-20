import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpFranchiseeRepository } from "./franchisee";
import { IDS, dataResponse, problemResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TASK = IDS.member;

const franchisee = () => createHttpFranchiseeRepository(testClient());

const ticketFixture = (overrides: Record<string, unknown> = {}) => ({
  id: IDS.request,
  franchise_id: IDS.business,
  subject: "Falta material",
  body: "No llegó el pedido de la semana.",
  state: "open",
  ...overrides,
});

const taskFixture = (overrides: Record<string, unknown> = {}) => ({
  id: TASK,
  franchise_id: IDS.business,
  title: "Leer el manual v2",
  done: false,
  ...overrides,
});

describe("http franchisee", () => {
  it("getHome: GET /franchisee/home", async () => {
    const home = { franchise: { id: IDS.business }, pending_reports: [] };
    const { calls } = stubFetch(dataResponse(home));
    expect(await franchisee().getHome()).toEqual(home);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/franchisee/home" });
  });

  it("getHome: someone who is not a franchisee gets the API's franchisee_only", async () => {
    stubFetch(problemResponse(403, "franchisee_only"));
    await expect(franchisee().getHome()).rejects.toThrow("franchisee_only");
  });

  it("listChecklist: GET /franchisee/checklist", async () => {
    const item = { id: IDS.event, franchise_id: IDS.business, label: "Uniformes", done: true };
    const { calls } = stubFetch(dataResponse([item]));
    expect(await franchisee().listChecklist()).toEqual([item]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/franchisee/checklist" });
  });

  it("listTickets: GET /franchisee/tickets", async () => {
    const { calls } = stubFetch(dataResponse([ticketFixture()]));
    expect(await franchisee().listTickets()).toEqual([ticketFixture()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/franchisee/tickets" });
  });

  it("createTicket: POST /franchisee/tickets { subject, body }", async () => {
    const { calls } = stubFetch(dataResponse(ticketFixture(), 201));
    const input = { subject: "Falta material", body: "No llegó el pedido de la semana." };
    expect(await franchisee().createTicket(input)).toEqual(ticketFixture());
    expect(calls[0]).toMatchObject({ method: "POST", path: "/franchisee/tickets", body: input });
  });

  it("listTasks: GET /franchisee/tasks", async () => {
    const { calls } = stubFetch(dataResponse([taskFixture()]));
    expect(await franchisee().listTasks()).toEqual([taskFixture()]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/franchisee/tasks" });
  });

  it("setTaskDone: PATCH /franchisee/tasks/{id} { done }", async () => {
    const { calls } = stubFetch(dataResponse(taskFixture({ done: true })));
    expect((await franchisee().setTaskDone(TASK, true)).done).toBe(true);
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      path: `/franchisee/tasks/${TASK}`,
      body: { done: true },
    });
  });

  it("listTeam: GET /franchisee/team", async () => {
    const member = { id: IDS.lucia, full_name: "Lucía Pérez", status: "active" };
    const { calls } = stubFetch(dataResponse([member]));
    expect(await franchisee().listTeam()).toEqual([member]);
    expect(calls[0]).toMatchObject({ method: "GET", path: "/franchisee/team" });
  });
});
