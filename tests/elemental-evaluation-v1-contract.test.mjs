import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateAllElementalDirections,
  evaluateElementalDirection,
  ELEMENTAL_EVAL_DIRECTION_GROUPS,
  ElementalEvaluationValidationError,
} from "../lib/elemental-evaluation-v1.ts";

const moduleSource = () =>
  readFileSync(new URL("../lib/elemental-evaluation-v1.ts", import.meta.url), "utf8");

const bars = ["WITHIN_BAND", "ABOVE_RED", "BELOW_BLUE"];

const stateForPattern = (directions, index) =>
  directions.map((direction, i) => ({ direction, state: bars[Math.floor((index / Math.pow(3, i)) % 3)] }));

const expectedForPattern = (directionStates) => {
  const above = directionStates.filter((entry) => entry.state === "ABOVE_RED");
  const below = directionStates.filter((entry) => entry.state === "BELOW_BLUE");
  if (above.length > 0 && below.length > 0) {
    return {
      verdict: "BALANCE",
      correctionScope: "WHOLE_ELEMENT",
      remedyType: "EQUALISER",
      reasonCode: "RULE_1_MIXED_HIGH_AND_LOW",
      expectedTarget: null,
    };
  }
  if (above.length >= 2) {
    return {
      verdict: "SUPPRESS",
      correctionScope: "WHOLE_ELEMENT",
      remedyType: "TATTAV_BALANCER",
      reasonCode: "RULE_2_MULTI_ABOVE",
      expectedTarget: null,
    };
  }
  if (above.length === 1) {
    return {
      verdict: "GROUND",
      correctionScope: "SPECIFIC_DIRECTION",
      remedyType: "DISHA_BALANCER",
      reasonCode: "RULE_3_SINGLE_ABOVE",
      expectedTarget: above[0].direction,
    };
  }
  if (below.length >= 2) {
    return {
      verdict: "UPLIFT",
      correctionScope: "WHOLE_ELEMENT",
      remedyType: "TATTAV_ACTIVATION",
      reasonCode: "RULE_4_MULTI_BELOW",
      expectedTarget: null,
    };
  }
  if (below.length === 1) {
    return {
      verdict: "PROMOTE",
      correctionScope: "SPECIFIC_DIRECTION",
      remedyType: "DISHA_ACTIVATION",
      reasonCode: "RULE_5_SINGLE_BELOW",
      expectedTarget: below[0].direction,
    };
  }
  return {
    verdict: "BALANCE",
    correctionScope: "WHOLE_ELEMENT",
    remedyType: "EQUALISER",
    reasonCode: "RULE_6_ALL_WITHIN",
    expectedTarget: null,
  };
};

test("all WITHIN_BAND resolves to BALANCE / Equaliser", () => {
  for (const [element, directions] of Object.entries(ELEMENTAL_EVAL_DIRECTION_GROUPS)) {
    const result = evaluateElementalDirection({
      element,
      directions: directions.map((direction) => ({ direction, state: "WITHIN_BAND" })),
    });
    assert.equal(result.element, element);
    assert.equal(result.verdict, "BALANCE");
    assert.equal(result.correctionScope, "WHOLE_ELEMENT");
    assert.equal(result.remedyType, "EQUALISER");
    assert.equal(result.reasonCode, "RULE_6_ALL_WITHIN");
    assert.equal(result.targetDirection, undefined);
  }
});

test("exactly one ABOVE_RED → GROUND / SPECIFIC_DIRECTION / DISHA_BALANCER", () => {
  const result = evaluateElementalDirection({
    element: "WATER",
    directions: [
      { direction: "NNW", state: "WITHIN_BAND" },
      { direction: "N", state: "ABOVE_RED" },
      { direction: "NNE", state: "WITHIN_BAND" },
      { direction: "NE", state: "WITHIN_BAND" },
    ],
  });
  assert.equal(result.verdict, "GROUND");
  assert.equal(result.correctionScope, "SPECIFIC_DIRECTION");
  assert.equal(result.targetDirection, "N");
  assert.equal(result.remedyType, "DISHA_BALANCER");
  assert.equal(result.reasonCode, "RULE_3_SINGLE_ABOVE");
});

