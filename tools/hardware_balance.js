import { control, control_id } from './cc.js';

// Keys are BS2 DISPLAY SLOTS, not the one-based filename prefixes.
// Raw CC/SysEx units, not dB or Hz. These are first-pass voicing changes;
// actual loudness matching requires recordings from the physical synth.
export const hardwareBalance = {
    14: { name: 'Mogwai Drone', cc: { osc1_lfo1_depth: 128 } },
    15: { name: 'Sigur Lead', cc: { filter_frequency: 65, filter_resonance: 48, mixer_osc_2_level: 115, amp_env_sustain: 115 } },
    16: { name: 'Quiet Earth', cc: { filter_frequency: 42, mixer_osc_2_level: 85, amp_env_sustain: 108 } },
    21: { name: 'Post-Rock Trem', cc: { filter_frequency: 46, filter_resonance: 50, filter_mod_env_depth: 76, amp_env_sustain: 78 } },
    // Acid mode: don't rely on Classic-only filter envelope modulation.
    22: { name: 'Shoegaze Strobe', cc: { filter_frequency: 72, filter_resonance: 72, amp_env_decay: 52, amp_env_sustain: 72 } },
    // Keep slow attacks; raise the filter floor and reduce the depth of dips.
    25: { name: 'Ether Swell', cc: { filter_frequency: 45, filter_lfo2_depth: 136, mixer_osc_1_level: 145, mixer_osc_2_level: 130 } },
    27: { name: 'Aurora Waves', cc: { filter_frequency: 52, filter_lfo2_depth: 138, filter_resonance: 34, mixer_osc_1_level: 145, mixer_osc_2_level: 125 } },
    29: { name: 'Celestial Lead', cc: { filter_frequency: 58, filter_resonance: 32, mixer_osc_1_level: 150, mixer_osc_2_level: 150, amp_env_sustain: 120 } },
    33: { name: 'Starlight Arp', cc: { filter_frequency: 60, filter_mod_env_depth: 76, amp_env_sustain: 58 } },
    // Keep band-pass and ring modulation, but use its gentler slope.
    34: { name: 'Modular Bell Arp', cc: { filter_frequency: 64, filter_mod_env_depth: 76, filter_slope: 0, filter_resonance: 48, amp_env_sustain: 35 } },
    // Preserve zero sustain, extending only the percussive body.
    35: { name: 'Clockwork Pluck', cc: { filter_frequency: 57, amp_env_decay: 42, mixer_osc_2_level: 105 } },
    38: { name: 'Talkbox Lead', cc: { filter_frequency: 61, filter_mod_env_depth: 74, filter_slope: 0, filter_resonance: 60, amp_env_sustain: 110 } },
    46: { name: 'Prophet Pluck', cc: { filter_frequency: 54, filter_mod_env_depth: 76, amp_env_sustain: 52 } },
    47: { name: 'Sub Polyrhythm', cc: { filter_frequency: 42, filter_mod_env_depth: 72, amp_env_sustain: 68 } }
};

export function reviseHardwarePatch(input) {
    const data = Buffer.from(input);
    if (data.length !== 154 || data[0] !== 0xF0 || data[153] !== 0xF7) {
        throw new Error('Expected one 154-byte BS2 patch');
    }
    const revision = hardwareBalance[data[8]];
    if (!revision) return data;
    const name = data.subarray(137, 153).toString('ascii').trim();
    if (name !== revision.name) throw new Error(`Slot ${data[8]} contains ${name}, expected ${revision.name}`);
    for (const [key, value] of Object.entries(revision.cc)) {
        const s = control[control_id[key]]?.sysex;
        if (!s) throw new Error(`No SysEx mapping for ${key}`);
        const bits = s.mask.reduce((n, mask) => n + mask.toString(2).replaceAll('0', '').length, 0);
        if (!Number.isInteger(value) || value < 0 || value >= 2 ** bits) throw new Error(`Invalid ${key}: ${value}`);
        // Pack only the declared bits; preserve all adjacent/unmapped bits.
        let remaining = value;
        for (let i = s.mask.length - 1; i >= 0; i--) {
            for (let bit = 0; bit < 7; bit++) {
                if (!(s.mask[i] & (1 << bit))) continue;
                data[s.offset + i] = (data[s.offset + i] & ~(1 << bit)) | ((remaining & 1) << bit);
                remaining >>>= 1;
            }
        }
    }
    return data;
}
