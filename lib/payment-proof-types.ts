export type PaymentProofKey = "advance-proof" | "balance-proof";
export type PaymentProofStatus = "UPLOADED" | "VERIFIED" | "REJECTED";

export type PaymentProofRecord = {
  id?: string;
  key: PaymentProofKey;
  label: string;
  fileName: string;
  url: string;
  uploadedAt: string;
  mimeType?: string;
  sizeBytes?: number;
  checksumSha256?: string;
  uploadedBy?: string;
  uploadedById?: string;
  status?: PaymentProofStatus;
  clientId?: string;
  proposalId?: string;
  caseId?: string;
};

export const paymentProofLabels: Record<PaymentProofKey, string> = {
  "advance-proof": "Advance proof",
  "balance-proof": "Balance proof"
};
