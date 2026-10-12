import {mount} from '@vue/test-utils';
import {createPinia} from 'pinia';
import {nextTick} from 'vue';
import {expect,it,vi} from 'vitest';
import type {DisplayInfo,DisplayContent} from '@sodashitsu/protocol';
import {DisplayHostKey} from '../injection.js';
import {useDisplayStore} from '../store/display.js';
import {useSettingsStore} from '../store/settings.js';
import PluginView from './PluginView.vue';

it('refreshing an engaged app display retains app focus without requesting terminal focus',async()=>{
 const pinia=createPinia(),store=useDisplayStore(pinia);
 useSettingsStore(pinia).displayScriptEnabled=true;
 const info:DisplayInfo={id:'d',paneId:'anchor',name:'main',title:'Studio',kind:'panel',format:'script-html',rev:1,bytes:1,size:320,updatedAt:'x',source:{type:'extension',scope:'project',id:'studio'}};
 store.upsert(info);
 store.setContent({id:'d',format:'script-html',rev:1,content:'<button>制作を開く</button>'} as DisplayContent);
 const host={focusTerminal:vi.fn(),focusSelectedTerminal:vi.fn(),injectPrefix:vi.fn(),prefixKey:()=>({key:'b',ctrl:true,alt:false,shift:false,meta:false})};
 const w=mount(PluginView,{props:{paneId:'anchor',plugin:{extensionKey:'project:studio',display:'main'}},global:{plugins:[pinia],provide:{[DisplayHostKey as symbol]:host}},attachTo:document.body});
 try {
  const iframe=w.get('iframe').element as HTMLIFrameElement;iframe.focus();store.setFocused('d');
  store.upsert({...info,rev:2});await nextTick();
  expect(host.focusTerminal).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(w.get('[data-plugin-view]').element);
  expect(store.focusedDisplayId).toBe(null);
 }finally{w.unmount();}
});
