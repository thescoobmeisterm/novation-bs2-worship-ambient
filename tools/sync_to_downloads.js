import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourcePatchesDir = path.join(rootDir, 'patches');
const sourceSamplesDir = path.join(rootDir, 'patches', 'samples');
const targetDir = 'C:\\Users\\dvgpr\\Downloads\\BS2_PostRock_Ambient_Worship_Patches';
const targetSamplesDir = path.join(targetDir, 'samples');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}
if (!fs.existsSync(targetSamplesDir)) {
    fs.mkdirSync(targetSamplesDir, { recursive: true });
}

// Clean target directories to ensure no old numbered files remain
const oldTargetFiles = fs.readdirSync(targetDir);
for (const f of oldTargetFiles) {
    if (f.endsWith('.syx')) {
        fs.unlinkSync(path.join(targetDir, f));
    }
}

const oldSampleFiles = fs.readdirSync(targetSamplesDir);
for (const f of oldSampleFiles) {
    if (f.endsWith('.wav')) {
        fs.unlinkSync(path.join(targetSamplesDir, f));
    }
}

// Copy .syx files
const syxFiles = fs.readdirSync(sourcePatchesDir).filter(f => f.endsWith('.syx'));
for (const f of syxFiles) {
    fs.copyFileSync(path.join(sourcePatchesDir, f), path.join(targetDir, f));
    console.log(`Copied .syx: ${f}`);
}

// Copy .wav samples
const wavFiles = fs.readdirSync(sourceSamplesDir).filter(f => f.endsWith('.wav'));
for (const f of wavFiles) {
    fs.copyFileSync(path.join(sourceSamplesDir, f), path.join(targetSamplesDir, f));
    console.log(`Copied .wav: ${f}`);
}

// Copy markdown guide
const guideSrc = path.join(rootDir, 'BS2_Patch_Collection_Guide.md');
if (fs.existsSync(guideSrc)) {
    fs.copyFileSync(guideSrc, path.join(targetDir, 'BS2_Patch_Collection_Guide.md'));
    console.log('Copied BS2_Patch_Collection_Guide.md');
}

// Copy soundboard HTML
const soundboardSrc = path.join('C:\\Users\\dvgpr\\.gemini\\antigravity\\brain\\4372e775-d101-466d-8136-8555eb0f62ac', 'patch_soundboard.html');
if (fs.existsSync(soundboardSrc)) {
    fs.copyFileSync(soundboardSrc, path.join(targetDir, 'patch_soundboard.html'));
    console.log('Copied patch_soundboard.html');
}

// Copy index.html (Interactive GitHub Pages manual & emulator)
const indexSrc = path.join(rootDir, 'index.html');
if (fs.existsSync(indexSrc)) {
    fs.copyFileSync(indexSrc, path.join(targetDir, 'index.html'));
    console.log('Copied index.html');
}

// Copy print_qr_sticker.html
const qrPrintSrc = path.join(rootDir, 'print_qr_sticker.html');
if (fs.existsSync(qrPrintSrc)) {
    fs.copyFileSync(qrPrintSrc, path.join(targetDir, 'print_qr_sticker.html'));
    console.log('Copied print_qr_sticker.html');
}

// Copy PNG sticker files in patches dir if any
const patchPngs = fs.readdirSync(sourcePatchesDir).filter(f => f.endsWith('.png'));
for (const f of patchPngs) {
    fs.copyFileSync(path.join(sourcePatchesDir, f), path.join(targetDir, f));
    console.log(`Copied patch PNG: ${f}`);
}

// Copy assets folder (Logo, QR code, badges, etc.)
const targetAssetsDir = path.join(targetDir, 'assets');
if (!fs.existsSync(targetAssetsDir)) {
    fs.mkdirSync(targetAssetsDir, { recursive: true });
}
const sourceAssetsDir = path.join(rootDir, 'assets');
if (fs.existsSync(sourceAssetsDir)) {
    const assetFiles = fs.readdirSync(sourceAssetsDir);
    for (const af of assetFiles) {
        fs.copyFileSync(path.join(sourceAssetsDir, af), path.join(targetAssetsDir, af));
        console.log(`Copied asset: ${af}`);
    }
}

console.log('\nAll 48 patches, bank, guide, soundboard, index.html, print_qr_sticker.html, assets, QR badges, and audio samples successfully synchronized to Downloads!');
