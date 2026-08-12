import type { MediaAssetCategory, QualificationKind, VastuServiceType } from "./domain.ts";

export type ApprovedLocalAsset = {
  key: string; filename: string; title: string; category: MediaAssetCategory;
  serviceApplicability: Array<VastuServiceType | QualificationKind>; pageCount: number; sizeBytes: number; checksumSha256: string; clientSendable: true;
};

export const APPROVED_FOUNDER_ASSETS: readonly ApprovedLocalAsset[] = [
  { key: "BROCHURE_NEW_CONSTRUCTION_V2", filename: "V2-new connstruction vastu planning & design.pdf", title: "New Construction Vastu Planning & Design Coordination", category: "BROCHURE", serviceApplicability: ["NEW_CONSTRUCTION"], pageCount: 20, sizeBytes: 1849296, checksumSha256: "F173688BDED4F1084A00EE33A6BC094C270273D7D2DE83DE6F5F1C466F84B1E5", clientSendable: true },
  { key: "BROCHURE_EXISTING_SPACE_V2", filename: "v2-existing vastu evaluation & balancing.pdf", title: "Existing Space Vastu Audit & Optimisation", category: "BROCHURE", serviceApplicability: ["EXISTING_SPACE"], pageCount: 15, sizeBytes: 1716257, checksumSha256: "BA4E5CA4FF5223405EC93488FDAD89DF855D834FE60DBC54069CB44ED0A60FFA", clientSendable: true },
  { key: "QUALIFICATION_HYBRID_MASTER_V1", filename: "Uchit_Vastu_India_Master_Client_Qualification_Form.pdf", title: "Master Client Qualification & Application Form", category: "QUALIFICATION_FORM", serviceApplicability: ["HYBRID"], pageCount: 6, sizeBytes: 201976, checksumSha256: "6BA68D002BDB02DC5D10F33B33D25571A230D08687877E7AF27B4CD4C4611B0A", clientSendable: true },
  { key: "QUALIFICATION_COMMERCIAL_V2", filename: "Uchit_Vastu_India_Private_Commercial_Client_Application_v2.pdf", title: "Private Commercial Client Application", category: "QUALIFICATION_FORM", serviceApplicability: ["COMMERCIAL"], pageCount: 3, sizeBytes: 123175, checksumSha256: "A08C1C6856599D80C07FCD5A80095DCB06E97F8797E8BDAE1DB23BFE4CB3C333", clientSendable: true },
  { key: "QUALIFICATION_RESIDENTIAL_V3", filename: "Uchit_Vastu_India_Private_Residential_Client_Application_v3.pdf", title: "Private Residential Client Application", category: "QUALIFICATION_FORM", serviceApplicability: ["RESIDENTIAL"], pageCount: 3, sizeBytes: 118117, checksumSha256: "D0562C8EDDAAF1DBC2EC4E8996921F50B8F208D4E7D49A997AE68D9A3DAD014E", clientSendable: true },
] as const;

export function validateApprovedAssetMetadata(input: { key: string; checksumSha256: string; sizeBytes: number; pageCount: number; mimeType: string }) {
  const expected = APPROVED_FOUNDER_ASSETS.find((asset) => asset.key === input.key);
  if (!expected) throw new Error("This file is not in the Founder-approved asset manifest.");
  if (input.mimeType !== "application/pdf") throw new Error("Approved Founder assets must remain PDF files.");
  if (input.checksumSha256.toUpperCase() !== expected.checksumSha256 || input.sizeBytes !== expected.sizeBytes || input.pageCount !== expected.pageCount) {
    throw new Error("The selected PDF bytes do not match the approved immutable asset version.");
  }
  return { ...expected, validation: "MATCH" as const, dryRunOnly: true as const };
}
