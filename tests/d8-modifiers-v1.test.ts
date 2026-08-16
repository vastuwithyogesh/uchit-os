import assert from "node:assert/strict";
import test from "node:test";
import { D8_CUTOUT_RULES, D8_EXTENSION_RULES, D8_OPEN_SIDE_PATTERNS, evaluateD8Modifier } from "../lib/d8-modifiers-v1.ts";

test("cutout and extension catalogs preserve all eight directions", () => { assert.equal(D8_CUTOUT_RULES.length, 8); assert.equal(D8_EXTENSION_RULES.length, 8); });
test("cutout requires explicit confirmed condition", () => { assert.equal(evaluateD8Modifier({ modifier: "CUT_OUT", direction: "N" }).kind, "REVIEW_REQUIRED"); assert.equal(evaluateD8Modifier({ modifier: "CUT_OUT", direction: "N", confirmed: true }).kind, "RESOLVED"); });
test("extension is an independent rule, not an opposite cutout", () => { const result = evaluateD8Modifier({ modifier: "EXTENSION", direction: "SW", confirmed: true }); assert.equal(result.kind, "RESOLVED"); if (result.kind === "RESOLVED") assert.match(result.rule?.interpretation ?? "", /Amplifies/); });
test("opening is not silently classified as cutout", () => { assert.equal(evaluateD8Modifier({ modifier: "CUT_OUT", direction: "E", confirmed: false }).kind, "REVIEW_REQUIRED"); });
test("open-side requires one exact locked pattern", () => { assert.equal(D8_OPEN_SIDE_PATTERNS.length, 11); assert.equal(evaluateD8Modifier({ modifier: "OPEN_SIDE", openSidePattern: "N+E" }).kind, "RESOLVED"); assert.equal(evaluateD8Modifier({ modifier: "OPEN_SIDE", openSidePattern: "N+E+S" }).kind, "REVIEW_REQUIRED"); });
test("marga vedha and corner remain explicit inputs", () => { assert.equal(evaluateD8Modifier({ modifier: "MARGA_VEDHA", direction: "W", confirmed: true }).kind, "RESOLVED"); assert.equal(evaluateD8Modifier({ modifier: "CORNER" }).kind, "REVIEW_REQUIRED"); });
