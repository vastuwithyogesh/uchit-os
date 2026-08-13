import type { ClientIntakeProfile } from "./domain.ts";

export type IntakeFieldKey = "challenge" | "outcome" | "service" | "propertyType" | "propertyStatus" | "cityCountry" | "floorCount" | "locationLink" | "latitude" | "longitude";
export type IntakeFieldErrors = Partial<Record<IntakeFieldKey, string>>;
const propertyTypes = new Set(["Residential", "Commercial", "Factory", "Shop", "Hospital", "Hotel", "Temple"]);
const serviceTypes = new Set(["EXISTING_SPACE", "NEW_CONSTRUCTION"]);

/** Single required-field and location contract shared by the screen, scorecard and server mutation. */
export function validateClientIntake(input: Record<string, unknown>): IntakeFieldErrors {
  const errors: IntakeFieldErrors = {};
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  if (!text("challenge")) errors.challenge = "Enter the client’s main challenge.";
  if (!text("outcome")) errors.outcome = "Enter the desired outcome.";
  if (!serviceTypes.has(text("service"))) errors.service = "Choose Existing Space or New Construction.";
  if (!propertyTypes.has(text("propertyType"))) errors.propertyType = "Choose an approved property type.";
  if (!text("propertyStatus")) errors.propertyStatus = "Enter the current property status.";
  if (!text("cityCountry")) errors.cityCountry = "Enter the city and country.";
  const floors = text("floorCount");
  if (floors && (!/^\d+$/.test(floors) || Number(floors) < 1 || Number(floors) > 200)) errors.floorCount = "Enter a whole number from 1 to 200, or leave this blank.";
  const locationLink = text("locationLink");
  if (locationLink) {
    try { const url = new URL(locationLink); if (url.protocol !== "https:" || !url.hostname || url.username || url.password || /^(localhost|127\.|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) errors.locationLink = "Enter a safe HTTPS map or location link."; }
    catch { errors.locationLink = "Enter a valid HTTPS map or location link."; }
  }
  const latitude = text("latitude"); const longitude = text("longitude");
  if (Boolean(latitude) !== Boolean(longitude)) { if (!latitude) errors.latitude = "Enter latitude with longitude."; if (!longitude) errors.longitude = "Enter longitude with latitude."; }
  if (latitude && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90)) errors.latitude = "Latitude must be between -90 and 90.";
  if (longitude && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180)) errors.longitude = "Longitude must be between -180 and 180.";
  return errors;
}

export function getClientIntakeCompleteness(profile: ClientIntakeProfile | undefined) {
  // Consent is retained only as source evidence; removed Founder consent
  // self-attestation never contributes to this completion result.
  const errors = validateClientIntake({ challenge: profile?.needs?.mainChallenge, outcome: profile?.needs?.desiredOutcome, service: profile?.propertyContext?.serviceInterest, propertyType: profile?.propertyContext?.propertyType, propertyStatus: profile?.propertyContext?.propertyStatus, cityCountry: profile?.propertyContext?.cityCountry, floorCount: profile?.propertyContext?.floorCount?.toString(), locationLink: profile?.propertyContext?.locationLink, latitude: profile?.propertyContext?.latitude?.toString(), longitude: profile?.propertyContext?.longitude?.toString() });
  const checks = [
    { key: "context", complete: !errors.challenge && !errors.outcome },
    { key: "propertyProject", complete: !errors.service && !errors.propertyType && !errors.propertyStatus && !errors.cityCountry && !errors.floorCount && !errors.locationLink && !errors.latitude && !errors.longitude }
  ];
  return { completed: checks.filter((item) => item.complete).length, total: checks.length, complete: checks.every((item) => item.complete), checks };
}
