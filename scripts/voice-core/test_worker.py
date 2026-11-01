"""Focused regressions for API payloads returned by real CORE and WAV compatibility."""
import base64
import io
import sys
import unittest
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'packages/server/assets/voice-core'))
from validation import frame_query, audio_query,encode
from waves import connect,unpack
from engine_frontend.kana_converter import parse_kana,ParseKanaError
class CompatibilityTests(unittest.TestCase):
 def test_song_query_accepts_native_negative_volume(self):
  query={'f0':[0,220,0],'volume':[0,-.000413,0],'phonemes':[{'phoneme':'pau','frame_length':3,'note_id':None}],'volumeScale':1,'outputSamplingRate':24000,'outputStereo':False}
  self.assertEqual(encode(frame_query(query))['volume'],query['volume'])
 def test_arbitrary_sample_rate_and_long_silence(self):
  query={'accent_phrases':[],'speedScale':1,'pitchScale':0,'intonationScale':1,'volumeScale':5,'prePhonemeLength':130,'postPhonemeLength':.1,'outputSamplingRate':192000,'outputStereo':False}
  self.assertEqual(audio_query(query).output_sampling_rate,192000)
  with self.assertRaises(ValueError):audio_query({**query,'volumeScale':float('nan')})
 def test_float_multichannel_high_rate_wave_connection(self):
  import numpy as np
  import soundfile as sf
  data=io.BytesIO();sf.write(data,np.zeros((100,3)),192000,format='WAV',subtype='FLOAT')
  samples,rate=unpack(connect([base64.b64encode(data.getvalue()).decode()]*2))
  self.assertEqual((samples.shape,rate),((200,3),192000))
 def test_engine_kana_error_keeps_specific_error(self):
  with self.assertRaises(ParseKanaError) as caught:parse_kana('ア')
  self.assertEqual(caught.exception.errcode.name,'ACCENT_NOTFOUND')
 def test_imported_dictionary_metadata_survives_export(self):
  from state import State
  state=object.__new__(State)
  state.words={'id':{'surface':'テスト','pronunciation':'テスト','accent_type':1,'word_type':'PROPER_NOUN','priority':5,'accent_associative_rule':'C1','yomi':'テスト','part_of_speech_detail_3':'特殊'}}
  exported=state.export_words()['id']
  self.assertEqual(exported['accent_associative_rule'],'C1')
  self.assertEqual(exported['part_of_speech_detail_3'],'特殊')
 def test_frontend_releases_mapped_dictionary_before_cleanup(self):
  from frontend import Frontend
  released=[]
  class JTalk:
   def __del__(self):released.append(True)
  class Temp:
   def cleanup(self):self_cleaned=bool(released);assert self_cleaned,'dictionary still mapped'
  holder=[JTalk(),Temp()]
  Frontend.discard(holder)
  self.assertIsNone(holder[0])
if __name__=='__main__':unittest.main()
