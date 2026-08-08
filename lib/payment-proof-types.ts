export type PaymentProofKey = "advance-proof" | "balance-proof";

export type PaymentProofRecord = {
  key: PaymentProofKey;
  label: string;
  fileName: string;
  url: string;
  uploadedAt: string;
};

export const paymentProofLabels: Record<PaymentProofKey, string> = {
  "advance-proof": "Advance proof",
  "balance-proof": "Balance proof"
};
