import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpBrandRepository } from "./brand";
import { dataUrlToBlob } from "./files";
import {
  IDS,
  dataResponse,
  emptyResponse,
  problemResponse,
  stubFetch,
  testClient,
} from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const LOGO_ID = "f1111111-1111-4111-8111-111111111111";
const MANUAL_ID = "f2222222-2222-4222-8222-222222222222";
const UPLOAD_URL = "https://storage.test/quarantine/abc?X-Amz-Signature=sig";

/** 1x1 transparent PNG, as readImageAsDataUrl gives a picked logo. */
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** BusinessBrandSchema: loaded by SM. */
const brandFixture = (overrides: Record<string, unknown> = {}) => ({
  business_id: IDS.business,
  primary_color: "#153f58",
  accent_color: "#a77e00",
  font_family: "Inter",
  logo_file_name: "logo.png",
  logo_url: "https://cdn.test/public/logos/abc.png",
  source: "manual_sm",
  version: null,
  applied_at: "2026-10-19T12:00:00.000Z",
  applied_by_user_id: IDS.andrea,
  manual_file_name: null,
  ...overrides,
});

const palette = {
  primary_color: "#153f58",
  accent_color: "#a77e00",
  font_family: "Inter",
  logo_file_name: "logo.png",
  logo_url: PNG_DATA_URL,
};

const uploadReplies = (fileId: string) => [
  dataResponse(
    {
      file_id: fileId,
      upload_url: `${UPLOAD_URL}&id=${fileId}`,
      headers: {},
      expires_at: "2026-10-19T12:05:00.000Z",
    },
    201,
  ),
  emptyResponse(200),
  dataResponse({ id: fileId, status: "pending" }, 202),
  dataResponse({ id: fileId, status: "ready" }),
];

const brand = () => createHttpBrandRepository(testClient());

