"""Reuse the verified ENGINE operation handlers in memory, without binding any socket."""
import base64,io,json
from email.message import Message
from types import SimpleNamespace
from urllib.parse import urlencode
from api import Handler,SPEC
class DirectHandler(Handler):
 def allowed(self):return True
 def disconnected(self):return False
 def reply(self,status,value=None,content_type=None):
  self.result=(status,value,content_type or ('application/octet-stream' if isinstance(value,bytes) else 'application/json'))
 def stream(self,data,sid,upspeak):
  # JSON-lines returns the complete WAV; there is no HTTP chunking in this transport.
  self.reply(200,self.server.runtime.synthesis(data,sid,upspeak),'audio/wav')

def execute(rt,request,cancelled=lambda:False):
 if not isinstance(request,dict):raise ValueError('request must be an object')
 with rt.lock:rt.state.refresh()
 aliases={'query':'audio_query','synthesize':'synthesis','devices':'supported_devices','versions':'core_versions'}
 name=aliases.get(request.get('operation'),request.get('operation'))
 if not isinstance(name,str):raise ValueError('operation is required')
 path='/'+name
 if path not in SPEC['paths'] and not path.startswith(('/user_dict_word/','/resources/')):raise ValueError('unknown CORE operation')
 params=dict(request.get('params') or {})
 if 'speaker' in request:params['speaker']=request['speaker']
 body=request.get('body');method=request.get('method')
 if request.get('operation')=='synthesize' and body is None:
  body=rt.query(request.get('text',''),params.get('speaker',2));params.setdefault('speaker',2)
 if name in ('synthesis','cancellable_synthesis'):
  cooperative=cancelled if request.get('cancellable') or name=='cancellable_synthesis' or hasattr(rt.synth,'streaming_synthesis') else None
  wav=rt.synthesis(body,params.get('speaker',2),str(params.get('enable_interrogative_upspeak','true')).lower() not in ('false','0'),cooperative)
  return {'kind':'bytes','mime':'audio/wav','base64':base64.b64encode(wav).decode()}
 if 'text' in request and name in ('audio_query','accent_phrases','validate_kana','audio_query_from_preset'):params['text']=request['text']
 if method is None:method='GET' if 'get' in SPEC['paths'].get(path,{}) and body is None else 'POST'
 if method not in ('GET','POST','PUT','DELETE'):raise ValueError('unsupported method')
 data=json.dumps(body,ensure_ascii=False,allow_nan=False).encode() if body is not None else b''
 handler=object.__new__(DirectHandler);handler.server=SimpleNamespace(runtime=rt,server_port=0,resource_origin=None);handler.command=method
 handler.path=path+('?' +urlencode(params,doseq=False) if params else '')
 handler.headers=Message();handler.headers['Content-Type']='application/json';handler.headers['Content-Length']=str(len(data))
 handler.rfile=io.BytesIO(data);handler.cors_origin=None;handler.streaming_started=False;handler.result=None
 handler.handle_api()
 if handler.result is None:raise ValueError('operation did not return a result')
 status,value,mime=handler.result
 if not 200<=status<300:raise ValueError(json.dumps({'status':status,'detail':value},ensure_ascii=False))
 if isinstance(value,bytes):return {'kind':'bytes','mime':mime,'base64':base64.b64encode(value).decode()}
 return {'kind':'json','value':value}
