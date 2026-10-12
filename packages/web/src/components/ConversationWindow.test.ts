import {mount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import {expect,it,vi} from 'vitest';
import ConversationWindow from './ConversationWindow.vue';
import {useConversationWindowStore} from '../store/conversationWindow.js';
import {ConnectionKey} from '../injection.js';
it('switches the sent-message list order and merges additional records without reordering the conversation',async()=>{
  const pinia=createPinia(),store=useConversationWindowStore(pinia);store.open('pane','messages');
  const request=vi.fn().mockResolvedValueOnce({messages:[{id:'old',role:'user',text:'最初の質問'},{id:'answer',role:'assistant',text:'回答'},{id:'recent',role:'user',text:'次の質問'}],nextOffset:3,partial:false}).mockResolvedValueOnce({messages:[{id:'latest',role:'user',text:'最後の質問'}],nextOffset:null,partial:false});
  const w=mount(ConversationWindow,{global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request}}}});
  try{
    await flushPromises();const nav=w.get('nav');const order=w.get('select');
    expect(nav.findAll('button').map(b=>b.text()).slice(0,2)).toEqual(['最初の質問','次の質問']);
    await order.setValue('newest');expect(nav.findAll('button').map(b=>b.text()).slice(0,2)).toEqual(['次の質問','最初の質問']);
    await nav.findAll('button').at(-1)!.trigger('click');await flushPromises();
    expect(nav.findAll('button').map(b=>b.text())).toEqual(['最後の質問','次の質問','最初の質問']);
    expect(w.findAll('article').map(a=>a.attributes('data-message'))).toEqual(['old','answer','recent','latest']);
    await order.setValue('oldest');expect(nav.findAll('button').map(b=>b.text())).toEqual(['最初の質問','次の質問','最後の質問']);
  }finally{w.unmount();}
});
