"""VOICEVOX ENGINE 0.25.2 API surface, backed by the public CORE Python API."""
import base64
import copy
import html
import io
import json
import select
import socket
import threading
import zipfile
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs,urlsplit
from validation import array,integer,number,text,encode
import waves
from frontend import ParseKanaError as FrontendKanaError,parse_kana
from voicevox_core import ParseKanaError,InvalidWordError,InvalidQueryError,IncompatibleQueriesError

SPEC=json.loads(Path(__file__).with_name('engine-api-0.25.2.json').read_text())
SPEC['info']={**SPEC['info'],'title':'Sodashitsu Direct CORE','version':'1.0.0','description':'Direct VOICEVOX CORE adapter; local API, bounded requests. ENGINE 0.25.2 compatible operations.'}
SPEC['paths']['/health']={'get':{'summary':'Worker status','responses':{'200':{'description':'Ready'}}}}
SPEC['paths']['/streaming_synthesis']={'post':copy.deepcopy(SPEC['paths']['/cancellable_synthesis']['post'])}
SPEC['paths']['/streaming_synthesis']['post']['operationId']='sodashitsu_streaming_synthesis'
SPEC['paths']['/streaming_synthesis']['post']['summary']='Stream WAV from CORE as it is synthesized'


class Server(ThreadingMixIn,HTTPServer):
    daemon_threads=True
    allow_reuse_address=True
    request_queue_size=2048
    def __init__(self,address,runtime):
        self.runtime=runtime;self.slots=threading.BoundedSemaphore(40)
        super().__init__(address,Handler)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):request.close();return
        try:super().process_request(request,address)
        except BaseException:self.slots.release();raise
    def process_request_thread(self,request,address):
        try:super().process_request_thread(request,address)
        finally:self.slots.release()


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup();self.connection.settimeout(5);self.cors_origin=None;self.streaming_started=False
    def log_message(self,*args):pass
    def reply(self,status,value=None,content_type='application/json'):
        if self.streaming_started:self.close_connection=True;return
        if status==204:body=b''
        else:body=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False,allow_nan=False).encode()
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store');self.send_header('Connection','close')
        self.send_header('X-Content-Type-Options','nosniff')
        if content_type.startswith('text/html'):self.send_header('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
        if self.cors_origin:self.send_header('Access-Control-Allow-Origin',self.cors_origin);self.send_header('Vary','Origin')
        if self.command=='OPTIONS':
            self.send_header('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.end_headers()
        if body:self.wfile.write(body)

    def allowed(self):
        host=self.headers.get('Host','')
        if host not in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}:return False
        origin=self.headers.get('Origin')
        if origin is None:return self.headers.get('Sec-Fetch-Site') not in ('cross-site',)
        settings=self.server.runtime.state.settings
        parsed=urlsplit(origin)
        local=parsed.scheme in ('http','https') and parsed.hostname in ('localhost','127.0.0.1','::1') and not parsed.username and not parsed.password
        allowed=(settings.get('allow_origin') or '').split()
        if settings['cors_policy_mode']=='all' or local or origin=='app://.' or origin in allowed:
            self.cors_origin=origin;return True
        return False

    def do_GET(self):self.handle_api()
    def do_POST(self):self.handle_api()
    def do_PUT(self):self.handle_api()
    def do_DELETE(self):self.handle_api()
    def do_OPTIONS(self):self.handle_api()

    def disconnected(self):
        try:
            readable,_,_=select.select([self.connection],[],[],0)
            return bool(readable) and self.connection.recv(1,socket.MSG_PEEK)==b''
        except (OSError,ValueError):return True

    def handle_api(self):
        try:
            with self.server.runtime.lock:self.server.runtime.state.refresh_settings()
            if not self.allowed():self.reply(403,{'detail':'local clients only'});return
            if self.command=='OPTIONS':self.reply(204);return
            with self.server.runtime.lock:self.server.runtime.state.refresh()
            url=urlsplit(self.path);params=parse_qs(url.query,keep_blank_values=True,max_num_fields=16)
            if any(len(v)!=1 for v in params.values()):raise ValueError('duplicate parameter')
            p={k:v[0] for k,v in params.items()};rt=self.server.runtime;path=url.path
            if p.get('core_version') and p['core_version']!=rt.version:raise LookupError('requested CORE version is not installed')
            def string(k,default=None):return p[k] if k in p else default
            def intp(k,default=None):return int(p[k]) if k in p else default if default is not None else (_ for _ in ()).throw(ValueError('missing integer'))
            def boolp(k,default=False):
                value=p.get(k,str(default)).lower()
                if value not in ('true','false','1','0'):raise ValueError('invalid boolean')
                return value in ('true','1')
            def body():
                size=int(self.headers.get('Content-Length','0'))
                if size<0 or self.headers.get('Transfer-Encoding'):raise ValueError('body too large')
                chunks=[];remaining=size
                while remaining:
                    chunk=self.rfile.read(min(65536,remaining))
                    if not chunk:break
                    chunks.append(chunk);remaining-=len(chunk)
                data=b''.join(chunks)
                if len(data)!=size:raise ValueError('incomplete body')
                if self.headers.get_content_type()=='application/x-www-form-urlencoded':
                    fields=parse_qs(data.decode(),keep_blank_values=True,max_num_fields=8)
                    if any(len(v)!=1 for v in fields.values()):raise ValueError('duplicate field')
                    return {k:v[0] for k,v in fields.items()}
                if self.headers.get_content_type()!='application/json':raise ValueError('JSON required')
                return json.loads(data,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('nonfinite number')))
            method=self.command
            if method=='GET':
                if path=='/health':self.reply(200,{'ready':True,'loadedModels':len(rt.loaded),'startedAt':rt.started});return
                if path=='/version':self.reply(200,'sodashitsu-core-'+rt.version);return
                if path=='/core_versions':self.reply(200,[rt.version]);return
                if path=='/supported_devices':self.reply(200,encode(rt.synth.onnxruntime.supported_devices()));return
                if path=='/openapi.json':self.reply(200,SPEC);return
                if path in ('/speakers','/singers'):self.reply(200,rt.speakers(path=='/singers'));return
                if path in ('/speaker_info','/singer_info'):
                    fmt=string('resource_format','base64')
                    if fmt not in ('base64','url'):raise ValueError('invalid resource format')
                    speaker=next((s for s in rt.speakers(path=='/singer_info') if s['speaker_uuid']==string('speaker_uuid')),None)
                    if speaker is None:raise LookupError('speaker not found')
                    self.reply(200,rt.resources.info(speaker,fmt,getattr(self.server,'resource_origin',f'http://127.0.0.1:{self.server.server_port}')));return
                if path.startswith('/resources/'):
                    parts=path.split('/',3)
                    if len(parts)!=4:raise LookupError('resource not found')
                    data,mime=rt.resources.public_file(parts[2],parts[3]);self.reply(200,data,mime);return
                if path=='/is_initialized_speaker':
                    with rt.lock:self.reply(200,rt.initialized(intp('speaker')))
                    return
                if path=='/presets':
                    with rt.lock:self.reply(200,rt.state.presets)
                    return
                if path=='/user_dict':
                    with rt.lock:self.reply(200,rt.state.export_words())
                    return
                if path=='/engine_manifest':self.reply(200,self.manifest());return
                if path=='/setting':self.reply(200,self.setting_html(),'text/html; charset=utf-8');return
                if path in ('/','/docs'):
                    rows=''.join(f'<li>{html.escape(m.upper()+" "+u)}</li>' for u,ops in SPEC['paths'].items() for m in ops)
                    self.reply(200,('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Sodashitsu Direct CORE</title><h1>Sodashitsu Direct CORE</h1><p>CORE直結の音声合成サービス</p><a href="/setting">設定</a> <a href="/openapi.json">OpenAPI</a><ul>'+rows+'</ul></html>').encode(),'text/html; charset=utf-8');return
            if method=='POST':
                if path in ('/audio_query','/accent_phrases','/audio_query_from_preset'):
                    english=boolp('enable_katakana_english',True)
                    if path=='/audio_query_from_preset':
                        with rt.lock:
                            preset=next((v for v in rt.state.presets if v['id']==intp('preset_id')),None)
                            if preset is None:raise LookupError('preset not found')
                            q=rt.query(string('text'),preset['style_id'],english)
                            q.update({k:v for k,v in preset.items() if k not in ('id','name','speaker_uuid','style_id')})
                        self.reply(200,q);return
                    if path=='/audio_query':value=rt.query(string('text'),intp('speaker'),english)
                    else:value=rt.accent(string('text'),intp('speaker'),boolp('is_kana'),english)
                    self.reply(200,value);return
                if path in ('/mora_data','/mora_length','/mora_pitch'):self.reply(200,rt.mora(body(),intp('speaker'),path.removeprefix('/mora_')));return
                if path in ('/synthesis','/cancellable_synthesis'):
                    data=rt.synthesis(body(),intp('speaker'),boolp('enable_interrogative_upspeak',True),self.disconnected if path=='/cancellable_synthesis' else None)
                    self.reply(200,data,'audio/wav');return
                if path=='/streaming_synthesis':self.stream(body(),intp('speaker'),boolp('enable_interrogative_upspeak',True));return
                if path=='/multi_synthesis':
                    values=array(body(),64);result=io.BytesIO();total=0
                    if not values:raise ValueError('no audio queries')
                    with zipfile.ZipFile(result,'w',compression=zipfile.ZIP_STORED) as archive:
                        for i,q in enumerate(values):
                            data=rt.synthesis(q,intp('speaker'),boolp('enable_interrogative_upspeak',True),self.disconnected);total+=len(data)
                            archive.writestr(f'{i+1:03}.wav',data)
                    self.reply(200,result.getvalue(),'application/zip');return
                if path in ('/sing_frame_audio_query','/sing_frame_f0','/sing_frame_volume','/frame_synthesis'):
                    kind={'/sing_frame_audio_query':'query','/sing_frame_f0':'f0','/sing_frame_volume':'volume','/frame_synthesis':'synthesis'}[path]
                    data=rt.sing(body(),intp('speaker'),kind);self.reply(200,data,'audio/wav' if kind=='synthesis' else 'application/json');return
                if path=='/connect_waves':self.reply(200,waves.connect(body()),'audio/wav');return
                if path=='/validate_kana':
                    parse_kana(string('text'));self.reply(200,True);return
                if path=='/initialize_speaker':
                    sid=intp('speaker')
                    with rt.lock:
                        entry=rt.style(sid)
                        if not boolp('skip_reinit') and rt.initialized(sid):rt.synth.unload_voice_model(rt.loaded.pop(entry['path']))
                        rt.load(sid)
                    self.reply(204);return
                if path=='/morphable_targets':
                    bases=array(body(),256)
                    self.reply(200,[{str(target):{'is_morphable':rt.morphable(base,target)} for target in rt.styles} for base in bases]);return
                if path=='/synthesis_morphing':
                    value=rt.morph(body(),intp('base_speaker'),intp('target_speaker'),float(string('morph_rate')),boolp('enable_interrogative_upspeak',True));self.reply(200,value,'audio/wav');return
                if path in ('/add_preset','/update_preset','/delete_preset'):
                    with rt.lock:value=rt.state.change_preset(intp('id') if path=='/delete_preset' else body(),path.split('_')[0][1:])
                    self.reply(204 if path=='/delete_preset' else 200,value);return
                if path=='/user_dict_word':
                    with rt.lock:value=rt.state.change_word(self.word_params(p))
                    self.reply(200,value);return
                if path=='/import_user_dict':
                    with rt.lock:rt.state.import_words(body(),boolp('override'))
                    self.reply(204);return
                if path=='/setting':
                    with rt.lock:rt.state.change_setting(body())
                    self.reply(204);return
            if path.startswith('/user_dict_word/') and method in ('PUT','DELETE'):
                key=path.removeprefix('/user_dict_word/')
                with rt.lock:rt.state.change_word(self.word_params(p) if method=='PUT' else None,key,method=='DELETE')
                self.reply(204);return
            self.reply(405 if path in SPEC['paths'] else 404,{'detail':'unsupported method or endpoint'})
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError,socket.timeout):pass
        except PermissionError:self.reply(400,{'detail':'morphing is not permitted for these voices'})
        except LookupError:self.reply(404,{'detail':'requested resource, style, word, preset or CORE version is unavailable'})
        except FrontendKanaError as error:
            self.reply(400,{'detail':{'text':error.text,'error_name':error.errname,'error_args':{k:str(v) for k,v in error.kwargs.items()}}})
        except ParseKanaError:
            self.reply(400,{'detail':{'text':'読み仮名を解析できません。','error_name':'UNKNOWN_TEXT','error_args':{'text':p.get('text','')}}})
        except (InvalidWordError,InvalidQueryError,IncompatibleQueriesError):self.reply(400,{'detail':'invalid word or query'})
        except (ValueError,TypeError,KeyError,OverflowError):self.reply(422,{'detail':'invalid request or input exceeds documented limits'})
        except Exception:self.reply(503,{'detail':'CORE operation failed; check installed dependencies and models'})

    @staticmethod
    def word_params(p):
        result={k:p[k] for k in ('surface','pronunciation','word_type') if k in p}
        for k in ('accent_type','priority'):
            if k in p:result[k]=int(p[k])
        return result

    def setting_html(self):
        settings=self.server.runtime.state.settings
        options=''.join(f'<option value="{v}"'+(' selected' if v==settings['cors_policy_mode'] else '')+f'>{v}</option>' for v in ('localapps','all'))
        return ('<!doctype html><html lang="ja"><meta charset="utf-8"><title>CORE設定</title><h1>Sodashitsu Direct CORE</h1><form method="post"><label>CORS<select name="cors_policy_mode">'+options+'</select></label><label>許可するOrigin（空白区切り）<input name="allow_origin" value="'+html.escape(settings.get('allow_origin') or '',quote=True)+'"></label><button>保存</button></form></html>').encode()

    def manifest(self):
        rt=self.server.runtime
        return {'manifest_version':'0.13.1','name':'Sodashitsu Direct CORE','brand_name':'Sodashitsu','uuid':'ef5e9325-d160-4f21-995e-d67f03681a68','url':'https://github.com/VOICEVOX/voicevox_core','icon':'','default_sampling_rate':24000,'frame_rate':93.75,'terms_of_service':'VOICEVOXおよび各音声ライブラリの利用規約とクレジットに従ってください。','update_infos':[],'dependency_licenses':[],'supported_vvlib_manifest_version':None,'supported_features':{'adjust_mora_pitch':True,'adjust_phoneme_length':True,'adjust_speed_scale':True,'adjust_pitch_scale':True,'adjust_intonation_scale':True,'adjust_volume_scale':True,'adjust_pause_length':True,'interrogative_upspeak':True,'synthesis_morphing':True,'sing':bool(rt.speakers(True)),'manage_library':False,'return_resource_url':True,'apply_katakana_english':True}}

    def stream(self,data,sid,upspeak):
        from validation import audio_query
        rt=self.server.runtime;q=audio_query(data)
        if q.output_sampling_rate not in (24000,48000):raise ValueError('streaming output must be 24000 or 48000 Hz')
        with rt.lock:
            rt.load(sid,('streaming_talk',));stream=rt.synth.streaming_synthesis(q,sid,enable_interrogative_upspeak=upspeak)
            try:
                header=next(stream)
                self.send_response(200);self.send_header('Content-Type','audio/wav');self.send_header('Cache-Control','no-store');self.send_header('Connection','close')
                if self.cors_origin:self.send_header('Access-Control-Allow-Origin',self.cors_origin)
                self.end_headers();self.streaming_started=True;self.wfile.write(header);self.wfile.flush()
                for chunk in stream:
                    if self.disconnected():break
                    self.wfile.write(chunk);self.wfile.flush()
            finally:stream.__exit__(None,None,None)
