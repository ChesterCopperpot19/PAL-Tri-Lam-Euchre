/* eslint-disable no-console */
// Unit test for the stats admin-key check (stats-auth.ts). Guards the two
// security-critical properties: fail-closed when unconfigured, and reject any
// key that isn't an exact match.
//   npx tsx scripts/stats-auth-check.ts

import assert from 'node:assert/strict';
import { isStatsAdmin } from '../src/lib/stats-auth';

let passed = 0;
const check = (l: string, fn: () => void) => { fn(); passed++; console.log('  ✓', l); };

check('fails closed when STATS_ADMIN_KEY is unset (nobody authorized)', () => {
  delete process.env.STATS_ADMIN_KEY;
  assert.equal(isStatsAdmin('anything'), false);
  assert.equal(isStatsAdmin(''), false);
  assert.equal(isStatsAdmin(undefined), false);
});

check('rejects wrong, empty, mis-typed, or off-by-one keys', () => {
  process.env.STATS_ADMIN_KEY = 'correct horse';
  assert.equal(isStatsAdmin('wrong'), false);
  assert.equal(isStatsAdmin(''), false);
  assert.equal(isStatsAdmin(undefined), false);
  assert.equal(isStatsAdmin(null), false);
  assert.equal(isStatsAdmin(12345), false);
  assert.equal(isStatsAdmin('correct hors'), false); // shorter
  assert.equal(isStatsAdmin('correct horsee'), false); // longer
  assert.equal(isStatsAdmin('Correct horse'), false); // case-sensitive
});

check('accepts only the exact configured key', () => {
  process.env.STATS_ADMIN_KEY = 'correct horse';
  assert.equal(isStatsAdmin('correct horse'), true);
});

delete process.env.STATS_ADMIN_KEY; // leave the env as we found it
console.log(`\nAll ${passed} stats-auth checks passed ✅`);