test("2+ ABOVE_RED → SUPPRESS / WHOLE_ELEMENT / TATTAV_BALANCER", () => {
  const result = evaluateElementalDirection({
    element: "AIR",
    directions: [
      { direction: "ENE", state: "ABOVE_RED" },
      { direction: "E", state: "ABOVE_RED" },
      { direction: "ESE", state: "WITHIN_BAND" },
    ],
  });
  assert.equal(result.verdict, "SUPPRESS");
  assert.equal(result.correctionScope, "WHOLE_ELEMENT");
  assert.equal(result.remedyType, "TATTAV_BALANCER");
  assert.equal(result.targetDirection, undefined);
  assert.equal(result.reasonCode, "RULE_2_MULTI_ABOVE");
});

test("3+ ABOVE_RED also resolves SUPPRESS", () => {
  const result = evaluateElementalDirection({
    element: "AIR",
    directions: [
      { direction: "ENE", state: "ABOVE_RED" },
      { direction: "E", state: "ABOVE_RED" },
      { direction: "ESE", state: "ABOVE_RED" },
    ],
  });
  assert.equal(result.verdict, "SUPPRESS");
  assert.equal(result.correctionScope, "WHOLE_ELEMENT");
  assert.equal(result.remedyType, "TATTAV_BALANCER");
});

test("exactly 1 BELOW_BLUE → PROMOTE / SPECIFIC_DIRECTION / DISHA_ACTIVATION", () => {
  const result = evaluateElementalDirection({
    element: "SPACE",
    directions: [
      { direction: "W", state: "WITHIN_BAND" },
      { direction: "WNW", state: "WITHIN_BAND" },
      { direction: "NW", state: "BELOW_BLUE" },
    ],
  });
  assert.equal(result.verdict, "PROMOTE");
  assert.equal(result.correctionScope, "SPECIFIC_DIRECTION");
  assert.equal(result.targetDirection, "NW");
  assert.equal(result.remedyType, "DISHA_ACTIVATION");
  assert.equal(result.reasonCode, "RULE_5_SINGLE_BELOW");
});

test("2+ BELOW_BLUE → UPLIFT / WHOLE_ELEMENT / TATTAV_ACTIVATION", () => {
  const result = evaluateElementalDirection({
    element: "SPACE",
    directions: [
      { direction: "W", state: "BELOW_BLUE" },
      { direction: "WNW", state: "BELOW_BLUE" },
      { direction: "NW", state: "WITHIN_BAND" },
    ],
  });
  assert.equal(result.verdict, "UPLIFT");
  assert.equal(result.correctionScope, "WHOLE_ELEMENT");
  assert.equal(result.remedyType, "TATTAV_ACTIVATION");
  assert.equal(result.targetDirection, undefined);
  assert.equal(result.reasonCode, "RULE_4_MULTI_BELOW");
});

test("3+ BELOW_BLUE also resolves UPLIFT", () => {
  const result = evaluateElementalDirection({
    element: "SPACE",
    directions: [
      { direction: "W", state: "BELOW_BLUE" },
      { direction: "WNW", state: "BELOW_BLUE" },
      { direction: "NW", state: "BELOW_BLUE" },
    ],
  });
  assert.equal(result.verdict, "UPLIFT");
  assert.equal(result.correctionScope, "WHOLE_ELEMENT");
  assert.equal(result.remedyType, "TATTAV_ACTIVATION");
});

test("mixed ABOVE_RED + BELOW_BLUE yields BALANCE regardless of majority", () => {
  const result = evaluateElementalDirection({
    element: "FIRE",
    directions: [
      { direction: "SE", state: "ABOVE_RED" },
      { direction: "SSE", state: "ABOVE_RED" },
      { direction: "S", state: "BELOW_BLUE" },
    ],
  });
  assert.equal(result.verdict, "BALANCE");
  assert.equal(result.correctionScope, "WHOLE_ELEMENT");
  assert.equal(result.remedyType, "EQUALISER");
  assert.equal(result.reasonCode, "RULE_1_MIXED_HIGH_AND_LOW");
});

