import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeWav } from './wav_writer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const samplesDir = path.join(rootDir, 'patches', 'samples');

if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
}

// Clean old sample files
const oldFiles = fs.readdirSync(samplesDir).filter(f => f.endsWith('.wav'));
for (const f of oldFiles) {
    fs.unlinkSync(path.join(samplesDir, f));
}

const sampleRate = 44100;

function polyBlep(t, dt) {
    if (t < dt) {
        let x = t / dt;
        return x + x - x * x - 1.0;
    } else if (t > 1.0 - dt) {
        let x = (t - 1.0) / dt;
        return x * x + x + x + 1.0;
    }
    return 0.0;
}

function oscSample(waveType, phase, dt, pw = 0.5) {
    switch (waveType) {
        case 'sine':
            return Math.sin(2 * Math.PI * phase);
        case 'triangle': {
            let saw = 2 * phase - 1.0;
            return 2 * Math.abs(saw) - 1.0;
        }
        case 'saw': {
            let raw = 2.0 * phase - 1.0;
            return raw - polyBlep(phase, dt);
        }
        case 'pulse': {
            let raw = phase < pw ? 1.0 : -1.0;
            let blep1 = polyBlep(phase, dt);
            let p2 = (phase + 1.0 - pw) % 1.0;
            let blep2 = polyBlep(p2, dt);
            return raw + blep1 - blep2;
        }
        default:
            return 0;
    }
}

class ResonantFilter {
    constructor(type = 'lp', poles = 4) {
        this.type = type;
        this.poles = poles;
        this.s1 = 0;
        this.s2 = 0;
        this.s3 = 0;
        this.s4 = 0;
    }

    process(input, cutoffHz, resRatio, drive = 1.0) {
        let fc = Math.max(20, Math.min(sampleRate * 0.45, cutoffHz));
        let g = Math.tan(Math.PI * fc / sampleRate);
        let r = Math.max(0.1, Math.min(3.8, resRatio * 3.8));

        let inDriven = Math.tanh(input * drive);
        let feedback = this.s4 * r;
        let u = inDriven - feedback;

        let v1 = (u - this.s1) * g / (1 + g);
        let y1 = v1 + this.s1;
        this.s1 = y1 + v1;

        let v2 = (y1 - this.s2) * g / (1 + g);
        let y2 = v2 + this.s2;
        this.s2 = y2 + v2;

        if (this.poles === 2) {
            if (this.type === 'bp') return y1 - y2;
            if (this.type === 'hp') return u - y1 * 2;
            return y2;
        }

        let v3 = (y2 - this.s3) * g / (1 + g);
        let y3 = v3 + this.s3;
        this.s3 = y3 + v3;

        let v4 = (y3 - this.s4) * g / (1 + g);
        let y4 = v4 + this.s4;
        this.s4 = y4 + v4;

        if (this.type === 'bp') return (y2 - y4) * 2.0;
        return y4;
    }
}

function applyStereoSpace(left, right, mix = 0.25, timeSec = 0.35, feedback = 0.45) {
    const delaySamplesL = Math.floor(timeSec * sampleRate);
    const delaySamplesR = Math.floor((timeSec * 1.33) * sampleRate);
    const bufL = new Float32Array(left.length + delaySamplesL);
    const bufR = new Float32Array(right.length + delaySamplesR);

    const outL = new Float32Array(left.length);
    const outR = new Float32Array(right.length);

    for (let i = 0; i < left.length; i++) {
        let readL = i >= delaySamplesL ? bufL[i - delaySamplesL] : 0;
        let readR = i >= delaySamplesR ? bufR[i - delaySamplesR] : 0;

        bufL[i] = left[i] + readL * feedback;
        bufR[i] = right[i] + readR * feedback;

        outL[i] = left[i] * (1 - mix) + readL * mix;
        outR[i] = right[i] * (1 - mix) + readR * mix;
    }
    return [outL, outR];
}

function renderPatchSample(patchConfig) {
    const duration = patchConfig.duration || 4.0;
    const totalSamples = Math.floor(duration * sampleRate);
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);

    const filterL = new ResonantFilter(patchConfig.filterShape || 'lp', patchConfig.filterSlope === '12dB' ? 2 : 4);
    const filterR = new ResonantFilter(patchConfig.filterShape || 'lp', patchConfig.filterSlope === '12dB' ? 2 : 4);

    let phase1 = 0;
    let phase2 = 0;
    let phaseSub = 0;
    let lfo1Phase = 0;
    let lfo2Phase = 0;
    let shVal = 0;
    let shLastStep = -1;

    const notes = patchConfig.notes || [{ start: 0.1, len: 3.5, midi: 36 }];

    for (let i = 0; i < totalSamples; i++) {
        let t = i / sampleRate;

        let activeNote = null;
        let noteAge = 0;
        let noteProgress = 0;
        for (const n of notes) {
            if (t >= n.start && t < n.start + n.len) {
                activeNote = n;
                noteAge = t - n.start;
                noteProgress = noteAge / n.len;
                break;
            }
        }

        if (!activeNote) {
            left[i] = 0;
            right[i] = 0;
            continue;
        }

        let envAttack = patchConfig.ampAttack || 0.01;
        let envRelease = patchConfig.ampRelease || 0.2;
        let ampEnv = 1.0;
        if (noteAge < envAttack) {
            ampEnv = noteAge / envAttack;
        } else if (noteAge > activeNote.len - envRelease) {
            ampEnv = Math.max(0, (activeNote.len - noteAge) / envRelease);
        }

        // Sidechain pump envelope
        if (patchConfig.sidechainPump) {
            let beat = (t % 0.5) / 0.5; // quarter-note ramp pump at 120 BPM
            let pumpCurve = Math.pow(beat, 2.5); // exponential ducking recovery
            ampEnv *= (0.15 + 0.85 * pumpCurve);
        }

        // Sample & Hold Stepped LFO
        let lfo1Rate = patchConfig.lfo1Rate || 3.0;
        let lfo2Rate = patchConfig.lfo2Rate || 0.2;
        lfo1Phase = (lfo1Phase + lfo1Rate / sampleRate) % 1.0;
        lfo2Phase = (lfo2Phase + lfo2Rate / sampleRate) % 1.0;

        if (patchConfig.isSampleAndHold) {
            let currentStep = Math.floor(t * (patchConfig.shRate || 6.0));
            if (currentStep !== shLastStep) {
                shVal = Math.random() * 2 - 1;
                shLastStep = currentStep;
            }
        }

        let lfo1 = patchConfig.isSampleAndHold ? shVal : Math.sin(2 * Math.PI * lfo1Phase);
        let lfo2 = Math.sin(2 * Math.PI * lfo2Phase);

        let baseMidi = activeNote.midi;
        if (patchConfig.portamento && activeNote.prevMidi) {
            let glideTime = patchConfig.portamento;
            let progress = Math.min(1.0, noteAge / glideTime);
            baseMidi = activeNote.prevMidi + (activeNote.midi - activeNote.prevMidi) * (1 - Math.pow(1 - progress, 2));
        }

        let pitchDrift = (patchConfig.oscError || 0) * 0.08 * (Math.sin(t * 1.7) + Math.cos(t * 2.3));
        let vibrato = (patchConfig.vibrato || 0) * lfo1 * 0.4;
        let freq1 = 440 * Math.pow(2, (baseMidi + (patchConfig.osc1Octave || 0) * 12 + pitchDrift + vibrato - 69) / 12);
        let detune2Cents = (patchConfig.osc2DetuneCents || 0) + pitchDrift * 1.2;
        let freq2 = 440 * Math.pow(2, (baseMidi + (patchConfig.osc2Octave || 0) * 12 + detune2Cents / 100 + vibrato - 69) / 12);
        let freqSub = 440 * Math.pow(2, (baseMidi + (patchConfig.subOctave || -1) * 12 + vibrato - 69) / 12);

        let dt1 = freq1 / sampleRate;
        let dt2 = freq2 / sampleRate;
        let dtSub = freqSub / sampleRate;

        phase1 = (phase1 + dt1) % 1.0;
        phase2 = (phase2 + dt2) % 1.0;
        phaseSub = (phaseSub + dtSub) % 1.0;

        let s1 = oscSample(patchConfig.osc1Wave || 'saw', phase1, dt1, patchConfig.osc1Pw || 0.5) * (patchConfig.osc1Level || 0.8);
        let s2 = oscSample(patchConfig.osc2Wave || 'saw', phase2, dt2, patchConfig.osc2Pw || 0.5) * (patchConfig.osc2Level || 0.5);
        let sSub = oscSample(patchConfig.subWave || 'sine', phaseSub, dtSub) * (patchConfig.subLevel || 0.9);
        let sNoise = (patchConfig.noiseLevel || 0) * (Math.random() * 2 - 1);

        // Dynamic noise riser
        if (patchConfig.riserNoise) {
            sNoise = (t / duration) * 0.8 * (Math.random() * 2 - 1);
        }

        let mix = (s1 + s2 + sSub + sNoise) * ampEnv;

        let cutoff = patchConfig.baseCutoff || 250;
        let filterEnvAmt = patchConfig.filterEnvAmt || 0;
        let filterLfoAmt = patchConfig.filterLfoAmt || 0;
        let dynamicCutoff = cutoff + filterEnvAmt * ampEnv + filterLfoAmt * (patchConfig.isSampleAndHold ? shVal : lfo2);

        if (patchConfig.swell) {
            dynamicCutoff += (noteProgress * (patchConfig.swellCutoffBoost || 400));
        }
        if (patchConfig.riser) {
            dynamicCutoff += Math.pow(t / duration, 1.8) * 1600; // dramatic filter riser
        }

        let filteredL = filterL.process(mix, dynamicCutoff, patchConfig.resonance || 0.2, patchConfig.drive || 1.0);
        let filteredR = filterR.process(mix, dynamicCutoff * 1.02, patchConfig.resonance || 0.2, patchConfig.drive || 1.0);

        if (patchConfig.distortion) {
            let distAmt = patchConfig.distortion;
            filteredL = Math.tanh(filteredL * (1 + distAmt * 2.5));
            filteredR = Math.tanh(filteredR * (1 + distAmt * 2.5));
        }

        left[i] = filteredL * 0.85;
        right[i] = filteredR * 0.85;
    }

    if (patchConfig.stereoSpace) {
        return applyStereoSpace(left, right, patchConfig.spaceMix || 0.28, patchConfig.spaceTime || 0.32, patchConfig.spaceFeedback || 0.45);
    }
    return [left, right];
}

