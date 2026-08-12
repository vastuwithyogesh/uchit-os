import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const comms = fs.readFileSync(path.join(root, 'docs/founder-crm-communications-media-qualification-booking.md'), 'utf8');
const statutory = fs.readFileSync(path.join(root, 'docs/founder-statutory-documents.md'), 'utf8');

test('manual email recovery runbook preserves PREPARED/OPENED-only behavior', () => {
  for (const phrase of ['Open Gmail draft', 'Use default email app', 'Retry opening Gmail draft', 'PREPARED', 'OPENED', 'SENT', 'DELIVERED', 'mailto:']) {
    assert.match(comms, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')));
  }
  assert.match(comms, /missing recipient, inactive asset\/form, expired grant or missing template/);
  assert.match(comms, /No token or raw contact is written to logs/);
});

test('statutory readiness runbook is one-task and fail-closed', () => {
  for (const phrase of ['identity', 'recipient/billing', 'fixed Ludhiana place-of-supply policy', 'confirmed payment reconciliation', 'active Founder logo/signature assets', 'issue or retry', 'READY', 'REVIEW_REQUIRED', 'BLOCKED', 'OVERDUE', 'ISSUED']) {
    assert.match(statutory, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')));
  }
  assert.match(statutory, /no issue button/);
  assert.match(statutory, /within 60 minutes/);
  assert.match(statutory, /only after confirmed full payment/);
  assert.match(statutory, /cannot create a second number or artifact/);
});
