import {RpcError} from '@sodashitsu/protocol';

const cleanupReason='接続先の入力解放を確認できません。接続先で共有設定を確認して再起動してください。';
const cleanupMessage='接続先PCで前の入力の解放を確認できないため、共有を停止しています。接続先PCのSodashitsuサーバーを再起動してから接続し直してください。';
const genericMessage='共有を開始できません。Bの補助プログラム設定・共有先の許可・接続状態を確認してください。';
/** Never display arbitrary local or authenticated remote exception text. */
export function desktopStartFailureMessage(error:unknown):string {
 return error instanceof RpcError&&error.code==='server_busy'&&error.message===cleanupReason?cleanupMessage:genericMessage;
}
/** Only the authenticated bridge's pending desktop.start reply may call this. */
export function desktopStartReplyError(value:unknown):RpcError|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const error=value as Record<string,unknown>;
 if(Object.keys(error).length!==2||!Object.hasOwn(error,'code')||!Object.hasOwn(error,'message')||error.code!=='server_busy'||error.message!==cleanupReason)return;
 return new RpcError('server_busy',cleanupReason);
}
