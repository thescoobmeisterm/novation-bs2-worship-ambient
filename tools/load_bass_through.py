"""Back up, load, and read back only bass-through slots 048–059 using ALSA amidi."""
from pathlib import Path
import subprocess, time, json, datetime, argparse
parser=argparse.ArgumentParser();parser.add_argument('--port',required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
specs=json.loads((root/'bass-through.json').read_text())
assert [int(s['slot']) for s in specs]==list(range(48,60))
patches=[]
for s in specs:
 b=(root/'patches'/s['file']).read_bytes()
 assert len(b)==154 and b[:8]==bytes.fromhex('f0 00 20 29 00 33 00 00') and b[-1]==247 and b[8]==int(s['slot']) and all(x<128 for x in b[1:-1])
 patches.append((s,b))
out=root/'hardware-backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-bass-through');out.mkdir()
def read(slot,path):
 subprocess.run(['amidi','-p',args.port,'-S',f'F0 00 20 29 00 33 00 41 {slot:02X} F7','-r',str(path),'-t','0.5'],check=True,timeout=10)
 b=path.read_bytes();start=b.find(bytes.fromhex('f0 00 20 29 00 33'));end=b.find(b'\xf7',start)
 if start<0 or end<0:raise RuntimeError('No patch response')
 b=b[start:end+1]
 assert len(b)==154 and b[7]==1 and b[8]==slot
 path.write_bytes(b);return b
for s,b in patches:read(b[8],out/f'before-{b[8]:03}.syx')
print(f'Backed up 12 slots: {out}',flush=True)
report=[]
for s,b in patches:
 data=bytearray(b);data[7]=1;send=out/f'loaded-{b[8]:03}.syx';send.write_bytes(data)
 subprocess.run(['amidi','-p',args.port,'-s',str(send)],check=True,timeout=10);time.sleep(.2)
 actual=read(b[8],out/f'after-{b[8]:03}.syx');assert actual==data,f'Verification failed: {s["name"]}'
 report.append({'slot':b[8],'name':s['name'],'verified':True});(out/'transfer-report.json').write_text(json.dumps(report,indent=2))
 print(f'Verified {b[8]:03}: {s["name"]}',flush=True)
