"use strict";
(()=>{
 const api=window.assistant,element=id=>document.getElementById(id),status=element("apps-status"),selector=element("app-operations");let data=null,busy=false;
 const report=error=>{status.textContent=error.message||"プラグインの操作を確認できません。";};
 const selected=()=>data?.operations[Number(selector.value)];
 const updateSelection=()=>{const operation=selected();element("app-description").textContent=operation?`${operation.description}\n引数の定義：${JSON.stringify(operation.inputSchema)}`:"操作はありません。先にプラグインUIを開く必要がある場合があります。";element("app-call").disabled=busy||!data?.allowActions||!operation;};
 selector.onchange=updateSelection;
 element("apps-refresh").onclick=async()=>{if(busy)return;busy=true;try{
  data=await api.apps();element("app-views").replaceChildren();selector.replaceChildren();
  for(const view of data.views){const button=document.createElement("button");button.type="button";button.textContent=view.title;button.disabled=!data.allowViews;button.onclick=()=>api.openApp({instanceId:data.instanceId,extensionKey:view.extensionKey,runId:view.runId,viewId:view.id}).catch(report);element("app-views").append(button);}
  data.operations.forEach((operation,index)=>{const option=document.createElement("option");option.value=String(index);option.textContent=operation.name;selector.append(option);});status.textContent="公開中のプラグインUIと操作です。素材とは別の許可で扱います。";
 }catch(error){report(error);data=null;element("app-views").replaceChildren();selector.replaceChildren();}finally{busy=false;updateSelection();}};
 element("app-call").onclick=async()=>{const operation=selected();if(busy||!operation||!data?.allowActions)return;busy=true;updateSelection();try{const source=element("app-params").value;if(source.length>65536)throw Error("引数が長すぎます。");const params=JSON.parse(source);if(!params||typeof params!=="object"||Array.isArray(params))throw Error("引数はJSONオブジェクトで指定してください。");
  const result=await api.callApp({instanceId:data.instanceId,extensionKey:operation.extensionKey,runId:operation.runId,operation:operation.name,params});const text=typeof result.result==="string"?result.result:JSON.stringify(result.result,null,2);element("app-result").value=text.slice(0,65536);status.textContent=text.length>65536?"結果が長いため表示を65536文字までにしました。":"実行しました。結果は確認してから会話やメモへ渡してください。";
 }catch(error){report(error);}finally{busy=false;updateSelection();}};
 element("app-use").onclick=()=>{const text=element("app-result").value;if(text.length>8192){report(Error("8192文字以内に編集してください。"));return;}if(!document.dispatchEvent(new CustomEvent("assistant-import-text",{detail:text,cancelable:true})))report(Error("メモの保存が終わってから渡してください。"));else status.textContent="扱う文章へ移しました。会話にはまだ送っていません。";};
})();
