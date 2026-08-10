export const UTILITY_RULESET_FORMAT_VERSION = "utility-rules/v1";
export const UTILITY_EVALUATION_ALGORITHM_VERSION = "utility-first-zone-match/v1";
export const SHAKTI_ALGORITHM_VERSION = "shakti-element-average/v1";
export const SHAKTI_MAPPING_VERSION = "shakti-16-input-element-map/v1";
export const SHAKTI_ROUNDING_VERSION = "decimal-2-js-to-fixed/v1";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

// A small synchronous SHA-256 implementation keeps hashes identical in Node and Workers.
export function deterministicContentHash(value: unknown): string {
  const text = canonicalJson(value);
  const bytes = new TextEncoder().encode(text);
  const words: number[] = [];
  const bitLength = bytes.length * 8;
  for (const byte of bytes) words.push(byte);
  words.push(0x80);
  while (words.length % 64 !== 56) words.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) words.push(Math.floor(bitLength / 2 ** shift) & 0xff);

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotate = (n: number, bits: number) => (n >>> bits) | (n << (32 - bits));

  for (let offset = 0; offset < words.length; offset += 64) {
    const schedule = new Array<number>(64);
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      schedule[index] = ((words[base] << 24) | (words[base + 1] << 16) | (words[base + 2] << 8) | words[base + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = schedule[index - 15];
      const b = schedule[index - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (hh + sum1 + choice + k[index] + schedule[index]) >>> 0;
      const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      [hh, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
    }
    [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]] = [
      (h[0] + a) >>> 0, (h[1] + b) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0,
      (h[4] + e) >>> 0, (h[5] + f) >>> 0, (h[6] + g) >>> 0, (h[7] + hh) >>> 0
    ];
  }
  return `sha256:${h.map((part) => part.toString(16).padStart(8, "0")).join("")}`;
}

export function validateShaktiInputs(values: number[]) {
  if (values.length !== 16) throw new Error("Shakti engine expects exactly 16 values.");
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Shakti inputs must contain only finite numbers.");
  return [...values];
}
