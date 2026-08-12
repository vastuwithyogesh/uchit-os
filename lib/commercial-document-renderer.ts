import type { FounderProposalVersionRecord } from "./domain.ts";

export const COMMERCIAL_PROPOSAL_RENDERER_VERSION = "uchit-commercial-proposal/pdf-v1";
export const COMMERCIAL_INVOICE_RENDERER_VERSION = "uchit-commercial-invoice/pdf-v1";

const textEncoder = new TextEncoder();
const pdfEscape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll(/[\r\n]+/g, " ");

function deterministicPdf(lines: string[]): Uint8Array {
  const body = lines.slice(0, 45).map((line, index) => `BT /F1 ${index === 0 ? 18 : 10} Tf 54 ${790 - index * 16} Td (${pdfEscape(line)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${textEncoder.encode(body).length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(textEncoder.encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = textEncoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return textEncoder.encode(pdf);
}

export type FounderProposalClientProjection = {
  proposalVersion: number;
  proposalHash: string;
  client: { name: string; permanentClientId: string };
  project: { kind: string; serviceType: string; propertyType?: string; propertyLocation?: string; knownFloorCount?: number; primaryRequirement?: string };
  requirements: { exactQualificationVersion: string; refinedSummary?: string };
  scopeItems: Array<{ order: number; title: string; status: string; floorIds: string[]; note?: string }>;
  deliverables: Array<{ order: number; name: string; status: string; floorIds: string[]; deliveryFormat: string; expectedStage: string; description: string; clientDependency: string }>;
  interactions: FounderProposalVersionRecord["content"]["interactions"];
  timeline: FounderProposalVersionRecord["content"]["timeline"];
  commercial: { professionalFeePaise: number; gstAppliedBasisPoints: number; gstAmountPaise: number; totalPayablePaise: number; agreedAdvancePaise: number; remainingBalancePaise: number; paymentMilestones: FounderProposalVersionRecord["content"]["commercial"]["paymentMilestones"] };
  professionalBoundaries: string;
  projectExclusions: string[];
  cancellationRefundDelayPolicy: string;
  validityEndsAt: string;
  postAcceptanceSequence: string[];
};

export function renderCommercialProposalPdf(projection: FounderProposalClientProjection): Uint8Array {
  const money = (paise: number) => `INR ${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
  return deterministicPdf([
    "UCHIT VASTU INDIA — COMMERCIAL PROPOSAL",
    `Proposal version ${projection.proposalVersion}`,
    `Client: ${projection.client.name} (${projection.client.permanentClientId})`,
    `Project: ${projection.project.kind} / ${projection.project.serviceType}`,
    `Professional fee before GST: ${money(projection.commercial.professionalFeePaise)}`,
    `GST: ${(projection.commercial.gstAppliedBasisPoints / 100).toFixed(2)}% — ${money(projection.commercial.gstAmountPaise)}`,
    `Total payable: ${money(projection.commercial.totalPayablePaise)}`,
    `Agreed advance: ${money(projection.commercial.agreedAdvancePaise)}`,
    `Remaining balance: ${money(projection.commercial.remainingBalancePaise)}`,
    "Scope of Consultancy",
    ...projection.scopeItems.map((item) => `${item.order}. [${item.status}] ${item.title}`),
    "Deliverables",
    ...projection.deliverables.map((item) => `${item.order}. [${item.status}] ${item.name} — ${item.deliveryFormat}`),
    "Professional Boundaries",
    projection.professionalBoundaries,
    "Cancellation, Refund and Delay Policy",
    projection.cancellationRefundDelayPolicy,
    `Valid until: ${projection.validityEndsAt}`
  ]);
}

export function renderCommercialInvoicePdf(input: { invoiceNumber: string; clientName: string; proposalVersion: number; paymentId: string; amountReceivedPaise: number; gstBasisPoints: number; gstAmountSnapshotPaise: number; remainingBalancePaise: number; statutoryText: string; issuedAt: string }): Uint8Array {
  const money = (paise: number) => `INR ${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
  return deterministicPdf([
    "UCHIT VASTU INDIA — ADVANCE RECEIPT INVOICE",
    `Invoice: ${input.invoiceNumber}`,
    `Issued: ${input.issuedAt}`,
    `Client: ${input.clientName}`,
    `Proposal version: ${input.proposalVersion}`,
    `Payment reference: ${input.paymentId}`,
    `Amount received: ${money(input.amountReceivedPaise)}`,
    `Commercial GST snapshot: ${(input.gstBasisPoints / 100).toFixed(2)}% / ${money(input.gstAmountSnapshotPaise)}`,
    `Remaining balance: ${money(input.remainingBalancePaise)}`,
    input.statutoryText
  ]);
}
