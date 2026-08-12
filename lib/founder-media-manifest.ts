import type { MediaAssetCategory, QualificationKind, VastuServiceType } from "./domain.ts";

export type ApprovedLocalAsset = {
  key: string; filename: string; title: string; category: MediaAssetCategory;
  serviceApplicability: Array<VastuServiceType | QualificationKind>; pageCount: number; sizeBytes: number; checksumSha256: string; clientSendable: boolean;
  mimeType: "application/pdf" | "image/png"; widthPixels?: number; heightPixels?: number; hasAlphaChannel?: boolean;
  audience?: "FOUNDER_PRIVATE" | "CLIENT_SENDABLE"; statutoryPurpose?: "LOGO" | "SIGNATURE"; brandRole?: "PRIMARY_DARK_PREMIUM" | "LIGHT_MONOCHROME_PRINT" | "FOUNDER_SIGNATURE";
};

export const APPROVED_FOUNDER_ASSETS: readonly ApprovedLocalAsset[] = [
  { key: "BRAND_LOGO_GOLD_V1", filename: "Gold UCHIT Vastu India Emblem (1).png", title: "Gold UCHIT Vastu India Emblem", category: "BRAND", serviceApplicability: [], pageCount: 1, sizeBytes: 2188928, checksumSha256: "88D678C05CE83CE9D12CCB6C021F1E5A5361F3AC018C5E2131DDA49A156251B6", clientSendable: false, mimeType: "image/png", widthPixels: 1254, heightPixels: 1254, hasAlphaChannel: false, audience: "FOUNDER_PRIVATE", statutoryPurpose: "LOGO", brandRole: "PRIMARY_DARK_PREMIUM" },
  { key: "BRAND_LOGO_MONOCHROME_V1", filename: "black and white logo (1).png", title: "Black and White UCHIT Vastu India Logo", category: "BRAND", serviceApplicability: [], pageCount: 1, sizeBytes: 2092736, checksumSha256: "317B0C0A44B2F17D727F17147DAE5CBCE0DC015536DA241D711437B8BD8FAFA6", clientSendable: false, mimeType: "image/png", widthPixels: 1536, heightPixels: 1024, hasAlphaChannel: true, audience: "FOUNDER_PRIVATE", statutoryPurpose: "LOGO", brandRole: "LIGHT_MONOCHROME_PRINT" },
  { key: "FOUNDER_SIGNATURE_YOGESH_V1", filename: "ChatGPT Image Aug 12, 2026, 07_13_30 PM.png", title: "Yogesh K Hora Founder Signature", category: "BRAND", serviceApplicability: [], pageCount: 1, sizeBytes: 1003751, checksumSha256: "7FAFD67BDBFAE86A6BF6B1098C14ACFCE120F9DD02EF73D5C0A358D285F7A0CA", clientSendable: false, mimeType: "image/png", widthPixels: 2172, heightPixels: 724, hasAlphaChannel: false, audience: "FOUNDER_PRIVATE", statutoryPurpose: "SIGNATURE", brandRole: "FOUNDER_SIGNATURE" },
  { key: "BROCHURE_NEW_CONSTRUCTION_V2", filename: "V2-new connstruction vastu planning & design.pdf", title: "New Construction Vastu Planning & Design Coordination", category: "BROCHURE", serviceApplicability: ["NEW_CONSTRUCTION"], pageCount: 20, sizeBytes: 1849296, checksumSha256: "F173688BDED4F1084A00EE33A6BC094C270273D7D2DE83DE6F5F1C466F84B1E5", clientSendable: true, mimeType: "application/pdf", audience: "CLIENT_SENDABLE" },
  { key: "BROCHURE_EXISTING_SPACE_V2", filename: "v2-existing vastu evaluation & balancing.pdf", title: "Existing Space Vastu Audit & Optimisation", category: "BROCHURE", serviceApplicability: ["EXISTING_SPACE"], pageCount: 15, sizeBytes: 1716257, checksumSha256: "BA4E5CA4FF5223405EC93488FDAD89DF855D834FE60DBC54069CB44ED0A60FFA", clientSendable: true, mimeType: "application/pdf", audience: "CLIENT_SENDABLE" },
  { key: "QUALIFICATION_HYBRID_MASTER_V1", filename: "Uchit_Vastu_India_Master_Client_Qualification_Form.pdf", title: "Master Client Qualification & Application Form", category: "QUALIFICATION_FORM", serviceApplicability: ["HYBRID"], pageCount: 6, sizeBytes: 201976, checksumSha256: "6BA68D002BDB02DC5D10F33B33D25571A230D08687877E7AF27B4CD4C4611B0A", clientSendable: true, mimeType: "application/pdf", audience: "CLIENT_SENDABLE" },
  { key: "QUALIFICATION_COMMERCIAL_V2", filename: "Uchit_Vastu_India_Private_Commercial_Client_Application_v2.pdf", title: "Private Commercial Client Application", category: "QUALIFICATION_FORM", serviceApplicability: ["COMMERCIAL"], pageCount: 3, sizeBytes: 123175, checksumSha256: "A08C1C6856599D80C07FCD5A80095DCB06E97F8797E8BDAE1DB23BFE4CB3C333", clientSendable: true, mimeType: "application/pdf", audience: "CLIENT_SENDABLE" },
  { key: "QUALIFICATION_RESIDENTIAL_V3", filename: "Uchit_Vastu_India_Private_Residential_Client_Application_v3.pdf", title: "Private Residential Client Application", category: "QUALIFICATION_FORM", serviceApplicability: ["RESIDENTIAL"], pageCount: 3, sizeBytes: 118117, checksumSha256: "D0562C8EDDAAF1DBC2EC4E8996921F50B8F208D4E7D49A997AE68D9A3DAD014E", clientSendable: true, mimeType: "application/pdf", audience: "CLIENT_SENDABLE" },
] as const;

export function validateApprovedAssetMetadata(input: { key: string; checksumSha256: string; sizeBytes: number; pageCount: number; mimeType: string }) {
  const expected = APPROVED_FOUNDER_ASSETS.find((asset) => asset.key === input.key);
  if (!expected) throw new Error("This file is not in the Founder-approved asset manifest.");
  if (input.mimeType !== expected.mimeType) throw new Error("The selected file MIME type does not match the approved immutable asset version.");
  if (input.checksumSha256.toUpperCase() !== expected.checksumSha256 || input.sizeBytes !== expected.sizeBytes || input.pageCount !== expected.pageCount) {
    throw new Error("The selected file bytes do not match the approved immutable asset version.");
  }
  return { ...expected, validation: "MATCH" as const, dryRunOnly: true as const };
}
