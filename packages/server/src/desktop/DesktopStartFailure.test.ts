import {expect,it} from 'vitest';
import {RpcError} from '@sodashitsu/protocol';
import {DesktopBridgeRpc,DesktopBridgeError} from './bridgeRpc.js';
import type {LinkChannel} from '../machine/MachineLink.js';
import {desktopStartFailureMessage,desktopStartReplyError} from './DesktopStartFailure.js';
const message='接続先の入力解放を確認できません。接続先で共有設定を確認して再起動してください。';
const generic=desktopStartFailureMessage(undefined);
function bridge(error:unknown){let text=(_value:string)=>{};const channel={onText(fn:typeof text){text=fn;},onClose(){},close(){},sendText(raw:string){const request=JSON.parse(raw);text(JSON.stringify({id:request.id,error}));}} as unknown as LinkChannel;return new DesktopBridgeRpc(channel,()=>{});}
it('reconstructs only the pending authenticated desktop.start fixed RPC failure',async()=>{
 const rpc=bridge({code:'server_busy',message});try{await expect(rpc.request('desktop.start',{} as never)).rejects.toBeInstanceOf(RpcError);await expect(rpc.request('desktop.capabilities',{})).rejects.toBeInstanceOf(DesktopBridgeError);}finally{rpc.close();}
});
it.each([{code:'server_busy',message:message+'PRIVATE'},{code:'internal',message},{message},{code:'server_busy',message,extra:'PRIVATE'},{code:'server_busy',message:7},[message],null])('does not preserve unapproved wire error %j',async(error)=>{
 expect(desktopStartReplyError(error)).toBeUndefined();const rpc=bridge(error);try{if(error!==null)await expect(rpc.request('desktop.start',{} as never)).rejects.toBeInstanceOf(DesktopBridgeError);}finally{rpc.close();}
});
it.each([new Error(message),{code:'server_busy',message},new RpcError('internal',message),new RpcError('server_busy',message+'PRIVATE')])('never displays untyped or arbitrary exception text %j',(error)=>{expect(desktopStartFailureMessage(error)).toBe(generic);});