test("mixed precedence beats UPLIFT", () => {
  const result = evaluateElementalDirection({
    element: "EARTH",
    directions: [
      { direction: "SSW", state: "BELOW_BLUE" },
      { direction: "SW", state: "BELOW_BLUE" },
      { direction: "WSW", state: "ABOVE_RED" },
    ],
  });
  assert.equal(result.verdict, "BALANCE");
});

test("mixed precedence beats SUPPRESS", () => {
  const result = evaluateElementalDirection({
    element: "FIRE",
    directions: [
      { direction: "SE", state: "ABOVE_RED" },
      { direction: "SSE", state: "ABOVE_RED" },
      { direction: "S", state: "BELOW_BLUE" },
    ],
  });
  assert.equal(result.verdict, "BALANCE");
});

test("Water four-direction combinations are contract-complete and deterministic", () => {
  const directions = ELEMENTAL_EVAL_DIRECTION_GROUPS.WATER;
  const patterns = Math.pow(3, directions.length); // 81
  assert.equal(patterns, 81);
  for (let i = 0; i < patterns; i += 1) {
    const input = stateForPattern(directions, i);
    const actual = evaluateElementalDirection({ element: "WATER", directions: input });
    const expected = expectedForPattern(input);
    const expectedKeys = new Set(["SUPPRESS", "GROUND", "UPLIFT", "PROMOTE", "BALANCE"]);
    assert.equal(expectedKeys.has(actual.verdict), true);
    assert.equal(actual.verdict, expected.verdict);
    assert.equal(actual.correctionScope, expected.correctionScope);
    assert.equal(actual.remedyType, expected.remedyType);
    assert.equal(actual.reasonCode, expected.reasonCode);
    if (expected.expectedTarget) {
      assert.equal(actual.targetDirection, expected.expectedTarget);
    } else {
      assert.equal(actual.targetDirection, undefined);
    }
  }
});

test("three-direction elements are complete and deterministic", () => {
  const threeDirElements = ["AIR", "FIRE", "SPACE"];
  for (const element of threeDirElements) {
    const directions = ELEMENTAL_EVAL_DIRECTION_GROUPS[element];
    const patterns = Math.pow(3, directions.length); // 27
    assert.equal(patterns, 27);
    const seen = new Set();
    for (let i = 0; i < patterns; i += 1) {
      const input = stateForPattern(directions, i);
      const actual = evaluateElementalDirection({ element, directions: input });
      const expected = expectedForPattern(input);
      assert.equal(actual.element, element);
      assert.equal(actual.verdict, expected.verdict);
      assert.equal(actual.correctionScope, expected.correctionScope);
      assert.equal(actual.remedyType, expected.remedyType);
      assert.equal(actual.reasonCode, expected.reasonCode);
      if (expected.expectedTarget) {
        assert.equal(actual.targetDirection, expected.expectedTarget);
      } else {
        assert.equal(actual.targetDirection, undefined);
      }
      seen.add(`${actual.verdict}|${actual.correctionScope}|${actual.remedyType}|${actual.targetDirection ?? ""}`);
    }
    assert.ok(seen.size >= 2);
  }
});

test("WSW resolves under EARTH", () => {
  const waterGroup = ELEMENTAL_EVAL_DIRECTION_GROUPS.WATER;
  const earthGroup = ELEMENTAL_EVAL_DIRECTION_GROUPS.EARTH;
  assert.equal(waterGroup.includes("WSW"), false);
  assert.equal(earthGroup.includes("WSW"), true);
});

