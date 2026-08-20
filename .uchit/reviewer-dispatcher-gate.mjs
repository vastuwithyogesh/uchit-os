import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const reviewer = readJson('.uchit/reviewer.json');
const dispatcher = readJson('.uchit/dispatcher.json');
const autonomy = readJson('.uchit/autonomy.json');

const failures = [];

if (reviewer.independentFromImplementer !== true) failures.push('Reviewer must be independent from implementer.');
if (!Array.isArray(reviewer.allowedDecisions) || reviewer.allowedDecisions.length < 3) failures.push('Reviewer decision contract is incomplete.');
if (!reviewer.allowedDecisions.includes('REQUEST_CHANGES')) failures.push('Reviewer must support REQUEST_CHANGES.');
if (!reviewer.allowedDecisions.includes('ESCALATE_RISK')) failures.push('Reviewer must support ESCALATE_RISK.');
if (dispatcher.maxRepairAttempts !== 3) failures.push('Dispatcher repair budget must remain 3 during M0.');
if (dispatcher.forbidden?.includes('direct push to main') !== true) failures.push('Dispatcher must forbid direct push to main.');
if (dispatcher.forbidden?.includes('self-approval') !== true) failures.push('Dispatcher must forbid self-approval.');

if (dispatcher.enabled === true) {
  if (reviewer.active !== true) failures.push('Dispatcher cannot activate before independent reviewer is active.');
  if (autonomy.dispatchEnabled !== true) failures.push('Dispatcher cannot activate while autonomy dispatchEnabled is false.');
}

if (reviewer.active === true && reviewer.mode === 'contract-only') failures.push('Active reviewer cannot remain contract-only.');

console.log('# Uchit Reviewer / Dispatcher Contract Gate');
console.log(`Reviewer: ${reviewer.active ? 'ACTIVE' : 'DORMANT'} (${reviewer.mode})`);
console.log(`Reviewer independent: ${reviewer.independentFromImplementer ? 'PASS' : 'FAIL'}`);
console.log(`Dispatcher: ${dispatcher.enabled ? 'ENABLED' : 'DORMANT'}`);
console.log(`Autonomy dispatch: ${autonomy.dispatchEnabled ? 'ENABLED' : 'DISABLED'}`);

if (failures.length) {
  console.error('\n## FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\n## PASS');
console.log('- Reviewer and dispatcher contracts are internally consistent.');
console.log('- No autonomous execution is authorized by this gate.');
