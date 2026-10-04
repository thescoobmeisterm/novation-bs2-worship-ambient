import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sysex from './sysex.js';
import { control, control_id } from './cc.js';
import { nrpn, nrpn_id } from './nrpn.js';
import meta from './meta.js';
import { reviseHardwarePatch } from './hardware_balance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const patchesDir = path.join(rootDir, 'patches');
os_mkdir(patchesDir);

function os_mkdir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// User original service dumps
const baileyPath = process.env.BS2_BAILEY_REFERENCE || path.join(patchesDir, '02_Refinery_Special.syx');
const heavenPath = process.env.BS2_HEAVEN_REFERENCE || path.join(patchesDir, '07_Anthem_Drive_Arp.syx');

if (!fs.existsSync(baileyPath) || !fs.existsSync(heavenPath)) {
    throw new Error('Reference patches missing; set BS2_BAILEY_REFERENCE and BS2_HEAVEN_REFERENCE');
}

const baileyTemplate = fs.readFileSync(baileyPath);
const heavenTemplate = fs.readFileSync(heavenPath);

class PatchBuilder {
    constructor(slot = 0, name = 'Init', baseBuf = baileyTemplate) {
        this.data = new Uint8Array(baseBuf);
        this.setSlot(slot);
        this.setName(name);
    }

    setSlot(slot) {
        this.data[8] = slot & 0x7F;
    }

    setName(name) {
        const clean = name.padEnd(16, ' ').slice(0, 16);
        for (let i = 0; i < 16; i++) {
            this.data[137 + i] = clean.charCodeAt(i) & 0x7F;
        }
    }

    setCC(id, rawValue) {
        const c = control[id];
        if (!c || !c.sysex) return;
        const s = c.sysex;
        if (s.mask.length === 2) {
            this.data[s.offset] &= ~s.mask[0];
            this.data[s.offset + 1] &= ~s.mask[1];
            let r = 0;
            let m = s.mask[1];
            while ((m & 1) === 0 && m > 0) { r++; m >>= 1; }
            let lsb = (rawValue << r) & s.mask[1];
            let nBitsLsb = 7 - r;
            let msb = (rawValue >>> nBitsLsb) & s.mask[0];
            this.data[s.offset] |= msb;
            this.data[s.offset + 1] |= lsb;
        } else {
            this.data[s.offset] &= ~s.mask[0];
            let r = 0;
            let m = s.mask[0];
            while ((m & 1) === 0 && m > 0) { r++; m >>= 1; }
            this.data[s.offset] |= (rawValue << r) & s.mask[0];
        }
    }

    setNRPN(id, rawValue) {
        const n = nrpn[id];
        if (!n || !n.sysex) return;
        const s = n.sysex;
        if (s.mask.length === 2) {
            this.data[s.offset] &= ~s.mask[0];
            this.data[s.offset + 1] &= ~s.mask[1];
            let r = 0;
            let m = s.mask[1];
            while ((m & 1) === 0 && m > 0) { r++; m >>= 1; }
            let lsb = (rawValue << r) & s.mask[1];
            let nBitsLsb = 7 - r;
            let msb = (rawValue >>> nBitsLsb) & s.mask[0];
            this.data[s.offset] |= msb;
            this.data[s.offset + 1] |= lsb;
        } else {
            this.data[s.offset] &= ~s.mask[0];
            let r = 0;
            let m = s.mask[0];
            while ((m & 1) === 0 && m > 0) { r++; m >>= 1; }
            this.data[s.offset] |= (rawValue << r) & s.mask[0];
        }
    }

    applyConfig(cfg) {
        if (cfg.cc) {
            for (const [key, val] of Object.entries(cfg.cc)) {
                if (control_id[key] !== undefined) {
                    this.setCC(control_id[key], val);
                }
            }
        }
        if (cfg.nrpn) {
            for (const [key, val] of Object.entries(cfg.nrpn)) {
                if (nrpn_id[key] !== undefined) {
                    this.setNRPN(nrpn_id[key], val);
                }
            }
        }
    }

    getBuffer() {
        return Buffer.from(this.data);
    }
}

