import http.server,threading,subprocess,tempfile,os,signal,json,shutil,pathlib,sys,shlex,socket,pty,select,time,fcntl,termios
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
os.makedirs(env['GROK_HOME']);os.makedirs(env['GROK_HOME']+'/hooks')
reports=[];sock=socket.socket(socket.AF_UNIX);sock.bind(root+'/report.sock');sock.listen(4);sock.settimeout(12)
def collect():
 try:
  while len(reports)<4:
   conn,_=sock.accept();conn.settimeout(2)
   with conn:
    data=b''
    while len(data)<4096 and b'\n' not in data:
     chunk=conn.recv(4096-len(data))
     if not chunk:break
     data+=chunk
    try:
     value=json.loads(data);reports.append({'kindGrok':value.get('kind')=='grok','hasUuid':isinstance(value.get('sessionId'),str) and len(value['sessionId'])==36,'agentPid':value.get('agentPid')})
    except:pass
 except (OSError,TimeoutError):pass
threading.Thread(target=collect,daemon=True).start()
node='/home/asaomaro/.nvm/versions/node/v24.22.2/bin/node'
asset=str(pathlib.Path(__file__).resolve().parents[3]/'packages/server/assets/agent-hook-report.cjs')
cmd=shlex.quote(node)+' '+shlex.quote(asset)+' grok'
pathlib.Path(env['GROK_HOME']+'/hooks/fixture.json').write_text(json.dumps({'hooks':{'SessionStart':[{'hooks':[{'type':'command','command':cmd,'timeout':2}]}]}}))
env.update(SODA_PANE_ID='12345678-1234-4234-8234-123456789012',SODA_AGENT_REPORT_SOCKET=root+'/report.sock',TERM='xterm-256color')
args=['grok','--model','grok-4']
master,slave=pty.openpty();os.set_blocking(master,False)

c=None
try:
 c=subprocess.Popen(args,cwd=root,env=env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True,preexec_fn=lambda:fcntl.ioctl(0,termios.TIOCSCTTY,0))
 os.close(slave);end=time.monotonic()+10;readBytes=0
 while time.monotonic()<end and c.poll() is None and not reports:
  if select.select([master],[],[],0.1)[0]:
   try:readBytes+=len(os.read(master,65536))
   except OSError:break
 if c.poll() is None:os.killpg(c.pid,signal.SIGTERM)
 try:c.wait(timeout=3)
 except subprocess.TimeoutExpired:os.killpg(c.pid,signal.SIGKILL);c.wait()
 print(json.dumps({'nativeTui':True,'networkNamespace':'loopback-only','realAuth':False,'externalModelCalls':0,'inputBytes':0,'cliExit':c.returncode,'ptyBytesDiscarded':readBytes,'reports':len(reports),'allKindsGrok':all(r['kindGrok'] for r in reports),'allUuid':all(r['hasUuid'] for r in reports),'allPidMatchesOwnTui':all(r['agentPid']==c.pid for r in reports),'inferenceRequests':sum(1 for r in records if r.get('chatEndpoint'))}))

finally:
 if c and c.poll() is None:os.killpg(c.pid,signal.SIGKILL);c.wait()
 sock.close();os.close(master);server.shutdown();server.server_close();shutil.rmtree(root)
