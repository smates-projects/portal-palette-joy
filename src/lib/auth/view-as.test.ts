import { describe, expect, it } from "vitest";
import { createHttpSessionRepository } from "../api/http/session";
import { createHttpClient } from "../api/http/client";
import { showViewAs } from "./view-as";

describe("Ver como in the top bar", () => {
  it("shows only with someone to pick: nothing for an empty or disabled list, or before it loads", () => {
    expect(showViewAs(undefined)).toBe(false);
    expect(showViewAs([])).toBe(false);
    expect(showViewAs([{ enabled: false }])).toBe(false);
    expect(showViewAs([{ enabled: false }, { enabled: true }])).toBe(true);
  });

  it("over the API a consultant or an owner gets no options, so the bar shows nothing", async () => {
    const me = { id: "u1", full_name: "Rosa Benítez", email: "rosa@example.com", role: "business_owner", organization_id: null, business_id: "b1", impersonating: null };
    const fetch = async () => new Response(JSON.stringify({ data: me }), { status: 200, headers: { "content-type": "application/json" } });
    const session = createHttpSessionRepository(createHttpClient({ baseUrl: "http://api.test/api/v1", fetch }));
    expect(showViewAs(await session.getViewAsOptions())).toBe(false);
  });
});