// Complete 24 Audition Profiles in Sequential Order
const auditionProfiles = [
    // === PILLAR 1: WORSHIP FOUNDATION (01-07) ===
    // 01: Sanctuary Sub
    {
        id: '01_Sanctuary_Sub', name: 'Sanctuary Sub', duration: 4.5,
        osc1Wave: 'triangle', osc1Level: 0.5, osc1Octave: 0, osc2Level: 0,
        subWave: 'sine', subLevel: 1.0, subOctave: -1, baseCutoff: 140,
        resonance: 0.1, drive: 1.1, ampAttack: 0.02, ampRelease: 0.35,
        notes: [{ start: 0.2, len: 1.8, midi: 36 }, { start: 2.1, len: 1.9, midi: 34 }]
    },
    // 02: Refinery Special (User's original service patch)
    {
        id: '02_Refinery_Special', name: 'Refinery Special', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.8, osc1Octave: 0, osc2Wave: 'saw', osc2Level: 0.35, osc2Octave: 1, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 0.9, subOctave: -1, baseCutoff: 230, filterEnvAmt: 260,
        resonance: 0.35, drive: 2.2, distortion: 0.18, ampAttack: 0.01, ampRelease: 0.35,
        notes: [{ start: 0.1, len: 1.8, midi: 36 }, { start: 2.1, len: 2.1, midi: 34 }]
    },
    // 03: Refinery Swell (Ambient/prayer evolution of Refinery Special)
    {
        id: '03_Refinery_Swell', name: 'Refinery Swell', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.75, osc1Octave: 0, osc2Wave: 'saw', osc2Level: 0.35, osc2Octave: 1, osc2DetuneCents: 11,
        subWave: 'sine', subLevel: 0.85, subOctave: -1, baseCutoff: 180, swell: true, swellCutoffBoost: 220,
        resonance: 0.32, drive: 1.9, distortion: 0.15, ampAttack: 1.1, ampRelease: 0.8, stereoSpace: true, spaceMix: 0.25,
        notes: [{ start: 0.2, len: 4.4, midi: 36 }]
    },
    // 04: Anthem Drive Arp (User's original service 16th arp - crafted for "Heaven")
    {
        id: '04_Anthem_Drive_Arp', name: 'Anthem Drive Arp', duration: 4.0,
        osc1Wave: 'saw', osc1Level: 0.8, osc2Wave: 'saw', osc2Level: 0.35, osc2Octave: 1, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 0.9, subOctave: -1, baseCutoff: 240, filterEnvAmt: 420,
        resonance: 0.42, drive: 2.2, distortion: 0.18, ampAttack: 0.005, ampRelease: 0.09,
        notes: [
            { start: 0.0, len: 0.2, midi: 36 }, { start: 0.25, len: 0.2, midi: 36 }, { start: 0.50, len: 0.2, midi: 36 },
            { start: 0.75, len: 0.2, midi: 36 }, { start: 1.00, len: 0.2, midi: 36 }, { start: 1.25, len: 0.2, midi: 36 },
            { start: 1.50, len: 0.2, midi: 36 }, { start: 1.75, len: 0.2, midi: 36 }, { start: 2.00, len: 0.2, midi: 36 },
            { start: 2.25, len: 0.2, midi: 36 }, { start: 2.50, len: 0.2, midi: 36 }, { start: 2.75, len: 0.2, midi: 36 },
            { start: 3.00, len: 0.2, midi: 34 }, { start: 3.25, len: 0.6, midi: 36 }
        ]
    },
    // 05: Praise 16th Arp
    {
        id: '05_Praise_16th_Arp', name: 'Praise 16th Arp', duration: 4.0,
        osc1Wave: 'saw', osc1Level: 0.75, osc2Wave: 'saw', osc2Level: 0.35, osc2Octave: 1, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.9, subOctave: -1, baseCutoff: 260, filterEnvAmt: 450,
        resonance: 0.45, drive: 2.2, distortion: 0.22, ampAttack: 0.005, ampRelease: 0.08,
        notes: [
            { start: 0.0, len: 0.2, midi: 36 }, { start: 0.24, len: 0.2, midi: 36 }, { start: 0.48, len: 0.2, midi: 48 },
            { start: 0.72, len: 0.2, midi: 36 }, { start: 0.96, len: 0.2, midi: 36 }, { start: 1.20, len: 0.2, midi: 46 },
            { start: 1.44, len: 0.2, midi: 36 }, { start: 1.68, len: 0.2, midi: 48 }, { start: 1.92, len: 0.2, midi: 36 },
            { start: 2.16, len: 0.2, midi: 36 }, { start: 2.40, len: 0.2, midi: 48 }, { start: 2.64, len: 0.2, midi: 36 },
            { start: 2.88, len: 0.2, midi: 39 }, { start: 3.12, len: 0.2, midi: 38 }, { start: 3.36, len: 0.5, midi: 36 }
        ]
    },
    // 06: Sunday Driver
    {
        id: '06_Sunday_Driver', name: 'Sunday Driver', duration: 4.0,
        osc1Wave: 'pulse', osc1Pw: 0.5, osc1Level: 0.8, osc2Wave: 'saw', osc2Level: 0.4, osc2DetuneCents: 4,
        subWave: 'sine', subLevel: 0.75, subOctave: -1, baseCutoff: 220, filterEnvAmt: 500,
        resonance: 0.28, drive: 1.6, distortion: 0.1, ampAttack: 0.005, ampRelease: 0.15,
        notes: [
            { start: 0.1, len: 0.7, midi: 36 }, { start: 0.9, len: 0.7, midi: 36 },
            { start: 1.7, len: 0.5, midi: 41 }, { start: 2.3, len: 0.5, midi: 43 }, { start: 2.9, len: 0.9, midi: 36 }
        ]
    },
    // 07: Living Water
    {
        id: '07_Living_Water', name: 'Living Water', duration: 4.5,
        osc1Wave: 'triangle', osc1Level: 0.85, osc2Wave: 'sine', osc2Level: 0.45, osc2Octave: 1, osc2DetuneCents: 6,
        subWave: 'sine', subLevel: 0.7, subOctave: -1, portamento: 0.22, baseCutoff: 210, filterEnvAmt: 280,
        resonance: 0.25, drive: 1.3, ampAttack: 0.03, ampRelease: 0.25, vibrato: 0.25,
        notes: [
            { start: 0.1, len: 1.2, midi: 36, prevMidi: 36 },
            { start: 1.3, len: 1.0, midi: 41, prevMidi: 36 },
            { start: 2.3, len: 1.9, midi: 39, prevMidi: 41 }
        ]
    },

    // === PILLAR 2: POST-ROCK POWER (08-12) ===
    // 08: Caspian Bow
    {
        id: '08_Caspian_Bow', name: 'Caspian Bow', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.75, osc1Octave: 0, osc2Wave: 'saw', osc2Level: 0.7, osc2DetuneCents: 14,
        subWave: 'sine', subLevel: 0.65, subOctave: -1, baseCutoff: 220, swell: true, swellCutoffBoost: 380,
        resonance: 0.42, drive: 1.8, distortion: 0.35, ampAttack: 1.2, ampRelease: 0.7, oscError: 3, stereoSpace: true, spaceMix: 0.35,
        notes: [{ start: 0.2, len: 4.4, midi: 36 }]
    },
    // 09: Tectonic Dist
    {
        id: '09_Tectonic_Dist', name: 'Tectonic Dist', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: 0, osc2Wave: 'saw', osc2Level: 0.8, osc2Octave: 1, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 1.1, subOctave: -1, baseCutoff: 380, resonance: 0.28, drive: 3.5, distortion: 0.88,
        ampAttack: 0.01, ampRelease: 0.35, notes: [{ start: 0.1, len: 2.0, midi: 36 }, { start: 2.2, len: 2.0, midi: 34 }]
    },
    // 10: Mogwai Drone
    {
        id: '10_Mogwai_Drone', name: 'Mogwai Drone', duration: 5.0,
        osc1Wave: 'pulse', osc1Pw: 0.65, osc1Level: 0.7, osc2Wave: 'saw', osc2Level: 0.65, osc2Octave: 1, osc2DetuneCents: 7,
        subWave: 'pulse', subLevel: 0.65, subOctave: -1, baseCutoff: 240, filterSlope: '12dB', resonance: 0.32, drive: 2.0,
        distortion: 0.25, ampAttack: 0.8, ampRelease: 1.0, oscError: 2, stereoSpace: true, spaceMix: 0.32,
        notes: [{ start: 0.2, len: 4.5, midi: 36 }]
    },
    // 11: Sigur Lead
    {
        id: '11_Sigur_Lead', name: 'Sigur Lead', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.85, osc1Octave: 2, osc2Wave: 'triangle', osc2Level: 0.55, osc2Octave: 2, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.25, subOctave: 1, baseCutoff: 450, resonance: 0.58, drive: 1.7, distortion: 0.18,
        ampAttack: 0.15, ampRelease: 0.5, portamento: 0.2, vibrato: 0.38, stereoSpace: true, spaceMix: 0.38,
        notes: [
            { start: 0.1, len: 1.2, midi: 60, prevMidi: 60 },
            { start: 1.3, len: 1.2, midi: 65, prevMidi: 60 },
            { start: 2.5, len: 2.2, midi: 67, prevMidi: 65 }
        ]
    },
    // 12: Quiet Earth
    {
        id: '12_Quiet_Earth', name: 'Quiet Earth', duration: 4.5,
        osc1Wave: 'triangle', osc1Level: 0.85, osc2Wave: 'sine', osc2Level: 0.4, osc2Octave: 1, subWave: 'sine', subLevel: 0.75, subOctave: -1,
        baseCutoff: 160, resonance: 0.15, drive: 1.1, ampAttack: 0.25, ampRelease: 0.45, oscError: 2,
        notes: [{ start: 0.2, len: 1.8, midi: 36 }, { start: 2.1, len: 2.0, midi: 33 }]
    },

    // === PILLAR 3: AMBIENT & SHIMMER (13-18) ===
    // 13: Tape Drift
    {
        id: '13_Tape_Drift', name: 'Tape Drift', duration: 4.5,
        osc1Wave: 'pulse', osc1Pw: 0.6, osc1Level: 0.75, osc2Wave: 'saw', osc2Level: 0.55, osc2Octave: 1, osc2DetuneCents: 12,
        subWave: 'sine', subLevel: 0.65, subOctave: -1, baseCutoff: 240, filterSlope: '12dB', resonance: 0.22, drive: 1.5, distortion: 0.15,
        ampAttack: 0.3, ampRelease: 0.5, oscError: 5, stereoSpace: true, spaceMix: 0.25, notes: [{ start: 0.2, len: 4.0, midi: 36 }]
    },
    // 14: Ether Swell
    {
        id: '14_Ether_Swell', name: 'Ether Swell', duration: 5.5,
        osc1Wave: 'saw', osc1Level: 0.7, osc1Octave: 1, osc2Wave: 'pulse', osc2Pw: 0.45, osc2Level: 0.65, osc2Octave: 1, osc2DetuneCents: 9,
        subWave: 'sine', subLevel: 0.5, subOctave: 0, baseCutoff: 150, filterLfoAmt: 140, filterSlope: '12dB', resonance: 0.3, drive: 1.4,
        ampAttack: 2.2, ampRelease: 1.2, stereoSpace: true, spaceMix: 0.42, notes: [{ start: 0.2, len: 5.0, midi: 48 }]
    },
    // 15: Glass Pluck
    {
        id: '15_Glass_Pluck', name: 'Glass Pluck', duration: 4.5,
        osc1Wave: 'pulse', osc1Pw: 0.85, osc1Level: 0.85, osc1Octave: 2, osc2Wave: 'sine', osc2Level: 0.5, osc2Octave: 3, osc2DetuneCents: 7,
        subLevel: 0, filterShape: 'bp', baseCutoff: 520, filterEnvAmt: 480, resonance: 0.68, drive: 1.2, ampAttack: 0.005, ampRelease: 0.35,
        stereoSpace: true, spaceMix: 0.45, spaceTime: 0.38,
        notes: [
            { start: 0.1, len: 0.3, midi: 60 }, { start: 0.6, len: 0.3, midi: 67 }, { start: 1.1, len: 0.3, midi: 72 },
            { start: 1.6, len: 0.3, midi: 67 }, { start: 2.1, len: 0.3, midi: 65 }, { start: 2.6, len: 0.8, midi: 60 }
        ]
    },
    // 16: Aurora Waves
    {
        id: '16_Aurora_Waves', name: 'Aurora Waves', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.7, osc1Octave: 1, osc2Wave: 'pulse', osc2Pw: 0.7, osc2Level: 0.6, osc2Octave: 1, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 0.5, subOctave: 0, noiseLevel: 0.06, baseCutoff: 210, filterLfoAmt: 120, resonance: 0.42, drive: 1.3,
        ampAttack: 1.0, ampRelease: 0.8, stereoSpace: true, spaceMix: 0.38, notes: [{ start: 0.2, len: 4.5, midi: 48 }]
    },
    // 17: Hollow Chill
    {
        id: '17_Hollow_Chill', name: 'Hollow Chill', duration: 4.5,
        osc1Wave: 'pulse', osc1Pw: 0.5, osc1Level: 0.75, osc1Octave: 0, osc2Wave: 'triangle', osc2Level: 0.65, osc2Octave: 1, osc2DetuneCents: 8,
        subLevel: 0, filterShape: 'bp', baseCutoff: 380, resonance: 0.48, drive: 1.5, distortion: 0.15, ampAttack: 0.6, ampRelease: 0.7,
        stereoSpace: true, spaceMix: 0.35, notes: [{ start: 0.2, len: 4.0, midi: 48 }]
    },
    // 18: Celestial Lead
    {
        id: '18_Celestial_Lead', name: 'Celestial Lead', duration: 5.0,
        osc1Wave: 'pulse', osc1Pw: 0.6, osc1Level: 0.75, osc1Octave: 2, osc2Wave: 'pulse', osc2Pw: 0.4, osc2Level: 0.75, osc2Octave: 2, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.3, subOctave: 1, portamento: 0.15, baseCutoff: 340, filterEnvAmt: 260, resonance: 0.4, drive: 1.6,
        distortion: 0.08, ampAttack: 0.35, ampRelease: 0.6, vibrato: 0.28, stereoSpace: true, spaceMix: 0.42,
        notes: [
            { start: 0.1, len: 1.4, midi: 60, prevMidi: 60 },
            { start: 1.5, len: 1.3, midi: 67, prevMidi: 60 },
            { start: 2.8, len: 1.8, midi: 65, prevMidi: 67 }
        ]
    },

    // === PILLAR 4: RHYTHMIC MOTION & OSTINATOS (19-24) ===
    // 19: Sidechain Pump
    {
        id: '19_Sidechain_Pump', name: 'Sidechain Pump', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.8, osc1Octave: 0, osc2Wave: 'saw', osc2Level: 0.4, osc2Octave: 1, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.95, subOctave: -1, sidechainPump: true,
        baseCutoff: 210, resonance: 0.25, drive: 1.5, distortion: 0.12,
        notes: [{ start: 0.1, len: 4.2, midi: 36 }]
    },
    // 20: Modular Bubble
    {
        id: '20_Modular_Bubble', name: 'Modular Bubble', duration: 4.5,
        osc1Wave: 'triangle', osc1Level: 0.7, osc1Octave: 0, osc2Wave: 'pulse', osc2Pw: 0.6, osc2Level: 0.65, osc2Octave: 1, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 0.8, subOctave: -1, isSampleAndHold: true, shRate: 8.0,
        baseCutoff: 260, filterLfoAmt: 380, resonance: 0.58, drive: 1.4, distortion: 0.15,
        notes: [{ start: 0.1, len: 4.2, midi: 36 }]
    },
    // 21: Dotted 8th Motor
    {
        id: '21_Dotted_8th_Motor', name: 'Dotted 8th Motor', duration: 4.0,
        osc1Wave: 'pulse', osc1Pw: 0.55, osc1Level: 0.8, osc2Wave: 'saw', osc2Level: 0.4, osc2DetuneCents: 6,
        subWave: 'sine', subLevel: 0.85, subOctave: -1, baseCutoff: 280, filterEnvAmt: 420,
        resonance: 0.42, drive: 1.8, distortion: 0.16, ampAttack: 0.005, ampRelease: 0.08,
        notes: [
            { start: 0.0, len: 0.2, midi: 36 }, { start: 0.35, len: 0.2, midi: 36 }, { start: 0.70, len: 0.2, midi: 48 },
            { start: 1.05, len: 0.2, midi: 36 }, { start: 1.40, len: 0.2, midi: 46 }, { start: 1.75, len: 0.2, midi: 36 },
            { start: 2.10, len: 0.2, midi: 48 }, { start: 2.45, len: 0.2, midi: 36 }, { start: 2.80, len: 0.2, midi: 41 },
            { start: 3.15, len: 0.5, midi: 36 }
        ]
    },
    // 22: Octave Gallop
    {
        id: '22_Octave_Gallop', name: 'Octave Gallop', duration: 4.0,
        osc1Wave: 'saw', osc1Level: 0.8, osc2Wave: 'saw', osc2Level: 0.45, osc2Octave: 1, osc2DetuneCents: 9,
        subWave: 'sine', subLevel: 0.9, subOctave: -1, baseCutoff: 300, filterEnvAmt: 400,
        resonance: 0.45, drive: 2.0, distortion: 0.2, ampAttack: 0.005, ampRelease: 0.08,
        notes: [
            { start: 0.0, len: 0.15, midi: 36 }, { start: 0.18, len: 0.15, midi: 48 }, { start: 0.36, len: 0.15, midi: 36 },
            { start: 0.54, len: 0.15, midi: 48 }, { start: 0.72, len: 0.15, midi: 36 }, { start: 0.90, len: 0.15, midi: 48 },
            { start: 1.08, len: 0.15, midi: 36 }, { start: 1.26, len: 0.15, midi: 48 }, { start: 1.44, len: 0.15, midi: 36 },
            { start: 1.62, len: 0.15, midi: 48 }, { start: 1.80, len: 0.15, midi: 36 }, { start: 1.98, len: 0.15, midi: 48 },
            { start: 2.16, len: 0.15, midi: 36 }, { start: 2.34, len: 0.15, midi: 48 }, { start: 2.52, len: 0.15, midi: 36 },
            { start: 2.70, len: 0.15, midi: 48 }, { start: 2.88, len: 0.15, midi: 39 }, { start: 3.06, len: 0.15, midi: 51 },
            { start: 3.24, len: 0.5, midi: 36 }
        ]
    },
    // 23: Sacred Riser
    {
        id: '23_Sacred_Riser', name: 'Sacred Riser', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.5, osc1Octave: 0, osc2Wave: 'saw', osc2Level: 0.4, osc2Octave: 1,
        subWave: 'sine', subLevel: 0.7, subOctave: -1, riser: true, riserNoise: true,
        baseCutoff: 120, resonance: 0.52, drive: 1.6, distortion: 0.22, stereoSpace: true, spaceMix: 0.35,
        notes: [{ start: 0.1, len: 4.8, midi: 36 }]
    },
    // 24: Clockwork Pluck
    {
        id: '24_Clockwork_Pluck', name: 'Clockwork Pluck', duration: 4.0,
        osc1Wave: 'triangle', osc1Level: 0.85, osc2Wave: 'pulse', osc2Pw: 0.8, osc2Level: 0.5, osc2Octave: 1,
        subWave: 'sine', subLevel: 0.6, subOctave: -1, baseCutoff: 380, filterEnvAmt: 460,
        resonance: 0.35, drive: 1.1, ampAttack: 0.005, ampRelease: 0.04,
        notes: [
            { start: 0.1, len: 0.12, midi: 36 }, { start: 0.4, len: 0.12, midi: 36 }, { start: 0.7, len: 0.12, midi: 36 },
            { start: 1.0, len: 0.12, midi: 43 }, { start: 1.3, len: 0.12, midi: 36 }, { start: 1.6, len: 0.12, midi: 36 },
            { start: 1.9, len: 0.12, midi: 41 }, { start: 2.2, len: 0.12, midi: 36 }, { start: 2.5, len: 0.12, midi: 36 },
            { start: 2.8, len: 0.12, midi: 43 }, { start: 3.1, len: 0.12, midi: 36 }
        ]
    },

    // === PILLAR 5: SHOEGAZE WALLS & DREAM-POP (25-30) ===
    // 25: Shields Glide
    {
        id: '25_Shields_Glide', name: 'Shields Glide', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.8, osc1Octave: 0,
        osc2Wave: 'saw', osc2Level: 0.75, osc2Octave: 0, osc2DetuneCents: 15,
        subWave: 'sine', subLevel: 0.85, subOctave: -1,
        portamento: 0.35, vibrato: 0.45, oscError: 4,
        baseCutoff: 260, resonance: 0.32, drive: 1.9, distortion: 0.22,
        ampAttack: 0.08, ampRelease: 0.6, stereoSpace: true, spaceMix: 0.32,
        notes: [
            { start: 0.1, len: 1.8, midi: 36, prevMidi: 36 },
            { start: 1.9, len: 1.5, midi: 41, prevMidi: 36 },
            { start: 3.4, len: 1.5, midi: 38, prevMidi: 41 }
        ]
    },
    // 26: Slowdive Wash
    {
        id: '26_Slowdive_Wash', name: 'Slowdive Wash', duration: 5.0,
        osc1Wave: 'pulse', osc1Pw: 0.75, osc1Level: 0.75, osc1Octave: 1,
        osc2Wave: 'pulse', osc2Pw: 0.45, osc2Level: 0.7, osc2Octave: 1, osc2DetuneCents: 12,
        subWave: 'sine', subLevel: 0.9, subOctave: 0,
        filterSlope: '12dB', baseCutoff: 320, filterLfoAmt: 220,
        resonance: 0.38, drive: 1.5, distortion: 0.1,
        ampAttack: 0.5, ampRelease: 0.8, stereoSpace: true, spaceMix: 0.45, spaceTime: 0.42,
        notes: [{ start: 0.2, len: 4.5, midi: 48 }]
    },
    // 27: Gothic Chorus
    {
        id: '27_Gothic_Chorus', name: 'Gothic Chorus', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.85, osc1Octave: 0,
        osc2Wave: 'saw', osc2Level: 0.8, osc2Octave: 0, osc2DetuneCents: 16,
        subWave: 'sine', subLevel: 0.75, subOctave: -1,
        baseCutoff: 420, filterEnvAmt: 380, resonance: 0.44, drive: 1.6, distortion: 0.15,
        ampAttack: 0.005, ampRelease: 0.25,
        notes: [
            { start: 0.1, len: 0.6, midi: 36 }, { start: 0.8, len: 0.6, midi: 36 },
            { start: 1.5, len: 0.5, midi: 43 }, { start: 2.1, len: 0.5, midi: 41 },
            { start: 2.7, len: 0.5, midi: 40 }, { start: 3.3, len: 1.0, midi: 36 }
        ]
    },
    // 28: Blackgaze Roar
    {
        id: '28_Blackgaze_Roar', name: 'Blackgaze Roar', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: 0,
        osc2Wave: 'saw', osc2Level: 0.85, osc2Octave: 1, osc2DetuneCents: 11,
        subWave: 'sine', subLevel: 1.15, subOctave: -1, noiseLevel: 0.18,
        baseCutoff: 360, resonance: 0.32, drive: 3.8, distortion: 0.75,
        ampAttack: 0.01, ampRelease: 0.4,
        notes: [{ start: 0.1, len: 2.0, midi: 36 }, { start: 2.2, len: 2.1, midi: 34 }]
    },
    // 29: Dream Fluff
    {
        id: '29_Dream_Fluff', name: 'Dream Fluff', duration: 5.0,
        osc1Wave: 'triangle', osc1Level: 0.85, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.65, osc2Level: 0.6, osc2Octave: 1, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.9, subOctave: -1,
        baseCutoff: 190, resonance: 0.2, drive: 1.4, distortion: 0.08, oscError: 3,
        ampAttack: 0.35, ampRelease: 0.7, stereoSpace: true, spaceMix: 0.3,
        notes: [{ start: 0.2, len: 2.2, midi: 36 }, { start: 2.5, len: 2.3, midi: 33 }]
    },
    // 30: Feedback Siren
    {
        id: '30_Feedback_Siren', name: 'Feedback Siren', duration: 5.0,
        osc1Wave: 'saw', osc1Level: 0.8, osc1Octave: 1,
        osc2Wave: 'saw', osc2Level: 0.75, osc2Octave: 2, osc2DetuneCents: 14,
        subWave: 'sine', subLevel: 0.4, subOctave: 0,
        filterShape: 'lp', baseCutoff: 480, resonance: 0.85, drive: 2.4, distortion: 0.35,
        portamento: 0.25, vibrato: 0.35, swell: true, swellCutoffBoost: 500,
        ampAttack: 0.2, ampRelease: 0.6, stereoSpace: true, spaceMix: 0.4,
        notes: [
            { start: 0.1, len: 2.2, midi: 48, prevMidi: 48 },
            { start: 2.4, len: 2.4, midi: 55, prevMidi: 48 }
        ]
    },

    // === PILLAR 6: FUNK, GOSPEL & GROOVY BASSES (31-36) ===
    // 31: Funk Auto-Wah
    {
        id: '31_Funk_AutoWah', name: 'Funk Auto-Wah', duration: 4.5,
        osc1Wave: 'pulse', osc1Pw: 0.7, osc1Level: 0.85, osc1Octave: 0,
        osc2Wave: 'saw', osc2Level: 0.7, osc2Octave: 0, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.95, subOctave: -1,
        baseCutoff: 220, filterEnvAmt: 750, resonance: 0.65, drive: 1.35, distortion: 0.06,
        ampAttack: 0.008, ampRelease: 0.22,
        notes: [
            { start: 0.1, len: 0.45, midi: 28 }, { start: 0.65, len: 0.35, midi: 31 },
            { start: 1.1, len: 0.5, midi: 33 }, { start: 1.7, len: 0.35, midi: 28 },
            { start: 2.15, len: 0.4, midi: 38 }, { start: 2.65, len: 0.6, midi: 40 },
            { start: 3.35, len: 0.8, midi: 28 }
        ]
    },
    // 32: Gospel Chop
    {
        id: '32_Gospel_Chop', name: 'Gospel Chop', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.8, osc1Octave: -1,
        osc2Wave: 'pulse', osc2Pw: 0.6, osc2Level: 0.65, osc2Octave: 0, osc2DetuneCents: 6,
        subWave: 'sine', subLevel: 1.2, subOctave: -1,
        baseCutoff: 380, filterEnvAmt: 340, resonance: 0.42, drive: 1.45, distortion: 0.12,
        ampAttack: 0.002, ampRelease: 0.18,
        notes: [
            { start: 0.1, len: 0.25, midi: 34 }, { start: 0.4, len: 0.25, midi: 36 },
            { start: 0.7, len: 0.25, midi: 39 }, { start: 1.0, len: 0.25, midi: 41 },
            { start: 1.3, len: 0.35, midi: 43 }, { start: 1.75, len: 0.3, midi: 48 },
            { start: 2.15, len: 0.3, midi: 46 }, { start: 2.55, len: 0.7, midi: 36 }
        ]
    },
    // 33: Talkbox Lead
    {
        id: '33_Talkbox_Lead', name: 'Talkbox Lead', duration: 5.0,
        osc1Wave: 'pulse', osc1Pw: 0.82, osc1Level: 0.85, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.75, osc2Level: 0.75, osc2Octave: 1, osc2DetuneCents: 12,
        subWave: 'sine', subLevel: 0.6, subOctave: -1,
        filterShape: 'bp', baseCutoff: 480, filterEnvAmt: 450, resonance: 0.72, drive: 1.6, distortion: 0.18,
        portamento: 0.18, vibrato: 0.25,
        ampAttack: 0.015, ampRelease: 0.3, stereoSpace: true, spaceMix: 0.35, spaceTime: 0.3,
        notes: [
            { start: 0.1, len: 0.8, midi: 41, prevMidi: 41 },
            { start: 1.0, len: 0.6, midi: 44, prevMidi: 41 },
            { start: 1.7, len: 0.7, midi: 46, prevMidi: 44 },
            { start: 2.5, len: 1.1, midi: 48, prevMidi: 46 },
            { start: 3.7, len: 0.9, midi: 46, prevMidi: 48 }
        ]
    },
    // 34: Bernie Funk
    {
        id: '34_Moog_Funk_Sub', name: 'Bernie Funk', duration: 4.5,
        osc1Wave: 'pulse', osc1Pw: 0.5, osc1Level: 0.85, osc1Octave: -1,
        osc2Wave: 'saw', osc2Level: 0.75, osc2Octave: -1, osc2DetuneCents: 7,
        subWave: 'sine', subLevel: 1.1, subOctave: -1,
        baseCutoff: 240, filterEnvAmt: 420, resonance: 0.52, drive: 1.3, distortion: 0.05,
        ampAttack: 0.005, ampRelease: 0.22,
        notes: [
            { start: 0.1, len: 0.45, midi: 39 }, { start: 0.65, len: 0.4, midi: 43 },
            { start: 1.15, len: 0.4, midi: 44 }, { start: 1.65, len: 0.5, midi: 46 },
            { start: 2.25, len: 0.35, midi: 39 }, { start: 2.7, len: 0.4, midi: 41 },
            { start: 3.2, len: 0.9, midi: 39 }
        ]
    },
    // 35: Acid Squelch
    {
        id: '35_Acid_Squelch', name: 'Acid Squelch', duration: 4.0,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.5, osc2Level: 0.6, osc2Octave: 0, osc2DetuneCents: 9,
        subWave: 'sine', subLevel: 0.9, subOctave: -1,
        filterShape: 'lp', baseCutoff: 300, filterEnvAmt: 650, resonance: 0.78, drive: 1.8, distortion: 0.22,
        ampAttack: 0.004, ampRelease: 0.18,
        notes: [
            { start: 0.1, len: 0.22, midi: 38 }, { start: 0.38, len: 0.22, midi: 38 },
            { start: 0.66, len: 0.3, midi: 41 }, { start: 1.04, len: 0.25, midi: 43 },
            { start: 1.36, len: 0.35, midi: 48 }, { start: 1.78, len: 0.25, midi: 38 },
            { start: 2.1, len: 0.3, midi: 46 }, { start: 2.48, len: 0.8, midi: 38 }
        ]
    },
    // 36: Nu-Disco Pulse
    {
        id: '36_Nu_Disco_Pulse', name: 'Nu-Disco Pulse', duration: 4.2,
        osc1Wave: 'saw', osc1Level: 0.85, osc1Octave: -1,
        osc2Wave: 'pulse', osc2Pw: 0.65, osc2Level: 0.7, osc2Octave: 0, osc2DetuneCents: 6,
        subWave: 'sine', subLevel: 1.0, subOctave: -1,
        baseCutoff: 320, filterEnvAmt: 300, resonance: 0.38, drive: 2.0, distortion: 0.18,
        ampAttack: 0.005, ampRelease: 0.16,
        notes: [
            { start: 0.1, len: 0.2, midi: 33 }, { start: 0.35, len: 0.2, midi: 45 },
            { start: 0.6, len: 0.2, midi: 33 }, { start: 0.85, len: 0.2, midi: 45 },
            { start: 1.1, len: 0.2, midi: 36 }, { start: 1.35, len: 0.2, midi: 48 },
            { start: 1.6, len: 0.2, midi: 38 }, { start: 1.85, len: 0.25, midi: 50 },
            { start: 2.2, len: 0.2, midi: 33 }, { start: 2.45, len: 0.2, midi: 45 },
            { start: 2.7, len: 0.2, midi: 33 }, { start: 2.95, len: 0.7, midi: 45 }
        ]
    },
    // ================= PILLAR 7: ARPEGGIOS & SEQUENTIAL POWERHOUSES =================
    // 37: Cathedral 16ths
    {
        id: '37_Cathedral_16ths', name: 'Cathedral 16ths', duration: 4.8,
        osc1Wave: 'saw', osc1Level: 0.85, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.7, osc2Level: 0.75, osc2Octave: 1, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.7, subOctave: -1,
        baseCutoff: 440, filterEnvAmt: 500, resonance: 0.48, drive: 1.45, distortion: 0.12,
        ampAttack: 0.003, ampRelease: 0.22, stereoSpace: true, spaceMix: 0.35, spaceTime: 0.25,
        notes: [
            { start: 0.1, len: 0.18, midi: 48 }, { start: 0.3, len: 0.18, midi: 52 },
            { start: 0.5, len: 0.18, midi: 55 }, { start: 0.7, len: 0.18, midi: 60 },
            { start: 0.9, len: 0.18, midi: 55 }, { start: 1.1, len: 0.18, midi: 52 },
            { start: 1.3, len: 0.18, midi: 48 }, { start: 1.5, len: 0.18, midi: 52 },
            { start: 1.7, len: 0.18, midi: 46 }, { start: 1.9, len: 0.18, midi: 50 },
            { start: 2.1, len: 0.18, midi: 53 }, { start: 2.3, len: 0.18, midi: 58 },
            { start: 2.5, len: 0.18, midi: 53 }, { start: 2.7, len: 0.18, midi: 50 },
            { start: 2.9, len: 0.18, midi: 46 }, { start: 3.1, len: 0.7, midi: 48 }
        ]
    },
    // 38: Prophet Pluck
    {
        id: '38_Prophet_Pluck_Arp', name: 'Prophet Pluck', duration: 4.5,
        osc1Wave: 'pulse', osc1Pw: 0.45, osc1Level: 0.8, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.75, osc2Level: 0.75, osc2Octave: 0, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 0.6, subOctave: -1,
        baseCutoff: 380, filterEnvAmt: 420, resonance: 0.32, drive: 1.25, distortion: 0.05,
        ampAttack: 0.005, ampRelease: 0.3, stereoSpace: true, spaceMix: 0.3, spaceTime: 0.28,
        notes: [
            { start: 0.1, len: 0.2, midi: 36 }, { start: 0.35, len: 0.2, midi: 43 },
            { start: 0.6, len: 0.2, midi: 48 }, { start: 0.85, len: 0.2, midi: 55 },
            { start: 1.1, len: 0.2, midi: 36 }, { start: 1.35, len: 0.2, midi: 43 },
            { start: 1.6, len: 0.2, midi: 48 }, { start: 1.85, len: 0.2, midi: 55 },
            { start: 2.1, len: 0.2, midi: 38 }, { start: 2.35, len: 0.2, midi: 45 },
            { start: 2.6, len: 0.2, midi: 50 }, { start: 2.85, len: 0.7, midi: 36 }
        ]
    },
    // 39: Shoegaze Strobe
    {
        id: '39_Shoegaze_Strobe_Arp', name: 'Shoegaze Strobe', duration: 4.8,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: 1,
        osc2Wave: 'saw', osc2Level: 0.85, osc2Octave: 1, osc2DetuneCents: 14,
        subWave: 'sine', subLevel: 0.5, subOctave: -1,
        baseCutoff: 520, filterEnvAmt: 350, resonance: 0.92, drive: 1.95, distortion: 0.35,
        ampAttack: 0.002, ampRelease: 0.45, stereoSpace: true, spaceMix: 0.55, spaceTime: 0.35,
        notes: [
            { start: 0.05, len: 0.09, midi: 55 }, { start: 0.15, len: 0.09, midi: 58 },
            { start: 0.25, len: 0.09, midi: 62 }, { start: 0.35, len: 0.09, midi: 67 },
            { start: 0.45, len: 0.09, midi: 58 }, { start: 0.55, len: 0.09, midi: 62 },
            { start: 0.65, len: 0.09, midi: 67 }, { start: 0.75, len: 0.09, midi: 70 },
            { start: 0.85, len: 0.09, midi: 55 }, { start: 0.95, len: 0.09, midi: 58 },
            { start: 1.05, len: 0.09, midi: 62 }, { start: 1.15, len: 0.09, midi: 67 },
            { start: 1.25, len: 0.09, midi: 70 }, { start: 1.35, len: 0.09, midi: 74 },
            { start: 1.45, len: 0.09, midi: 67 }, { start: 1.55, len: 0.8, midi: 55 }
        ]
    },
    // 40: Stadium Praise
    {
        id: '40_Stadium_Praise_Arp', name: 'Stadium Praise', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: -1,
        osc2Wave: 'saw', osc2Level: 0.8, osc2Octave: 0, osc2DetuneCents: 9,
        subWave: 'sine', subLevel: 1.1, subOctave: -1,
        baseCutoff: 360, filterEnvAmt: 580, resonance: 0.45, drive: 1.9, distortion: 0.2,
        ampAttack: 0.003, ampRelease: 0.2,
        notes: [
            { start: 0.1, len: 0.18, midi: 36 }, { start: 0.3, len: 0.18, midi: 36 },
            { start: 0.5, len: 0.18, midi: 48 }, { start: 0.7, len: 0.18, midi: 36 },
            { start: 0.9, len: 0.18, midi: 39 }, { start: 1.1, len: 0.18, midi: 39 },
            { start: 1.3, len: 0.18, midi: 51 }, { start: 1.5, len: 0.18, midi: 39 },
            { start: 1.7, len: 0.18, midi: 41 }, { start: 1.9, len: 0.18, midi: 41 },
            { start: 2.1, len: 0.18, midi: 53 }, { start: 2.3, len: 0.18, midi: 41 },
            { start: 2.5, len: 0.18, midi: 36 }, { start: 2.7, len: 0.7, midi: 48 }
        ]
    },
    // 41: Starlight Arp
    {
        id: '41_Starlight_Ambient_Arp', name: 'Starlight Arp', duration: 5.2,
        osc1Wave: 'triangle', osc1Level: 0.85, osc1Octave: 1,
        osc2Wave: 'sine', osc2Level: 0.75, osc2Octave: 2, osc2DetuneCents: 5,
        subWave: 'sine', subLevel: 0.4, subOctave: -1,
        baseCutoff: 420, filterEnvAmt: 280, resonance: 0.28, drive: 1.1, distortion: 0.0,
        ampAttack: 0.02, ampRelease: 0.75, stereoSpace: true, spaceMix: 0.6, spaceTime: 0.4,
        notes: [
            { start: 0.1, len: 0.4, midi: 60 }, { start: 0.6, len: 0.4, midi: 67 },
            { start: 1.1, len: 0.4, midi: 71 }, { start: 1.5, len: 0.4, midi: 64 },
            { start: 2.0, len: 0.4, midi: 72 }, { start: 2.5, len: 0.4, midi: 69 },
            { start: 3.0, len: 0.4, midi: 67 }, { start: 3.5, len: 1.2, midi: 60 }
        ]
    },
    // 42: 303 Acid Arp
    {
        id: '42_Acid_Squelch_Arp', name: '303 Acid Arp', duration: 4.2,
        osc1Wave: 'saw', osc1Level: 0.95, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.5, osc2Level: 0.6, osc2Octave: 0, osc2DetuneCents: 10,
        subWave: 'sine', subLevel: 0.9, subOctave: -1,
        baseCutoff: 280, filterEnvAmt: 720, resonance: 0.88, drive: 1.75, distortion: 0.25,
        ampAttack: 0.003, ampRelease: 0.18,
        notes: [
            { start: 0.1, len: 0.18, midi: 36 }, { start: 0.3, len: 0.18, midi: 36 },
            { start: 0.5, len: 0.18, midi: 48 }, { start: 0.7, len: 0.18, midi: 39 },
            { start: 0.9, len: 0.18, midi: 41 }, { start: 1.1, len: 0.18, midi: 42 },
            { start: 1.3, len: 0.18, midi: 43 }, { start: 1.5, len: 0.18, midi: 36 },
            { start: 1.7, len: 0.18, midi: 48 }, { start: 1.9, len: 0.18, midi: 46 },
            { start: 2.1, len: 0.18, midi: 43 }, { start: 2.3, len: 0.7, midi: 36 }
        ]
    },
    // 43: Dotted 8th Edge
    {
        id: '43_Dotted_8th_Edge_Arp', name: 'Dotted 8th Edge', duration: 4.5,
        osc1Wave: 'saw', osc1Level: 0.85, osc1Octave: 0,
        osc2Wave: 'pulse', osc2Pw: 0.6, osc2Level: 0.75, osc2Octave: 0, osc2DetuneCents: 8,
        subWave: 'sine', subLevel: 0.95, subOctave: -1,
        baseCutoff: 400, filterEnvAmt: 460, resonance: 0.42, drive: 1.55, distortion: 0.15,
        ampAttack: 0.003, ampRelease: 0.2, stereoSpace: true, spaceMix: 0.45, spaceTime: 0.375,
        notes: [
            { start: 0.1, len: 0.22, midi: 41 }, { start: 0.475, len: 0.22, midi: 41 },
            { start: 0.85, len: 0.22, midi: 48 }, { start: 1.225, len: 0.22, midi: 41 },
            { start: 1.6, len: 0.22, midi: 44 }, { start: 1.975, len: 0.22, midi: 46 },
            { start: 2.35, len: 0.22, midi: 48 }, { start: 2.725, len: 0.8, midi: 41 }
        ]
    },
    // 44: Gospel Shout Arp
    {
        id: '44_Gospel_Shout_Arp', name: 'Gospel Shout Arp', duration: 4.2,
        osc1Wave: 'pulse', osc1Pw: 0.55, osc1Level: 0.85, osc1Octave: -1,
        osc2Wave: 'saw', osc2Level: 0.75, osc2Octave: 0, osc2DetuneCents: 7,
        subWave: 'sine', subLevel: 1.2, subOctave: -1,
        baseCutoff: 350, filterEnvAmt: 520, resonance: 0.58, drive: 1.5, distortion: 0.12,
        ampAttack: 0.002, ampRelease: 0.16,
        notes: [
            { start: 0.1, len: 0.15, midi: 38 }, { start: 0.28, len: 0.15, midi: 41 },
            { start: 0.46, len: 0.15, midi: 42 }, { start: 0.64, len: 0.15, midi: 43 },
            { start: 0.82, len: 0.15, midi: 45 }, { start: 1.0, len: 0.15, midi: 48 },
            { start: 1.18, len: 0.15, midi: 50 }, { start: 1.36, len: 0.15, midi: 48 },
            { start: 1.54, len: 0.15, midi: 45 }, { start: 1.72, len: 0.15, midi: 43 },
            { start: 1.9, len: 0.15, midi: 41 }, { start: 2.08, len: 0.7, midi: 38 }
        ]
    },
    // 45: Post-Rock Trem
    {
        id: '45_Post_Rock_Crescendo_Arp', name: 'Post-Rock Trem', duration: 5.2,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: 0,
        osc2Wave: 'saw', osc2Level: 0.85, osc2Octave: 0, osc2DetuneCents: 15,
        subWave: 'sine', subLevel: 0.95, subOctave: -1,
        baseCutoff: 320, filterEnvAmt: 380, resonance: 0.65, drive: 2.1, distortion: 0.4,
        ampAttack: 0.015, ampRelease: 0.45, stereoSpace: true, spaceMix: 0.5, spaceTime: 0.32,
        notes: [
            { start: 0.1, len: 0.15, midi: 36 }, { start: 0.28, len: 0.15, midi: 43 },
            { start: 0.46, len: 0.15, midi: 48 }, { start: 0.64, len: 0.15, midi: 55 },
            { start: 0.82, len: 0.15, midi: 36 }, { start: 1.0, len: 0.15, midi: 43 },
            { start: 1.18, len: 0.15, midi: 48 }, { start: 1.36, len: 0.15, midi: 55 },
            { start: 1.54, len: 0.15, midi: 36 }, { start: 1.72, len: 0.15, midi: 43 },
            { start: 1.9, len: 0.15, midi: 48 }, { start: 2.08, len: 1.4, midi: 55 }
        ]
    },
    // 46: Sub Polyrhythm
    {
        id: '46_Sub_Bass_Polyrhythm_Arp', name: 'Sub Polyrhythm', duration: 4.5,
        osc1Wave: 'triangle', osc1Level: 0.8, osc1Octave: -1,
        osc2Wave: 'triangle', osc2Level: 0.6, osc2Octave: -1, osc2DetuneCents: 4,
        subWave: 'sine', subLevel: 1.3, subOctave: -2,
        baseCutoff: 280, filterEnvAmt: 340, resonance: 0.25, drive: 1.35, distortion: 0.08,
        ampAttack: 0.005, ampRelease: 0.22,
        notes: [
            { start: 0.1, len: 0.24, midi: 36 }, { start: 0.4, len: 0.24, midi: 43 },
            { start: 0.7, len: 0.24, midi: 46 }, { start: 1.0, len: 0.24, midi: 36 },
            { start: 1.3, len: 0.24, midi: 43 }, { start: 1.6, len: 0.24, midi: 46 },
            { start: 1.9, len: 0.24, midi: 36 }, { start: 2.2, len: 0.8, midi: 43 }
        ]
    },
    // 47: Modular Bell Arp
    {
        id: '47_Modular_Bell_Arp', name: 'Modular Bell Arp', duration: 4.8,
        osc1Wave: 'triangle', osc1Level: 0.75, osc1Octave: 1,
        osc2Wave: 'triangle', osc2Level: 0.75, osc2Octave: 2, osc2DetuneCents: 12,
        subWave: 'sine', subLevel: 0.45, subOctave: -1,
        baseCutoff: 500, filterEnvAmt: 420, resonance: 0.6, drive: 1.2, distortion: 0.05,
        ampAttack: 0.003, ampRelease: 0.45, stereoSpace: true, spaceMix: 0.4, spaceTime: 0.3,
        notes: [
            { start: 0.1, len: 0.18, midi: 62 }, { start: 0.32, len: 0.18, midi: 65 },
            { start: 0.54, len: 0.18, midi: 69 }, { start: 0.76, len: 0.18, midi: 72 },
            { start: 0.98, len: 0.18, midi: 69 }, { start: 1.2, len: 0.18, midi: 65 },
            { start: 1.42, len: 0.18, midi: 62 }, { start: 1.64, len: 0.8, midi: 69 }
        ]
    },
    // 48: Cyberpunk Arp
    {
        id: '48_Cyberpunk_Drive_Arp', name: 'Cyberpunk Arp', duration: 4.2,
        osc1Wave: 'saw', osc1Level: 0.9, osc1Octave: -1,
        osc2Wave: 'pulse', osc2Pw: 0.8, osc2Level: 0.8, osc2Octave: 0, osc2DetuneCents: 11,
        subWave: 'sine', subLevel: 1.1, subOctave: -1,
        baseCutoff: 340, filterEnvAmt: 550, resonance: 0.82, drive: 2.2, distortion: 0.35,
        ampAttack: 0.003, ampRelease: 0.18,
        notes: [
            { start: 0.1, len: 0.18, midi: 33 }, { start: 0.3, len: 0.18, midi: 33 },
            { start: 0.5, len: 0.18, midi: 45 }, { start: 0.7, len: 0.18, midi: 33 },
            { start: 0.9, len: 0.18, midi: 36 }, { start: 1.1, len: 0.18, midi: 36 },
            { start: 1.3, len: 0.18, midi: 48 }, { start: 1.5, len: 0.18, midi: 36 },
            { start: 1.7, len: 0.18, midi: 38 }, { start: 1.9, len: 0.18, midi: 50 },
            { start: 2.1, len: 0.18, midi: 33 }, { start: 2.3, len: 0.7, midi: 45 }
        ]
    }
];

console.log('Rendering all 48 high-fidelity audio samples (.wav)...');

for (const p of auditionProfiles) {
    const [left, right] = renderPatchSample(p);
    const fileName = `${p.id}.wav`;
    const outPath = path.join(samplesDir, fileName);
    writeWav(outPath, left, right, sampleRate);
    console.log(`✓ Generated audio sample: ${fileName} (${left.length} samples, ${(left.length / sampleRate).toFixed(1)}s)`);
}

console.log('\nAll 48 audio samples successfully synthesized in patches/samples/!');
