"""Stable application data, independent of replaceable CORE/model installations."""
import copy
import json
import os
import re
import uuid
from pathlib import Path
from state_lock import mutation
from validation import obj, integer, number, text

POS={
 'PROPER_NOUN':(1348,'名詞','固有名詞','一般'),
 'COMMON_NOUN':(1345,'名詞','一般','*'),
 'VERB':(642,'動詞','自立','*'),
 'ADJECTIVE':(20,'形容詞','自立','*'),
 'SUFFIX':(1358,'名詞','接尾','一般'),
}


class State:
    def __init__(self, directory, synth):
        self.directory=Path(directory);self.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.synth=synth;self.frontend=None
        self.words=self.read('user-dict.json',{})
        self.presets=self.read('presets.json',[])
        self.settings=self.read('settings.json',{'cors_policy_mode':'localapps','allow_origin':None})
        obj(self.words)
        if not isinstance(self.presets,list):raise ValueError('invalid presets')
        for k,v in self.words.items():uuid.UUID(k);self.word(v)
        for v in self.presets:self.preset(v)
        if len({v['id'] for v in self.presets})!=len(self.presets):raise ValueError('duplicate preset')
        self.setting(self.settings)
        self.dictionary=self.make_dictionary(self.words)
        self.synth.open_jtalk.use_user_dict(self.dictionary)

    def refresh_settings(self):
        settings=self.read('settings.json',{'cors_policy_mode':'localapps','allow_origin':None});self.setting(settings);self.settings=settings

    def refresh(self):
        words=self.read('user-dict.json',{})
        if words!=self.words:
            obj(words)
            for key in words:uuid.UUID(key)
            candidate=self.make_dictionary(words)
            prepared=self.frontend.prepare(words) if self.frontend else None
            try:self.synth.open_jtalk.use_user_dict(candidate)
            except BaseException:
                if self.frontend:self.frontend.discard(prepared)
                raise
            previous=self.frontend.swap(prepared) if self.frontend else None
            self.dictionary=candidate;self.words=words
            if self.frontend:self.frontend.discard(previous)
        presets=self.read('presets.json',[])
        if not isinstance(presets,list):raise ValueError('invalid presets')
        for value in presets:self.preset(value)
        if len({p['id'] for p in presets})!=len(presets):raise ValueError('duplicate preset')
        self.refresh_settings()
        self.presets=presets

    def read(self,name,default):
        path=self.directory/name
        if not path.exists():return copy.deepcopy(default)
        if path.is_symlink() or not path.is_file():raise ValueError('invalid saved state')
        return json.loads(path.read_text(encoding='utf-8'))

    def write(self,name,data):
        payload=json.dumps(data,ensure_ascii=False,allow_nan=False).encode()
        path=self.directory/(f'.{name}-{uuid.uuid4()}.tmp')
        try:
            with open(path,'xb') as f:
                os.chmod(path,0o600);f.write(payload);f.flush();os.fsync(f.fileno())
            os.replace(path,self.directory/name)
        finally:path.unlink(missing_ok=True)

    def word(self,value):
        from voicevox_core import UserDictWord
        v=obj(value)
        for field in ('part_of_speech','part_of_speech_detail_1','part_of_speech_detail_2','part_of_speech_detail_3','inflectional_type','inflectional_form','stem','yomi','accent_associative_rule'):
            if field in v:
                text(v[field],empty=True)
                if any(c in v[field] for c in ('\r','\n',',')):raise ValueError('invalid dictionary field')
        kind=v.get('word_type')
        if kind is None:
            kind=next((k for k,p in POS.items() if p[0]==v.get('context_id')),'PROPER_NOUN')
        if kind not in POS:raise ValueError('unknown word type')
        return UserDictWord(surface=text(v.get('surface')),pronunciation=text(v.get('pronunciation')),accent_type=integer(v.get('accent_type')),word_type=kind,priority=integer(v.get('priority',5),0,10))

    def make_dictionary(self,words):
        from voicevox_core.blocking import UserDict
        candidate=UserDict()
        for value in words.values():candidate.add_word(self.word(value))
        return candidate

    def commit_words(self,words):
        candidate=self.make_dictionary(words)
        prepared=self.frontend.prepare(words) if self.frontend else None
        previous=None
        self.synth.open_jtalk.use_user_dict(candidate)
        try:
            if self.frontend:previous=self.frontend.swap(prepared)
            self.write('user-dict.json',words)
        except BaseException:
            self.synth.open_jtalk.use_user_dict(self.dictionary)
            if self.frontend and previous is not None:self.frontend.swap(previous);self.frontend.discard(prepared)
            raise
        self.words=words;self.dictionary=candidate
        if self.frontend:self.frontend.discard(previous)

    @mutation
    def change_word(self,value,word_id=None,delete=False):
        words=copy.deepcopy(self.words)
        if word_id is not None:
            word_id=str(uuid.UUID(word_id))
            if word_id not in words:raise LookupError('word not found')
        else:word_id=str(uuid.uuid4())
        if delete:del words[word_id]
        else:
            word=self.word(value)
            words[word_id]={'surface':word.surface,'pronunciation':word.pronunciation,'accent_type':word.accent_type,'word_type':word.word_type,'priority':word.priority}
        self.commit_words(words);return word_id

    @mutation
    def import_words(self,data,override):
        words=copy.deepcopy(self.words)
        for k,v in obj(data).items():
            k=str(uuid.UUID(k));w=self.word(v)
            if k not in words or override:
                words[k]={**{name:item for name,item in v.items() if name in ('part_of_speech','part_of_speech_detail_1','part_of_speech_detail_2','part_of_speech_detail_3','inflectional_type','inflectional_form','stem','yomi','accent_associative_rule')},'surface':w.surface,'pronunciation':w.pronunciation,'accent_type':w.accent_type,'word_type':w.word_type,'priority':w.priority}
        self.commit_words(words)

    def export_words(self):
        result={}
        for k,v in self.words.items():
            w=self.word(v);p=POS[w.word_type]
            result[k]={'surface':w.surface,'priority':w.priority,'context_id':p[0],'part_of_speech':p[1],'part_of_speech_detail_1':p[2],'part_of_speech_detail_2':p[3],'part_of_speech_detail_3':'*','inflectional_type':'*','inflectional_form':'*','stem':'*','yomi':w.pronunciation,'pronunciation':w.pronunciation,'accent_type':w.accent_type,'mora_count':len(re.sub('[ァィゥェォャュョヮ]','',w.pronunciation)),'accent_associative_rule':'*'}
            for field in ('part_of_speech','part_of_speech_detail_1','part_of_speech_detail_2','part_of_speech_detail_3','inflectional_type','inflectional_form','stem','yomi','accent_associative_rule'):
                if field in v:result[k][field]=v[field]
        return result

    @staticmethod
    def preset(value):
        v=dict(obj(value));integer(v.get('id'),0);text(v.get('name'),empty=True);uuid.UUID(v.get('speaker_uuid'));integer(v.get('style_id'))
        for k,lo,hi,default in [('speedScale',0,float('inf'),1),('pitchScale',-float('inf'),float('inf'),0),('intonationScale',-float('inf'),float('inf'),1),('volumeScale',0,float('inf'),1),('prePhonemeLength',0,float('inf'),.1),('postPhonemeLength',0,float('inf'),.1),('pauseLengthScale',0,float('inf'),1)]:v[k]=number(v.get(k,default),lo,hi)
        if v.get('pauseLength') is not None:number(v['pauseLength'],0,float('inf'))
        allowed={'id','name','speaker_uuid','style_id','speedScale','pitchScale','intonationScale','volumeScale','prePhonemeLength','postPhonemeLength','pauseLength','pauseLengthScale'}
        if set(v)-allowed:raise ValueError('unknown preset field')
        return v

    @mutation
    def change_preset(self,value,mode):
        rows=copy.deepcopy(self.presets)
        if mode=='delete':
            key=integer(value);found=next((p for p in rows if p['id']==key),None)
            if found is None:raise LookupError('preset not found')
            rows.remove(found)
        else:
            v=self.preset(value);key=v['id'];found=next((p for p in rows if p['id']==key),None)
            if mode=='update':
                if found is None:raise LookupError('preset not found')
                rows[rows.index(found)]=v
            else:
                if found:key=max([p['id'] for p in rows],default=-1)+1;v['id']=key
                rows.append(v)
        self.write('presets.json',rows);self.presets=rows;return key

    @staticmethod
    def setting(value):
        v=obj(value)
        if set(v)-{'cors_policy_mode','allow_origin'} or v.get('cors_policy_mode') not in ('all','localapps'):raise ValueError('invalid setting')
        if v.get('allow_origin') is not None:text(v['allow_origin'],4096,True)
        return v

    @mutation
    def change_setting(self,value):
        v=self.setting(value);self.write('settings.json',v);self.settings=v
