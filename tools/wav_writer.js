import fs from 'fs';
import path from 'path';

// Helper to write a 16-bit PCM Stereo WAV file
export function writeWav(filePath, leftSamples, rightSamples, sampleRate = 44100) {
    const numSamples = leftSamples.length;
    const numChannels = 2;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numSamples * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // subchunk1size (16 for PCM)
    buffer.writeUInt16LE(1, 20);  // audio format (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); // bits per sample

    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write interleaved 16-bit PCM
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        let l = Math.max(-1, Math.min(1, leftSamples[i]));
        let r = Math.max(-1, Math.min(1, rightSamples[i]));
        buffer.writeInt16LE(Math.floor(l < 0 ? l * 32768 : l * 32767), offset);
        buffer.writeInt16LE(Math.floor(r < 0 ? r * 32768 : r * 32767), offset + 2);
        offset += 4;
    }

    fs.writeFileSync(filePath, buffer);
}

console.log('writeWav helper verified');
