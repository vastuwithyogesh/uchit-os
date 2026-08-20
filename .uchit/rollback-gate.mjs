import fs from 'node:fs';

const rollback = JSON.parse(fs.readFileSync('.uchit/rollback.json', 'utf8'));
const autonomy = JSON.parse(fs.readFileSync('.uchit/autonomy.json', 'utf8'));
const reviewer = JSON.parse(fs.readFileSync('.uchit/reviewer.json', 'utf8'));

const errors = [];

if (rollback.executionEnabled !== false) errors.push('rollback execution must remain disabled during contract bootstrap');
if (rollback.automaticRollbackEnabled !== false) errors.push('automatic rollback must remain disabled during contract bootstrap');
if (rollback.productionMutationAllowed !== false) errors.push('rollback contract must not authorize production mutation yet');
if (rollback.knownGoodReleaseRequired !== true) errors.push('known-good release requirement must remain enabled');
if (rollback.postDeploySmokeRequired !== true) errors.push('post-deploy smoke must be required');
if (rollback.failedReleaseQuarantineRequired !== true) errors.push('failed release quarantine must be required');
if (rollback.incidentTicketRequired !== true) errors.push('incident ticket creation must be required');

if (autonomy.dispatchEnabled === true && rollback.executionEnabled !== true) {
  errors.push('autonomous dispatch cannot be enabled before rollback execution is governed and active');
}
if (autonomy.autoDeployEnabled === true && rollback.executionEnabled !== true) {
  errors.push('auto-deploy cannot be enabled before rollback execution is governed and active');
}
if (reviewer.executionEnabled === true && reviewer.contractOnly === true) {
  errors.push('active reviewer cannot remain contract-only');
}

console.log('# Uchit Rollback Contract Gate');
console.log(`Rollback execution: ${rollback.executionEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log(`Automatic rollback: ${rollback.automaticRollbackEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log(`Autonomous dispatch: ${autonomy.dispatchEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log(`Auto-deploy: ${autonomy.autoDeployEnabled ? 'ENABLED' : 'DISABLED'}`);

if (errors.length) {
  console.error('\n## FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('\n## PASS');
console.log('- Rollback/recovery contract is internally consistent and remains non-mutating.');