// 24 Ordered Patch Specifications
const patchSpecs = [

    // =========================================================================
    // === 1. WORSHIP FOUNDATION (Slots 000-011) ===
    // =========================================================================
    // 01: Sanctuary Sub (Sustain)
    {
        slot: 0,
        filename: '01_Sanctuary_Sub.syx',
        name: 'Sanctuary Sub',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_coarse: 128,
            osc2_range: 64, osc2_fine: 128, osc2_coarse: 128,
            mixer_osc_1_level: 110, mixer_osc_2_level: 20, mixer_sub_osc_level: 215,
            mixer_noise_level: 0, mixer_ring_mod_level: 0,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 26, filter_resonance: 10, filter_overdrive: 20,
            filter_mod_env_depth: 64, filter_lfo2_depth: 128,
            amp_env_attack: 5, amp_env_decay: 90, amp_env_sustain: 120, amp_env_release: 45,
            mod_env_attack: 10, mod_env_decay: 90, mod_env_sustain: 110, mod_env_release: 45,
            fx_distortion: 0, vca_limit: 0, portamento_time: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 0,
            mod_wheel_filter_freq: 89, aftertouch_filter_freq: 76,
            paraphonic: 0, osc_error: 0, filter_tracking: 0
        }
    },

    // 02: Refinery Special (Sustain)
    {
        slot: 1,
        filename: '02_Refinery_Special.syx',
        name: 'Refinery Special',
        category: '1. Worship Foundation',
        isOriginalBailey: true
    },

    // 03: Refinery Swell (Sustain)
    {
        slot: 2,
        filename: '03_Refinery_Swell.syx',
        name: 'Refinery Swell',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_coarse: 128,
            osc2_range: 64, osc2_fine: 139, osc2_coarse: 128,
            mixer_osc_1_level: 135, mixer_osc_2_level: 45, mixer_sub_osc_level: 155,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 30, filter_resonance: 38, filter_overdrive: 110, filter_mod_env_depth: 68,
            amp_env_attack: 32, amp_env_decay: 110, amp_env_sustain: 105, amp_env_release: 65,
            mod_env_attack: 38, mod_env_decay: 110, mod_env_sustain: 100, mod_env_release: 65,
            fx_distortion: 14, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2,
            mod_wheel_lfo2_filter_freq: 89, aftertouch_filter_freq: 82,
            paraphonic: 0, osc_error: 1, filter_tracking: 0
        }
    },

    // 04: Sunday Driver (Sustain)
    {
        slot: 3,
        filename: '04_Sunday_Driver.syx',
        name: 'Sunday Driver',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_manual_pw: 64,
            osc2_range: 63, osc2_fine: 132,
            mixer_osc_1_level: 145, mixer_osc_2_level: 55, mixer_sub_osc_level: 130,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 42, filter_resonance: 30, filter_overdrive: 65, filter_mod_env_depth: 82,
            velocity_mod_env: 88, velocity_amp_env: 78,
            amp_env_attack: 0, amp_env_decay: 68, amp_env_sustain: 85, amp_env_release: 30,
            mod_env_attack: 2, mod_env_decay: 50, mod_env_sustain: 40, mod_env_release: 25,
            fx_distortion: 10, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 2,
            aftertouch_filter_freq: 79, mod_wheel_filter_freq: 84,
            paraphonic: 0, osc_error: 0
        }
    },

    // 05: Living Water (Sustain)
    {
        slot: 4,
        filename: '05_Living_Water.syx',
        name: 'Living Water',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 134,
            mixer_osc_1_level: 150, mixer_osc_2_level: 75, mixer_sub_osc_level: 120,
            sub_osc_wave: 0, sub_osc_oct: 63, portamento_time: 22,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 34, filter_resonance: 25, filter_overdrive: 40, filter_mod_env_depth: 70,
            amp_env_attack: 4, amp_env_decay: 80, amp_env_sustain: 95, amp_env_release: 38,
            mod_env_attack: 8, mod_env_decay: 70, mod_env_sustain: 60, mod_env_release: 38,
            fx_distortion: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 0,
            mod_wheel_filter_freq: 94, aftertouch_lfo1_to_osc_pitch: 78,
            paraphonic: 0, osc_error: 1
        }
    },

    // 06: Sidechain Pump (Sustain)
    {
        slot: 5,
        filename: '06_Sidechain_Pump.syx',
        name: 'Sidechain Pump',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 136,
            mixer_osc_1_level: 140, mixer_osc_2_level: 60, mixer_sub_osc_level: 160,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 32, filter_resonance: 25, filter_overdrive: 60, filter_lfo2_depth: 170,
            lfo2_wave: 1, lfo2_speed: 55,
            amp_env_attack: 0, amp_env_decay: 100, amp_env_sustain: 115, amp_env_release: 40,
            fx_distortion: 12, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2,
            lfo2_speed_sync: 1, lfo2_sync_value: 25, lfo2_key_sync: 1,
            mod_wheel_filter_freq: 90, aftertouch_filter_freq: 82,
            paraphonic: 0, osc_error: 1
        }
    },

    // 07: Anthem Drive Arp (Arpeggio)
    {
        slot: 6,
        filename: '07_Anthem_Drive_Arp.syx',
        name: 'Anthem Drive Arp',
        category: '1. Worship Foundation',
        isOriginalHeaven: true
    },

    // 08: Praise 16th Arp (Arpeggio)
    {
        slot: 7,
        filename: '08_Praise_16th_Arp.syx',
        name: 'Praise 16th Arp',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_coarse: 128,
            osc2_range: 64, osc2_fine: 136, osc2_coarse: 128,
            mixer_osc_1_level: 140, mixer_osc_2_level: 40, mixer_sub_osc_level: 160,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 36, filter_resonance: 52, filter_overdrive: 127, filter_mod_env_depth: 72,
            amp_env_attack: 0, amp_env_decay: 38, amp_env_sustain: 60, amp_env_release: 22,
            mod_env_attack: 0, mod_env_decay: 38, mod_env_sustain: 50, mod_env_release: 22,
            fx_distortion: 22, arp_on: 1, arp_octaves: 0, arp_rhythm: 13, arp_swing: 50
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, arp_seq_retrig: 1,
            mod_wheel_lfo2_filter_freq: 93, aftertouch_filter_freq: 84,
            paraphonic: 0, osc_error: 0, filter_tracking: 1
        }
    },

    // 09: Stadium Praise (Arpeggio)
    {
        slot: 8,
        filename: '09_Stadium_Praise_Arp.syx',
        name: 'Stadium Praise',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 126,
            osc2_range: 64, osc2_fine: 130,
            mixer_osc_1_level: 180, mixer_osc_2_level: 160, mixer_sub_osc_level: 175,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 36, filter_resonance: 45, filter_mod_env_depth: 85, filter_overdrive: 90,
            amp_env_attack: 1, amp_env_decay: 55, amp_env_sustain: 45, amp_env_release: 25,
            mod_env_attack: 1, mod_env_decay: 45, mod_env_sustain: 15, mod_env_release: 20,
            fx_distortion: 20, arp_on: 1, arp_octaves: 1, arp_rhythm: 2
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 1,
            aftertouch_filter_freq: 92, mod_wheel_filter_freq: 94,
            paraphonic: 0
        }
    },

    // 10: Cathedral 16ths (Arpeggio)
    {
        slot: 9,
        filename: '10_Cathedral_16ths.syx',
        name: 'Cathedral 16ths',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 64, osc1_fine: 126,
            osc2_range: 65, osc2_fine: 130, osc2_manual_pw: 70,
            mixer_osc_1_level: 165, mixer_osc_2_level: 145, mixer_sub_osc_level: 135,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 44, filter_resonance: 48, filter_mod_env_depth: 72, filter_overdrive: 45,
            amp_env_attack: 1, amp_env_decay: 55, amp_env_sustain: 40, amp_env_release: 25,
            mod_env_attack: 1, mod_env_decay: 45, mod_env_sustain: 10, mod_env_release: 20,
            fx_distortion: 12, arp_on: 1, arp_octaves: 2, arp_rhythm: 1
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 1,
            aftertouch_filter_freq: 85, mod_wheel_filter_freq: 88,
            paraphonic: 0
        }
    },

    // 11: Dotted 8th Motor (Arpeggio)
    {
        slot: 10,
        filename: '11_Dotted_8th_Motor.syx',
        name: 'Dotted 8th Motor',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_manual_pw: 55,
            osc2_range: 63, osc2_fine: 134,
            mixer_osc_1_level: 140, mixer_osc_2_level: 60, mixer_sub_osc_level: 150,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 38, filter_resonance: 42, filter_overdrive: 85, filter_mod_env_depth: 78,
            amp_env_attack: 0, amp_env_decay: 32, amp_env_sustain: 40, amp_env_release: 18,
            mod_env_attack: 0, mod_env_decay: 32, mod_env_sustain: 30, mod_env_release: 18,
            fx_distortion: 16, arp_on: 1, arp_octaves: 0, arp_rhythm: 7, arp_swing: 50
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 2, arp_seq_retrig: 1,
            mod_wheel_lfo2_filter_freq: 90, aftertouch_filter_freq: 86,
            paraphonic: 0, osc_error: 0
        }
    },

    // 12: Dotted 8th Edge (Arpeggio)
    {
        slot: 11,
        filename: '12_Dotted_8th_Edge_Arp.syx',
        name: 'Dotted 8th Edge',
        category: '1. Worship Foundation',
        cc: {
            osc1_range: 64, osc1_fine: 126,
            osc2_range: 64, osc2_fine: 131, osc2_manual_pw: 60,
            mixer_osc_1_level: 170, mixer_osc_2_level: 150, mixer_sub_osc_level: 155,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 40, filter_resonance: 42, filter_mod_env_depth: 68, filter_overdrive: 55,
            amp_env_attack: 1, amp_env_decay: 55, amp_env_sustain: 35, amp_env_release: 22,
            mod_env_attack: 1, mod_env_decay: 48, mod_env_sustain: 15, mod_env_release: 20,
            fx_distortion: 15, arp_on: 1, arp_octaves: 2, arp_rhythm: 5
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 1,
            aftertouch_filter_freq: 88, mod_wheel_filter_freq: 90,
            paraphonic: 0
        }
    },


    // =========================================================================
    // === 2. POST-ROCK (Slots 012-023) ===
    // =========================================================================
    // 13: Caspian Bow (Sustain)
    {
        slot: 12,
        filename: '13_Caspian_Bow.syx',
        name: 'Caspian Bow',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 64, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 142,
            mixer_osc_1_level: 130, mixer_osc_2_level: 120, mixer_sub_osc_level: 110,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 32, filter_resonance: 44, filter_overdrive: 85, filter_mod_env_depth: 78,
            amp_env_attack: 42, amp_env_decay: 95, amp_env_sustain: 115, amp_env_release: 60,
            mod_env_attack: 48, mod_env_decay: 90, mod_env_sustain: 105, mod_env_release: 60,
            fx_distortion: 35, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 3,
            aftertouch_filter_freq: 86, aftertouch_lfo1_to_osc_pitch: 74,
            paraphonic: 0, filter_tracking: 1
        }
    },

    // 14: Tectonic Dist (Sustain)
    {
        slot: 13,
        filename: '14_Tectonic_Dist.syx',
        name: 'Tectonic Dist',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 138,
            mixer_osc_1_level: 160, mixer_osc_2_level: 140, mixer_sub_osc_level: 200,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 48, filter_resonance: 28, filter_overdrive: 127, filter_mod_env_depth: 68,
            amp_env_attack: 0, amp_env_decay: 100, amp_env_sustain: 120, amp_env_release: 40,
            mod_env_attack: 0, mod_env_decay: 90, mod_env_sustain: 110, mod_env_release: 40,
            fx_distortion: 88, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2,
            mod_wheel_filter_freq: 92, aftertouch_filter_freq: 80,
            paraphonic: 0, osc_error: 1
        }
    },

    // 15: Mogwai Drone (Sustain)
    {
        slot: 14,
        filename: '15_Mogwai_Drone.syx',
        name: 'Mogwai Drone',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_manual_pw: 75, osc1_lfo1_depth: 148,
            osc2_range: 64, osc2_fine: 135, osc2_manual_pw: 55,
            mixer_osc_1_level: 130, mixer_osc_2_level: 120, mixer_sub_osc_level: 115,
            sub_osc_wave: 1, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 0,
            filter_frequency: 35, filter_resonance: 35, filter_overdrive: 95,
            lfo1_wave: 0, lfo1_speed: 35,
            amp_env_attack: 25, amp_env_decay: 127, amp_env_sustain: 127, amp_env_release: 75,
            fx_distortion: 25, arp_on: 0
        },
        nrpn: {
            paraphonic: 1, osc1_waveform: 3, osc2_waveform: 2,
            aftertouch_filter_freq: 80, mod_wheel_lfo2_filter_freq: 84, osc_error: 2
        }
    },

    // 16: Sigur Lead (Sustain)
    {
        slot: 15,
        filename: '16_Sigur_Lead.syx',
        name: 'Sigur Lead',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 65, osc1_fine: 128,
            osc2_range: 65, osc2_fine: 136,
            mixer_osc_1_level: 140, mixer_osc_2_level: 90, mixer_sub_osc_level: 40,
            sub_osc_wave: 0, sub_osc_oct: 63, portamento_time: 28,
            filter_type: 1, filter_shape: 0, filter_slope: 1,
            filter_frequency: 45, filter_resonance: 58, filter_overdrive: 70, filter_mod_env_depth: 74,
            lfo1_wave: 0, lfo1_speed: 95,
            amp_env_attack: 8, amp_env_decay: 85, amp_env_sustain: 105, amp_env_release: 55,
            mod_env_attack: 12, mod_env_decay: 80, mod_env_sustain: 90, mod_env_release: 55,
            fx_distortion: 18, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 1,
            aftertouch_lfo1_to_osc_pitch: 86, mod_wheel_filter_freq: 94,
            paraphonic: 0, filter_tracking: 2
        }
    },

    // 17: Quiet Earth (Sustain)
    {
        slot: 16,
        filename: '17_Quiet_Earth.syx',
        name: 'Quiet Earth',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 132,
            mixer_osc_1_level: 150, mixer_osc_2_level: 60, mixer_sub_osc_level: 140,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 28, filter_resonance: 15, filter_overdrive: 15,
            amp_env_attack: 14, amp_env_decay: 80, amp_env_sustain: 90, amp_env_release: 35,
            mod_env_attack: 18, mod_env_decay: 70, mod_env_sustain: 75, mod_env_release: 35,
            fx_distortion: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 0,
            osc_error: 2, aftertouch_filter_freq: 74, paraphonic: 0
        }
    },

    // 18: Shields Glide (Sustain)
    {
        slot: 17,
        filename: '18_Shields_Glide.syx',
        name: 'Shields Glide',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 63, osc2_fine: 143,
            mixer_osc_1_level: 135, mixer_osc_2_level: 130, mixer_sub_osc_level: 145,
            sub_osc_wave: 0, sub_osc_oct: 63, portamento_time: 24,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 38, filter_resonance: 32, filter_overdrive: 95,
            lfo1_wave: 0, lfo1_speed: 52,
            amp_env_attack: 8, amp_env_decay: 95, amp_env_sustain: 115, amp_env_release: 55,
            fx_distortion: 22, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 4, lfo1_slew: 40,
            mod_wheel_lfo1_osc_pitch: 88, aftertouch_filter_freq: 86,
            paraphonic: 0
        }
    },

    // 19: Gothic Chorus (Sustain)
    {
        slot: 18,
        filename: '19_Gothic_Chorus.syx',
        name: 'Gothic Chorus',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 63, osc2_fine: 144,
            mixer_osc_1_level: 140, mixer_osc_2_level: 130, mixer_sub_osc_level: 110,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 52, filter_resonance: 44, filter_overdrive: 65, filter_mod_env_depth: 76,
            amp_env_attack: 0, amp_env_decay: 75, amp_env_sustain: 95, amp_env_release: 35,
            mod_env_attack: 0, mod_env_decay: 60, mod_env_sustain: 50, mod_env_release: 30,
            fx_distortion: 15, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 2,
            aftertouch_filter_freq: 88, mod_wheel_filter_freq: 90,
            paraphonic: 0
        }
    },

    // 20: Blackgaze Roar (Sustain)
    {
        slot: 19,
        filename: '20_Blackgaze_Roar.syx',
        name: 'Blackgaze Roar',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 139,
            mixer_osc_1_level: 155, mixer_osc_2_level: 145, mixer_sub_osc_level: 210, mixer_noise_level: 45,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 46, filter_resonance: 32, filter_overdrive: 127, filter_mod_env_depth: 72,
            amp_env_attack: 0, amp_env_decay: 105, amp_env_sustain: 125, amp_env_release: 45,
            fx_distortion: 75, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 2,
            mod_wheel_filter_freq: 94, aftertouch_filter_freq: 84,
            paraphonic: 0
        }
    },

    // 21: Feedback Siren (Sustain)
    {
        slot: 20,
        filename: '21_Feedback_Siren.syx',
        name: 'Feedback Siren',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 64, osc1_fine: 128,
            osc2_range: 65, osc2_fine: 140,
            mixer_osc_1_level: 130, mixer_osc_2_level: 120, mixer_sub_osc_level: 80,
            sub_osc_wave: 0, sub_osc_oct: 63, portamento_time: 20,
            filter_type: 1, filter_shape: 0, filter_slope: 1,
            filter_frequency: 48, filter_resonance: 85, filter_overdrive: 90,
            lfo1_wave: 0, lfo1_speed: 85,
            amp_env_attack: 12, amp_env_decay: 90, amp_env_sustain: 110, amp_env_release: 55,
            fx_distortion: 35, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 3,
            aftertouch_filter_freq: 95, mod_wheel_filter_freq: 98,
            paraphonic: 0
        }
    },

    // 22: Post-Rock Trem (Arpeggio)
    {
        slot: 21,
        filename: '22_Post_Rock_Crescendo_Arp.syx',
        name: 'Post-Rock Trem',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 64, osc1_fine: 124,
            osc2_range: 64, osc2_fine: 133,
            mixer_osc_1_level: 170, mixer_osc_2_level: 165, mixer_sub_osc_level: 150, mixer_noise_level: 25,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 32, filter_resonance: 65, filter_mod_env_depth: 55, filter_overdrive: 110,
            amp_env_attack: 4, amp_env_decay: 60, amp_env_sustain: 60, amp_env_release: 45,
            mod_env_attack: 3, mod_env_decay: 50, mod_env_sustain: 25, mod_env_release: 35,
            fx_distortion: 40, arp_on: 1, arp_octaves: 2, arp_rhythm: 1
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 3,
            aftertouch_filter_freq: 95, mod_wheel_filter_freq: 95,
            paraphonic: 0
        }
    },

    // 23: Shoegaze Strobe (Arpeggio)
    {
        slot: 22,
        filename: '23_Shoegaze_Strobe_Arp.syx',
        name: 'Shoegaze Strobe',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 65, osc1_fine: 124,
            osc2_range: 65, osc2_fine: 133,
            mixer_osc_1_level: 175, mixer_osc_2_level: 165, mixer_sub_osc_level: 110, mixer_noise_level: 35,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 1, filter_shape: 0, filter_slope: 1,
            filter_frequency: 52, filter_resonance: 92, filter_mod_env_depth: 45, filter_overdrive: 95,
            amp_env_attack: 1, amp_env_decay: 40, amp_env_sustain: 50, amp_env_release: 45,
            mod_env_attack: 2, mod_env_decay: 40, mod_env_sustain: 20, mod_env_release: 35,
            fx_distortion: 35, arp_on: 1, arp_octaves: 3, arp_rhythm: 1
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, osc_error: 4,
            aftertouch_filter_freq: 95, mod_wheel_filter_freq: 95,
            paraphonic: 0
        }
    },

    // 24: Cyberpunk Arp (Arpeggio)
    {
        slot: 23,
        filename: '24_Cyberpunk_Drive_Arp.syx',
        name: 'Cyberpunk Arp',
        category: '2. Post-Rock',
        cc: {
            osc1_range: 63, osc1_fine: 125,
            osc2_range: 64, osc2_fine: 132, osc2_manual_pw: 80,
            mixer_osc_1_level: 185, mixer_osc_2_level: 165, mixer_sub_osc_level: 170,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 1, filter_shape: 0, filter_slope: 1,
            filter_frequency: 34, filter_resonance: 82, filter_mod_env_depth: 78, filter_overdrive: 120,
            amp_env_attack: 1, amp_env_decay: 50, amp_env_sustain: 40, amp_env_release: 22,
            mod_env_attack: 1, mod_env_decay: 42, mod_env_sustain: 10, mod_env_release: 18,
            fx_distortion: 35, arp_on: 1, arp_octaves: 1, arp_rhythm: 2
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 2,
            aftertouch_filter_freq: 92, mod_wheel_filter_freq: 95,
            paraphonic: 0
        }
    },


    // =========================================================================
    // === 3. AMBIENT (Slots 024-035) ===
    // =========================================================================
    // 25: Tape Drift (Sustain)
    {
        slot: 24,
        filename: '25_Tape_Drift.syx',
        name: 'Tape Drift',
        category: '3. Ambient',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_manual_pw: 60,
            osc2_range: 64, osc2_fine: 140,
            mixer_osc_1_level: 135, mixer_osc_2_level: 85, mixer_sub_osc_level: 120,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 0,
            filter_frequency: 38, filter_resonance: 22, filter_overdrive: 50,
            lfo1_wave: 0, lfo1_speed: 48,
            amp_env_attack: 18, amp_env_decay: 85, amp_env_sustain: 95, amp_env_release: 50,
            fx_distortion: 12, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 2, osc_error: 5, lfo1_slew: 35,
            mod_wheel_lfo1_osc_pitch: 89, aftertouch_filter_freq: 76, paraphonic: 0
        }
    },

    // 26: Ether Swell (Sustain)
    {
        slot: 25,
        filename: '26_Ether_Swell.syx',
        name: 'Ether Swell',
        category: '3. Ambient',
        cc: {
            osc1_range: 64, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 137, osc2_manual_pw: 45,
            mixer_osc_1_level: 125, mixer_osc_2_level: 115, mixer_sub_osc_level: 90,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 0,
            filter_frequency: 25, filter_resonance: 30, filter_overdrive: 40, filter_lfo2_depth: 145,
            lfo2_wave: 0, lfo2_speed: 12,
            amp_env_attack: 72, amp_env_decay: 120, amp_env_sustain: 120, amp_env_release: 82,
            mod_env_attack: 78, mod_env_decay: 115, mod_env_sustain: 110, mod_env_release: 82,
            fx_distortion: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3,
            aftertouch_filter_freq: 82, paraphonic: 0, osc_error: 2
        }
    },

    // 27: Glass Pluck (Sustain)
    {
        slot: 26,
        filename: '27_Glass_Pluck.syx',
        name: 'Glass Pluck',
        category: '3. Ambient',
        cc: {
            osc1_range: 65, osc1_fine: 128, osc1_manual_pw: 85,
            osc2_range: 66, osc2_fine: 135,
            mixer_osc_1_level: 145, mixer_osc_2_level: 80, mixer_sub_osc_level: 0,
            filter_type: 0, filter_shape: 1, filter_slope: 0,
            filter_frequency: 55, filter_resonance: 68, filter_overdrive: 25, filter_mod_env_depth: 90,
            amp_env_attack: 0, amp_env_decay: 42, amp_env_sustain: 15, amp_env_release: 35,
            mod_env_attack: 0, mod_env_decay: 32, mod_env_sustain: 0, mod_env_release: 30,
            fx_distortion: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 0,
            aftertouch_filter_freq: 84, mod_wheel_filter_freq: 88,
            paraphonic: 0, filter_tracking: 3
        }
    },

    // 28: Aurora Waves (Sustain)
    {
        slot: 27,
        filename: '28_Aurora_Waves.syx',
        name: 'Aurora Waves',
        category: '3. Ambient',
        cc: {
            osc1_range: 64, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 138, osc2_manual_pw: 70,
            mixer_osc_1_level: 120, mixer_osc_2_level: 100, mixer_sub_osc_level: 80, mixer_noise_level: 35,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 32, filter_resonance: 42, filter_overdrive: 30, filter_lfo2_depth: 148,
            lfo1_wave: 0, lfo1_speed: 24, lfo2_wave: 0, lfo2_speed: 18,
            amp_env_attack: 45, amp_env_decay: 110, amp_env_sustain: 115, amp_env_release: 70,
            fx_distortion: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3,
            mod_wheel_lfo2_filter_freq: 95, aftertouch_filter_freq: 78,
            paraphonic: 0, osc_error: 3
        }
    },

    // 29: Hollow Chill (Sustain)
    {
        slot: 28,
        filename: '29_Hollow_Chill.syx',
        name: 'Hollow Chill',
        category: '3. Ambient',
        cc: {
            osc1_range: 63, osc1_fine: 128, osc1_manual_pw: 64,
            osc2_range: 64, osc2_fine: 136,
            mixer_osc_1_level: 130, mixer_osc_2_level: 110, mixer_sub_osc_level: 0,
            filter_type: 0, filter_shape: 1, filter_slope: 1,
            filter_frequency: 42, filter_resonance: 48, filter_overdrive: 45, filter_mod_env_depth: 72,
            amp_env_attack: 28, amp_env_decay: 90, amp_env_sustain: 100, amp_env_release: 60,
            mod_env_attack: 35, mod_env_decay: 85, mod_env_sustain: 90, mod_env_release: 60,
            fx_distortion: 15, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 1,
            aftertouch_filter_freq: 88, mod_wheel_filter_freq: 88,
            paraphonic: 0, osc_error: 2
        }
    },

    // 30: Celestial Lead (Sustain)
    {
        slot: 29,
        filename: '30_Celestial_Lead.syx',
        name: 'Celestial Lead',
        category: '3. Ambient',
        cc: {
            osc1_range: 65, osc1_fine: 128, osc1_manual_pw: 60,
            osc2_range: 65, osc2_fine: 136, osc2_manual_pw: 40,
            mixer_osc_1_level: 130, mixer_osc_2_level: 130, mixer_sub_osc_level: 50,
            sub_osc_wave: 0, sub_osc_oct: 63, portamento_time: 15,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 38, filter_resonance: 40, filter_overdrive: 55, filter_mod_env_depth: 76,
            lfo1_wave: 0, lfo1_speed: 90,
            amp_env_attack: 16, amp_env_decay: 95, amp_env_sustain: 110, amp_env_release: 58,
            mod_env_attack: 22, mod_env_decay: 90, mod_env_sustain: 100, mod_env_release: 58,
            fx_distortion: 8, arp_on: 0
        },
        nrpn: {
            paraphonic: 1, osc1_waveform: 3, osc2_waveform: 3,
            mod_wheel_lfo1_osc_pitch: 92, aftertouch_filter_freq: 86,
            osc_error: 2, filter_tracking: 2
        }
    },

    // 31: Slowdive Wash (Sustain)
    {
        slot: 30,
        filename: '31_Slowdive_Wash.syx',
        name: 'Slowdive Wash',
        category: '3. Ambient',
        cc: {
            osc1_range: 64, osc1_fine: 128, osc1_manual_pw: 75,
            osc2_range: 64, osc2_fine: 138, osc2_manual_pw: 45,
            mixer_osc_1_level: 125, mixer_osc_2_level: 115, mixer_sub_osc_level: 140,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 0,
            filter_frequency: 42, filter_resonance: 38, filter_overdrive: 50, filter_lfo2_depth: 155,
            lfo2_wave: 0, lfo2_speed: 22,
            amp_env_attack: 25, amp_env_decay: 110, amp_env_sustain: 115, amp_env_release: 75,
            fx_distortion: 10, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 3, osc_error: 3,
            mod_wheel_lfo2_filter_freq: 96, aftertouch_filter_freq: 82,
            paraphonic: 0
        }
    },

    // 32: Dream Fluff (Sustain)
    {
        slot: 31,
        filename: '32_Dream_Fluff.syx',
        name: 'Dream Fluff',
        category: '3. Ambient',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 134, osc2_manual_pw: 65,
            mixer_osc_1_level: 140, mixer_osc_2_level: 90, mixer_sub_osc_level: 150,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 30, filter_resonance: 20, filter_overdrive: 45,
            amp_env_attack: 15, amp_env_decay: 90, amp_env_sustain: 100, amp_env_release: 65,
            mod_env_attack: 20, mod_env_decay: 85, mod_env_sustain: 80, mod_env_release: 65,
            fx_distortion: 8, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 3, osc_error: 3,
            aftertouch_filter_freq: 78, mod_wheel_filter_freq: 86,
            paraphonic: 0
        }
    },

    // 33: Sacred Riser (Sustain)
    {
        slot: 32,
        filename: '33_Sacred_Riser.syx',
        name: 'Sacred Riser',
        category: '3. Ambient',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 136,
            mixer_osc_1_level: 80, mixer_osc_2_level: 60, mixer_sub_osc_level: 120, mixer_noise_level: 180,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 20, filter_resonance: 52, filter_overdrive: 60, filter_mod_env_depth: 110,
            amp_env_attack: 110, amp_env_decay: 120, amp_env_sustain: 120, amp_env_release: 25,
            mod_env_attack: 115, mod_env_decay: 120, mod_env_sustain: 120, mod_env_release: 25,
            fx_distortion: 22, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2,
            mod_wheel_filter_freq: 95, aftertouch_filter_freq: 85,
            paraphonic: 0, osc_error: 2
        }
    },

    // 34: Starlight Arp (Arpeggio)
    {
        slot: 33,
        filename: '34_Starlight_Ambient_Arp.syx',
        name: 'Starlight Arp',
        category: '3. Ambient',
        cc: {
            osc1_range: 65, osc1_fine: 127,
            osc2_range: 66, osc2_fine: 129,
            mixer_osc_1_level: 170, mixer_osc_2_level: 140, mixer_sub_osc_level: 90, mixer_noise_level: 15,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 0,
            filter_frequency: 42, filter_resonance: 28, filter_mod_env_depth: 40, filter_overdrive: 10,
            amp_env_attack: 5, amp_env_decay: 80, amp_env_sustain: 40, amp_env_release: 75,
            mod_env_attack: 4, mod_env_decay: 65, mod_env_sustain: 20, mod_env_release: 60,
            fx_distortion: 0, arp_on: 1, arp_octaves: 3, arp_rhythm: 17
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 0, osc_error: 2,
            aftertouch_filter_freq: 75, mod_wheel_filter_freq: 80,
            paraphonic: 1
        }
    },

    // 35: Modular Bell Arp (Arpeggio)
    {
        slot: 34,
        filename: '35_Modular_Bell_Arp.syx',
        name: 'Modular Bell Arp',
        category: '3. Ambient',
        cc: {
            osc1_range: 65, osc1_fine: 128,
            osc2_range: 66, osc2_fine: 135,
            mixer_osc_1_level: 150, mixer_osc_2_level: 150, mixer_sub_osc_level: 80, mixer_ring_mod_level: 65,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 1, filter_slope: 1,
            filter_frequency: 50, filter_resonance: 60, filter_mod_env_depth: 55, filter_overdrive: 20,
            amp_env_attack: 1, amp_env_decay: 65, amp_env_sustain: 20, amp_env_release: 45,
            mod_env_attack: 1, mod_env_decay: 50, mod_env_sustain: 10, mod_env_release: 35,
            fx_distortion: 5, arp_on: 1, arp_octaves: 2, arp_rhythm: 12
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 1, osc_error: 2,
            aftertouch_filter_freq: 85, mod_wheel_filter_freq: 88,
            paraphonic: 1
        }
    },

    // 36: Clockwork Pluck (Arpeggio)
    {
        slot: 35,
        filename: '36_Clockwork_Pluck.syx',
        name: 'Clockwork Pluck',
        category: '3. Ambient',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 132, osc2_manual_pw: 80,
            mixer_osc_1_level: 140, mixer_osc_2_level: 80, mixer_sub_osc_level: 100,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 45, filter_resonance: 35, filter_overdrive: 20, filter_mod_env_depth: 84,
            amp_env_attack: 0, amp_env_decay: 28, amp_env_sustain: 0, amp_env_release: 15,
            mod_env_attack: 0, mod_env_decay: 24, mod_env_sustain: 0, mod_env_release: 15,
            fx_distortion: 0, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 3,
            aftertouch_filter_freq: 78, mod_wheel_filter_freq: 86,
            paraphonic: 0, osc_error: 0
        }
    },


    // =========================================================================
    // === 4. FUNK & GOSPEL (Slots 036-047) ===
    // =========================================================================
    // 37: Funk Auto-Wah (Sustain)
    {
        slot: 36,
        filename: '37_Funk_AutoWah.syx',
        name: 'Funk Auto-Wah',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 64, osc1_fine: 128, osc1_manual_pw: 70,
            osc2_range: 64, osc2_fine: 134,
            mixer_osc_1_level: 160, mixer_osc_2_level: 120, mixer_sub_osc_level: 140,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 24, filter_resonance: 68, filter_mod_env_depth: 85, filter_overdrive: 35,
            amp_env_attack: 2, amp_env_decay: 75, amp_env_sustain: 45, amp_env_release: 35,
            mod_env_attack: 12, mod_env_decay: 65, mod_env_sustain: 15, mod_env_release: 30,
            fx_distortion: 6, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 2, osc_error: 1,
            aftertouch_filter_freq: 85, mod_wheel_filter_freq: 90,
            paraphonic: 0
        }
    },

    // 38: Gospel Chop (Sustain)
    {
        slot: 37,
        filename: '38_Gospel_Chop.syx',
        name: 'Gospel Chop',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 132, osc2_manual_pw: 60,
            mixer_osc_1_level: 150, mixer_osc_2_level: 110, mixer_sub_osc_level: 190,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 38, filter_resonance: 42, filter_mod_env_depth: 60, filter_overdrive: 45,
            amp_env_attack: 0, amp_env_decay: 68, amp_env_sustain: 60, amp_env_release: 25,
            mod_env_attack: 0, mod_env_decay: 48, mod_env_sustain: 0, mod_env_release: 20,
            fx_distortion: 12, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 0,
            aftertouch_filter_freq: 75, mod_wheel_filter_freq: 85,
            paraphonic: 0
        }
    },

    // 39: Talkbox Lead (Sustain)
    {
        slot: 38,
        filename: '39_Talkbox_Lead.syx',
        name: 'Talkbox Lead',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 64, osc1_fine: 128, osc1_manual_pw: 82,
            osc2_range: 65, osc2_fine: 136, osc2_manual_pw: 75,
            mixer_osc_1_level: 165, mixer_osc_2_level: 135, mixer_sub_osc_level: 90,
            sub_osc_wave: 0, sub_osc_oct: 63, portamento_time: 18,
            filter_type: 0, filter_shape: 1, filter_slope: 1,
            filter_frequency: 45, filter_resonance: 72, filter_mod_env_depth: 50, filter_overdrive: 55,
            lfo1_wave: 0, lfo1_speed: 75,
            amp_env_attack: 5, amp_env_decay: 80, amp_env_sustain: 95, amp_env_release: 35,
            mod_env_attack: 15, mod_env_decay: 70, mod_env_sustain: 40, mod_env_release: 30,
            fx_distortion: 18, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 3, osc_error: 1,
            aftertouch_filter_freq: 85, mod_wheel_filter_freq: 92,
            paraphonic: 0
        }
    },

    // 40: Bernie Funk (Sustain)
    {
        slot: 39,
        filename: '40_Moog_Funk_Sub.syx',
        name: 'Bernie Funk',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 63, osc2_fine: 133,
            mixer_osc_1_level: 170, mixer_osc_2_level: 140, mixer_sub_osc_level: 180,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 32, filter_resonance: 55, filter_mod_env_depth: 65, filter_overdrive: 30,
            amp_env_attack: 2, amp_env_decay: 72, amp_env_sustain: 65, amp_env_release: 25,
            mod_env_attack: 3, mod_env_decay: 60, mod_env_sustain: 20, mod_env_release: 20,
            fx_distortion: 5, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 2, osc_error: 1,
            aftertouch_filter_freq: 80, mod_wheel_filter_freq: 85,
            paraphonic: 0
        }
    },

    // 41: Acid Squelch (Sustain)
    {
        slot: 40,
        filename: '41_Acid_Squelch.syx',
        name: 'Acid Squelch',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 64, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 135,
            mixer_osc_1_level: 175, mixer_osc_2_level: 110, mixer_sub_osc_level: 150,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 1, filter_shape: 0, filter_slope: 1,
            filter_frequency: 34, filter_resonance: 78, filter_mod_env_depth: 80, filter_overdrive: 65,
            amp_env_attack: 1, amp_env_decay: 65, amp_env_sustain: 40, amp_env_release: 25,
            mod_env_attack: 2, mod_env_decay: 50, mod_env_sustain: 10, mod_env_release: 20,
            fx_distortion: 22, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 1,
            aftertouch_filter_freq: 90, mod_wheel_filter_freq: 92,
            paraphonic: 0
        }
    },

    // 42: Nu-Disco Pulse (Sustain)
    {
        slot: 41,
        filename: '42_Nu_Disco_Pulse.syx',
        name: 'Nu-Disco Pulse',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 132, osc2_manual_pw: 65,
            mixer_osc_1_level: 165, mixer_osc_2_level: 130, mixer_sub_osc_level: 160,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 36, filter_resonance: 38, filter_mod_env_depth: 60, filter_overdrive: 80,
            amp_env_attack: 2, amp_env_decay: 65, amp_env_sustain: 55, amp_env_release: 30,
            mod_env_attack: 3, mod_env_decay: 55, mod_env_sustain: 15, mod_env_release: 25,
            fx_distortion: 18, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 0,
            aftertouch_filter_freq: 85, mod_wheel_filter_freq: 90,
            paraphonic: 0
        }
    },

    // 43: Gospel Shout Arp (Arpeggio)
    {
        slot: 42,
        filename: '43_Gospel_Shout_Arp.syx',
        name: 'Gospel Shout Arp',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 132,
            mixer_osc_1_level: 175, mixer_osc_2_level: 140, mixer_sub_osc_level: 180,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 35, filter_resonance: 58, filter_mod_env_depth: 75, filter_overdrive: 50,
            amp_env_attack: 1, amp_env_decay: 45, amp_env_sustain: 30, amp_env_release: 18,
            mod_env_attack: 1, mod_env_decay: 38, mod_env_sustain: 10, mod_env_release: 15,
            fx_distortion: 12, arp_on: 1, arp_octaves: 1, arp_rhythm: 4
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 2, osc_error: 1,
            aftertouch_filter_freq: 85, mod_wheel_filter_freq: 88,
            paraphonic: 0
        }
    },

    // 44: 303 Acid Arp (Arpeggio)
    {
        slot: 43,
        filename: '44_Acid_Squelch_Arp.syx',
        name: '303 Acid Arp',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 64, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 133,
            mixer_osc_1_level: 180, mixer_osc_2_level: 120, mixer_sub_osc_level: 145,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 1, filter_shape: 0, filter_slope: 1,
            filter_frequency: 28, filter_resonance: 105, filter_mod_env_depth: 88, filter_overdrive: 75,
            amp_env_attack: 1, amp_env_decay: 50, amp_env_sustain: 30, amp_env_release: 20,
            mod_env_attack: 1, mod_env_decay: 40, mod_env_sustain: 10, mod_env_release: 18,
            fx_distortion: 25, arp_on: 1, arp_octaves: 1, arp_rhythm: 8
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 3, osc_error: 1,
            aftertouch_filter_freq: 95, mod_wheel_filter_freq: 95,
            paraphonic: 0
        }
    },

    // 45: Octave Gallop (Arpeggio)
    {
        slot: 44,
        filename: '45_Octave_Gallop.syx',
        name: 'Octave Gallop',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 137,
            mixer_osc_1_level: 145, mixer_osc_2_level: 70, mixer_sub_osc_level: 170,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 40, filter_resonance: 45, filter_overdrive: 110, filter_mod_env_depth: 75,
            amp_env_attack: 0, amp_env_decay: 36, amp_env_sustain: 50, amp_env_release: 20,
            mod_env_attack: 0, mod_env_decay: 36, mod_env_sustain: 40, mod_env_release: 20,
            fx_distortion: 20, arp_on: 1, arp_octaves: 1, arp_note_mode: 0, arp_rhythm: 1, arp_swing: 50
        },
        nrpn: {
            osc1_waveform: 2, osc2_waveform: 2, arp_seq_retrig: 1,
            aftertouch_filter_freq: 88, mod_wheel_filter_freq: 92,
            paraphonic: 0, osc_error: 0
        }
    },

    // 46: Modular Bubble (Arpeggio)
    {
        slot: 45,
        filename: '46_Modular_Bubble.syx',
        name: 'Modular Bubble',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 64, osc2_fine: 138, osc2_manual_pw: 60,
            mixer_osc_1_level: 120, mixer_osc_2_level: 110, mixer_sub_osc_level: 130,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 35, filter_resonance: 58, filter_overdrive: 45, filter_lfo2_depth: 175,
            lfo1_wave: 3, lfo1_speed: 115, lfo2_wave: 3, lfo2_speed: 95,
            amp_env_attack: 12, amp_env_decay: 95, amp_env_sustain: 105, amp_env_release: 45,
            fx_distortion: 15, arp_on: 0
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 3,
            lfo1_slew: 35, lfo2_slew: 30,
            mod_wheel_filter_freq: 92, aftertouch_filter_freq: 80,
            paraphonic: 0, osc_error: 2
        }
    },

    // 47: Prophet Pluck (Arpeggio)
    {
        slot: 46,
        filename: '47_Prophet_Pluck_Arp.syx',
        name: 'Prophet Pluck',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 64, osc1_fine: 125, osc1_manual_pw: 45,
            osc2_range: 64, osc2_fine: 131, osc2_manual_pw: 75,
            mixer_osc_1_level: 160, mixer_osc_2_level: 155, mixer_sub_osc_level: 120,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 0,
            filter_frequency: 38, filter_resonance: 32, filter_mod_env_depth: 60, filter_overdrive: 25,
            amp_env_attack: 2, amp_env_decay: 65, amp_env_sustain: 35, amp_env_release: 35,
            mod_env_attack: 2, mod_env_decay: 50, mod_env_sustain: 15, mod_env_release: 28,
            fx_distortion: 5, arp_on: 1, arp_octaves: 2, arp_rhythm: 3
        },
        nrpn: {
            osc1_waveform: 3, osc2_waveform: 3, osc_error: 2,
            aftertouch_filter_freq: 80, mod_wheel_filter_freq: 85,
            paraphonic: 0
        }
    },

    // 48: Sub Polyrhythm (Arpeggio)
    {
        slot: 47,
        filename: '48_Sub_Bass_Polyrhythm_Arp.syx',
        name: 'Sub Polyrhythm',
        category: '4. Funk & Gospel',
        cc: {
            osc1_range: 63, osc1_fine: 128,
            osc2_range: 63, osc2_fine: 130,
            mixer_osc_1_level: 160, mixer_osc_2_level: 120, mixer_sub_osc_level: 195,
            sub_osc_wave: 0, sub_osc_oct: 63,
            filter_type: 0, filter_shape: 0, filter_slope: 1,
            filter_frequency: 28, filter_resonance: 25, filter_mod_env_depth: 50, filter_overdrive: 35,
            amp_env_attack: 2, amp_env_decay: 58, amp_env_sustain: 50, amp_env_release: 25,
            mod_env_attack: 2, mod_env_decay: 45, mod_env_sustain: 15, mod_env_release: 22,
            fx_distortion: 8, arp_on: 1, arp_octaves: 1, arp_rhythm: 9
        },
        nrpn: {
            osc1_waveform: 1, osc2_waveform: 1, osc_error: 1,
            aftertouch_filter_freq: 75, mod_wheel_filter_freq: 80,
            paraphonic: 0
        }
    },

];

