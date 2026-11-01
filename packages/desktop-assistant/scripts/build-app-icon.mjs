// Render the existing vector logo, without changing its shapes or colours.
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const assets=fileURLToPath(new URL('../assets/',import.meta.url));
const svg=await readFile(new URL('../../web/public/logo.svg',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,...(process.env.SODA_E2E_CHROMIUM_PATH?{executablePath:process.env.SODA_E2E_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage(),images=[];
 for(const size of [16,24,32,48,64,128,256]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="256" height="256"',`width="${size}" height="${size}"`)}</body></html>`);
  const png=await page.screenshot({omitBackground:true});images.push({size,png});
  if(size===256)await writeFile(assets+'sodashitsu.png',png);
  if(size===32)await writeFile(assets+'tray.png',png);
 }
 const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
 let offset=header.length;
 images.forEach(({size,png},index)=>{
  const at=6+16*index;header[at]=header[at+1]=size===256?0:size;
  header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;
 });
 await writeFile(assets+'sodashitsu.ico',Buffer.concat([header,...images.map(v=>v.png)]));
}finally{await browser.close();}
