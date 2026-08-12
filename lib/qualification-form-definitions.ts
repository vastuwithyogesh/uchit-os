import { deterministicContentHash } from "./evaluation-provenance.ts";
import type { QualificationFormDefinitionRecord, QualificationKind, QualificationQuestionRecord } from "./domain.ts";
import { APPROVED_FOUNDER_ASSETS } from "./founder-media-manifest.ts";

const q = (id: string, sourcePage: number, section: string, prompt: string, kind: QualificationQuestionRecord["kind"], required = false, choices?: string[], shared = false): QualificationQuestionRecord => ({ id, sourcePage, section, prompt, kind, required, choices, shared });
const decisionChoices = ["Yes", "Joint decision", "No"];
const propertyStagesResidential = ["Existing / Occupied", "Under Construction", "Renovation / Remodeling", "Planned Purchase", "Vacant Plot / Planning Stage"];
const propertyStagesCommercial = ["Existing / Operational", "Under Construction", "Renovation / Remodeling", "Planned Purchase / Lease", "Vacant Plot / Planning Stage"];

const sharedQuestions = (prefix: string, page: number) => [
  q(`${prefix}.process-video`, page, "Process Video Confirmation", "Have you watched the full process video we shared?", "SINGLE", true, ["Yes", "Not yet"], true),
  q(`${prefix}.process-video-questions`, page, "Process Video Confirmation", "Any doubts / questions after watching?", "TEXT", false, undefined, true),
  q(`${prefix}.full-name`, page, "A. Basic Details", "Full Name", "TEXT", true, undefined, true),
  q(`${prefix}.date-of-birth`, page, "A. Basic Details", "Date of Birth", "DATE", false, undefined, true),
  q(`${prefix}.mobile-whatsapp`, page, "A. Basic Details", "Mobile / WhatsApp", "TEXT", true, undefined, true),
  q(`${prefix}.email-address`, page, "A. Basic Details", "Email Address", "TEXT", true, undefined, true),
  q(`${prefix}.city-country`, page, "A. Basic Details", "City & Country", "TEXT", true, undefined, true),
];

