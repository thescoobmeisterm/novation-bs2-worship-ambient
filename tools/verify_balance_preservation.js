import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sysex from './sysex.js';
import { control, control_id } from './cc.js';
import { hardwareBalance, reviseHardwarePatch } from './hardware_balance.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backup = process.argv[2];
assert.ok(backup, 'Usage: node tools/verify_balance_preservation.js <backup-directory>');
const baseline = fs.readFileSync(path.join(backup, 'patches/PostRock_Ambient_Worship_Bank.syx'));
const current = fs.readFileSync(path.join(root, 'patches/PostRock_Ambient_Worship_Bank.syx'));
assert.equal(current.length, baseline.length);
const changed = [];
for (let slot = 0; slot < 128; slot++) {
    const before = baseline.subarray(slot * 154, (slot + 1) * 154);
    const after = current.subarray(slot * 154, (slot + 1) * 154);
    const revision = hardwareBalance[slot];
    if (!revision) { assert.deepEqual(after, before, `Untargeted slot ${slot} changed`); continue; }
    assert.notDeepEqual(before, after);
    const masks = new Uint8Array(154);
    for (const key of Object.keys(revision.cc)) {
        const s = control[control_id[key]].sysex;
        s.mask.forEach((mask, i) => { masks[s.offset + i] |= mask; });
    }
    for (let i = 0; i < 154; i++) assert.equal((before[i] ^ after[i]) & ~masks[i], 0, `Unexpected bits: slot ${slot}, byte ${i}`);
    assert.ok(sysex.setDump(before));
    const previous = Object.fromEntries(Object.keys(revision.cc).map(k => [k, control[control_id[k]].raw_value]));
    assert.ok(sysex.setDump(after));
    for (const [key, value] of Object.entries(revision.cc)) assert.equal(control[control_id[key]].raw_value, value, `${slot} ${key}`);
    assert.deepEqual(reviseHardwarePatch(after), after, 'Revision must be idempotent');
    changed.push({ slot, name: revision.name, changes: Object.fromEntries(Object.entries(revision.cc).map(([k, v]) => [k, { before: previous[k], after: v }])) });
}
assert.deepEqual(changed.map(p => p.slot), Object.keys(hardwareBalance).map(Number));
assert.equal(changed.length, 14);
assert.throws(() => reviseHardwarePatch(Buffer.alloc(10)));
const mismatched = Buffer.from(baseline.subarray(14 * 154, 15 * 154));
mismatched[137] = 88;
assert.throws(() => reviseHardwarePatch(mismatched), /expected/);
console.log(JSON.stringify({ result: 'PASS', revised: changed.length, unchanged_bank_slots: 128 - changed.length, changed }, null, 2));
