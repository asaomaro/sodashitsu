import type {InsightGroup,UsageInsights,AccountUsage} from '@sodashitsu/protocol';
export const totalLabel=(n:number)=>Intl.NumberFormat('ja-JP',{notation:'compact',maximumFractionDigits:1}).format(n);
export const rate=(value:number,total:number)=>total>0?Math.round(value/total*1000)/10:null;
export const delta=(value:number,previous:number)=>previous>0?(value-previous)/previous*100:null;
export function dateSlots(from:string,to:string,timezone='UTC'):string[]{
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}),values=new Set<string>();
 for(let t=Date.parse(from+'T00:00:00Z');t<Date.parse(to+'T00:00:00Z')+86400000;t+=3600000)values.add(format.format(t));
 return [...values];
}
export function seriesPath(rows:InsightGroup[],max:number,width=640,height=180,axis=rows.map(r=>r.key)):string {
 let last=-2;return rows.map(r=>{const i=axis.indexOf(r.key);if(i<0)return '';const move=i===last+1?'L':'M';last=i;return `${move}${axis.length===1?width/2:i/(axis.length-1)*width},${height-(max?r.total/max:0)*height}`;}).join(' ');
}
export function exportInsights(data:UsageInsights,format:'json'|'csv'):string {
 if(format==='json')return JSON.stringify(data,null,2);
 const safe=(value:unknown)=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return [['session','kind','role','parent','project','account','input','output','cacheRead','cacheWrite','total','tools','errors'],...data.sessions.map(s=>[s.key,s.kind,s.role,s.parent,s.project,s.account,s.input,s.output,s.cacheRead,s.cacheWrite,s.total,s.tools,s.errors])].map(row=>row.map(safe).join(',')).join('\r\n');
}
export interface LimitPoint {at:number;used:number;reset?:number;}
export function limitForecast(points:LimitPoint[],now:number):number|null {
 const recent=points.filter(p=>now-p.at<=30*60000&&p.at<=now);
 if(recent.length<3)return null;
 const first=recent[0]!,last=recent.at(-1)!;
 if(last.at-first.at<60000||last.used<=first.used||last.used>=100||last.reset!==first.reset)return null;
 const rate=(last.used-first.used)/(last.at-first.at);return now+(100-last.used)/rate;
}
export function limitWindows(accounts:AccountUsage[]){return accounts.flatMap(a=>a.windows.map(w=>({key:`${a.accountKey}:${w.label}`,account:a.label,...w})));}