describe("http brand", () => {
  it("get: GET /businesses/{id}/brand; null is the Strategic Mates brand", async () => {
    const { calls } = stubFetch(dataResponse(brandFixture()), dataResponse(null));
    const repo = brand();
    expect(await repo.get(IDS.business)).toEqual(brandFixture());
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/brand` });
    expect(await repo.get(IDS.newFirm)).toBeNull();
  });

  it("get without a business: the person's own, GET /me/brand", async () => {
    const { calls } = stubFetch(dataResponse(brandFixture()));
    expect(await brand().get()).toEqual(brandFixture());
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me/brand" });
  });

  it("getMine: GET /me/brand", async () => {
    const { calls } = stubFetch(dataResponse(null));
    expect(await brand().getMine()).toBeNull();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/me/brand" });
  });

  it("set: uploads the logo data URL (context brand), then PUT the palette with its id", async () => {
    const { calls, fetchMock } = stubFetch(...uploadReplies(LOGO_ID), dataResponse(brandFixture()));
    expect(await brand().set(IDS.business, palette)).toEqual(brandFixture());
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}&id=${LOGO_ID}`,
      `POST /files/${LOGO_ID}/complete`,
      `GET /files/${LOGO_ID}`,
      `PUT /businesses/${IDS.business}/brand`,
    ]);
    const png = dataUrlToBlob(PNG_DATA_URL)!;
    expect(calls[0]?.body).toEqual({
      context: "brand",
      original_name: "logo.png",
      mime: "image/png",
      size_bytes: png.size,
      business_id: IDS.business,
    });
    expect((fetchMock.mock.calls[1]?.[1]?.body as Blob).type).toBe("image/png");
    expect(calls[4]?.body).toEqual({
      primary_color: "#153f58",
      accent_color: "#a77e00",
      font_family: "Inter",
      logo_file_id: LOGO_ID,
      manual_file_id: null,
    });
  });

  it("set with Files: the logo File (brand) and the manual PDF (other), in that order", async () => {
    const { calls, fetchMock } = stubFetch(
      ...uploadReplies(LOGO_ID),
      ...uploadReplies(MANUAL_ID),
      dataResponse(brandFixture()),
    );
    const logo = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    const manual = new File(["%PDF-1.7"], "manual.pdf", { type: "application/pdf" });
    await brand().set(IDS.business, {
      ...palette,
      logo_file_name: logo.name,
      logo_file: logo,
      manual_file: manual,
    });
    expect(calls.filter((c) => c.path === "/files/presign").map((c) => c.body)).toEqual([
      expect.objectContaining({
        context: "brand",
        original_name: "logo.svg",
        mime: "image/svg+xml",
      }),
      expect.objectContaining({
        context: "other",
        original_name: "manual.pdf",
        mime: "application/pdf",
      }),
    ]);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(logo);
    expect(fetchMock.mock.calls[5]?.[1]?.body).toBe(manual);
    expect(calls[8]?.body).toMatchObject({ logo_file_id: LOGO_ID, manual_file_id: MANUAL_ID });
  });

  it("set without a logo: no upload, logo_file_id null", async () => {
    const { calls } = stubFetch(
      dataResponse(brandFixture({ logo_file_name: null, logo_url: null })),
    );
    await brand().set(IDS.business, { ...palette, logo_file_name: null, logo_url: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toMatchObject({ logo_file_id: null, manual_file_id: null });
  });

  it("set: a logo and manual the API already stores are resent by their ids, without uploading", async () => {
    const { calls } = stubFetch(
      dataResponse(brandFixture({ logo_file_id: LOGO_ID, manual_file_id: MANUAL_ID })),
    );
    await brand().set(IDS.business, {
      ...palette,
      logo_url: "https://cdn.test/public/logos/abc.png",
      logo_file_id: LOGO_ID,
      manual_file_id: MANUAL_ID,
    });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `PUT /businesses/${IDS.business}/brand`,
    ]);
    expect(calls[0]?.body).toMatchObject({ logo_file_id: LOGO_ID, manual_file_id: MANUAL_ID });
  });

  it("set: a stored logo without its id leaves logo_file_id out (the API keeps the current one)", async () => {
    const { calls } = stubFetch(dataResponse(brandFixture()));
    await brand().set(IDS.business, {
      ...palette,
      logo_url: "https://cdn.test/public/logos/abc.png",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).not.toHaveProperty("logo_file_id");
  });

  it("set: a broken data URL is invalid_file, without calling", async () => {
    const { calls } = stubFetch();
    await expect(
      brand().set(IDS.business, { ...palette, logo_url: "data:image/png;base64" }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });

  it("set: the palette rules and the permission come back as the API's codes", async () => {
    stubFetch(
      problemResponse(422, "contrast_too_low"),
      problemResponse(422, "invalid_color"),
      problemResponse(403, "forbidden"),
    );
    const repo = brand();
    const plain = { ...palette, logo_url: null };
    await expect(repo.set(IDS.business, plain)).rejects.toThrow("contrast_too_low");
    await expect(repo.set(IDS.business, { ...plain, primary_color: "azul" })).rejects.toThrow(
      "invalid_color",
    );
    await expect(repo.set(IDS.business, plain)).rejects.toThrow("forbidden");
  });

  it("reset: DELETE /businesses/{id}/brand (204)", async () => {
    const { calls } = stubFetch(emptyResponse(204));
    await expect(brand().reset(IDS.business)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: "DELETE", path: `/businesses/${IDS.business}/brand` });
  });

  it("listEvents: GET /businesses/{id}/brand/events", async () => {
    const event = {
      id: IDS.event,
      business_id: IDS.business,
      kind: "reset",
      actor_user_id: IDS.carla,
      created_at: "2026-10-19T12:00:00.000Z",
      palette: null,
    };
    const { calls } = stubFetch(dataResponse([event]));
    expect(await brand().listEvents(IDS.business)).toEqual([event]);
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: `/businesses/${IDS.business}/brand/events`,
    });
  });
});
