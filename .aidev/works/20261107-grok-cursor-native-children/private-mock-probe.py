import http.server,threading,subprocess,tempfile,os,signal,json,shutil,pathlib,time,select,sys
if '--private-netns-child' not in sys.argv:
 child_env=dict(os.environ,SODA_PROBE_PARENT_NETNS=os.readlink('/proc/self/ns/net'))
 raise SystemExit(subprocess.run(['unshare','-Urn',sys.executable,__file__,'--private-netns-child'],env=child_env).returncode)
parent_netns=os.environ.get('SODA_PROBE_PARENT_NETNS')
if not parent_netns or parent_netns==os.readlink('/proc/self/ns/net'):raise SystemExit('requires a new private network namespace')
subprocess.run(['/usr/sbin/ip','link','set','lo','up'],check=True)
root=pathlib.Path(tempfile.mkdtemp(prefix='soda-grok-native-mock-'));records=[];spawned=False;inference=0;spawn_schema=None

def args_for(schema,key=''):
 if not isinstance(schema,dict):return 'CHILD_NATIVE_FIXTURE'
 if 'const'in schema:return schema['const']
 if schema.get('enum'):
  for choice in ['general-purpose','new','read-only']:
   if choice in schema['enum']:return choice
  return schema['enum'][0]
 for union in ['anyOf','oneOf']:
  if schema.get(union):return args_for(schema[union][0],key)
 typ=schema.get('type')
 if typ=='object' or 'properties'in schema:
  props=schema.get('properties',{});required=set(schema.get('required',[]));required.update(k for k in ['prompt','description','subagent_type','task','run_in_background']if k in props)
  return{k:args_for(props[k],k)for k in required if k in props}
 if typ=='boolean':return False
 if typ in ['integer','number']:return max(1,schema.get('minimum',1))
 if typ=='array':return[]
 if key in ['description','title']:return'Native mock child'
 if key in ['subagent_type','agent_type']:return'general-purpose'
 return'CHILD_NATIVE_FIXTURE: reply LOCAL_CHILD_DONE without tools.'

