// DocumentsRepository over the real API: entry documents (pipeline module, business-entry.controller.ts) and the
// signing (signing module, contracts.controller.ts: the portal's own screen, or DocuSeal's embedded form when the API
// runs the real driver). Files travel through the files module
// (./files.ts): the adapter uploads the bytes first and then attaches the returned file_id.
import type { DocumentUpload, DocumentsRepository, SigningSession } from "../repositories";
import type { BusinessDocument, Contract, IntakeSummary, IsoDateTime, SavedSignature, Uuid } from "../types";
import { ApiError, getOrNull, type HttpClient } from "./client";
import { signatureToPng, uploadFile } from "./files";
import { ensureCurrentUser } from "./session";

type Party = "owner" | "sm" | "bishop";
type SignerStatus = "sent" | "opened" | "signed" | "declined";

/** GET /contracts/{id}/signed-document: the sealed text, its fingerprint and the audit trail. */
export interface SignedDocument {
  contract_id: Uuid;
  kind: "nda" | "mou" | "tripartite" | "framework" | "other";
  name: string;
  text: string;
  fingerprint: string | null;
  signers: {
    party: Party;
    name: string;
    status: SignerStatus;
    signed_at: IsoDateTime | null;
    signature: { kind: "drawn" | "typed" | "uploaded"; image_url: string } | null;
  }[];
  audit_trail: {
    party: Party;
    name: string;
    status: SignerStatus;
    at: IsoDateTime;
    reason: string | null;
  }[];
}

/** The API's signed document has no place in the front's contract yet (the dialog draws it from the Contract). */
export interface HttpDocumentsRepository extends DocumentsRepository {
  getSignedDocument(contractId: Uuid): Promise<SignedDocument>;
}

const businessPath = (id: Uuid) => `/businesses/${encodeURIComponent(id)}`;
const contractPath = (id: Uuid) => `/contracts/${encodeURIComponent(id)}`;

/** meta.signing of POST /contracts/{id}/open, when it is a well-formed SigningSessionSchema; null otherwise. */
function signingOf(value: unknown): SigningSession | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const provider = record["provider"];
  if (provider !== "docuseal" && provider !== "simulated") return null;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : null);
  return { provider, embed_src: text("embed_src"), slug: text("slug") };
}

/** A real File (or Blob with a name) from the input; `{ name }` alone is the mock's simulated upload. */
const isRealFile = (file: DocumentUpload): file is File =>
  typeof Blob !== "undefined" && file instanceof Blob;

export function createHttpDocumentsRepository(client: HttpClient): HttpDocumentsRepository {
  /** The given business, or the signed-in person's own; null when the person has none. */
  const businessIdOrOwn = async (businessId?: Uuid): Promise<Uuid | null> =>
    businessId ?? (await ensureCurrentUser(client)).business_id;

  return {
    listDocuments: async (businessId) => {
      const id = await businessIdOrOwn(businessId);
      return id ? client.get<BusinessDocument[]>(`${businessPath(id)}/documents`) : [];
    },

    listContracts: async (businessId) => {
      const id = await businessIdOrOwn(businessId);
      return id ? client.get<Contract[]>(`${businessPath(id)}/contracts`) : [];
    },

    /** presign → PUT the bytes → complete → POST /documents/{id}/upload { file_id }. */
    uploadDocument: async (documentId, file) => {
      if (!isRealFile(file)) {
        throw new ApiError({
          code: "invalid_file",
          status: 422,
          detail: "Pick the file to upload.",
        });
      }
      const fileId = await uploadFile(client, file, {
        context: "intake_document",
        name: file.name,
        businessId: client.session().user?.business_id ?? null,
      });
      return client.post<BusinessDocument>(`/documents/${encodeURIComponent(documentId)}/upload`, {
        file_id: fileId,
      });
    },

    /** POST /documents/{id}/not-applicable { reason }: "No aplica", with why. */
    markNotApplicable: (documentId, reason) =>
      client.post<BusinessDocument>(`/documents/${encodeURIComponent(documentId)}/not-applicable`, { reason: reason.trim() }),

    getIntake: async (businessId) => {
      const id = await businessIdOrOwn(businessId);
      return id ? getOrNull<IntakeSummary>(client, `${businessPath(id)}/intake`) : null;
    },

    /**
     * POST /open answers the contract plus meta.signing: with the real DocuSeal driver, the embed of this signer's
     * own form (provider docuseal, embed_src, slug). It is idempotent once opened, so the signer screen also polls
     * it while the embed is open (the API has no GET /contracts/{id}).
     */
    openContract: async (contractId) => {
      const answer = await client.envelope<Contract>("POST", `${contractPath(contractId)}/open`);
      const signing = signingOf((answer.meta as Record<string, unknown> | undefined)?.["signing"]);
      return signing ? { ...answer.data, signing } : answer.data;
    },

    /**
     * The SignaturePad gives a data URL; the API wants the image stored first (context contract_signature, PNG
     * only) and its id. Pressing "Firmar" after reading the consent text is the consent the API records.
     */
    signContract: async (contractId, signature, options) => {
      if (options?.use_saved_signature) {
        return client.post<Contract>(`${contractPath(contractId)}/sign`, { use_saved_signature: true, consent: true });
      }
      if (!signature) {
        throw new ApiError({
          code: "signature_required",
          status: 422,
          detail: "Draw, type or upload the signature first.",
        });
      }
      const png = await signatureToPng(signature.image_url);
      const fileId = await uploadFile(client, png, {
        context: "contract_signature",
        name: "signature.png",
      });
      return client.post<Contract>(`${contractPath(contractId)}/sign`, {
        signature_file_id: fileId,
        signature_kind: signature.kind,
        ...(options?.save_signature ? { save_signature: true } : {}),
        consent: true,
      });
    },

    getMySignature: () => getOrNull<SavedSignature>(client, "/me/signature"),

    /** presign (contract_signature) → PUT the bytes → complete → PUT /me/signature { file_id, kind }. */
    saveMySignature: async (signature) => {
      const png = await signatureToPng(signature.image_url);
      const fileId = await uploadFile(client, png, { context: "contract_signature", name: "signature.png" });
      return client.request<SavedSignature>("PUT", "/me/signature", { body: { file_id: fileId, kind: signature.kind } });
    },

    deleteMySignature: async () => {
      await client.delete<unknown>("/me/signature");
    },

    declineContract: (contractId, reason) =>
      client.post<Contract>(`${contractPath(contractId)}/decline`, { reason }),

    /** POST /acknowledge { points }: the four points of the MOU, before signing it. */
    acknowledge: (contractId, points) =>
      client.post<Contract>(`${contractPath(contractId)}/acknowledge`, { points }),

    getSignedDocument: (contractId) =>
      client.get<SignedDocument>(`${contractPath(contractId)}/signed-document`),

    /** GET /contracts?kind=framework: the Bishops' framework agreements (SM Global). */
    listFrameworkAgreements: () => client.get<Contract[]>("/contracts", { query: { kind: "framework" } }),
  };
}
