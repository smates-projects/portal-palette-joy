// DistributionRepository over the real API (money module: funds.controller.ts). How SM distributes the funds of one
// business among its partner firms and itself. Every answer is the whole distribution with its ETag, kept under
// GET /businesses/{id}/distribution (`resource`): the line writes require it as If-Match. When none is known yet the
// distribution is read first; a stale one answers precondition_failed.
import type { DistributionRepository } from "../repositories";
import type {
  Distribution,
  DistributionLine,
  DistributionPayment,
  MarkPaidInput,
  Uuid,
} from "../types";
import type { HttpClient } from "./client";
import { uploadReceipt } from "./files";
import { toReceipt, type ReceiptResponse } from "./funds";

type DistributionPaymentResponse = Omit<DistributionPayment, "receipt"> & {
  receipt: ReceiptResponse | null;
};
type DistributionLineResponse = Omit<DistributionLine, "payments"> & {
  payments: DistributionPaymentResponse[];
};
type DistributionResponse = Omit<Distribution, "lines"> & { lines: DistributionLineResponse[] };

/** Strategic Mates' own share (organization_id null) in the line ids and in DELETE /lines/{org}. */
const SM_LINE = "sm";

const toPayment = (payment: DistributionPaymentResponse): DistributionPayment => ({
  id: payment.id,
  amount: payment.amount,
  due_on: payment.due_on,
  milestone: payment.milestone,
  status: payment.status,
  paid_on: payment.paid_on,
  method: payment.method,
  reference: payment.reference,
  receipt: toReceipt(payment.receipt),
  overdue: payment.overdue,
});

const toLine = (line: DistributionLineResponse): DistributionLine => ({
  // Rebuilt rather than trusted: the screens key the lines by `${business_id}:${organization_id ?? "sm"}`.
  id: `${line.business_id}:${line.organization_id ?? SM_LINE}`,
  business_id: line.business_id,
  organization_id: line.organization_id,
  firm_name: line.firm_name,
  areas: line.areas,
  kind: line.kind,
  amount: line.amount,
  paid: line.paid,
  payments: line.payments.map(toPayment),
});

const toDistribution = (distribution: DistributionResponse): Distribution => ({
  business_id: distribution.business_id,
  business_name: distribution.business_name,
  received: distribution.received,
  assigned: distribution.assigned,
  unassigned: distribution.unassigned,
  paid: distribution.paid,
  overdue_count: distribution.overdue_count,
  lines: distribution.lines.map(toLine),
});

const distributionPath = (businessId: Uuid) =>
  `/businesses/${encodeURIComponent(businessId)}/distribution`;
const paymentPath = (paymentId: Uuid) => `/distribution-payments/${encodeURIComponent(paymentId)}`;

export function createHttpDistributionRepository(client: HttpClient): DistributionRepository {
  /** Reads the distribution once when its ETag is unknown, so the guarded write carries a current If-Match. */
  const ensureVersion = async (businessId: Uuid) => {
    const resource = distributionPath(businessId);
    if (!client.etags.has(resource)) await client.get<DistributionResponse | null>(resource);
    return resource;
  };

  return {
    /** Null while the business has no funds record. Keeps the ETag. */
    get: async (businessId) => {
      const distribution = await client.get<DistributionResponse | null>(
        distributionPath(businessId),
      );
      return distribution ? toDistribution(distribution) : null;
    },

    /** PUT /businesses/{id}/distribution/lines (If-Match): creates or replaces the plan of one line. */
    saveLine: async (businessId, input) => {
      const resource = await ensureVersion(businessId);
      return toDistribution(
        await client.request<DistributionResponse>("PUT", `${resource}/lines`, {
          resource,
          body: {
            organization_id: input.organization_id,
            kind: input.kind,
            payments: input.payments.map((payment) => ({
              amount: payment.amount,
              due_on: payment.due_on,
              milestone: payment.milestone,
            })),
          },
        }),
      );
    },

    /** DELETE /businesses/{id}/distribution/lines/{org | sm} (If-Match). */
    clearLine: async (businessId, organizationId) => {
      const resource = await ensureVersion(businessId);
      const org = organizationId ? encodeURIComponent(organizationId) : SM_LINE;
      return toDistribution(
        await client.delete<DistributionResponse>(`${resource}/lines/${org}`, { resource }),
      );
    },

    /** POST /distribution-payments/{id}/paid (Idempotency-Key); the receipt is uploaded first. */
    markPaid: async (businessId, paymentId, input: MarkPaidInput) => {
      const receiptFileId = await uploadReceipt(
        client,
        input.receipt,
        "distribution_payment",
        businessId,
      );
      return toDistribution(
        await client.post<DistributionResponse>(
          `${paymentPath(paymentId)}/paid`,
          {
            paid_on: input.paid_on,
            method: input.method,
            reference: input.reference,
            receipt_file_id: receiptFileId,
          },
          { idempotent: true, resource: distributionPath(businessId) },
        ),
      );
    },

    /** POST /distribution-payments/{id}/pending: undo of markPaid. */
    markPending: async (businessId, paymentId) =>
      toDistribution(
        await client.post<DistributionResponse>(`${paymentPath(paymentId)}/pending`, undefined, {
          resource: distributionPath(businessId),
        }),
      ),
  };
}