export const COMMERCIAL_QUESTIONS: QualificationQuestionRecord[] = [
  ...sharedQuestions("commercial", 1),
  q("commercial.business-company", 1, "B. Business Profile & Reason for Enquiry", "Business / Company", "TEXT", true),
  q("commercial.industry", 1, "B. Business Profile & Reason for Enquiry", "Industry / Nature", "TEXT", true),
  q("commercial.designation", 1, "B. Business Profile & Reason for Enquiry", "Designation / Role", "TEXT", true),
  q("commercial.business-scale", 1, "B. Business Profile & Reason for Enquiry", "Current Business Scale", "TEXT"),
  q("commercial.decision-maker", 1, "B. Business Profile & Reason for Enquiry", "Are you a final decision-maker for this consultation?", "SINGLE", true, decisionChoices),
  q("commercial.enquiry-reason", 1, "B. Business Profile & Reason for Enquiry", "What made you consider Uchit Vastu India at this point?", "TEXT", true),
  q("commercial.vision", 1, "B. Business Profile & Reason for Enquiry", "Business Vision / Key Goals for the Next 1-3 Years", "TEXT"),
  q("commercial.guidance-route", 1, "C. Commercial Property & Consultation Route", "Which type of guidance are you primarily seeking?", "MULTI", true, ["Existing Commercial Property Evaluation", "New Construction Vastu Planning", "Property / Plot Purchase Evaluation", "Renovation / Replanning", "Expansion / New Branch / Additional Unit", "Second Opinion / Re-evaluation", "Not sure - I need guidance"]),
  q("commercial.property-type", 1, "C. Commercial Property & Consultation Route", "Property Type", "SINGLE", true, ["Office", "Factory / Industrial Unit", "Showroom / Retail", "Clinic / Hospital", "Hotel / Hospitality", "Restaurant / Cafe", "Commercial Building", "Warehouse", "Educational / Institutional", "Other"]),
  q("commercial.property-stage", 1, "C. Commercial Property & Consultation Route", "Property Stage", "SINGLE", true, propertyStagesCommercial),
  q("commercial.ownership", 1, "C. Commercial Property & Consultation Route", "Ownership / Occupancy", "SINGLE", true, ["Owned", "Rented / Leased", "Purchase / Lease in Process", "Family / Group-Owned", "Other"]),
  q("commercial.property-location", 1, "C. Commercial Property & Consultation Route", "Property Location", "TEXT", true),
  q("commercial.area", 1, "C. Commercial Property & Consultation Route", "Approx. Area / Size", "TEXT"),
  q("commercial.property-description", 1, "C. Commercial Property & Consultation Route", "Brief Property Description", "TEXT"),
  q("commercial.documents", 1, "C. Commercial Property & Consultation Route", "Floor Plan / Photos / Drawings", "SINGLE", true, ["Attached", "Will share later", "Not available"]),
  q("commercial.review-areas", 2, "D. Current Situation & Business Priorities", "Which areas would you particularly like us to review?", "MULTI", true, ["Overall Vastu alignment", "Business growth / profitability", "Leadership / decision-making spaces", "Employee harmony / productivity", "Customer footfall / sales areas", "Operational flow / department placement", "Financial / accounts areas", "Health & wellbeing concerns", "Entrance / reception / cabins / workstations", "Machinery / production / storage zones", "Expansion / architectural planning", "Other"]),
  q("commercial.main-challenge", 2, "D. Current Situation & Business Priorities", "Main challenge or decision requiring guidance", "TEXT", true),
  q("commercial.duration", 2, "D. Current Situation & Business Priorities", "How long has this concern or requirement been present?", "TEXT"),
  q("commercial.desired-outcome", 2, "D. Current Situation & Business Priorities", "Desired outcome from the consultation", "TEXT", true),
  q("commercial.prior-consultation", 2, "D. Current Situation & Business Priorities", "Have you previously consulted another Vastu professional for this property?", "SINGLE", true, ["No", "Yes"]),
  q("commercial.prior-recommendation", 2, "D. Current Situation & Business Priorities", "If yes, what was recommended and what was implemented?", "TEXT"),
  q("commercial.pending-decision", 2, "E. Decision, Timeline & Readiness", "Is there a specific business or property decision currently waiting on this consultation?", "MULTI", true, ["Property purchase / lease", "Construction commencement", "Architectural planning", "Renovation / interiors", "Expansion / new branch", "Machinery / department layout", "Launch / opening / shifting", "Remedy implementation", "No immediate decision"]),
  q("commercial.deadline", 2, "E. Decision, Timeline & Readiness", "Decision Deadline", "TEXT"),
  q("commercial.guidance-needed", 2, "E. Decision, Timeline & Readiness", "Guidance Needed", "SINGLE", true, ["Immediately", "7 days", "30 days", "Exploring"]),
  q("commercial.decision-makers-aligned", 2, "E. Decision, Timeline & Readiness", "Have all key business / property decision-makers agreed to explore this consultation?", "SINGLE", true, ["Yes", "Partly", "Not yet"]),
  q("commercial.call-attendees", 2, "E. Decision, Timeline & Readiness", "Who should ideally attend the Private Review Call?", "TEXT"),
  q("commercial.implementation-openness", 2, "E. Decision, Timeline & Readiness", "If recommendations are practical and feasible, how open are you to implementing them?", "SINGLE", true, ["Very open", "Open, depending on feasibility", "Only limited changes possible", "Evaluation / second opinion only"]),
  q("commercial.investment", 3, "Investment Confirmation", "If, after the Private Review Call, we mutually determine that Uchit Vastu India is the right fit, which best describes you?", "SINGLE", true, ["I am comfortable proceeding with the required investment", "I would first like to understand the exact scope, process and deliverables", "I am currently researching and am not ready to proceed"]),
  q("commercial.language", 3, "F. Private Review Call", "Preferred Language", "SINGLE", true, ["Hindi", "English", "Hinglish"]),
  q("commercial.call-window", 3, "F. Private Review Call", "Preferred Days / Time Window", "TEXT"),
  q("commercial.source", 3, "F. Private Review Call", "How did you hear about Uchit Vastu India?", "SINGLE", false, ["Instagram", "YouTube", "Google Search", "AI / ChatGPT / AI Search", "Referral", "Existing Client", "Architect / Designer / Builder", "Event / Seminar", "Other"]),
  q("commercial.additional", 3, "F. Private Review Call", "Anything else we should know before the call?", "TEXT"),
  q("commercial.consent-confidentiality", 3, "G. Privacy & Consent", "I understand that Uchit Vastu India maintains strict confidentiality and will not disclose my identity, contact details, business information, property plans, drawings or photographs without explicit permission.", "CONSENT", true),
  q("commercial.consent-accuracy", 3, "G. Privacy & Consent", "I confirm that the information shared in this application is accurate to the best of my knowledge.", "CONSENT", true),
  q("commercial.consent-contact", 3, "G. Privacy & Consent", "I agree to be contacted by Uchit Vastu India for a Private Review Call and consultation-related communication.", "CONSENT", true),
  q("commercial.signature", 3, "G. Privacy & Consent", "Client Signature / Typed Name", "TEXT", true),
  q("commercial.signature-date", 3, "G. Privacy & Consent", "Date", "DATE", true),
];

