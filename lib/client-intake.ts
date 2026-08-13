import type { ClientIntakeProfile } from "./domain.ts";

export function getClientIntakeCompleteness(profile: ClientIntakeProfile | undefined) {
  const checks = [
    { key: "contactPreference", complete: Boolean(profile?.contactPreference?.whatsapp || profile?.contactPreference?.preferredLanguage || profile?.contactPreference?.preferredContactWindow) },
    { key: "decisionMaker", complete: Boolean(profile?.decisionMakerStatus) },
    { key: "propertyContext", complete: Boolean(profile?.propertyContext?.serviceInterest && profile?.propertyContext?.propertyType) },
    { key: "needs", complete: Boolean(profile?.needs?.mainChallenge && profile?.needs?.desiredOutcome) },
    // Consent evidence remains authoritative at its source. It is deliberately
    // not a Founder self-attestation or an intake-save gate.
    { key: "consent", complete: true }
  ];
  return { completed: checks.filter((item) => item.complete).length, total: checks.length, complete: checks.every((item) => item.complete), checks };
}
