import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import type {MachineStatus,UsageInsights,UsageInsightsParams} from '@sodashitsu/protocol';
import UsageInsightsPanel from './UsageInsightsPanel.vue';
import {ConnectionKey,UsageInsightsPortKey} from '../injection.js';
import {useMachinesStore} from '../store/machines.js';
let wrapper:VueWrapper|undefined;
beforeEach(()=>setActivePinia(createPinia()));afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.useRealTimers();});
function fixture(p:UsageInsightsParams,collecting=false):UsageInsights{
 const group={key:'total',label:'total',input:100,output:0,cacheRead:0,cacheWrite:0,total:100,calls:1,tools:1,errors:0,knownResults:1};
 return {...p,asOf:Date.now(),partial:collecting,collecting,retainedFrom:'2025-01-01',activity:{started:1,completed:1,aborted:0,failed:0},totals:group,previous:group,byDay:[],byDayRole:[],previousByDay:[],byKind:[],byModel:[],byProject:[],byAccount:[],byRole:[],byHour:[],tools:[],sessions:[],coverage:[],options:{kinds:[],models:[],projects:[],accounts:[]}};
}
function setup(port:(id:string,p:UsageInsightsParams)=>Promise<UsageInsights>){
 const machines=useMachinesStore();machines.machines=[{id:'remote',label:'Other PC',state:'online'} as MachineStatus];
 wrapper=mount(UsageInsightsPanel,{global:{provide:{[ConnectionKey as symbol]:{request:vi.fn()},[UsageInsightsPortKey as symbol]:port}}});return machines;
}
it('clears the previous PC data when the newly selected PC cannot be read',async()=>{
 setup(async(id,p)=>{if(id==='remote')throw new Error('offline');return fixture(p);});await flushPromises();expect(wrapper!.find('.insights-metrics').exists()).toBe(true);
 await wrapper!.findAll('select')[0]!.setValue('remote');await wrapper!.find('form').trigger('submit');await flushPromises();expect(wrapper!.find('.insights-metrics').exists()).toBe(false);expect(wrapper!.get('[role="alert"]').text()).toContain('取得できません');
});
it('shows a failure instead of a permanent loading message when every PC fails',async()=>{
 let failing=false;setup(async(_id,p)=>{if(failing)throw new Error('offline');return fixture(p);});await flushPromises();failing=true;
 await wrapper!.findAll('select')[0]!.setValue('all');await wrapper!.find('form').trigger('submit');await flushPromises();expect(wrapper!.get('[role="alert"]').text()).toContain('取得できません');expect(wrapper!.text()).not.toContain('記録を読み取っています…');
});
it('continues scanning a peer even when the current PC is already complete',async()=>{
 vi.useFakeTimers();const calls=vi.fn(async(id:string,p:UsageInsightsParams)=>fixture(p,id==='remote'));const machines=setup(calls);machines.summaries.remote={connected:true,everConnected:true,workspaces:[],tabWorkspace:{},panes:{}};await flushPromises();
 await wrapper!.findAll('select')[0]!.setValue('all');await wrapper!.find('form').trigger('submit');await flushPromises();const first=calls.mock.calls.filter(c=>c[0]==='remote').length;expect(first).toBe(1);
 await vi.advanceTimersByTimeAsync(3000);await flushPromises();expect(calls.mock.calls.filter(c=>c[0]==='remote').length).toBeGreaterThan(first);
});
it('invalidates the parent report filter before starting a new PC request',async()=>{
 const machines=setup(async(id,p)=>{if(id==='remote')throw new Error('offline');return fixture(p);});await flushPromises();
 expect(wrapper!.emitted('insights')?.at(-1)?.[0]).toMatchObject({timezone:expect.any(String)});
 machines.selectedId='remote';await flushPromises();expect(wrapper!.emitted('insights')?.at(-1)?.[0]).toBeNull();
});
it('keeps the current chart visible during a background continuation of the same scope',async()=>{
 vi.useFakeTimers();let finish:((r:UsageInsights)=>void)|undefined,last:UsageInsightsParams|undefined,calls=0;
 setup(async(_id,p)=>{last=p;if(calls++===0)return fixture(p,true);return new Promise<UsageInsights>(resolve=>{finish=resolve;});});await flushPromises();expect(wrapper!.find('.insights-metrics').exists()).toBe(true);
 await vi.advanceTimersByTimeAsync(3000);await flushPromises();expect(wrapper!.find('.insights-metrics').exists()).toBe(true);finish!(fixture(last!));await flushPromises();
});

it('pauses continuation while the agent analysis screen is active',async()=>{
 vi.useFakeTimers();const calls=vi.fn(async(_id:string,p:UsageInsightsParams)=>fixture(p,true));setup(calls);await flushPromises();const count=calls.mock.calls.length;
 await wrapper!.setProps({active:false});await vi.advanceTimersByTimeAsync(5000);expect(calls).toHaveBeenCalledTimes(count);
 await wrapper!.setProps({active:true});await flushPromises();expect(calls.mock.calls.length).toBeGreaterThan(count);
});
it('invalidates report filters when the PC changes while the charts are paused',async()=>{
 const machines=setup(async(_id,p)=>fixture(p));await flushPromises();await wrapper!.setProps({active:false});expect(wrapper!.emitted('insights')?.at(-1)?.[0]).not.toBeNull();
 machines.selectedId='remote';await flushPromises();expect(wrapper!.emitted('insights')?.at(-1)?.[0]).toBeNull();
});
it('shows usage-unavailable sessions without zero-token totals or charts and keeps all five filters',async()=>{
 setup(async(_id,p)=>{const r=fixture(p);r.totals={...r.totals,input:0,total:0,calls:0};r.byDay=[{...r.totals,key:p.from}];r.coverage=[{kind:'agy',files:1,pending:0,missing:0,invalid:0,oversized:0,firstAt:null,lastAt:null,limited:false}];return r;});await flushPromises();
 expect(wrapper!.find('.insights-metrics article strong').text()).toBe('未取得');expect(wrapper!.find('svg[aria-label="期間トークンと前期間の推移"]').exists()).toBe(false);
 for(const kind of ['claude','codex','muse','agy','copilot'])expect(wrapper!.find(`option[value="${kind}"]`).exists()).toBe(true);
});
