import { describe, expect, it } from "vitest";
import { loginSearchFor } from "./redirect";

describe("loginSearchFor", () => {
  it("keeps where the person was as ?next=", () => {
    expect(loginSearchFor("/embudo/123?tab=docs")).toEqual({ next: "/embudo/123?tab=docs" });
  });

  it("needs no ?next= from the home or from a sign-in screen", () => {
    expect(loginSearchFor("/")).toEqual({});
    expect(loginSearchFor("/login?next=/tareas")).toEqual({});
    expect(loginSearchFor("/restablecer")).toEqual({});
  });
});
