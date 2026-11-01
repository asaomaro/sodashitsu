"""The official ENGINE text frontend with instance-local dictionaries; inference uses CORE."""
import csv
import sys
import ctypes
import os
import tempfile
from pathlib import Path
import pyopenjtalk
from engine_frontend.njd_feature_processor import text_to_full_context_labels
from engine_frontend.text_analyzer import full_context_labels_to_accent_phrases
from engine_frontend.kana_converter import parse_kana,create_kana,ParseKanaError
from engine_frontend.text_utility import count_mora
from state import POS

COSTS={
 'PROPER_NOUN':[-988,3488,4768,6048,7328,8609,8734,8859,8984,9110,14176],
 'COMMON_NOUN':[-4445,49,1473,2897,4321,5746,6554,7362,8170,8979,15001],
 'VERB':[3100,6160,6360,6561,6761,6962,7414,7866,8318,8771,13433],
 'ADJECTIVE':[1527,3266,3561,3857,4153,4449,5149,5849,6549,7250,10001],
 'SUFFIX':[4399,5373,6041,6710,7378,8047,9440,10834,12228,13622,15847],
}

class Frontend:
 def __init__(self,dictionary,directory):
  self.dictionary=Path(dictionary);self.directory=Path(directory);self.current=None
 def prepare(self,words):
  temp=tempfile.TemporaryDirectory(prefix='.frontend-',dir=self.directory);root=Path(temp.name)
  try:
   with open(root/'words.csv','w',encoding='utf-8',newline='') as f:
    f.write(Path(__file__).with_name('engine_frontend').joinpath('default.csv').read_text(encoding='utf-8').rstrip()+'\n')
    writer=csv.writer(f)
    for v in words.values():
     kind=v.get('word_type') or next(k for k,p in POS.items() if p[0]==v['context_id']);p=POS[kind]
     pronunciation=v['pronunciation'];moras=count_mora(pronunciation)
     writer.writerow([v['surface'],p[0],p[0],COSTS[kind][10-v.get('priority',5)],v.get('part_of_speech',p[1]),v.get('part_of_speech_detail_1',p[2]),v.get('part_of_speech_detail_2',p[3]),v.get('part_of_speech_detail_3','*'),v.get('inflectional_type','*'),v.get('inflectional_form','*'),v.get('stem','*'),v.get('yomi',pronunciation),pronunciation,f"{v['accent_type']}/{moras}",v.get('accent_associative_rule','*')])
   sys.stdout.flush();saved=os.dup(1);os.dup2(2,1)
   try:pyopenjtalk.mecab_dict_index(str(root/'words.csv'),str(root/'words.dic'),dn_mecab=os.fsencode(self.dictionary))
   finally:
    ctypes.CDLL('msvcrt' if sys.platform=='win32' else None).fflush(None)
    os.dup2(saved,1);os.close(saved)
   return [pyopenjtalk.OpenJTalk(dn_mecab=os.fsencode(self.dictionary),userdic=os.fsencode(root/'words.dic')),temp]
  except BaseException:temp.cleanup();raise
 def swap(self,candidate):old=self.current;self.current=candidate;return old
 @staticmethod
 def discard(state):
  if state:
   obj,temp=state;state[0]=None;del obj
   if temp:temp.cleanup()
 def analyze(self,text,english=True):
  return full_context_labels_to_accent_phrases(text_to_full_context_labels(text,english,self.current[0]))
