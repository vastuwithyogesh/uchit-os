import assert from "node:assert/strict";
import test from "node:test";
import { automaticCallout, boundedBox, boxesOverlap, collisionSafeBox, pointFromRect } from "./stage-b-workspace-geometry.ts";

test("Stage B workspace geometry stays inside printable normalized bounds", () => {
  assert.deepEqual(pointFromRect(-20, 250, { left: 0, top: 0, width: 100, height: 100 }), { x: 0, y: 1 });
  assert.deepEqual(boundedBox({ x: .95, y: -.2, width: .26, height: .15 }), { x: .74, y: 0, width: .26, height: .15 });
});

test("automatic callouts avoid the first occupied printable region deterministically", () => {
  const first = automaticCallout({ x: .5, y: .5 });
  const second = automaticCallout({ x: .5, y: .5 }, [first]);
  assert.equal(boxesOverlap(first, second), false);
  assert.deepEqual(automaticCallout({ x: .5, y: .5 }, [first]), second);
});

test("dragged callouts remain print-safe and avoid completed callouts", () => {
  const occupied = { x: .5, y: .4, width: .26, height: .15 };
  const moved = collisionSafeBox({ x: .55, y: .42, width: .26, height: .15 }, [occupied]);
  assert.equal(boxesOverlap(moved, occupied), false);
  assert.ok(moved.x >= 0 && moved.y >= 0);
  assert.ok(moved.x + moved.width <= 1 && moved.y + moved.height <= 1);
  assert.deepEqual(collisionSafeBox({ x: .9, y: .94, width: .26, height: .15 }), { x: .74, y: .85, width: .26, height: .15 });
});