class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.reply()
 def do_POST(self):self.reply()
 def reply(self):
  global spawned,inference,spawn_schema
  length=int(self.headers.get('Content-Length','0'));data=self.rfile.read(min(length,2*1024*1024))
  try:v=json.loads(data)if data else{}
  except:v={}
  tools=v.get('tools',[])if isinstance(v,dict)else[]
  names=[t.get('name',t.get('function',{}).get('name'))for t in tools if isinstance(t,dict)]if isinstance(tools,list)else[]
  fact={'path':self.path,'method':self.command,'toolNames':names,'bytes':len(data)};records.append(fact)
  if self.path.endswith('/api-key'):self.simple(200,{})
  elif'model'in self.path.lower():self.simple(200,{'data':[{'id':'grok-4','object':'model','context_window':131072}],'models':[{'id':'grok-4','name':'grok-4','context_window':131072}]})
  elif self.path.endswith('/chat/completions'):
   inference+=1
   if inference>8:self.simple(400,{'error':{'message':'fixture request cap'}});return
   functions=[t.get('function',t)for t in tools if isinstance(t,dict)]
   tool=next((t for t in functions if t.get('name')=='spawn_subagent'),None)
   delta={'role':'assistant','content':'LOCAL_NATIVE_FIXTURE_DONE'};finish='stop'
   if tool and not spawned:
    spawned=True;schema=tool.get('parameters',{});args=args_for(schema);spawn_schema={'required':schema.get('required',[]),'properties':list(schema.get('properties',{})),'sentKeys':list(args)if isinstance(args,dict)else[]}
    delta={'role':'assistant','tool_calls':[{'index':0,'id':'native-fixture-call','type':'function','function':{'name':'spawn_subagent','arguments':json.dumps(args)}}]};finish='tool_calls'
   frames=[{'id':'local-mock-'+str(inference),'object':'chat.completion.chunk','created':1770000000,'model':'grok-4','choices':[{'index':0,'delta':delta,'finish_reason':None}]},{'id':'local-mock-'+str(inference),'object':'chat.completion.chunk','created':1770000000,'model':'grok-4','choices':[{'index':0,'delta':{},'finish_reason':finish}],'usage':{'prompt_tokens':10,'completion_tokens':2,'total_tokens':12}}]
   out=(''.join('data: '+json.dumps(f)+'\n\n'for f in frames)+'data: [DONE]\n\n').encode();self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Content-Length',str(len(out)));self.end_headers();self.wfile.write(out)
  else:self.simple(400,{'error':{'message':'fixture only'}})
 def simple(self,status,value):
  out=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(out)));self.end_headers();self.wfile.write(out)

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
env={'PATH':os.environ['PATH'],'HOME':str(root),'USERPROFILE':str(root),'XDG_CONFIG_HOME':str(root/'config'),'XDG_DATA_HOME':str(root/'data'),'GROK_HOME':str(root/'.grok'),'XAI_API_KEY':'generated-invalid-fixture-key','GROK_XAI_API_BASE_URL':base,'GROK_CLI_CHAT_PROXY_BASE_URL':base,'GROK_MODELS_BASE_URL':base,'GROK_MODELS_LIST_URL':base+'/models','OTEL_TRACES_EXPORTER':'none','NO_OPEN_BROWSER':'1','TERM':'dumb'}
(root/'.grok').mkdir();(root/'prompt.txt').write_text('ROOT_NATIVE_FIXTURE: delegate one native child, wait for its result, then reply LOCAL_ROOT_DONE. No shell, file or network tools.')
args=['grok','--leader-socket',str(root/'leader.sock'),'--prompt-file',str(root/'prompt.txt'),'--output-format','streaming-json','--tools','task','--disallowed-tools','search_tool,use_tool','--allow','Task','--disable-web-search','--permission-mode','dontAsk','--max-turns','4','--model','grok-4']
c=None;out=b'';err=b'';timed=False;start=time.monotonic();events=[];filefacts=[];envelopes=[]
try:
 c=subprocess.Popen(args,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 try:out,err=c.communicate(timeout=35)
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(c.pid,signal.SIGTERM)
  try:out,err=c.communicate(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(c.pid,signal.SIGKILL);out,err=c.communicate(timeout=3)
 def fold(v,path,outer):
  if isinstance(v,dict):
   if v.get('sessionUpdate')in ['subagent_spawned','subagent_progress','subagent_finished','model_changed']:
    allowed=['sessionUpdate','subagent_id','attempt_id','parent_session_id','parent_prompt_id','child_session_id','subagent_type','model','model_id','reasoning_effort','status','turns','tool_calls']
    events.append({'file':path,'outerKeys':outer,'event':{k:v[k]for k in allowed if k in v}})
   for x in v.values():fold(x,path,outer)
  elif isinstance(v,list):
   for x in v:fold(x,path,outer)
 for file in(root/'.grok'/'sessions').glob('*/*/*.jsonl'):
  if file.stat().st_size>4*1024*1024:continue
  kind=file.name;filefacts.append({'name':kind,'bytes':file.stat().st_size})
  for line in file.read_text().splitlines()[:20000]:
   try:v=json.loads(line)
   except:continue
   fold(v,kind,list(v)if isinstance(v,dict)else[])
   if kind=='updates.jsonl' and isinstance(v,dict):
    params=v.get('params',{});update=params.get('update',{}) if isinstance(params,dict) else {}
    if isinstance(update,dict) and update.get('sessionUpdate') in ['subagent_spawned','subagent_progress','subagent_finished','model_changed']:
     envelopes.append({'recordSessionId':file.parent.name,'row':v})
 receipt={'networkNamespace':'loopback-only','realAuth':False,'externalModelCalls':0,'provider':'own local deterministic HTTP mock, not a real model','cliExit':c.returncode,'timedOut':timed,'elapsedMs':round((time.monotonic()-start)*1000),'stdoutBytes':len(out),'stderrBytes':len(err),'requests':records,'spawnSchema':spawn_schema,'files':filefacts,'nativeEvents':events,'nativeEnvelopes':envelopes}
 pathlib.Path('/tmp/soda-grok-native-binding-fixture.json').write_text(json.dumps(receipt,indent=2)+'\n')
 # No actual credentials/userdata; diagnostics remain local generated fixture only.
 pathlib.Path('/tmp/soda-grok-native-binding-fixture-diagnostic.txt').write_bytes(out[:2*1024*1024]+b'\n'+err[:2*1024*1024])
 print(json.dumps(receipt))
finally:
 if c and c.poll()is None:os.killpg(c.pid,signal.SIGKILL);c.wait()
 server.shutdown();server.server_close()
 # Reap only processes in this unique private net namespace, including an owned leader if any.
 ns=os.readlink('/proc/self/ns/net')
 for entry in pathlib.Path('/proc').iterdir():
  if not entry.name.isdigit()or int(entry.name)==os.getpid():continue
  try:
   if os.readlink(entry/'ns/net')==ns:os.kill(int(entry.name),signal.SIGKILL)
  except(OSError,ProcessLookupError,PermissionError):pass
 shutil.rmtree(root)
