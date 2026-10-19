import { describe, expect, it, vi } from "vitest";
import type { SessionRepository } from "../repositories";
import type { User } from "../types";
import { withMockUserSync } from "./mixed-mode";

const marilyn = { id: "api-1", email: "marilyn@strategicmates.com" } as User;

const setup = () => {
  const session = {
    getCurrentUser: vi.fn(async () => marilyn),
    login: vi.fn(async () => marilyn),
    acceptInvitation: vi.fn(async () => marilyn),
    exchangeMagicLink: vi.fn(async () => marilyn),
    setViewAs: vi.fn(async () => marilyn),
    logout: vi.fn(async () => undefined),
    logoutAll: vi.fn(async () => undefined),
    isAuthenticated: vi.fn(() => true),
  } as unknown as SessionRepository;
  const mock = { adopt: vi.fn(() => true), reset: vi.fn() };
  return { session, mock, wrapped: withMockUserSync(session, mock) };
};

describe("withMockUserSync", () => {
  it("adopts the signed-in email after every call that returns a user", async () => {
    const { wrapped, mock } = setup();
    const credentials = { email: "x", password: "y" };
    const accept = { token: "t", name: "n", password: "p", accepted_terms: true as const };

    expect(await wrapped.getCurrentUser()).toBe(marilyn);
    await wrapped.login(credentials);
    await wrapped.acceptInvitation(accept);
    await wrapped.exchangeMagicLink("t");
    await wrapped.setViewAs("api-2");

    expect(mock.adopt).toHaveBeenCalledTimes(5);
    expect(mock.adopt).toHaveBeenCalledWith("marilyn@strategicmates.com");
  });

  it("resets the mock after logout and logoutAll", async () => {
    const { wrapped, mock } = setup();
    await wrapped.logout();
    await wrapped.logoutAll();
    expect(mock.reset).toHaveBeenCalledTimes(2);
  });

  it("does not touch the mock when the HTTP call fails", async () => {
    const { wrapped, session, mock } = setup();
    vi.mocked(session.login).mockRejectedValueOnce(new Error("invalid_credentials"));
    vi.mocked(session.logout).mockRejectedValueOnce(new Error("boom"));
    await expect(wrapped.login({ email: "x", password: "y" })).rejects.toThrow("invalid_credentials");
    await expect(wrapped.logout()).rejects.toThrow("boom");
    expect(mock.adopt).not.toHaveBeenCalled();
    expect(mock.reset).not.toHaveBeenCalled();
  });

  it("ignores silently an email the mock does not know", async () => {
    const { wrapped, mock } = setup();
    mock.adopt.mockReturnValue(false);
    await expect(wrapped.getCurrentUser()).resolves.toBe(marilyn);
  });

  it("keeps the rest of the repository untouched", () => {
    const { wrapped } = setup();
    expect(wrapped.isAuthenticated()).toBe(true);
  });
});