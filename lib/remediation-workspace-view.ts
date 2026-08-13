import type { StageBRemedyType } from "./domain.ts";

export type SectionAWorkspacePageType = "EXISTING_LAYOUT" | "FINAL_REVISED_LAYOUT" | "FURNITURE_ADDON" | "FURNITURE_IMPLEMENTATION" | "APPLIANCE" | "APPLIANCE_IMPLEMENTATION" | "COLOUR_FRAME";
export type RemediationWorkspacePageKey = `A:${SectionAWorkspacePageType}` | `B:${StageBRemedyType}`;

export const REMEDIATION_WORKSPACE_PAGES = [
  { key: "A:EXISTING_LAYOUT", section: "A", pageType: "EXISTING_LAYOUT", label: "Existing Furniture Layout", shortLabel: "A1", ordinal: 1 },
  { key: "A:FINAL_REVISED_LAYOUT", section: "A", pageType: "FINAL_REVISED_LAYOUT", label: "Recommended / Final Revised Furniture Layout", shortLabel: "A2", ordinal: 2 },
  { key: "A:FURNITURE_ADDON", section: "A", pageType: "FURNITURE_ADDON", label: "Furniture Add-ons", shortLabel: "A3", ordinal: 3 },
  { key: "A:FURNITURE_IMPLEMENTATION", section: "A", pageType: "FURNITURE_IMPLEMENTATION", label: "Furniture Add-ons Implementation Sheet", shortLabel: "A4", ordinal: 4 },
  { key: "A:APPLIANCE", section: "A", pageType: "APPLIANCE", label: "Appliances", shortLabel: "A5", ordinal: 5 },
  { key: "A:APPLIANCE_IMPLEMENTATION", section: "A", pageType: "APPLIANCE_IMPLEMENTATION", label: "Appliances Implementation Sheet", shortLabel: "A6", ordinal: 6 },
  { key: "A:COLOUR_FRAME", section: "A", pageType: "COLOUR_FRAME", label: "Colour Chart / Wall Colour Reference", shortLabel: "A7", ordinal: 7 },
  { key: "B:DISHA_BALANCER", section: "B", pageType: "DISHA_BALANCER", label: "Disha Balancer", shortLabel: "B1", ordinal: 8 },
  { key: "B:DISHA_ACTIVATION", section: "B", pageType: "DISHA_ACTIVATION", label: "Disha Activation", shortLabel: "B2", ordinal: 10 },
  { key: "B:TATTAV_BALANCER", section: "B", pageType: "TATTAV_BALANCER", label: "Tattav Balancer", shortLabel: "B3", ordinal: 12 },
  { key: "B:TATTAV_ACTIVATION", section: "B", pageType: "TATTAV_ACTIVATION", label: "Tattav Activation", shortLabel: "B4", ordinal: 14 },
  { key: "B:EQUALISER", section: "B", pageType: "EQUALISER", label: "Equaliser", shortLabel: "B5", ordinal: 16 }
] as const satisfies ReadonlyArray<{ key: RemediationWorkspacePageKey; section: "A" | "B"; pageType: SectionAWorkspacePageType | StageBRemedyType; label: string; shortLabel: string; ordinal: number }>;

export function visualWorkspacePage(scenario: string): RemediationWorkspacePageKey {
  const values: Record<string, RemediationWorkspacePageKey> = {
    navigation: "A:EXISTING_LAYOUT", existing: "A:EXISTING_LAYOUT", circle: "A:EXISTING_LAYOUT", arrow: "A:EXISTING_LAYOUT", highlight: "A:EXISTING_LAYOUT", pen: "A:EXISTING_LAYOUT", text: "A:EXISTING_LAYOUT",
    revised: "A:FINAL_REVISED_LAYOUT", furniture: "A:FURNITURE_ADDON", "furniture-sheet": "A:FURNITURE_IMPLEMENTATION", appliance: "A:APPLIANCE", "appliance-sheet": "A:APPLIANCE_IMPLEMENTATION",
    colour: "A:COLOUR_FRAME", "colour-rotate": "A:COLOUR_FRAME", "colour-opacity": "A:COLOUR_FRAME", numbering: "A:FURNITURE_ADDON", preview: "A:COLOUR_FRAME", mobile: "A:EXISTING_LAYOUT",
    "disha-balancer": "B:DISHA_BALANCER", "disha-activation": "B:DISHA_ACTIVATION", "tattav-balancer": "B:TATTAV_BALANCER", "tattav-activation": "B:TATTAV_ACTIVATION", equaliser: "B:EQUALISER"
  };
  return values[scenario] ?? "A:EXISTING_LAYOUT";
}