test("remedy mapping is exact lock", () => {
  const cases = [
    {
      dirs: [{ direction: "ENE", state: "ABOVE_RED" }, { direction: "E", state: "ABOVE_RED" }, { direction: "ESE", state: "WITHIN_BAND" }],
      expected: "TATTAV_BALANCER",
    },
    {
      dirs: [{ direction: "ENE", state: "ABOVE_RED" }, { direction: "E", state: "WITHIN_BAND" }, { direction: "ESE", state: "WITHIN_BAND" }],
      expected: "DISHA_BALANCER",
    },
    {
      dirs: [{ direction: "ENE", state: "BELOW_BLUE" }, { direction: "E", state: "BELOW_BLUE" }, { direction: "ESE", state: "WITHIN_BAND" }],
      expected: "TATTAV_ACTIVATION",
    },
    {
      dirs: [{ direction: "ENE", state: "BELOW_BLUE" }, { direction: "E", state: "WITHIN_BAND" }, { direction: "ESE", state: "WITHIN_BAND" }],
      expected: "DISHA_ACTIVATION",
    },
    {
      dirs: [{ direction: "ENE", state: "WITHIN_BAND" }, { direction: "E", state: "WITHIN_BAND" }, { direction: "ESE", state: "WITHIN_BAND" }],
      expected: "EQUALISER",
    },
  ];
  for (const item of cases) {
    const result = evaluateElementalDirection({
      element: "AIR",
      directions: item.dirs,
    });
    assert.equal(result.remedyType, item.expected);
  }
  assert.equal(evaluateElementalDirection({
    element: "WATER",
    directions: [
      { direction: "NNW", state: "WITHIN_BAND" },
      { direction: "N", state: "WITHIN_BAND" },
      { direction: "NNE", state: "WITHIN_BAND" },
      { direction: "NE", state: "WITHIN_BAND" },
    ],
  }).verdict, "BALANCE");
});

test("evaluateAllElementalDirections returns exactly five outputs", () => {
  const all = evaluateAllElementalDirections([
    { direction: "N", state: "WITHIN_BAND" },
    { direction: "NNE", state: "WITHIN_BAND" },
    { direction: "NE", state: "WITHIN_BAND" },
    { direction: "ENE", state: "WITHIN_BAND" },
    { direction: "E", state: "WITHIN_BAND" },
    { direction: "ESE", state: "WITHIN_BAND" },
    { direction: "SE", state: "WITHIN_BAND" },
    { direction: "SSE", state: "WITHIN_BAND" },
    { direction: "S", state: "WITHIN_BAND" },
    { direction: "SSW", state: "WITHIN_BAND" },
    { direction: "SW", state: "WITHIN_BAND" },
    { direction: "WSW", state: "WITHIN_BAND" },
    { direction: "W", state: "WITHIN_BAND" },
    { direction: "WNW", state: "WITHIN_BAND" },
    { direction: "NW", state: "WITHIN_BAND" },
    { direction: "NNW", state: "WITHIN_BAND" },
  ]);
  const elements = all.map((result) => result.element).sort();
  assert.deepEqual(elements, ["AIR", "EARTH", "FIRE", "SPACE", "WATER"]);
  assert.equal(all.length, 5);
});

test("input order does not affect 5-element deterministic output", () => {
  const canonical = [
    { direction: "N", state: "BELOW_BLUE" },
    { direction: "NNE", state: "WITHIN_BAND" },
    { direction: "NE", state: "ABOVE_RED" },
    { direction: "ENE", state: "WITHIN_BAND" },
    { direction: "E", state: "WITHIN_BAND" },
    { direction: "ESE", state: "WITHIN_BAND" },
    { direction: "SE", state: "WITHIN_BAND" },
    { direction: "SSE", state: "WITHIN_BAND" },
    { direction: "S", state: "WITHIN_BAND" },
    { direction: "SSW", state: "WITHIN_BAND" },
    { direction: "SW", state: "WITHIN_BAND" },
    { direction: "WSW", state: "BELOW_BLUE" },
    { direction: "W", state: "WITHIN_BAND" },
    { direction: "WNW", state: "WITHIN_BAND" },
    { direction: "NW", state: "WITHIN_BAND" },
    { direction: "NNW", state: "WITHIN_BAND" },
  ];
  const shuffled = [
    { direction: "ENE", state: "WITHIN_BAND" },
    { direction: "W", state: "WITHIN_BAND" },
    { direction: "N", state: "BELOW_BLUE" },
    { direction: "NW", state: "WITHIN_BAND" },
    { direction: "S", state: "WITHIN_BAND" },
    { direction: "SE", state: "WITHIN_BAND" },
    { direction: "SSW", state: "WITHIN_BAND" },
    { direction: "E", state: "WITHIN_BAND" },
    { direction: "NNW", state: "WITHIN_BAND" },
    { direction: "SW", state: "WITHIN_BAND" },
    { direction: "SSE", state: "WITHIN_BAND" },
    { direction: "ESE", state: "WITHIN_BAND" },
    { direction: "WNW", state: "WITHIN_BAND" },
    { direction: "NNE", state: "WITHIN_BAND" },
    { direction: "NE", state: "ABOVE_RED" },
    { direction: "WSW", state: "BELOW_BLUE" },
  ];
  const canonicalResult = evaluateAllElementalDirections(canonical);
  const shuffledResult = evaluateAllElementalDirections(shuffled);
  assert.deepEqual(
    canonicalResult.map((entry) => JSON.stringify(entry)),
    shuffledResult.map((entry) => JSON.stringify(entry)),
  );
});

