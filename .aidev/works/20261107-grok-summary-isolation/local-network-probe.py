import http.server,threading,subprocess,tempfile,os,signal,json,shutil,pathlib,sys,shlex
subprocess.run(['/usr/sbin/ip','link','set','lo','up'],check=True)
root=tempfile.mkdtemp(prefix='soda-grok-tools-zero-');records=[]
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.reply()
 def do_POST(self):self.reply()
 def reply(self):
  data=self.rfile.read(min(int(self.headers.get('Content-Length','0')),1048576))
  try:v=json.loads(data) if data else None
  except:v=None
  # Keep content/auth entirely in memory and retain only non-content schema facts.
  def toolfacts(x,depth=0):
   found=[]
   if depth>8:return found
   if isinstance(x,dict):
    for k,v in x.items():
     if k in ('tools','tool_choice','toolChoice'):found.append({'field':k,'kind':type(v).__name__,'count':len(v) if isinstance(v,(list,dict)) else None,'names':[i.get('name',i.get('function',{}).get('name')) for i in v] if isinstance(v,list) else None})
     else:found+=toolfacts(v,depth+1)
   elif isinstance(x,list):
    for v in x[:16]:found+=toolfacts(v,depth+1)
   return found
  records.append({'path':self.path,'method':self.command,'chatEndpoint':any(w in self.path.lower() for w in ['completion','chat','sample','response']),'json':v is not None,'rootKeys':list(v)[:30] if isinstance(v,dict) else [],'toolFacts':toolfacts(v),'bytes':len(data)})
  if self.path.endswith('/api-key'):
   out=b'{}';self.send_response(200)
  elif 'model' in self.path.lower():
   out=json.dumps({'data':[{'id':'grok-4','object':'model','context_window':131072}], 'models':[{'id':'grok-4','name':'grok-4','context_window':131072}]}).encode();self.send_response(200)
  else:out=b'{"error":{"message":"generated fixture stops before inference"}}';self.send_response(400)
  self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(out)));self.end_headers();self.wfile.write(out)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
env={'PATH':os.environ['PATH'],'HOME':root,'USERPROFILE':root,'XDG_CONFIG_HOME':root+'/config','XDG_DATA_HOME':root+'/data','GROK_HOME':root+'/.grok','XAI_API_KEY':'generated-invalid-fixture-key','GROK_XAI_API_BASE_URL':base,'GROK_CLI_CHAT_PROXY_BASE_URL':base,'GROK_MODELS_BASE_URL':base,'GROK_MODELS_LIST_URL':base+'/models','NO_OPEN_BROWSER':'1','TERM':'dumb'}
os.makedirs(env['GROK_HOME']);os.makedirs(env['GROK_HOME']+'/hooks');pin='--pin' in sys.argv;sentinel=root+'/hook-ran';
if pin:pathlib.Path(env['GROK_HOME']+'/requirements.toml').write_text('allow_managed_hooks_only = true\n')
cmd=shlex.quote(sys.executable)+' -c '+shlex.quote('from pathlib import Path; Path('+repr(sentinel)+').write_text("generated")')
pathlib.Path(env['GROK_HOME']+'/hooks/fixture.json').write_text(json.dumps({'hooks':{'SessionStart':[{'hooks':[{'type':'command','command':cmd,'timeout':2}]}]}}))
pathlib.Path(root+'/prompt.txt').write_text('Return only the word fixture. Do not use tools.')
args=['grok','--prompt-file',root+'/prompt.txt','--output-format','json','--tools','read_file','--disallowed-tools','read_file,Agent,search_tool,use_tool','--deny','MCPTool','--no-subagents','--disable-web-search','--permission-mode','dontAsk','--max-turns','1','--model','grok-4']
c=None
try:
 c=subprocess.Popen(args,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
 try:out,err=c.communicate(timeout=35);timed=False
 except subprocess.TimeoutExpired:os.killpg(c.pid,signal.SIGTERM);out,err=c.communicate(timeout=5);timed=True
 pathlib.Path('/tmp/soda-grok-summary-tools-diagnostic.txt').write_bytes(out+b'\n'+err)
 print(json.dumps({'managedOnlyPin':pin,'userFixtureHookRan':os.path.exists(sentinel),'networkNamespace':'loopback-only','realAuth':False,'externalModelCalls':0,'cliExit':c.returncode,'timedOut':timed,'stdoutBytes':len(out),'stderrBytes':len(err),'requests':records}))
finally:
 if c and c.poll() is None:os.killpg(c.pid,signal.SIGKILL);c.wait()
 server.shutdown();server.server_close();shutil.rmtree(root)
