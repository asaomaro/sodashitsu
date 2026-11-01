import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.SODA_E2E_CHROMIUM_PATH?{executablePath:process.env.SODA_E2E_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage();await page.setContent('<canvas id="actor"></canvas>');
 await page.addScriptTag({path:fileURLToPath(new URL('../assets/actor.js',import.meta.url))});
 const result=await page.evaluate(async()=>{
  const png=(color,w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,w,h);return c.toDataURL().split(',')[1];};
  const base='aaaaaaaaaaaa',point='bbbbbbbbbbbb',chin='cccccccccccc',raise='dddddddddddd',eye='eeeeeeeeeeee',blink='ffffffffffff',mouth='111111111111';
  const face={normal:{blink:[blink,5,5],open:[mouth,6,9]},smile:{e:[eye,5,5],open:[mouth,6,9]},think:{e:[eye,5,5]},surprised:{e:[eye,5,5]}};
  const actor={w:20,h:30,poses:{'':{base,faces:face},point:{base:point,faces:face},chin:{base:chin,faces:face},raise:{base:raise,faces:face}},images:{[base]:png('blue',20,30),[point]:png('red',20,30),[chin]:png('purple',20,30),[raise]:png('green',20,30),[eye]:png('yellow',4,4),[blink]:png('black',4,2),[mouth]:png('white',2,2)}};
  const c=document.getElementById('actor'),player=await window.createCharacterActor(actor,c),now=performance.now(),observed=[];
  const sample=(time,mode,noticeAge,still)=>{player.render(now+time,mode,noticeAge,still);observed.push({...c.dataset,pixel:Array.from(c.getContext('2d').getImageData(0,0,1,1).data),eye:Array.from(c.getContext('2d').getImageData(5,5,1,1).data)});};
  sample(200,'idle',Infinity,false);sample(6200,'idle',Infinity,false);sample(12200,'idle',Infinity,false);sample(24200,'idle',Infinity,false);sample(200,'idle',100,false);sample(1155,'speaking',Infinity,false);sample(2601,'idle',Infinity,false);sample(24200,'working',Infinity,true);
  player.dispose();
  const shifted=document.createElement('canvas'),shiftedPlayer=await window.createCharacterActor({...actor,poses:{'':{base,faces:{normal:{e:[eye,1,1]},smile:{e:[eye,10,1]}}}}},shifted),at=performance.now();
  shiftedPlayer.render(at+6200,'idle',Infinity,false);
  const shiftedPixels=[1,10].map(x=>Array.from(shifted.getContext('2d').getImageData(x,1,1,1).data));shiftedPlayer.dispose();
  return {observed,size:[c.width,c.height],shiftedPixels};
 });
 expect(result.observed.map(x=>x.pose)).toEqual(['normal','normal','chin','point','raise','point','normal','normal']);
 expect(result.shiftedPixels).toEqual([[0,0,255,255],[255,255,0,255]]);
 expect(result.observed[1].face).toBe('smile');expect(result.observed[2].face).toBe('think');expect(result.observed[4].face).toBe('surprised');
 expect(result.observed[5].mouth).toBe('open');expect(result.observed[6].blink).toBe('true');expect(result.observed[6].eye).toEqual([0,0,0,255]);
 expect(result.observed[0].pixel).toEqual([0,0,255,255]);expect(result.observed[3].pixel).toEqual([255,0,0,255]);expect(result.observed[7].mouth).toBe('closed');expect(result.size).toEqual([1,1]);
 console.log('PASS: real canvas pose/face/blink/mouth switching, replacement pixels, reduced-motion reset and disposal');
 if(process.env.SODA_ACTOR_INPUT){
  const actor=JSON.parse(await readFile(process.env.SODA_ACTOR_INPUT,'utf8'));
  await page.evaluate(async actor=>{document.body.innerHTML='<canvas id="actor"></canvas>';window.actorPlayer=await window.createCharacterActor(actor,document.getElementById('actor'));window.actorEpoch=performance.now();},actor);
  for(const [name,age,mode,notice]of [['normal',200,'idle',1e9],['thinking',12200,'idle',1e9],['notification',200,'idle',100],['speaking',1155,'speaking',1e9]]){
   await page.evaluate(({age,mode,notice})=>window.actorPlayer.render(window.actorEpoch+age,mode,notice,false),{age,mode,notice});
   await page.locator('#actor').screenshot({path:`/tmp/desktop-actor-${name}.png`,omitBackground:true});
   console.log(name,JSON.stringify(await page.locator('#actor').evaluate(c=>({...c.dataset,width:c.width,height:c.height}))));
  }
 }
}finally{await browser.close();}
