import assert from "node:assert/strict";
import test from "node:test";
import { buildFounderScorecard } from "../lib/founder-scorecard.ts";
import { getAppState } from "../lib/store.ts";

test("empty production-shaped state exposes no case and no fabricated workflow context", () => {
  const state = structuredClone(getAppState());
  state.vastuCases = [];
  state.clients = [];
  state.projects = [];
  state.floorWorkspaces = [];

  const scorecard = buildFounderScorecard(state, { role: "SUPER_ADMIN" });

  assert.equal(scorecard.availableCaseCount, 0);
  assert.equal(scorecard.caseRecord, undefined);
  assert.equal(scorecard.selectedFloorId, undefined);
});