test("input validation rejects missing/duplicate/unknown/malformed/extra directions", () => {
  assert.throws(
    () =>
      evaluateElementalDirection({
        element: "FIRE",
        directions: [
          { direction: "SE", state: "ABOVE_RED" },
          { direction: "SSE", state: "WITHIN_BAND" },
        ],
      }),
    ElementalEvaluationValidationError,
  );
  assert.throws(
    () =>
      evaluateElementalDirection({
        element: "FIRE",
        directions: [
          { direction: "SE", state: "WITHIN_BAND" },
          { direction: "SSE", state: "WITHIN_BAND" },
          { direction: "SSE", state: "ABOVE_RED" },
        ],
      }),
    ElementalEvaluationValidationError,
  );
  assert.throws(
    () =>
      evaluateElementalDirection({
        element: "FIRE",
        directions: [
          { direction: "SE", state: "WITHIN_BAND" },
          { direction: "SSE", state: "WITHIN_BAND" },
          { direction: "S", state: "INVALID_STATE" },
        ],
      }),
    ElementalEvaluationValidationError,
  );
  assert.throws(
    () =>
      evaluateElementalDirection({
        element: "FIRE",
        directions: [
          { direction: "SE", state: "WITHIN_BAND" },
          { direction: "SSE", state: "WITHIN_BAND" },
          { direction: "S", state: "WITHIN_BAND" },
          { direction: "N", state: "WITHIN_BAND" },
        ],
      }),
    ElementalEvaluationValidationError,
  );
  assert.throws(
    () =>
      evaluateElementalDirection({
        element: "FIRE",
        directions: [
          { direction: "SE", state: "WITHIN_BAND" },
          { direction: "ZZ", state: "WITHIN_BAND" },
          { direction: "S", state: "WITHIN_BAND" },
        ],
      }),
    ElementalEvaluationValidationError,
  );
});

test("full-set cardinality is validated", () => {
  assert.throws(() => evaluateAllElementalDirections([]), ElementalEvaluationValidationError);
  assert.throws(() => evaluateAllElementalDirections([
    { direction: "N", state: "WITHIN_BAND" },
    { direction: "NNE", state: "WITHIN_BAND" },
    { direction: "NE", state: "WITHIN_BAND" },
  ]), ElementalEvaluationValidationError);
});

test("one element returns exactly one verdict/one remedy", () => {
  const result = evaluateElementalDirection({
    element: "EARTH",
    directions: [
      { direction: "SSW", state: "ABOVE_RED" },
      { direction: "SW", state: "WITHIN_BAND" },
      { direction: "WSW", state: "WITHIN_BAND" },
    ],
  });
  assert.equal(typeof result.verdict, "string");
  assert.equal(typeof result.remedyType, "string");
  assert.equal(result.correctionScope, "SPECIFIC_DIRECTION");
  assert.equal(result.targetDirection, "SSW");
});

test("module does not import legacy Shakti/UtilityGraph symbols", () => {
  const source = moduleSource();
  assert.equal(source.includes("rankShakti"), false);
  assert.equal(source.includes("calculateUtilityGraphVerdict"), false);
  assert.equal(source.includes("tolerance"), false);
  assert.equal(source.includes("near"), false);
});