const generatedPatches = [];

for (const spec of patchSpecs) {
    let buf;
    if (spec.isOriginalBailey) {
        buf = Buffer.from(baileyTemplate);
        buf[8] = spec.slot & 0x7F;
        const clean = spec.name.padEnd(16, ' ').slice(0, 16);
        for (let i = 0; i < 16; i++) {
            buf[137 + i] = clean.charCodeAt(i) & 0x7F;
        }
    } else if (spec.isOriginalHeaven) {
        buf = Buffer.from(heavenTemplate);
        buf[8] = spec.slot & 0x7F;
        const clean = spec.name.padEnd(16, ' ').slice(0, 16);
        for (let i = 0; i < 16; i++) {
            buf[137 + i] = clean.charCodeAt(i) & 0x7F;
        }
    } else {
        const builder = new PatchBuilder(spec.slot, spec.name);
        builder.applyConfig(spec);
        buf = builder.getBuffer();
    }

    buf = reviseHardwarePatch(buf);
    const filePath = path.join(patchesDir, spec.filename);
    fs.writeFileSync(filePath, buf);
    console.log(`✓ [Slot ${String(spec.slot).padStart(3, '0')}] Created: ${spec.filename.padEnd(25)} | "${spec.name}"`);
    generatedPatches.push({ spec, buf });
}

// Generate the unified 128-patch Bank File
console.log('\nGenerating 128-patch SysEx bank file with all 48 patches in order...');
const bankBuffers = [];

// Slots 000-047: All 48 patches in sequential order
for (let i = 0; i < 48; i++) {
    const pBuf = Buffer.from(generatedPatches[i].buf);
    pBuf[8] = i & 0x7F;
    bankBuffers.push(pBuf);
}

// Slots 048-127: Clean template initialized slots
for (let i = 48; i < 128; i++) {
    const initBuilder = new PatchBuilder(i, `User Slot ${i}`);
    bankBuffers.push(initBuilder.getBuffer());
}

const fullBankBuffer = Buffer.concat(bankBuffers);
const bankFilePath = path.join(patchesDir, 'PostRock_Ambient_Worship_Bank.syx');
fs.writeFileSync(bankFilePath, fullBankBuffer);

console.log(`✓ Master Bank created: PostRock_Ambient_Worship_Bank.syx (${fullBankBuffer.length} bytes) [Expected: 19712 bytes]`);
console.log(`Slots 000-047 populated in sequence with 48 patches!`);
