import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const options={baseline:'',out:join(tmpdir(),'soda-desktop-render-bench.json')};
for(let i=2;i<process.argv.length;i+=2){
 const key=process.argv[i]?.replace(/^--/,'');
 if(!Object.hasOwn(options,key)||!process.argv[i+1])throw Error('Usage: node benchmark-render.mjs --baseline <git-ref> [--out <file>]');
 options[key]=process.argv[i+1];
}
if(!options.baseline)throw Error('Specify --baseline <git-ref> for the comparison');
const require=createRequire(join(root,'packages/e2e/package.json'));
const {chromium}=require('@playwright/test'),ts=require('typescript');
const codes={};
for(const mode of ['baseline','parallel']) {
 const src=mode==='baseline'?execFileSync('git',['show',options.baseline+':packages/web/src/desktop/render.ts'],{cwd:root,encoding:'utf8'}):await readFile(join(root,'packages/web/src/desktop/render.ts'),'utf8');
 codes[mode]=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
}
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 const report=await page.evaluate(async codes=>{
  const renderers={};for(const [mode,code] of Object.entries(codes)){
   const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));renderers[mode]=(await import(url)).renderDesktopUpdate;URL.revokeObjectURL(url);
  }
  const blocks=[],patches=[];let size=0,seed=42;
  for(let i=0;i<8;i++){
   const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),pixels=ctx.createImageData(256,256);
   for(let n=0;n<pixels.data.length;n+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[n]=(seed>>>16&7)*32;pixels.data[n+1]=(seed>>>19&7)*32;pixels.data[n+2]=(seed>>>22&7)*32;pixels.data[n+3]=255;}
   ctx.putImageData(pixels,0,0);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));const bytes=new Uint8Array(await blob.arrayBuffer());
   patches.push({x:(i%4)*256,y:Math.floor(i/4)*256,width:256,height:256,offset:size,length:bytes.length});blocks.push(bytes);size+=bytes.length;
  }
  const image=new Uint8Array(size);for(let i=0;i<8;i++)image.set(blocks[i],patches[i].offset);
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const frame={image,info:{seq:2,width:1024,height:512,format:'image/png',captureMs:0,encodeMs:0,update:{kind:'patch',baseSeq:1,patches}}};
  const samples={baseline:[],parallel:[]};
  for(let i=0;i<30;i++)for(const mode of (i%2?['parallel','baseline']:['baseline','parallel'])){
   let accepted=0;const started=performance.now();if(!await renderers[mode](canvas,frame,{accept:()=>accepted++},()=>true)||accepted!==1)throw Error('Render failed');
   if(i>=5)samples[mode].push(performance.now()-started);
  }
  const result={kind:'actual-Chromium-PNG-decode-render',patchCount:8,pixels:1024*512,pngBytes:size,samplesPerMode:25,modes:{},limitations:'Controlled generated PNG patches in headless Chromium on one host; not remote desktop or WAN/input latency.'};
  for(const [mode,values] of Object.entries(samples)){const sorted=[...values].sort((a,b)=>a-b);result.modes[mode]={meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:sorted[12],p95Ms:sorted[23]};}
  return result;
 },codes);
 report.browser=browser.version();report.baseline=options.baseline;await writeFile(options.out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {await browser.close();}
