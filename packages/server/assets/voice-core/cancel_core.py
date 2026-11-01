"""Parent-leased supervisor and disposable inference for legacy CORE models."""
import os,sys,json,ctypes,signal,zipfile
sys.dont_write_bytecode=True
if '--infer' not in sys.argv:
 import subprocess,threading
 payload=sys.stdin.buffer.readline()
 if not payload:sys.exit(1)
 child=subprocess.Popen([sys.executable,__file__,'--infer'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 def lease():
  # EOF arrives on cancellation and on every OS when the owning worker exits.
  os.read(sys.stdin.fileno(),1)
  try:child.kill()
  except OSError:pass
 threading.Thread(target=lease,daemon=True).start()
 try:
  wav,_=child.communicate(payload)
  if child.returncode:sys.exit(1)
  sys.stdout.buffer.write(wav);sys.stdout.buffer.flush()
 finally:
  if child.poll() is None:child.kill();child.wait()
 sys.exit(0)
# Native diagnostics must not enter the WAV pipe.
output=os.dup(1);os.dup2(2,1)
if sys.platform=='linux':
 parent=os.getppid();ctypes.CDLL(None).prctl(1,signal.SIGTERM)
 if os.getppid()!=parent:sys.exit(1)
from pathlib import Path
from voicevox_core.blocking import Onnxruntime,OpenJtalk,Synthesizer,VoiceModelFile
from validation import audio_query
p=json.load(sys.stdin);root=Path(p['runtime'])
libs=[v for v in (root/'onnxruntime').rglob('*onnxruntime*') if v.is_file() and (v.name.endswith(('.dll','.dylib')) or '.so' in v.name)]
dictionary=next((root/'dict').rglob('sys.dic')).parent
synth=Synthesizer(Onnxruntime.load_once(filename=str(sorted(libs,key=lambda v:len(v.name))[0])),OpenJtalk(str(dictionary)),acceleration_mode=p.get('acceleration_mode','CPU'),cpu_num_threads=p['threads'])
for path in (root/'models').rglob('*.vvm'):
 with zipfile.ZipFile(path) as archive:metas=json.loads(archive.read('metas.json'))
 if any(s['id']==p['speaker'] for m in metas for s in m['styles']):
  with VoiceModelFile.open(str(path)) as model:synth.load_voice_model(model)
  break
wav=synth.synthesis(audio_query(p['query']),p['speaker'],enable_interrogative_upspeak=p['upspeak'])
with os.fdopen(output,'wb') as f:f.write(wav)