export const RESIDENTIAL_QUESTIONS: QualificationQuestionRecord[] = [
  ...sharedQuestions("residential", 1),
  q("residential.primary-contact", 1, "B. Your Household & Reason for Enquiry", "Primary contact / relation to the property", "SINGLE", true, ["Homeowner", "Head of Household", "Family Member", "Tenant / Occupant"]),
  q("residential.decision-maker", 1, "B. Your Household & Reason for Enquiry", "Are you a final decision-maker for this consultation?", "SINGLE", true, decisionChoices),
  q("residential.residents", 1, "B. Your Household & Reason for Enquiry", "Number of Residents", "TEXT"),
  q("residential.enquiry-reason", 1, "B. Your Household & Reason for Enquiry", "What made you consider Uchit Vastu India at this point?", "TEXT", true),
  q("residential.vision", 1, "B. Your Household & Reason for Enquiry", "Family Vision / Key Goals for the Next 1-3 Years", "TEXT"),
  q("residential.property-type", 1, "C. Residential Property Details", "Property Type", "SINGLE", true, ["Apartment / Flat", "Independent House / Villa", "Builder Floor", "Duplex", "Farmhouse", "Plot / Vacant Land", "Other"]),
  q("residential.property-stage", 1, "C. Residential Property Details", "Property Stage", "SINGLE", true, propertyStagesResidential),
  q("residential.ownership", 1, "C. Residential Property Details", "Ownership / Occupancy", "SINGLE", true, ["Owned", "Rented / Leased", "Purchase in Process", "Family-Owned / Other"]),
  q("residential.property-location", 1, "C. Residential Property Details", "Property Location / Address", "TEXT", true),
  q("residential.area", 1, "C. Residential Property Details", "Approx. Area / Size", "TEXT"),
  q("residential.property-description", 1, "C. Residential Property Details", "Brief Property Description", "TEXT"),
  q("residential.documents", 2, "C. Residential Property Details", "Floor Plan / Photos", "SINGLE", true, ["Attached", "Will share later", "Not available"]),
  q("residential.guidance-route", 2, "D. Your Current Situation & Priorities", "Which type of guidance are you primarily seeking?", "MULTI", true, ["Existing Home Vastu Evaluation", "New Construction Vastu Planning", "Property / Plot Purchase Evaluation", "Renovation / Replanning", "Second Opinion / Re-evaluation", "Not sure - I need guidance"]),
  q("residential.review-areas", 2, "D. Your Current Situation & Priorities", "Which areas would you particularly like us to review?", "MULTI", true, ["Overall Vastu alignment", "Family harmony", "Health & wellbeing concerns", "Career / business growth", "Financial stability", "Children / studies / development", "Sleep / peace of mind", "Relationship concerns", "Entrance / kitchen / bedrooms / toilets", "Construction or architectural planning", "Other"]),
  q("residential.main-concern", 2, "D. Your Current Situation & Priorities", "Main concern or decision requiring guidance", "TEXT", true),
  q("residential.duration", 2, "D. Your Current Situation & Priorities", "How long has this concern been present?", "TEXT"),
  q("residential.desired-outcome", 2, "D. Your Current Situation & Priorities", "Desired outcome from the consultation", "TEXT", true),
  q("residential.prior-consultation", 2, "D. Your Current Situation & Priorities", "Have you previously consulted another Vastu professional for this property?", "SINGLE", true, ["No", "Yes"]),
  q("residential.prior-recommendation", 2, "D. Your Current Situation & Priorities", "If yes, what was recommended and what was implemented?", "TEXT"),
  q("residential.pending-decision", 2, "E. Decision, Timeline & Readiness", "Is there a specific decision currently waiting on this consultation?", "MULTI", true, ["Property purchase", "Construction commencement", "Architectural planning", "Renovation", "Interior planning", "Shifting into the property", "Remedy implementation", "No immediate decision"]),
  q("residential.deadline", 2, "E. Decision, Timeline & Readiness", "By when does this decision need to be made?", "TEXT"),
  q("residential.guidance-needed", 2, "E. Decision, Timeline & Readiness", "How soon do you require guidance?", "SINGLE", true, ["Immediately", "Within 7 days", "Within 30 days", "Just exploring"]),
  q("residential.decision-makers-aligned", 2, "E. Decision, Timeline & Readiness", "Have all key family decision-makers agreed to explore this consultation?", "SINGLE", true, ["Yes", "Partly", "Not yet"]),
  q("residential.call-attendees", 2, "E. Decision, Timeline & Readiness", "Who should ideally attend the Private Review Call?", "TEXT"),
  q("residential.implementation-openness", 2, "E. Decision, Timeline & Readiness", "If recommendations are practical and feasible, how open are you to implementing them?", "SINGLE", true, ["Very open", "Open, depending on feasibility", "Only minor changes possible", "Evaluation / second opinion only"]),
  q("residential.investment", 3, "Investment Confirmation", "If, after the Private Review Call, we mutually determine that Uchit Vastu India is the right fit, which best describes you?", "SINGLE", true, ["I am comfortable proceeding with the required investment", "I would first like to understand the exact scope, process and deliverables", "I am currently researching and am not ready to proceed"]),
  q("residential.language", 3, "F. Private Review Call", "Preferred Language", "SINGLE", true, ["Hindi", "English", "Hinglish"]),
  q("residential.call-window", 3, "F. Private Review Call", "Preferred Days / Time Window", "TEXT"),
  q("residential.source", 3, "F. Private Review Call", "How did you hear about Uchit Vastu India?", "SINGLE", false, ["Instagram", "YouTube", "Google Search", "AI / ChatGPT / AI Search", "Referral", "Existing Client", "Event / Seminar", "Other"]),
  q("residential.additional", 3, "F. Private Review Call", "Anything else we should know before the call?", "TEXT"),
  q("residential.consent-confidentiality", 3, "G. Privacy & Consent", "I understand that Uchit Vastu India maintains strict confidentiality and will not disclose my identity, contact details, property plans, photographs or personal information without explicit permission.", "CONSENT", true),
  q("residential.consent-accuracy", 3, "G. Privacy & Consent", "I confirm that the information shared in this application is accurate to the best of my knowledge.", "CONSENT", true),
  q("residential.consent-contact", 3, "G. Privacy & Consent", "I agree to be contacted by Uchit Vastu India for a Private Review Call and consultation-related communication.", "CONSENT", true),
  q("residential.signature", 3, "G. Privacy & Consent", "Client Signature / Typed Name", "TEXT", true),
  q("residential.signature-date", 3, "G. Privacy & Consent", "Date", "DATE", true),
];

