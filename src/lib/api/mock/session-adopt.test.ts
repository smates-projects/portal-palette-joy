import { describe, expect, it } from "vitest";
import { createMockApi } from "./index";

describe("mock session adoptUserByEmail / resetUser", () => {
  it("switches the mock to the user with that email, ignoring case", async () => {
    const api = createMockApi();
    expect(api.session.adoptUserByEmail(" Marilyn@StrategicMates.com ")).toBe(true);
    expect((await api.session.getCurrentUser()).role).toBe("sm_global");
    await expect(api.network.getSummary()).resolves.toBeDefined();
  });

  it("returns false and keeps the current user when the email is unknown", async () => {
    const api = createMockApi();
    const before = await api.session.getCurrentUser();
    expect(api.session.adoptUserByEmail("nobody@nowhere.test")).toBe(false);
    expect((await api.session.getCurrentUser()).id).toBe(before.id);
  });

  it("resetUser goes back to the default demo user", async () => {
    const api = createMockApi();
    const initial = await api.session.getCurrentUser();
    api.session.adoptUserByEmail("marilyn@strategicmates.com");
    api.session.resetUser();
    expect((await api.session.getCurrentUser()).id).toBe(initial.id);
  });
});