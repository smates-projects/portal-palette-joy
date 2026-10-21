import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFile, waitForFileReady } from "./files";
import { IDS, dataResponse, emptyResponse, stubFetch, testClient } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FILE_ID = IDS.zone;
const UPLOAD_URL = "https://storage.test/quarantine/doc?X-Amz-Signature=sig";
const presigned = () =>
  dataResponse({ file_id: FILE_ID, upload_url: UPLOAD_URL, headers: { "Content-Type": "application/pdf" }, expires_at: "2026-10-19T12:05:00.000Z" }, 201);
const status = (value: string, reason?: string) => dataResponse({ id: FILE_ID, status: value, ...(reason ? { reason } : {}) });
/** A clock that never sleeps but records how long it was asked to. */
const fakeSleep = () => {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => { waits.push(ms); } };
};

describe("waitForFileReady", () => {
  it("reads GET /files/{id} until the file is ready, sleeping between reads", async () => {
    const { calls } = stubFetch(status("pending"), status("pending"), status("ready"));
    const { waits, sleep } = fakeSleep();
    const metadata = await waitForFileReady(testClient(), FILE_ID, { intervalMs: 250, sleep });
    expect(metadata).toEqual({ id: FILE_ID, status: "ready", reason: null });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`GET /files/${FILE_ID}`, `GET /files/${FILE_ID}`, `GET /files/${FILE_ID}`]);
    expect(waits).toEqual([250, 250]);
  });

  it("a file already ready answers without sleeping", async () => {
    stubFetch(status("ready"));
    const { waits, sleep } = fakeSleep();
    await waitForFileReady(testClient(), FILE_ID, { sleep });
    expect(waits).toEqual([]);
  });

  it("failed is file_rejected with the API's reason", async () => {
    stubFetch(status("failed", "scanner_flagged"));
    const { sleep } = fakeSleep();
    await expect(waitForFileReady(testClient(), FILE_ID, { sleep })).rejects.toMatchObject({ code: "file_rejected", detail: "scanner_flagged" });
  });

  it("gives up with file_verification_timeout once the wait passes the limit", async () => {
    stubFetch(status("pending"), status("pending"), status("pending"));
    const { sleep } = fakeSleep();
    await expect(waitForFileReady(testClient(), FILE_ID, { intervalMs: 500, timeoutMs: 1000, sleep })).rejects.toThrow("file_verification_timeout");
  });
});

describe("uploadFile", () => {
  it("presign → PUT → complete, then waits for the verification when complete answers pending", async () => {
    const { calls } = stubFetch(presigned(), emptyResponse(200), dataResponse({ id: FILE_ID, status: "pending" }, 202), status("ready"));
    const phases: string[] = [];
    const file = new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" });
    expect(await uploadFile(testClient(), file, { context: "intake_document", onProgress: (p) => phases.push(p) })).toBe(FILE_ID);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /files/presign",
      `PUT ${UPLOAD_URL}`,
      `POST /files/${FILE_ID}/complete`,
      `GET /files/${FILE_ID}`,
    ]);
    expect(phases).toEqual(["uploading", "verifying"]);
  });

  it("does not poll when complete already answers ready, or answers nothing", async () => {
    const { calls } = stubFetch(presigned(), emptyResponse(200), status("ready"), presigned(), emptyResponse(200), emptyResponse(204));
    const file = new File(["%PDF-1.7"], "doc.pdf", { type: "application/pdf" });
    await uploadFile(testClient(), file, { context: "intake_document" });
    await uploadFile(testClient(), file, { context: "intake_document" });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(0);
  });
});