export const APPROVED_CROSS_SERVICE_COPY = "Would you also like us to understand another property alongside this consultation? Many clients prefer to review their residential and business spaces together so that priorities can be considered more comprehensively. Selecting another property only adds it for preliminary review—it does not confirm a service or commercial commitment.";

function activeDefinition(kind: QualificationKind, sourceAssetKey: string, title: string, questions: QualificationQuestionRecord[]): QualificationFormDefinitionRecord {
  const asset = APPROVED_FOUNDER_ASSETS.find((item) => item.key === sourceAssetKey)!;
  const id = `qualification-${kind.toLowerCase()}-${asset.checksumSha256.slice(0, 12).toLowerCase()}`;
  const base = { id, organisationId: undefined, kind, version: 1, title, sourceAssetVersionId: sourceAssetKey, sourceChecksumSha256: asset.checksumSha256, questions, status: "ACTIVE" as const, createdAt: "2026-08-12T00:00:00.000Z" };
  return { ...base, definitionHash: deterministicContentHash(base) };
}

const hybridShared = sharedQuestions("hybrid", 1);
const withoutShared = (questions: QualificationQuestionRecord[]) => questions.filter((item) => !item.shared);
const onMasterPages = (questions: QualificationQuestionRecord[], pageOffset: number) => withoutShared(questions).map((question) => ({ ...question, sourcePage: question.sourcePage + pageOffset }));
export const APPROVED_QUALIFICATION_DEFINITIONS = {
  RESIDENTIAL: activeDefinition("RESIDENTIAL", "QUALIFICATION_RESIDENTIAL_V3", "Private Residential Client Application", RESIDENTIAL_QUESTIONS),
  COMMERCIAL: activeDefinition("COMMERCIAL", "QUALIFICATION_COMMERCIAL_V2", "Private Commercial Client Application", COMMERCIAL_QUESTIONS),
  HYBRID: activeDefinition("HYBRID", "QUALIFICATION_HYBRID_MASTER_V1", "Master Client Qualification & Application Form", [...hybridShared, ...onMasterPages(COMMERCIAL_QUESTIONS, 0), ...onMasterPages(RESIDENTIAL_QUESTIONS, 3)]),
} as const;

export function resolveQualificationKind(primary: "RESIDENTIAL" | "COMMERCIAL" | undefined, secondarySelected: boolean) {
  if (!primary) throw new Error("Choose Residential, Commercial or Hybrid; the qualification type cannot be guessed.");
  return secondarySelected ? "HYBRID" as const : primary;
}
