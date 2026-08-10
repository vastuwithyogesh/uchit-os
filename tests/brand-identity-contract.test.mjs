import test from "node:test";
import assert from "node:assert/strict";
import { source } from "./helpers/source-contracts.mjs";

test("the shared interface uses the approved restrained brand palette", () => {
  const css = source("app/globals.css");
  for (const color of ["#f7f5f2", "#111111", "#2d2d2d", "#888888", "#b08d57"]) {
    assert.match(css.toLowerCase(), new RegExp(color));
  }
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(css.toLowerCase(), /#9a4e24|#176b62|#7c3aed/);
});

test("header uses a safe text lockup and preserves accessible navigation", () => {
  const header = source("components/site-header.tsx");
  assert.match(header, /aria-label="Uchit Vastu India home"/);
  assert.match(header, /className="brand-name">UCHIT/);
  assert.match(header, /className="brand-descriptor">VASTU INDIA/);
  assert.match(header, /aria-label="Main navigation"/);
  assert.doesNotMatch(header, /Gold UCHIT|brand story\.png|<img/);
});

test("metadata does not publish the unapproved generated social image", () => {
  const layout = source("app/layout.tsx");
  assert.match(layout, /Uchit Vastu India Workspace/);
  assert.doesNotMatch(layout, /og\.png|summary_large_image/);
});
