import{mkdtemp,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{fileURLToPath}from'node:url';
import{spawn}from'node:child_process';
import{expect,it}from'vitest';
import{startAgentReportSocket,type AgentReport}from'./AgentReportSocket.js';
import{MemoryLogger}from'../log/Logger.js';
it.skipIf(process.platform!=='linux')('reports the nearest formal cursor-agent parent PID from the SessionStart hook',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-cursor-pid-')),socketPath=join(dir,'r.sock'),reports:AgentReport[]=[];
 const socket=await startAgentReportSocket(socketPath,r=>reports.push(r),new MemoryLogger());
 try{
  const hook=fileURLToPath(new URL('../../assets/agent-hook-report.cjs',import.meta.url));
  const script=`process.title='cursor-agent';const{spawn}=require('node:child_process');const child=spawn(process.execPath,[${JSON.stringify(hook)},'cursor'],{stdio:['pipe','ignore','ignore']});child.stdin.end(JSON.stringify({session_id:'11111111-1111-4111-8111-111111111111',hook_event_name:'sessionStart'}));child.on('close',code=>process.exit(code||0));`;
  const parent=spawn(process.execPath,['-e',script],{env:{...process.env,SODA_PANE_ID:'fixture-pane',SODA_AGENT_REPORT_SOCKET:socketPath},stdio:'ignore'});
  await new Promise<void>((resolve,reject)=>{parent.on('error',reject);parent.on('close',code=>{try{expect(code).toBe(0);resolve()}catch(e){reject(e)}});});
  expect(reports).toHaveLength(1);expect(reports[0]?.type).toBe('session');expect(reports[0]?.agentPid).toBe(parent.pid);
 }finally{await socket.close();await rm(dir,{recursive:true,force:true});}
});
