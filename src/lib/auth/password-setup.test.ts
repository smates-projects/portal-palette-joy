import { describe, expect, it } from "vitest";
import type { User } from "@/lib/api/types";
import {
  PASSWORD_SETUP_LATER_KEY,
  clearPasswordSetupDismissal,
  dismissPasswordSetup,
  passwordSetupDismissed,
  shouldShowPasswordSetup,
} from "./password-setup";

const owner = (overrides: Partial<User> = {}): User => ({
  id: "u-1",
  full_name: "Enyermy Rivas",
  email: "enyermy@enyermycleanpro.com",
  role: "business_owner",
  organization_id: null,
  business_id: "b-1",
  title: null,
  google_calendar_email: null,
  booking_url: null,
  has_password: false,
  password_setup_required: true,
  ...overrides,
});

/** An in-memory sessionStorage, so the rules are tested without the browser. */
const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

describe("password setup: when the dialog shows", () => {
  it("shows for an account that must create its password and did not say Más tarde", () => {
    expect(shouldShowPasswordSetup(owner(), memoryStore())).toBe(true);
  });

  it("never shows without the flag, with a password already, or without a person", () => {
    const store = memoryStore();
    expect(shouldShowPasswordSetup(owner({ password_setup_required: false }), store)).toBe(false);
    expect(shouldShowPasswordSetup(owner({ password_setup_required: undefined }), store)).toBe(
      false,
    );
    expect(shouldShowPasswordSetup(owner({ has_password: true }), store)).toBe(false);
    expect(shouldShowPasswordSetup(null, store)).toBe(false);
    expect(shouldShowPasswordSetup(undefined, store)).toBe(false);
  });

  it("Más tarde hides it for the session and the dismissal can be forgotten", () => {
    const store = memoryStore();
    dismissPasswordSetup(store);
    expect(store.getItem(PASSWORD_SETUP_LATER_KEY)).toBe("1");
    expect(passwordSetupDismissed(store)).toBe(true);
    expect(shouldShowPasswordSetup(owner(), store)).toBe(false);
    clearPasswordSetupDismissal(store);
    expect(passwordSetupDismissed(store)).toBe(false);
    expect(shouldShowPasswordSetup(owner(), store)).toBe(true);
  });

  it("a fresh session (empty storage, the next entry) shows it again", () => {
    const first = memoryStore();
    dismissPasswordSetup(first);
    expect(shouldShowPasswordSetup(owner(), memoryStore())).toBe(true);
  });

  it("without storage (blocked, SSR) it reads as not dismissed and never throws", () => {
    expect(shouldShowPasswordSetup(owner(), null)).toBe(true);
    expect(() => dismissPasswordSetup(null)).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(shouldShowPasswordSetup(owner(), broken)).toBe(true);
    expect(() => dismissPasswordSetup(broken)).not.toThrow();
    expect(() => clearPasswordSetupDismissal(broken)).not.toThrow();
  });

  it("uses the tab's sessionStorage by default", () => {
    window.sessionStorage.removeItem(PASSWORD_SETUP_LATER_KEY);
    expect(shouldShowPasswordSetup(owner())).toBe(true);
    dismissPasswordSetup();
    expect(window.sessionStorage.getItem(PASSWORD_SETUP_LATER_KEY)).toBe("1");
    expect(shouldShowPasswordSetup(owner())).toBe(false);
    clearPasswordSetupDismissal();
    expect(shouldShowPasswordSetup(owner())).toBe(true);
  });
});
