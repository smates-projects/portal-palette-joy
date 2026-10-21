import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import { createHttpDocumentsRepository } from "./documents";
import { dataUrlToBlob } from "./files";
import {
  IDS,
  contractFixture,
  dataResponse,
  documentFixture,
  emptyResponse,
  intakeSummaryFixture,
  jsonResponse,
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

const DOC = IDS.member;
const CONTRACT = IDS.newFirm;
const FILE_ID = IDS.zone;
const UPLOAD_URL = "https://storage.test/quarantine/abc?X-Amz-Signature=sig";
const UPLOAD_HEADERS = { "Content-Type": "application/pdf", "x-amz-meta-file": FILE_ID };

/** Signed in as the owner, as after a login (no GET /me needed). */
const asOwner = () => {
  const client = testClient();
  client.setSession(CARLA as User);
  return createHttpDocumentsRepository(client);
};

const presigned = (headers: Record<string, string> = UPLOAD_HEADERS) =>
  dataResponse(
    { file_id: FILE_ID, upload_url: UPLOAD_URL, headers, expires_at: "2026-10-19T12:05:00.000Z" },
    201,
  );

const fileMetadata = () => dataResponse({ id: FILE_ID, status: "pending" }, 202);

/** 1x1 transparent PNG, as SignaturePad's canvas.toDataURL("image/png") gives it. */
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("http documents", () => {
  it("listDocuments: GET /businesses/{id}/documents, the owner's own business by default", async () => {
    const { calls } = stubFetch(dataResponse([documentFixture()]), dataResponse([]));
    const documents = asOwner();
    expect(await documents.listDocuments()).toEqual([documentFixture()]);
    await documents.listDocuments(IDS.newFirm);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET /businesses/${IDS.business}/documents`,
      `GET /businesses/${IDS.newFirm}/documents`,
    ]);
  });

  it("listDocuments: a person without a business gets an empty list without calling", async () => {
    const { calls } = stubFetch();
    const client = testClient();
    client.setSession(userFixture() as User);
    expect(await createHttpDocumentsRepository(client).listDocuments()).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("listContracts: GET /businesses/{id}/contracts", async () => {
    const { calls } = stubFetch(dataResponse([contractFixture()]));
    expect(await asOwner().listContracts()).toEqual([contractFixture()]);
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: `/businesses/${IDS.business}/contracts`,
    });
  });

  it("getIntake: GET /businesses/{id}/intake; null when the business has no checklist", async () => {
    const { calls } = stubFetch(dataResponse(intakeSummaryFixture()), dataResponse(null));
    const documents = asOwner();
    expect(await documents.getIntake()).toEqual(intakeSummaryFixture());
    expect(await documents.getIntake(IDS.business)).toBeNull();
    expect(calls[0]).toMatchObject({ method: "GET", path: `/businesses/${IDS.business}/intake` });
  });

  it("uploadDocument: presign → PUT the bytes → complete → attach, in this order", async () => {
    const received = documentFixture({
      state: "received",
      file_name: "banco.pdf",
      received_at: "2026-10-19",
    });
    const { calls, fetchMock } = stubFetch(
      presigned(),
      emptyResponse(200),
      fileMetadata(),
      dataResponse(received),
    );
    const file = new File(["%PDF-1.7 estados"], "banco.pdf", { type: "application/pdf" });

    expect(await asOwner().uploadDocument(DOC, file)).toEqual(received);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}`,
      `POST /files/${FILE_ID}/complete`,
      `POST /documents/${DOC}/upload`,
    ]);
    expect(calls[0]?.body).toEqual({
      context: "intake_document",
      original_name: "banco.pdf",
      mime: "application/pdf",
      size_bytes: file.size,
      business_id: IDS.business,
    });
    expect(calls[0]?.headers["Idempotency-Key"]).toBeTruthy();
    // The PUT goes to storage with the presigned headers only: no cookies, no API headers.
    const putInit = fetchMock.mock.calls[1]?.[1];
    expect(putInit?.credentials).toBe("omit");
    expect(putInit?.headers).toEqual(UPLOAD_HEADERS);
    expect(putInit?.body).toBe(file);
    expect(calls[3]?.body).toEqual({ file_id: FILE_ID });
  });

  it("uploadDocument: a name without the file is invalid_file, without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(asOwner().uploadDocument(DOC, { name: "banco.pdf" })).rejects.toThrow(
      "invalid_file",
    );
    expect(calls).toHaveLength(0);
  });

  it("uploadDocument: a failed PUT is upload_failed and nothing is attached", async () => {
    const { calls } = stubFetch(presigned(), new Response(null, { status: 403 }));
    const file = new File(["x"], "banco.pdf", { type: "application/pdf" });
    await expect(asOwner().uploadDocument(DOC, file)).rejects.toThrow("upload_failed");
    expect(calls).toHaveLength(2);
  });

  it("uploadDocument: a refused type answers the API's code", async () => {
    stubFetch(problemResponse(422, "file_type_not_allowed"));
    const file = new File(["x"], "banco.exe", { type: "application/x-msdownload" });
    await expect(asOwner().uploadDocument(DOC, file)).rejects.toThrow("file_type_not_allowed");
  });

  it("openContract: POST /contracts/{id}/open", async () => {
    const opened = contractFixture({ state: "opened" });
    const { calls } = stubFetch(dataResponse(opened));
    expect(await asOwner().openContract(CONTRACT)).toEqual(opened);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/contracts/${CONTRACT}/open`,
      body: undefined,
    });
  });

  it("openContract with the real DocuSeal driver: meta.signing comes back as the contract's signing", async () => {
    const opened = contractFixture({ state: "opened" });
    const signing = {
      provider: "docuseal",
      embed_src: "https://docuseal.test/s/abc123",
      slug: "abc123",
    };
    stubFetch(jsonResponse({ data: opened, meta: { signing } }));
    const answer = await asOwner().openContract(CONTRACT);
    expect(answer).toEqual({ ...opened, signing });
    expect(answer.signing?.embed_src).toBe("https://docuseal.test/s/abc123");
  });

  it("openContract simulated: the session says so and has no embed", async () => {
    const opened = contractFixture({ state: "opened" });
    stubFetch(
      jsonResponse({
        data: opened,
        meta: { signing: { provider: "simulated", embed_src: null, slug: null } },
      }),
      jsonResponse({ data: opened, meta: { signing: null } }),
    );
    const documents = asOwner();
    expect((await documents.openContract(CONTRACT)).signing).toEqual({
      provider: "simulated",
      embed_src: null,
      slug: null,
    });
    // A signer who already signed gets no session at all.
    expect(await documents.openContract(CONTRACT)).toEqual(opened);
  });

  it("signContract: uploads the signature as PNG (presign → PUT → complete), then POST /sign with consent", async () => {
    const signed = contractFixture({ state: "signed", signed_at: "2026-10-19" });
    const { calls, fetchMock } = stubFetch(
      presigned({ "Content-Type": "image/png" }),
      emptyResponse(200),
      fileMetadata(),
      dataResponse(signed),
    );

    expect(
      await asOwner().signContract(CONTRACT, { kind: "drawn", image_url: PNG_DATA_URL }),
    ).toEqual(signed);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}`,
      `POST /files/${FILE_ID}/complete`,
      `POST /contracts/${CONTRACT}/sign`,
    ]);
    const png = dataUrlToBlob(PNG_DATA_URL)!;
    expect(calls[0]?.body).toEqual({
      context: "contract_signature",
      original_name: "signature.png",
      mime: "image/png",
      size_bytes: png.size,
      business_id: null,
    });
    const putBody = fetchMock.mock.calls[1]?.[1]?.body as Blob;
    expect(putBody.type).toBe("image/png");
    expect(putBody.size).toBe(png.size);
    expect(calls[3]?.body).toEqual({
      signature_file_id: FILE_ID,
      signature_kind: "drawn",
      consent: true,
    });
  });

  it("signContract: without a signature it is signature_required, without calling the API", async () => {
    const { calls } = stubFetch();
    await expect(asOwner().signContract(CONTRACT)).rejects.toThrow("signature_required");
    expect(calls).toHaveLength(0);
  });

  it("signContract: something that is not an image is invalid_file", async () => {
    const { calls } = stubFetch();
    await expect(
      asOwner().signContract(CONTRACT, { kind: "uploaded", image_url: "data:text/plain,hola" }),
    ).rejects.toThrow("invalid_file");
    expect(calls).toHaveLength(0);
  });

  it("declineContract: POST /contracts/{id}/decline with the reason", async () => {
    const declined = contractFixture({ state: "declined" });
    const { calls } = stubFetch(dataResponse(declined));
    expect(await asOwner().declineContract(CONTRACT, "Cambiar la cláusula 4")).toEqual(declined);
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: `/contracts/${CONTRACT}/decline`,
      body: { reason: "Cambiar la cláusula 4" },
    });
  });

  it("getSignedDocument: GET /contracts/{id}/signed-document", async () => {
    const document = {
      contract_id: CONTRACT,
      kind: "nda",
      name: "NDA",
      text: "Texto del NDA",
      fingerprint: "abc123",
      signers: [],
      audit_trail: [],
    };
    const { calls } = stubFetch(dataResponse(document));
    expect(await asOwner().getSignedDocument(CONTRACT)).toEqual(document);
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: `/contracts/${CONTRACT}/signed-document`,
    });
  });

  const POINTS = ["funds_finance_intervention", "business_stays_yours", "franchisor_entity_participation", "do_it_together_no_debt"] as const;

  it("acknowledge: POST /contracts/{id}/acknowledge with the four points", async () => {
    const mou = contractFixture({ kind: "mou" });
    const { calls } = stubFetch(dataResponse(mou));
    expect(await asOwner().acknowledge(CONTRACT, [...POINTS])).toEqual(mou);
    expect(calls[0]).toMatchObject({ method: "POST", path: `/contracts/${CONTRACT}/acknowledge`, body: { points: [...POINTS] } });
  });

  it("signContract: a MOU without the four points answers acknowledgment_required", async () => {
    stubFetch(presigned({ "Content-Type": "image/png" }), emptyResponse(200), fileMetadata(), problemResponse(409, "acknowledgment_required"));
    await expect(asOwner().signContract(CONTRACT, { kind: "drawn", image_url: PNG_DATA_URL })).rejects.toThrow("acknowledgment_required");
  });

  it("the owner's own NDA is gone: the documents adapter no longer calls /own-nda", () => {
    const documents = asOwner() as unknown as Record<string, unknown>;
    expect(documents["getOwnNdaTemplate"]).toBeUndefined();
    expect(documents["createOwnNda"]).toBeUndefined();
    expect(documents["updateOwnNda"]).toBeUndefined();
  });

  it("signContract: the Operating Agreement before its waiting period answers waiting_period with the date in detail", async () => {
    stubFetch(presigned({ "Content-Type": "image/png" }), emptyResponse(200), fileMetadata(), problemResponse(409, "waiting_period", { detail: "2026-10-18" }));
    await expect(asOwner().signContract(CONTRACT, { kind: "drawn", image_url: PNG_DATA_URL })).rejects.toMatchObject({ code: "waiting_period", detail: "2026-10-18" });
  });
});
