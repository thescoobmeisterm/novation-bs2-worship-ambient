import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sysex from './sysex.js';
import { control, control_id } from './cc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bank = fs.readFileSync(path.join(root, 'patches/PostRock_Ambient_Worship_Bank.syx'));
const quiet = [15, 16, 21, 22, 25, 27, 29, 33, 34, 35, 38, 46, 47];
const oldCutoffs = [45, 28, 32, 52, 25, 32, 38, 42, 50, 45, 45, 38, 28];
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const raw = key => control[control_id[key]].raw_value;
const files = fs.readdirSync(path.join(root, 'patches')).filter(f => /^\d.*\.syx$/.test(f));
assert.equal(files.length, 60);
assert.equal(bank.length, 128 * 154);
for (const file of files) {
    const buf = fs.readFileSync(path.join(root, 'patches', file));
    assert.equal(buf.length, 154);
    assert.ok(sysex.setDump(buf));
    assert.ok([...buf.subarray(1, -1)].every(b => b < 128));
    const slot = buf[8];
    assert.deepEqual(buf, bank.subarray(slot * 154, (slot + 1) * 154));
    if (slot === 14) check(Math.abs(control[control_id.osc1_lfo1_depth].value) <= 2, '014: excessive automatic pitch LFO');
    if (quiet.includes(slot)) {
        check(raw('filter_frequency') > oldCutoffs[quiet.indexOf(slot)], `${slot}: filter still at original restricted setting`);
        check(raw('velocity_amp_env') === 64, `${slot}: unintended velocity attenuation`);
    }
    if ([21, 33, 34, 38, 46, 47].includes(slot)) {
        check(control[control_id.filter_mod_env_depth].value > 0, `${slot}: filter envelope still closes instead of opens`);
    }
    if (slot === 35) {
        check(raw('amp_env_decay') > 28, '035: pluck decay still too short');
        check(raw('amp_env_sustain') === 0, '035: preserve percussive zero sustain');
    }
}
if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
console.log('PASS: 60 SysEx messages, bank consistency, and 14-slot parameter regression checks. Hardware loudness audition still required.');
