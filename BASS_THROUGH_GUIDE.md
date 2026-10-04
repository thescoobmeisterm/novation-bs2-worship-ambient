# Bass-through collection — slots 048–059

Twelve hardware patches for electric bass through the Bass Station II EXT IN. Original synth slots 000–047 retain their existing voicings, including the September hardware balance changes.

## Connect and play

1. Connect your bass or buffered pedal/preamp output to EXT IN; take LINE OUTPUT to your amp or interface.
2. Begin with low output volume. Function + upper B adjusts global Input Gain. Start at 0 dB and adjust for the bass/preamp; this is not a per-patch setting.
3. Select a patch below. Latch is saved ON with the arpeggiator OFF. Tap and release a key once to open the amp envelope for hands-free playing. Turn Latch off to close the gate. Tap a key again after changing patches if needed. The held note itself is not stored in the patch.
4. Adjust cutoff for brightness; mod wheel opens the filter further. Motion patches use free-running LFO 2; adjust its Speed by ear.

All internal mixer sources are muted, external level is 180/255, amp sustain is full, keyboard velocity does not change amp level, keyboard filter tracking is off, Latch is on, and the arpeggiator is off. This preserves your played bass articulation while processing its tone. LFO modulation is independent of bass plucks; these are not envelope-following auto-wahs. These patches do not add pitch tracking, delay or reverb.

Hardware audition with your bass is still needed to tune gain, loudness and the useful cutoff range. No rendered synth WAV is presented as an external-bass demonstration.

## The sounds

| Display slot | Patch | Lane | Character | Suggested songs |
|---|---|---|---|---|
| 048 | Sanctuary Thru | 1. Worship Foundation | Warm, open low-pass body for supportive fingerstyle bass. | Goodness of God; The Blessing; King of Kings |
| 049 | Refinery Grit | 1. Worship Foundation | Rounded edge and restrained drive for full-band praise. | Graves Into Gardens; Lion and the Lamb; Glorious Day |
| 050 | Prayer Motion | 1. Worship Foundation | Gentle slow filter movement under spacious prayer sections. | Worthy of It All; Build My Life; Holy Forever |
| 051 | Monolith Thru | 2. Post-Rock | Thick low-pass distortion for sustained post-rock bass lines. | RATTLE!; Graves Into Gardens; Do It Again |
| 052 | Crescendo Thru | 2. Post-Rock | Dark drive with a broad mod-wheel opening for crescendos. | Oceans; So Will I; Another In The Fire |
| 053 | Shoegaze Tide | 2. Post-Rock | Slow resonant movement through a gritty bass texture. | Touch of Heaven; With Everything; Hosanna |
| 054 | Velvet Thru | 3. Ambient | Softened upper harmonics with stable bass fundamentals. | Peace; Goodness of God; The Blessing |
| 055 | Aurora Thru | 3. Ambient | Slow triangle filter sweeps for evolving ambient bass. | Another In The Fire; Oceans; So Will I |
| 056 | Orbit Thru | 3. Ambient | A more audible cyclical filter sweep for spacious repeating lines. | Rest On Us; Build My Life; Holy Spirit |
| 057 | Pocket Thru | 4. Funk & Gospel | Open, lightly driven bass for articulate gospel runs. | Every Praise; Old Church Choir; House of the Lord |
| 058 | Wah Current | 4. Funk & Gospel | Continuous LFO wah; follows its own cycle, not your picking dynamics. | Sunday Sermons; Every Praise; Sing Wherever I Go |
| 059 | Disco Sweep | 4. Funk & Gospel | Brisk repeating filter motion with a firm driven bass core. | Wake; Real Love; Look To The Son |

## Install

Back up the destination slots before importing. Use the individual files or `patches/Bass_Through_Bank.syx` for this 12-patch collection. The master `PostRock_Ambient_Worship_Bank.syx` contains **128 slots**, including template slots 060–127, and importing it as a full bank can replace all stored patches. Stored-slot transfers must use the appropriate librarian command; the source files use the repository's standard patch-dump format.

## Sources and validation

[Novation: mixer, amp envelopes and global input gain](https://userguides.novationmusic.com/hc/en-gb/articles/25494313827986-Bass-Station-II-in-detail).

`npm run verify:bass-through` decodes the twelve patches, checks muted internal sources, enabled external input, full sustained gate, modulation values, bank agreement and song recommendation integration. `npm run verify:balance` checks the original hardware balance revision remains intact.

[Novation: hands-free external input using Latch](https://support.novationmusic.com/hc/en-gb/articles/206862179-How-to-use-Ext-In-on-the-Bass-Station-II).
