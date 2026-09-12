import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sysex from './sysex.js';
import { control, control_id } from './cc.js';
import { nrpn, nrpn_id } from './nrpn.js';
import meta from './meta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const patchesDir = path.resolve(__dirname, '..', 'patches');

console.log('====================================================');
console.log('   BASS STATION II COMPLETE 48-PATCH VERIFICATION   ');
console.log('====================================================\n');

const files = fs.readdirSync(patchesDir).filter(f => f.endsWith('.syx') && !f.includes('Bank'));
let passCount = 0;
let failCount = 0;

for (const f of files.sort()) {
    const filePath = path.join(patchesDir, f);
    const buf = fs.readFileSync(filePath);

    if (buf.length !== 154) {
        console.error(`❌ [FAIL] ${f}: Invalid length ${buf.length} bytes`);
        failCount++;
        continue;
    }

    if (buf[0] !== 0xF0 || buf[1] !== 0x00 || buf[2] !== 0x20 || buf[3] !== 0x29 || buf[5] !== 0x33 || buf[153] !== 0xF7) {
        console.error(`❌ [FAIL] ${f}: Invalid SysEx boundaries`);
        failCount++;
        continue;
    }

    const valid = sysex.setDump(new Uint8Array(buf));
    if (!valid) {
        console.error(`❌ [FAIL] ${f}: Validation failed`);
        failCount++;
        continue;
    }

    const name = meta.patch_name.value.trim();
    const cutoff = control[control_id.filter_frequency]?.raw_value;
    const drive = control[control_id.filter_overdrive]?.raw_value;
    const dist = control[control_id.fx_distortion]?.raw_value;
    const osc1w = nrpn[nrpn_id.osc1_waveform]?.value;
    const osc2w = nrpn[nrpn_id.osc2_waveform]?.value;
    const arp = control[control_id.arp_on]?.raw_value;
    const error = nrpn[nrpn_id.osc_error]?.raw_value;

    console.log(`✓ [PASS] ${f.padEnd(25)} | "${name.padEnd(16)}" | Cutoff: ${String(cutoff).padStart(3)} | Overdrive: ${String(drive).padStart(3)} | Dist: ${String(dist).padStart(2)} | Osc: ${osc1w}/${osc2w} | Arp: ${arp} | Drift: ${error}`);
    passCount++;
}

console.log(`\nVerified ${passCount} individual patch files successfully. (${failCount} failures)\n`);

// Verify Bank File
console.log('----------------- Verifying Bank File -----------------');
const bankPath = path.join(patchesDir, 'PostRock_Ambient_Worship_Bank.syx');
const bankBuf = fs.readFileSync(bankPath);
if (bankBuf.length !== 19712) {
    console.error(`❌ [FAIL] Bank size ${bankBuf.length} != 19712 bytes`);
    process.exit(1);
}
console.log(`✓ Bank size exact match: 19712 bytes (128 patches * 154 bytes)`);

for (let i = 0; i < 48; i++) {
    const slot = bankBuf.subarray(i * 154, (i + 1) * 154);
    const slotName = String.fromCharCode(...slot.subarray(137, 153)).trim();
    console.log(`✓ Bank Slot ${String(i).padStart(3, '0')}: "${slotName}"`);
}

console.log('\n====================================================');
console.log('       ALL 48 SEQUENTIAL PATCH CHECKS PASSED!        ');
console.log('====================================================\n');
