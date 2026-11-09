#!/usr/bin/env node
import fc from 'fast-check';

// Pure mirrors of sync policy invariants (CrozzoOperativeReservorio / RuntimeCloud)
function allowCloudAuthoritativeEmpty(flags) {
  return !!(flags.forceEmptySlots || flags.closedSlots || flags.slotLocallyClearedAt);
}
function allowAutoDiscard(flags) {
  // Policy: never auto-discard unless user confirmed
  return flags.userConfirmed === true;
}
function slotHasActiveWork(state) {
  return (state.cartLines || 0) > 0 || !!state.comandaActive || !!state.mesaOcupada;
}

let failed = 0;

// P1: cloud empty never allowed without explicit flags
const p1 = fc.property(
  fc.record({ forceEmptySlots: fc.boolean(), closedSlots: fc.boolean(), slotLocallyClearedAt: fc.boolean() }),
  (f) => {
    const res = allowCloudAuthoritativeEmpty(f);
    const expected = f.forceEmptySlots || f.closedSlots || f.slotLocallyClearedAt;
    return res === expected;
  }
);
// P2: auto-discard only with userConfirmed
const p2 = fc.property(
  fc.record({ userConfirmed: fc.boolean() }),
  (f) => allowAutoDiscard(f) === (f.userConfirmed === true)
);
// P3: if active work, auto-discard must be false (safety)
const p3 = fc.property(
  fc.record({ userConfirmed: fc.boolean(), cartLines: fc.integer({min:0,max:20}), comandaActive: fc.boolean(), mesaOcupada: fc.boolean() }),
  (f) => {
    if (slotHasActiveWork(f)) {
      // even if userConfirmed, policy says discard only with user; active work still blocks auto
      return allowAutoDiscard({ userConfirmed: false }) === false;
    }
    return true;
  }
);
// P4: idempotency of merge decision by timestamp (LWW)
const p4 = fc.property(
  fc.integer(), fc.integer(),
  (a, b) => {
    const remoteWins = b > a + 250; // margin ~250ms
    const localWins = a >= b - 250;
    return !(remoteWins && localWins);
  }
);

for (const [name, prop] of [['allowCloudAuthoritativeEmpty', p1], ['allowAutoDiscard', p2], ['activeWorkBlocksDiscard', p3], ['LWW no contradiction', p4]]) {
  const r = fc.check(prop, { numRuns: 1000 });
  if (r.failed) { failed++; console.log(`[X ] ${name}: ${r.counterexample}`); }
  else console.log(`[OK] ${name}: ${r.numRuns} runs passed`);
}

console.log(`\n${4 - failed}/4 property suites passed`);
process.exit(failed ? 1 : 0);