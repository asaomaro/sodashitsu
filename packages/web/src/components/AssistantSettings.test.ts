import {mount,flushPromises} from '@vue/test-utils';
import {expect,it,vi} from 'vitest';
import AssistantSettings from './AssistantSettings.vue';
import {ConnectionKey} from '../injection.js';
it('toggles only the enabled flag and offers cancellation while preparing',async()=>{
 const request=vi.fn(async(method:string,p:unknown)=>({enabled:method.endsWith('.set')?(p as{enabled:boolean}).enabled:true,canConfigure:true,phase:'preparing',message:'準備中'}));
 const w=mount(AssistantSettings,{global:{provide:{[ConnectionKey as symbol]:{request}}}});
 try{await flushPromises();const checkbox=w.get('input');expect(checkbox.attributes('disabled')).toBeUndefined();await checkbox.setValue(false);await flushPromises();expect(request).toHaveBeenCalledWith('assistant.settings.set',{enabled:false});expect(w.text()).toContain('無効にしました');}finally{w.unmount();}
});
it('does not poll or load when the settings page is inactive',async()=>{const request=vi.fn();const w=mount(AssistantSettings,{props:{active:false},global:{provide:{[ConnectionKey as symbol]:{request}}}});try{await flushPromises();expect(request).not.toHaveBeenCalled();}finally{w.unmount();}});
it('reenabling the settings view releases a pending save indicator and ignores its late response',async()=>{
 let release!:(value:unknown)=>void;const request=vi.fn((method:string)=>method.endsWith('.set')?new Promise(resolve=>{release=resolve;}):Promise.resolve({enabled:false,canConfigure:true,phase:'disabled',message:''}));
 const w=mount(AssistantSettings,{global:{provide:{[ConnectionKey as symbol]:{request}}}});
 try{await flushPromises();await w.get('input').setValue(true);expect(w.get('input').attributes('disabled')).toBeDefined();await w.setProps({active:false});await w.setProps({active:true});await flushPromises();expect(w.get('input').attributes('disabled')).toBeUndefined();release({enabled:true,canConfigure:true,phase:'running',message:''});await flushPromises();expect((w.get('input').element as HTMLInputElement).checked).toBe(false);}
 finally{release?.({});w.unmount();}
});
it('an older polling response cannot overwrite a successful toggle',async()=>{
 vi.useFakeTimers();let gets=0,release!:(value:unknown)=>void;
 const initial={enabled:false,canConfigure:true,phase:'disabled',message:''};const request=vi.fn((method:string)=>method.endsWith('.set')?Promise.resolve({...initial,enabled:true,phase:'preparing'}):++gets===2?new Promise(resolve=>{release=resolve;}):Promise.resolve(initial));
 const w=mount(AssistantSettings,{global:{provide:{[ConnectionKey as symbol]:{request}}}});
 try{await flushPromises();await vi.advanceTimersByTimeAsync(2000);expect(gets).toBe(2);await w.get('input').setValue(true);await flushPromises();release(initial);await flushPromises();expect((w.get('input').element as HTMLInputElement).checked).toBe(true);}
 finally{release?.(initial);w.unmount();vi.useRealTimers();}
});
