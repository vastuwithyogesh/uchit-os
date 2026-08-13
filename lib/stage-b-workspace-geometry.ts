export type NormalizedPoint = { x: number; y: number };
export type NormalizedBox = NormalizedPoint & { width: number; height: number };

export const clampNormalized = (value: number, margin = 0) => Math.min(1 - margin, Math.max(margin, Number.isFinite(value) ? value : margin));

export function boxesOverlap(left: NormalizedBox, right: NormalizedBox, gap = 0.015) {
  return left.x < right.x + right.width + gap && left.x + left.width + gap > right.x && left.y < right.y + right.height + gap && left.y + left.height + gap > right.y;
}

export function boundedBox(box: NormalizedBox): NormalizedBox {
  const width = Math.min(0.45, Math.max(0.12, box.width));
  const height = Math.min(0.3, Math.max(0.08, box.height));
  return { x: Math.min(1 - width, Math.max(0, Number.isFinite(box.x) ? box.x : 0)), y: Math.min(1 - height, Math.max(0, Number.isFinite(box.y) ? box.y : 0)), width, height };
}

export function automaticCallout(anchor: NormalizedPoint, occupied: NormalizedBox[] = [], width = 0.26, height = 0.15): NormalizedBox {
  const candidates = [
    { x: anchor.x + 0.07, y: anchor.y - height - 0.05, width, height },
    { x: anchor.x - width - 0.07, y: anchor.y - height - 0.05, width, height },
    { x: anchor.x + 0.07, y: anchor.y + 0.05, width, height },
    { x: anchor.x - width - 0.07, y: anchor.y + 0.05, width, height }
  ].map(boundedBox);
  return candidates.find((candidate) => !occupied.some((box) => boxesOverlap(candidate, box))) ?? candidates[0];
}

export function collisionSafeBox(box: NormalizedBox, occupied: NormalizedBox[] = []): NormalizedBox {
  const desired = boundedBox(box);
  if (!occupied.some((item) => boxesOverlap(desired, item))) return desired;
  const gap = 0.016;
  const candidates = occupied.flatMap((item) => [
    { ...desired, x: item.x - desired.width - gap },
    { ...desired, x: item.x + item.width + gap },
    { ...desired, y: item.y - desired.height - gap },
    { ...desired, y: item.y + item.height + gap }
  ]).concat([
    { ...desired, x: 0, y: 0 },
    { ...desired, x: 1 - desired.width, y: 0 },
    { ...desired, x: 0, y: 1 - desired.height },
    { ...desired, x: 1 - desired.width, y: 1 - desired.height }
  ]).map(boundedBox).filter((candidate) => !occupied.some((item) => boxesOverlap(candidate, item)));
  return candidates.sort((left, right) =>
    ((left.x - desired.x) ** 2 + (left.y - desired.y) ** 2) - ((right.x - desired.x) ** 2 + (right.y - desired.y) ** 2)
  )[0] ?? desired;
}

export function pointFromRect(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): NormalizedPoint {
  return { x: clampNormalized((clientX - rect.left) / Math.max(1, rect.width)), y: clampNormalized((clientY - rect.top) / Math.max(1, rect.height)) };
}
