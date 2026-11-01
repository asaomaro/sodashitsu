#!/usr/bin/env python3
"""Compare isolated ENGINE and direct CORE instances; creates and removes uniquely named test state."""
import argparse,base64,io,json,urllib.request,urllib.parse,urllib.error,uuid,wave,zipfile
p=argparse.ArgumentParser();p.add_argument('--reference',required=True);p.add_argument('--direct',required=True);a=p.parse_args()
urls=[a.reference.rstrip('/'),a.direct.rstrip('/')];count=0

def call(i,path,method='GET',data=None,params=None,form=False):
 if params:path+='?'+urllib.parse.urlencode(params)
 payload=urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode() if data is not None else b'' if method=='POST' else None
 req=urllib.request.Request(urls[i]+path,data=payload,method=method,headers={'Content-Type':'application/x-www-form-urlencoded' if form else 'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=180) as r:
   b=r.read();return r.status,json.loads(b) if 'json' in r.headers.get('Content-Type','') and b else b
 except urllib.error.HTTPError as e:
  b=e.read()
  try:b=json.loads(b)
  except ValueError:pass
  return e.code,b

def pair(path,method='GET',data=None,params=None,status=200):
 global count
 rows=[call(i,path,method,data,params) for i in range(2)]
 assert all(s==status for s,_ in rows),(path,rows)
 count+=1;print('PASS',path,flush=True);return [v for _,v in rows]

def wav(data):
 with wave.open(io.BytesIO(data)) as w:return w.getframerate(),w.getnchannels(),w.getnframes()

for name in ('version','core_versions','supported_devices','engine_manifest','speakers','singers','presets','user_dict','openapi.json','setting'):
 pair('/'+name)
for text in ["テ'スト", "'ア",'ア',"ア''","ア'/",'ヘンナabc',"ア'？ア"]:
 rows=[call(i,'/validate_kana','POST',params={'text':text}) for i in range(2)]
 assert rows[0]==rows[1],rows
 count+=1;print('PASS kana error contract',text,flush=True)
queries=pair('/audio_query','POST',params={'speaker':3,'text':'Hello worldとVOICEVOXについて。'})
assert queries[0]['kana']==queries[1]['kana'],[q['kana'] for q in queries]
for flag in ['true','false']:
 q=pair('/audio_query','POST',params={'speaker':3,'text':'unknownfoobar VoiceVox test','enable_katakana_english':flag});assert q[0]['kana']==q[1]['kana']
phrases=pair('/accent_phrases','POST',params={'speaker':3,'text':"テ'スト",'is_kana':'true'})
for name in ['data','length','pitch']:pair('/mora_'+name,'POST',phrases[0],{'speaker':3})
for i,q in enumerate(queries):
 for rate in (16000,24000,44100,96000,192000):
  status,data=call(i,'/synthesis','POST',{**q,'outputSamplingRate':rate},params={'speaker':3})
  assert status==200,(i,rate,status,data)
  assert wav(data)[0]==rate
  count+=1
# Shared WAV input makes connection format/length equality independent of model versions.
_,q=call(0,'/audio_query','POST',params={'speaker':3,'text':'テストです。'})
_,w=call(0,'/synthesis','POST',q,{'speaker':3})
joined=pair('/connect_waves','POST',[base64.b64encode(w).decode()]*2)
assert wav(joined[0])==wav(joined[1])
for i in range(2):
 status,data=call(i,'/multi_synthesis','POST',[q,q],{'speaker':3});assert status==200,(i,status,data)
 with zipfile.ZipFile(io.BytesIO(data)) as z:assert len(z.namelist())==2
 count+=1
pair('/initialize_speaker','POST',params={'speaker':3,'skip_reinit':'true'},status=204)
assert pair('/is_initialized_speaker',params={'speaker':3})==[True,True]
pair('/morphable_targets','POST',[3])
morphed=pair('/synthesis_morphing','POST',q,{'base_speaker':3,'target_speaker':1,'morph_rate':.5})
assert all(wav(x)[0]==24000 for x in morphed)
speakers=pair('/speakers');uid=speakers[0][0]['speaker_uuid']
pair('/speaker_info',params={'speaker_uuid':uid,'resource_format':'url'})
singers=pair('/singers');teacher=next(s['id'] for m in singers[0] for s in m['styles'] if s['type'] in ('singing_teacher','sing'))
score={'notes':[{'id':'rest-a','frame_length':15,'lyric':''},{'id':'note-a','frame_length':30,'lyric':'ド','key':60},{'id':'rest-b','frame_length':15,'lyric':''}]}
frames=pair('/sing_frame_audio_query','POST',score,{'speaker':teacher})
for i,f in enumerate(frames):
 for name in ['f0','volume']:
  status,data=call(i,'/sing_frame_'+name,'POST',{'score':score,'frame_audio_query':f},{'speaker':teacher});assert status==200,(i,name,status,data);count+=1
 singer=next(s['id'] for m in singers[i] for s in m['styles'] if s['type'] in ('frame_decode','sing'))
 status,data=call(i,'/frame_synthesis','POST',f,{'speaker':singer});assert status==200,(i,status,data);assert wav(data)[0]==24000;count+=1
# Dictionary and preset state is confined to explicitly supplied isolated instances.
for i in range(2):
 word=None;pid=None
 try:
  params={'surface':'ソーダ互換検証','pronunciation':'ソーダケンショウ','accent_type':1,'word_type':'PROPER_NOUN','priority':5}
  status,word=call(i,'/user_dict_word','POST',params=params);assert status==200,(i,status,word)
  status,_=call(i,'/user_dict_word/'+word,'PUT',params={**params,'accent_type':2});assert status==204
  status,words=call(i,'/user_dict');assert status==200 and words[word]['accent_type']==2
  status,_=call(i,'/import_user_dict','POST',words,{'override':'true'});assert status==204
  preset={'id':987654321,'name':'Sodashitsu parity '+str(uuid.uuid4()),'speaker_uuid':next(m['speaker_uuid'] for m in speakers[i] if any(s['id']==3 for s in m['styles'])),'style_id':3,'speedScale':1.2,'pitchScale':0,'intonationScale':1,'volumeScale':1,'prePhonemeLength':.1,'postPhonemeLength':.1,'pauseLength':.2,'pauseLengthScale':1}
  status,pid=call(i,'/add_preset','POST',preset);assert status==200,(i,status,pid)
  status,_=call(i,'/update_preset','POST',{**preset,'id':pid,'speedScale':1.3});assert status==200
  status,query=call(i,'/audio_query_from_preset','POST',params={'text':'テスト','preset_id':pid});assert status==200 and query['speedScale']==1.3
  count+=7
 finally:
  if word is not None:call(i,'/user_dict_word/'+str(word),'DELETE')
  if pid is not None:call(i,'/delete_preset','POST',params={'id':pid})
print('PASS total',count,flush=True)
