import "server-only";
import type { AppState } from "./store.ts";

/**
 * Loopback page adapter only. The Node-backed pilot fixture never crosses into
 * a client module: this function returns only the server-built serializable
 * state that the scorecard needs to render its privacy-safe projection.
 */
export async function buildLocalFounderWalkthroughState(): Promise<AppState> {
  // @ts-ignore This test fixture is intentionally JavaScript and server-only.
  const fixture = await import("../tests/fixtures/founder-pilot-fixture.mjs");
  const state = structuredClone(fixture.buildReleaseableFounderPilotFixture().state) as AppState;
  const profile = state.clientIntakeProfiles[0];
  if (profile) {
    profile.contactPreference = { whatsapp: "+910000000001", preferredLanguage: "English" };
    profile.decisionMakerStatus = "SOLE";
    profile.propertyContext = { ...profile.propertyContext, propertyType: "Residential", propertyStatus: "Existing", cityCountry: "Test-only location", floorCount: 1, locationLink: "https://maps.example.test/test-only", latitude: 28.6139, longitude: 77.209 };
  }
  const floor = state.floorWorkspaces[0];
  if (floor) floor.stageAVerdictStatus = "PRESENTED";
  return state;
}
