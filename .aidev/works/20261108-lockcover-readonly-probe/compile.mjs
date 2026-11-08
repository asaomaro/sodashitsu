// Test fixture compiler only. Never executes the generated probe.
import{execFile}from'node:child_process';import{mkdir,readFile,writeFile,lstat}from'node:fs/promises';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{resolve,join,basename,isAbsolute}from'node:path';
export const PINS=Object.freeze({"scripts/remote-desktop/WindowsDesktopUnlock.cs": "44a7a537234c7c183e8a089da8154a29cf351c6952bc6533b6af41056ef03c2c", "scripts/remote-desktop/WindowsDesktopHost.cs": "0c42d61014ddfa7d2021d18bae3503e08db20227a2f2994fccece1449163a5e3", ".aidev/works/20261108-lockcover-readonly-probe/LockCoverProbe.cs": "71442c317fafa10f9df7c29e5129227045d56ed70a0e0e156639433b6693eced"});
export const CSC=String.raw`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`;
const refs=['System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','System.ServiceProcess.dll'];
const hash=b=>createHash('sha256').update(b).digest('hex');
function execute(command,args){return new Promise(resolve=>{const child=execFile(command,args,{windowsHide:true,shell:false,timeout:45000,maxBuffer:65536,encoding:'buffer'},(error,stdout,stderr)=>resolve({exit:error?typeof error.code==='number'?error.code:null:0,error:error?error.killed?'timeout':error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'output_limit':'compile_failed':null,stdout,stderr}));child.stdin?.end();});}
export async function compile(repo,out,run=execute){
 const sources=[];for(const[path,sha]of Object.entries(PINS)){const file=join(repo,path);if((await lstat(file)).isSymbolicLink())throw Error('source_link');const bytes=await readFile(file);if(hash(bytes)!==sha)throw Error('source_hash');sources.push({name:basename(file),bytes});}
 await mkdir(out,{mode:0o700});for(const source of sources)await writeFile(join(out,source.name),source.bytes,{flag:'wx',mode:0o600});
 const binary=join(out,'LockCoverProbe.exe'),args=['/nologo','/target:winexe','/platform:x64','/main:SodaLockCoverProbe','/out:'+binary,...refs.map(r=>'/r:'+r),...sources.map(s=>join(out,s.name))];
 const result=await run(CSC,args);const diagnostics={};for(const lane of ['stdout','stderr']){const bytes=Buffer.from(result[lane]??'');await writeFile(join(out,'compile-'+lane+'.log'),bytes.subarray(0,65536),{flag:'wx',mode:0o600});diagnostics[lane]={bytes:Math.min(bytes.length,65536),clipped:bytes.length>65536};}
 const receipt={fixture:'lockcover-readonly',source:PINS,compileExit:result.exit,error:result.error,diagnostics,executed:false};
 if(result.exit===0&&!result.error){for(const source of sources)if(!source.bytes.equals(await readFile(join(out,source.name))))throw Error('staged_source_changed');const info=await lstat(binary);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>4*1024*1024)throw Error('binary_invalid');receipt.binarySha256=hash(await readFile(binary));}
 await writeFile(join(out,'compile-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 if(result.exit!==0||result.error)throw Error('compile_failed');return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.platform!=='win32'||process.argv.length!==4||process.argv[2]!=='--out-dir'||!isAbsolute(process.argv[3]))throw Error('args');const repo=fileURLToPath(new URL('../../../',import.meta.url));const result=await compile(repo,process.argv[3]);process.stdout.write(JSON.stringify({fixture:result.fixture,compileExit:result.compileExit,binarySha256:result.binarySha256,executed:false})+'\n');}
 catch{process.stdout.write('{"fixture":"lockcover-readonly","compileUnavailable":true}\n');process.exitCode=1;}
}
