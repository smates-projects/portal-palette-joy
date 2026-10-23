import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { Business, Organization, User } from "@/lib/api/types";
import { officeNameOf, placeOf } from "./shared";

const t = ((key: string) => key) as unknown as TFunction;
const office = { id: "office-miami", name: "SM Miami", kind: "sm" } as Organization;
const owner = { id: "u1", role: "business_owner", organization_id: null, business_id: "biz-other" } as User;
const business = { id: "biz-mine", name: "Vossler", office_id: "office-miami" } as Business;

describe("Personas: where an owner belongs", () => {
  it("uses the business of the list when it is there", () => {
    const own = { ...owner, business_id: "biz-mine" };
    expect(placeOf(own, [office], [business], t)).toBe("Vossler");
    expect(officeNameOf(own, [office], [business])).toBe("SM Miami");
  });

  it("without the business in the list, takes business_name and office_id from GET /users", () => {
    const outOfList = { ...owner, business_name: "Prime 10 Solutions", office_id: "office-miami" };
    expect(placeOf(outOfList, [office], [business], t)).toBe("Prime 10 Solutions");
    expect(officeNameOf(outOfList, [office], [business])).toBe("SM Miami");
  });

  it("with neither, stays empty", () => {
    expect(placeOf(owner, [office], [business], t)).toBe("");
    expect(officeNameOf(owner, [office], [business])).toBe("");
  });
});
