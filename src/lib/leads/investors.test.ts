import { describe, expect, it } from "vitest";
import { investorRows, presentChoices } from "./investors";

describe("investor rows", () => {
  it("a Bishop presented but who never opened it (viewed_at null) renders without breaking", () => {
    const rows = investorRows({
      views: [
        {
          bishop_user_id: "j",
          name: "Jefferson Paula",
          viewed_at: null as unknown as string,
          decision: "none",
          decided_at: null,
        },
      ],
      bishop: null,
      presented: [
        { bishop_user_id: "j", name: "Jefferson Paula", presented_at: "2026-10-20T06:41:35Z" },
      ],
    });
    expect(rows).toEqual([
      {
        id: "j",
        name: "Jefferson Paula",
        presented_at: "2026-10-20T06:41:35Z",
        viewed_at: null,
        passed_at: null,
        accepted_at: null,
      },
    ]);
  });

  it("joins presented, viewed, passed and accepted per Bishop", () => {
    const rows = investorRows({
      views: [
        {
          bishop_user_id: "j",
          name: "Jefferson Paula",
          viewed_at: "2026-10-20T06:41:48Z",
          decision: "none",
          decided_at: null,
        },
        {
          bishop_user_id: "l",
          name: "Laura Ortega",
          viewed_at: "2026-10-19T10:00:00Z",
          decision: "passed",
          decided_at: "2026-10-19T11:00:00Z",
        },
      ],
      bishop: { user_id: "j", name: "Jefferson Paula", accepted_at: "2026-10-20T06:41:54Z" },
      presented: [
        { bishop_user_id: "j", name: "Jefferson Paula", presented_at: "2026-10-20T06:41:35Z" },
      ],
    });
    expect(
      rows.map((r) => [r.id, !!r.presented_at, !!r.viewed_at, !!r.passed_at, !!r.accepted_at]),
    ).toEqual([
      ["j", true, true, false, true],
      ["l", false, true, true, false],
    ]);
  });
});

describe("present choices", () => {
  it("one checkbox per candidate id; presented ones fixed; without the framework agreement not selectable", () => {
    const choices = presentChoices({
      candidates: [
        { user_id: "d", name: "Diego Rivas", framework_signed: false },
        { user_id: "j", name: "Jefferson Paula", framework_signed: true },
        { user_id: "l", name: "Laura Ortega", framework_signed: true },
        { user_id: "l", name: "Laura Ortega", framework_signed: true },
      ],
      presented: [
        { bishop_user_id: "j", name: "Jefferson Paula", presented_at: "2026-10-20T06:41:35Z" },
      ],
    });
    expect(choices).toEqual([
      { user_id: "d", name: "Diego Rivas", state: "no_framework" },
      { user_id: "j", name: "Jefferson Paula", state: "already" },
      { user_id: "l", name: "Laura Ortega", state: "available" },
    ]);
  });

  it("a candidate without an id is never a checkbox (it would tick every row and send [null])", () => {
    expect(
      presentChoices({ candidates: [{ user_id: undefined as unknown as string, name: "Sin id" }] }),
    ).toEqual([]);
  });
});
