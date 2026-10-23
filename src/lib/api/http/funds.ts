// FundsRepository over the real API (money module: funds.controller.ts). Money the Bishop pays SM for one program,
// in whole USD as in the front. SM records a payment (confirmed at once) and the Bishop reports his own with the
// receipt through the same POST: the API tells them apart by who is signed in. The receipt travels as the id of a
// file uploaded first (./files.ts, context fund_payment).
import type { FundsRepository } from "../repositories";
import type { BishopFunds, FundPayment, FundPaymentInput, Receipt, Uuid } from "../types";
import type { HttpClient } from "./client";
import { uploadReceipt } from "./files";

/** The API's receipt: the front's plus the stored file's id (download link), which the front has no place for. */
export interface ReceiptResponse extends Receipt {
  file_id?: Uuid | undefined;
}

type FundPaymentResponse = Omit<FundPayment, "receipt"> & { receipt: ReceiptResponse | null };
type BishopFundsResponse = Omit<BishopFunds, "payments"> & { payments: FundPaymentResponse[] };

export const toReceipt = (receipt: ReceiptResponse | null): Receipt | null =>
  receipt ? { file_name: receipt.file_name, size_kb: receipt.size_kb } : null;

const toPayment = (payment: FundPaymentResponse): FundPayment => ({
  id: payment.id,
  business_id: payment.business_id,
  amount: payment.amount,
  paid_on: payment.paid_on,
  method: payment.method,
  reference: payment.reference,
  receipt: toReceipt(payment.receipt),
  // The stored receipt and its download link (SM office and the Bishop only; null for anyone else).
  receipt_file_id: payment.receipt_file_id ?? payment.receipt?.file_id ?? null,
  receipt_url: payment.receipt_url ?? null,
  status: payment.status,
  reported_by: payment.reported_by,
  created_at: payment.created_at,
  confirmed_at: payment.confirmed_at,
});

const toFunds = (funds: BishopFundsResponse): BishopFunds => ({
  business_id: funds.business_id,
  lead_id: funds.lead_id,
  business_name: funds.business_name,
  bishop_user_id: funds.bishop_user_id,
  bishop_name: funds.bishop_name,
  total: funds.total,
  received: funds.received,
  to_confirm: funds.to_confirm,
  // Still missing, still reportable and the confirmed share, as the API computes them.
  ...(funds.remaining !== undefined ? { remaining: funds.remaining } : {}),
  ...(funds.reportable !== undefined ? { reportable: funds.reportable } : {}),
  ...(funds.received_pct !== undefined ? { received_pct: funds.received_pct } : {}),
  status: funds.status,
  completed_on: funds.completed_on,
  payments: funds.payments.map(toPayment),
  program_started: funds.program_started,
});

const fundsPath = (businessId: Uuid) => `/businesses/${encodeURIComponent(businessId)}/funds`;
const paymentPath = (paymentId: Uuid) => `/fund-payments/${encodeURIComponent(paymentId)}`;

export function createHttpFundsRepository(client: HttpClient): FundsRepository {
  /** POST /businesses/{id}/funds/payments (Idempotency-Key): the receipt is uploaded first. */
  const pay = async (businessId: Uuid, input: FundPaymentInput) => {
    const receiptFileId = await uploadReceipt(client, input.receipt, "fund_payment", businessId);
    return toFunds(
      await client.post<BishopFundsResponse>(
        `${fundsPath(businessId)}/payments`,
        {
          amount: input.amount,
          paid_on: input.paid_on,
          method: input.method,
          reference: input.reference,
          receipt_file_id: receiptFileId,
        },
        { idempotent: true },
      ),
    );
  };

  return {
    /** Null before the tripartite contract is signed by the three. */
    get: async (businessId) => {
      const funds = await client.get<BishopFundsResponse | null>(fundsPath(businessId));
      return funds ? toFunds(funds) : null;
    },

    listMine: async () => (await client.get<BishopFundsResponse[]>("/me/funds")).map(toFunds),

    recordPayment: pay,

    reportPayment: pay,

    /** The payment id is enough for the API; the business stays in the signature for the mock. */
    confirmPayment: async (_businessId, paymentId) =>
      toFunds(await client.post<BishopFundsResponse>(`${paymentPath(paymentId)}/confirm`)),

    removePayment: async (_businessId, paymentId) =>
      toFunds(await client.delete<BishopFundsResponse>(paymentPath(paymentId))),
  };
}
