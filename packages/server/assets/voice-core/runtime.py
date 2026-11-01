"""CORE 0.17 adapter. HTTP, saved presets and character assets remain independent."""
import copy
import importlib.metadata
import json
import re
import threading
import time
import zipfile
import unicodedata
from collections import OrderedDict
from pathlib import Path
from validation import encode,phrases,audio_query,score,frame_query,text,output,integer,number
from resources import Resources
from state import State
from frontend import Frontend,parse_kana,create_kana
import waves


class Runtime:
    def __init__(self,directory,threads,data_dir=None,acceleration_mode="CPU"):
        from voicevox_core.blocking import Onnxruntime,OpenJtalk,Synthesizer
        self.directory=Path(directory).resolve();self.version=importlib.metadata.version('voicevox-core')
        libs=[p for p in (self.directory/'onnxruntime').rglob('*onnxruntime*') if p.is_file() and (p.name.endswith(('.dll','.dylib')) or '.so' in p.name)]
        dictionaries=list((self.directory/'dict').rglob('sys.dic'))
        if not libs or len(dictionaries)!=1:raise ValueError('ONNX Runtime or dictionary not installed')
        self.synth=Synthesizer(Onnxruntime.load_once(filename=str(sorted(libs,key=lambda p:len(p.name))[0])),OpenJtalk(str(dictionaries[0].parent)),acceleration_mode=acceleration_mode,cpu_num_threads=threads)
        self.resources=Resources(self.directory/'resources')
        self.styles={};self.characters={};self.loaded=OrderedDict();self.lock=threading.RLock();self.started=time.time()
        for path in sorted((self.directory/'models').rglob('*.vvm')):
            with zipfile.ZipFile(path) as archive:
                info=archive.getinfo('metas.json')
                if info.file_size>2*1024*1024:raise ValueError('model metadata too large')
                metas=json.loads(archive.read(info))
            for meta in metas:
                uid=meta['speaker_uuid']
                if uid not in self.characters:self.characters[uid]={**meta,'styles':[],'supported_features':{'permitted_synthesis_morphing':self.resources.permission(uid)}}
                for style in meta['styles']:
                    sid=style['id'];integer(sid)
                    if sid in self.styles:raise ValueError('duplicate style id')
                    self.styles[sid]={'path':path,'type':style.get('type','talk'),'uuid':uid}
                    self.characters[uid]['styles'].append({**style,'type':'talk' if style.get('type')=='streaming_talk' else style.get('type','talk')})
        if not self.styles:raise ValueError('no voice models installed')
        self.state=State(data_dir or self.directory.parent/'user-data',self.synth)
        self.frontend=Frontend(dictionaries[0].parent,self.state.directory);self.frontend.swap(self.frontend.prepare(self.state.words));self.state.frontend=self.frontend
        self.threads=threads;self.acceleration_mode=acceleration_mode

    def speakers(self,singers=False):
        result=[]
        for meta in self.characters.values():
            styles=[s for s in meta['styles'] if (s['type']!='talk')==singers]
            if styles:result.append({**meta,'styles':styles})
        return sorted(result,key=lambda x:x.get('order',0))

    def style(self,sid,kinds=None):
        integer(sid)
        if sid not in self.styles:raise LookupError('style not installed')
        entry=self.styles[sid]
        if kinds is not None and entry['type'] not in kinds:raise ValueError('style does not support this operation')
        return entry

    def load(self,sid,kinds=None):
        from voicevox_core.blocking import VoiceModelFile
        path=self.style(sid,kinds)['path']
        if path in self.loaded:self.loaded.move_to_end(path);return
        if len(self.loaded)>=2:
            _,key=self.loaded.popitem(last=False);self.synth.unload_voice_model(key)
        with VoiceModelFile.open(str(path)) as model:
            self.synth.load_voice_model(model);self.loaded[path]=model.id

    def initialized(self,sid):return self.style(sid)['path'] in self.loaded

    def query(self,value,sid,english=True,kana=False):
        from voicevox_core import AudioQuery
        value=text(value)
        with self.lock:
            self.load(sid,('talk','streaming_talk'))
            raw=parse_kana(value) if kana else self.frontend.analyze(value,english)
            rows=self.synth.replace_mora_data(raw,sid)
            q=AudioQuery(rows,1,0,1,1,.1,.1,24000,False,create_kana(rows))
            return {**encode(q),'pauseLength':None,'pauseLengthScale':1}

    def accent(self,value,sid,kana=False,english=True):
        value=text(value)
        with self.lock:
            self.load(sid,('talk','streaming_talk'))
            rows=parse_kana(value) if kana else self.frontend.analyze(value,english)
            return encode(self.synth.replace_mora_data(rows,sid))

    def mora(self,value,sid,kind):
        rows=phrases(value)
        with self.lock:
            self.load(sid,('talk','streaming_talk'))
            name={'data':'replace_mora_data','length':'replace_phoneme_length','pitch':'replace_mora_pitch'}[kind]
            return encode(getattr(self.synth,name)(rows,sid))

    def synthesis(self,data,sid,upspeak=True,cancelled=None):
        q=audio_query(data);rate,stereo=output(data)
        # CORE currently supports only 24k multiples. Resampling stays in this adapter.
        q.output_sampling_rate=24000;q.output_stereo=False
        with self.lock:
            entry=self.style(sid,('talk','streaming_talk'));self.load(sid)
            if cancelled and entry['type']=='streaming_talk' and hasattr(self.synth,'streaming_synthesis'):
                chunks=[];total=0
                stream=self.synth.streaming_synthesis(q,sid,enable_interrogative_upspeak=upspeak)
                try:
                    for chunk in stream:
                        if cancelled():raise ConnectionAbortedError('client disconnected')
                        total+=len(chunk)
                        chunks.append(chunk)
                    result=b''.join(chunks)
                finally:stream.__exit__(None,None,None)
            else:
                if cancelled and cancelled():raise ConnectionAbortedError('client disconnected')
                result=self.cancel_legacy(q,sid,upspeak,cancelled) if cancelled else self.synth.synthesis(q,sid,enable_interrogative_upspeak=upspeak)
                if cancelled and cancelled():raise ConnectionAbortedError('client disconnected')
        return waves.convert(result,rate,stereo) if rate!=24000 or stereo else result

    def cancel_legacy(self,q,sid,upspeak,cancelled):
        import subprocess,sys,tempfile
        payload=json.dumps({'runtime':str(self.directory),'threads':self.threads,'acceleration_mode':self.acceleration_mode,'query':encode(q),'speaker':sid,'upspeak':upspeak}).encode()+b'\n'
        # The supervisor holds a parent-owned stdin lease and never enters native inference.
        # Thus cancellation/parent death works even while CORE holds the inference GIL.
        with tempfile.TemporaryFile() as result:
            child=subprocess.Popen([sys.executable,str(Path(__file__).with_name('cancel_core.py'))],stdin=subprocess.PIPE,stdout=result,stderr=subprocess.DEVNULL)
            try:
                child.stdin.write(payload);child.stdin.flush()
                while True:
                    if cancelled():raise ConnectionAbortedError('client disconnected')
                    try:
                        child.wait(timeout=.1)
                        if child.returncode:raise RuntimeError('cancellable CORE operation failed')
                        result.seek(0);return result.read()
                    except subprocess.TimeoutExpired:pass
            finally:
                child.stdin.close()
                try:child.wait(timeout=3)
                except subprocess.TimeoutExpired:child.kill();child.wait()

    def sing(self,data,sid,kind='query'):
        with self.lock:
            if kind=='synthesis':
                self.load(sid,('sing','frame_decode'));q=frame_query(data);rate,stereo=output(data)
                q.output_sampling_rate=24000;q.output_stereo=False
                result=self.synth.frame_synthesis(q,sid)
                return waves.convert(result,rate,stereo) if rate!=24000 or stereo else result
            self.load(sid,('sing','singing_teacher'))
            if kind=='query':return encode(self.synth.create_sing_frame_audio_query(score(data),sid))
            sc=score(data.get('score'));fq=frame_query(data.get('frame_audio_query'));fq.output_sampling_rate=24000
            if sum(n.frame_length for n in sc.notes)!=sum(p.frame_length for p in fq.phonemes):raise ValueError('score and query lengths differ')
            return getattr(self.synth,'create_sing_frame_'+kind)(sc,fq,sid)

    def morphable(self,base,target):
        a=self.style(base);b=self.style(target)
        if a['type'] not in ('talk','streaming_talk') or b['type'] not in ('talk','streaming_talk'):return False
        pa=self.resources.permission(a['uuid']);pb=self.resources.permission(b['uuid'])
        if 'NOTHING' in (pa,pb):return False
        if 'SELF_ONLY' in (pa,pb):return a['uuid']==b['uuid']
        return pa==pb=='ALL'

    def morph(self,data,base,target,ratio,upspeak=True):
        if not self.morphable(base,target):raise PermissionError('morphing not permitted for these voices')
        number(ratio,0,1);rate,stereo=output(data)
        query={**data,'outputSamplingRate':24000,'outputStereo':False}
        with self.lock:
            a=self.synthesis(query,base,upspeak);b=self.synthesis(query,target,upspeak)
            return waves.morph(a,b,ratio,rate,stereo)
