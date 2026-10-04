import fs from 'node:fs';
import { control, control_id } from './cc.js';
import { nrpn, nrpn_id } from './nrpn.js';
const root = new URL('../', import.meta.url);
const specs = JSON.parse(fs.readFileSync(new URL('bass-through.json', root)));
function set(data, mapping, value) {
  if (!mapping?.sysex) throw Error('Missing parameter mapping');
  const {offset, mask} = mapping.sysex;
  const bits = mask.reduce((n,m)=>n+m.toString(2).replaceAll('0','').length,0);
  if (!Number.isInteger(value) || value<0 || value>=2**bits) throw Error('Value out of range');
  for(let i=mask.length-1;i>=0;i--) for(let b=0;b<7;b++) if(mask[i]&(1<<b)) {
    data[offset+i]=(data[offset+i]&~(1<<b))|((value&1)<<b);value>>>=1;
  }
}
const bankPath = new URL('patches/PostRock_Ambient_Worship_Bank.syx',root);
const bank = fs.readFileSync(bankPath);
for(const spec of specs) {
 const data=Buffer.from(fs.readFileSync(new URL('patches/01_Sanctuary_Sub.syx',root)));
 data[7]=0;data[8]=Number(spec.slot);data.fill(32,137,153);data.write(spec.name,137,'ascii');
 const cc={mixer_osc_1_level:0,mixer_osc_2_level:0,mixer_sub_osc_level:0,mixer_noise_level:0,mixer_ring_mod_level:0,mixer_external_signal_level:180,filter_type:0,filter_shape:0,filter_slope:0,filter_mod_env_depth:64,velocity_amp_env:64,velocity_mod_env:64,amp_env_attack:0,amp_env_decay:0,amp_env_sustain:127,amp_env_release:8,mod_env_attack:0,mod_env_decay:0,mod_env_sustain:0,mod_env_release:0,arp_on:0,arp_latch:0,lfo2_wave:0,lfo2_delay:0,vca_limit:0,...spec.cc};
 for(const [key,value] of Object.entries(cc)) set(data,control[control_id[key]],value);
 const np={lfo2_speed_sync:0,lfo2_key_sync:0,lfo2_slew:0,aftertouch_lfo2_speed:64,filter_tracking:0,paraphonic:0,amp_env_triggering:0,amp_env_retriggering:0,mod_env_retriggering:0,mod_wheel_filter_freq:88,aftertouch_filter_freq:64,mod_wheel_lfo2_filter_freq:64};
 for(const [key,value] of Object.entries(np)) set(data,nrpn[nrpn_id[key]],value);
 for(const prefix of ['', 'patches/']) fs.writeFileSync(new URL(prefix+spec.file,root),data);
 data.copy(bank,Number(spec.slot)*154);
}
fs.writeFileSync(bankPath,bank);
fs.writeFileSync(new URL('PostRock_Ambient_Worship_Bank.syx',root),bank);
// A collection-only file targets exactly the twelve new slots when imported by a librarian.
const collection=Buffer.concat(specs.map(s=>fs.readFileSync(new URL('patches/'+s.file,root))));
fs.writeFileSync(new URL('patches/Bass_Through_Bank.syx',root),collection);
fs.writeFileSync(new URL('Bass_Through_Bank.syx',root),collection);
console.log('Created 12 external-input patches, slots 048–059.');
