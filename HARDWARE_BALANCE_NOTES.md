# BS2 hardware balance revision — display slots

All numbers below are the Bass Station II display slots, not the one-based filename prefixes. These are first-pass sound-design revisions based on decoded SysEx parameters and the reported hardware symptoms. No hardware audio was measured, and equal perceived loudness is not yet verified.

## Findings and changes

There is no mapped, stored patch-volume field in this project's SysEx encoder. Loudness depends on the oscillator mixer, filter, resonance, envelopes, waveform and playing register. The existing patches have substantially different settings in those stages; increasing a single volume value would not address them all.

A concrete parameter issue is bipolar filter-envelope depth: raw 63/64 means zero, not raw zero. Several quiet patches had values below this center, so the envelope closes the filter rather than opening it. That is a valid sound-design choice, but can further suppress already dark patches. This revision changes the direction on the listed affected Classic-filter patches. It does not indiscriminately change other patches.

| Display slot | Patch (file prefix) | Parameter evidence and revision |
|---|---|---|
| 014 | Mogwai Drone (15) | Oscillator 1 pitch LFO raw 148 → 128 (neutral), removing automatic pitch sweep while retaining PWM, detuning and paraphonic character. Pitch-wheel range is unchanged. |
| 015 | Sigur Lead (16) | Low Acid-filter cutoff and resonance emphasize a narrow sound. Open cutoff 45 → 65, reduce resonance, raise oscillator 2 and amp sustain. |
| 016 | Quiet Earth (17) | Dark cutoff with low oscillator 2 and sustain. Open cutoff 28 → 42 and add body, retaining the soft waveform character. |
| 021 | Post-Rock Trem (22) | Closing filter envelope, low cutoff and sustain. Change envelope depth 55 → 76, raise cutoff/sustain and reduce resonance. |
| 022 | Shoegaze Strobe (23) | High resonance (92), short decay and low sustain. Reduce resonance to 72, open cutoff and extend amp body; retain Acid mode and arp. |
| 025 | Ether Swell (26) | Very low cutoff plus moving filter and moderate mixer levels. Raise the filter floor, reduce modulation depth and raise mixer levels. Slow attack retained. |
| 027 | Aurora Waves (28) | Low cutoff, moving filter and modest mixer levels. Raise cutoff/mixer, reduce resonance and filter modulation depth. Motion retained. |
| 029 | Celestial Lead (30) | Low cutoff and modest oscillator mix. Open cutoff, lower resonance and raise mixer/sustain, retaining paraphony. |
| 033 | Starlight Arp (34) | Closing envelope (40) and low sustain. Change depth to 76 and raise cutoff/sustain; retain triangle/sine tone and arp. |
| 034 | Modular Bell Arp (35) | Closing envelope, steep band-pass and low sustain. Use opening envelope, gentler slope, reduced resonance and more body. Band-pass/ring modulation retained. |
| 035 | Clockwork Pluck (36) | Very short decay and zero sustain yield little sustained energy. Extend decay 28 → 42, raise cutoff and oscillator 2. Zero sustain retained. |
| 038 | Talkbox Lead (39) | Closing envelope and resonant steep band-pass. Open envelope, use gentler slope, reduce resonance and raise cutoff/sustain. Vocal band-pass character retained. |
| 046 | Prophet Pluck (47) | Closing envelope, low cutoff and sustain. Change depth 60 → 76 and raise cutoff/sustain. Pluck/arp retained. |
| 047 | Sub Polyrhythm (48) | Closing envelope with low cutoff over triangle/sub-heavy sound. Change depth 50 → 72 and raise cutoff/sustain. Sub voice and rhythm retained. |

Numeric values are raw parameter units, not dB or Hz. These changes may also brighten or lengthen the sounds; hardware audition determines whether the tradeoff is right.

## Files and rollback

- Revised individual patches and full bank: `patches/`, with matching top-level `.syx` copies.
- Revision specification: `tools/hardware_balance.js`; the generator applies it during `npm run build`.
- Original repository patches/bank: `revision-backups/before-display-slot-balance/patches/`.
- `hardware-backups/` was not modified.
- The update archive contains only the 14 revised individual patches, these notes and a parameter change report. The full 128-slot bank is deliberately excluded: importing it could overwrite unrelated slots on your instrument.
- No MIDI was sent to the instrument. No GitHub changes were pushed.
- Existing WAV previews and the website emulator were not regenerated or rebalanced; they are not evidence of hardware loudness.

## Verification and audition

Automated checks validate SysEx structure, expected parameter values, single-patch/bank agreement and preservation of every non-targeted bit. They do not measure audio loudness. The original bank fails the new parameter regression checks; the revised bank passes. The generator reproduces the revised files byte-for-byte.

Before importing, back up your current hardware patches. Load the individual files into the corresponding display slots using your usual librarian. Start with monitor volume reduced. Compare at unchanged master volume, interface gain, velocity, note/register, tempo and effects; let swell patches reach their sustain. Compare short phrases as well as held notes against your preferred reference patch. Record direct, unnormalized audio if further matching is needed—normalized previews hide level differences.
