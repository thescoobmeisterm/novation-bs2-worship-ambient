import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sysex from './sysex.js';
import {control,control_id} from './cc.js';
import {nrpn,nrpn_id} from './nrpn.js';
const specs=JSON.parse(fs.readFileSync('bass-through.json'));
const bank=fs.readFileSync('patches/PostRock_Ambient_Worship_Bank.syx');
assert.equal(specs.length,12);
assert.equal(bank.length,128*154);
for(const s of specs){
 const b=fs.readFileSync('patches/'+s.file);assert.equal(b.length,154);assert.equal(b[8],Number(s.slot));assert(b.subarray(1,-1).every(x=>x<128));assert(sysex.setDump(b));
 for(const k of ['mixer_osc_1_level','mixer_osc_2_level','mixer_sub_osc_level','mixer_noise_level','mixer_ring_mod_level','arp_on','arp_latch']) assert.equal(control[control_id[k]].raw_value,0,`${s.name}: ${k}`);
 for(const [k,v] of Object.entries({mixer_external_signal_level:180,amp_env_sustain:127,amp_env_attack:0,velocity_amp_env:64,filter_mod_env_depth:64,...s.cc})) assert.equal(control[control_id[k]].raw_value,v,`${s.name}: ${k}`);
 assert.equal(nrpn[nrpn_id.filter_tracking].raw_value,0);assert.equal(nrpn[nrpn_id.lfo2_speed_sync].raw_value,0);
 assert.deepEqual(b,bank.subarray(Number(s.slot)*154,(Number(s.slot)+1)*154));if(fs.existsSync(s.file)) assert.deepEqual(b,fs.readFileSync(s.file));
}
if(fs.existsSync('PostRock_Ambient_Worship_Bank.syx')) assert.deepEqual(fs.readFileSync('PostRock_Ambient_Worship_Bank.syx'),bank);
for(let i=0;i<48;i++){
 const names=fs.readdirSync('patches').filter(f=>f.startsWith(String(i+1).padStart(2,'0')+'_')&&f.endsWith('.syx'));assert.equal(names.length,1);
 assert.deepEqual(fs.readFileSync('patches/'+names[0]),bank.subarray(i*154,(i+1)*154));
 if(fs.existsSync(names[0])) assert.deepEqual(fs.readFileSync(names[0]),fs.readFileSync('patches/'+names[0]));
}
const html=fs.readFileSync('index.html','utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const start=html.indexOf('const patchData =');const end=html.indexOf('const worshipSongsData =');
const ctx=vm.createContext({});vm.runInContext(html.slice(start,end)+';globalThis.patches=patchData;',ctx);
assert.equal(ctx.patches.length,60);assert.equal(ctx.patches.filter(p=>p.externalInput).length,12);
const helper=html.slice(html.indexOf('    function bassThroughForSong('),html.indexOf('    function bassThroughSongPanel('));vm.runInContext(helper,ctx);
for(const title of ['Goodness of God','Every Praise','Oceans','An unknown song']){
 const found=ctx.bassThroughForSong({title,primaryId:'01'});assert(found.length>0);assert(found.every(p=>p.externalInput));
}
console.log('PASS: 12 EXT IN patches decoded, 60 bank entries matched, browser scripts parse, song recommendations resolve.');

assert.equal(JSON.stringify(ctx.patches.filter(p=>p.externalInput)),JSON.stringify(specs));
