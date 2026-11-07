"use strict";
(async () => {
 const preferences = await window.assistant.read();
 document.getElementById("open-tools").onclick=()=>window.assistant.openTools().catch(error=>{document.getElementById("status").textContent=error.message;});
 const portrait=await window.assistant.characterInfo();
 document.getElementById("portrait").src=portrait.uri;
 document.getElementById("captain-name").textContent=portrait.name;
 const greeting=document.querySelector("#conversation > .spoken:not([id])");if(greeting&&portrait.greeting)greeting.textContent=portrait.greeting;
 document.getElementById("expand-session").addEventListener("click",()=>window.assistant.openSession().catch(error=>{document.getElementById("status").textContent=error.message;}));
 document.getElementById("open").addEventListener("click", () => window.assistant.open());
 document.getElementById("settings").addEventListener("click", () => window.assistant.settings());
 const log = document.getElementById("conversation");
 const stateText = { connected: "通知を受信しています。", connecting: "操舵室へ接続しています。", login: "操舵室にログインすると、作業の知らせをお届けします。", offline: "操舵室との接続が切れました。再接続を待っています。", disabled: "アシスタントは無効です。" };
 const noticeRows=new Map();
 let noticeFocusRevision=-1;
 const notificationIndicator=document.getElementById("notification-indicator");
 let notification=null,readNotificationSequence=-1;
 const acknowledgeNotification=id=>{
  if(notification && (!id || notification.id===id)){readNotificationSequence=notification.seq;notificationIndicator.hidden=true;}
 };
 notificationIndicator.onclick=async()=>{
  const current=notification;if(!current)return;
  try{
   if(current.id&&noticeRows.has(current.id)){await window.assistant.readNotice({noticeId:current.id});selectNotice(current.id);}
   else {const target=document.getElementById("reminder-notices");if(target&&!target.hidden){window.assistantSections.reveal(target);target.scrollIntoView({block:"start"});}else document.getElementById("status").textContent=current.message;}
   if(notification?.seq===current.seq)acknowledgeNotification();
  }catch(error){document.getElementById("status").textContent=error.message;}
 };
 const selectNotice=id=>{
  const row=noticeRows.get(id);
  for(const item of noticeRows.values())item.classList.toggle("notice-current",item===row);
  if(!row)return;
  window.assistantSections.reveal(row);
  row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:"start"});
 };
 const inbox=document.getElementById("notices");
 let currentNotices=[];
 let chatRevision=-1,chatState=null;
 const renderSummary=(row,value)=>{
  const wrap=row.querySelector(".notice-work-summary"),text=row.querySelector(".notice-work-summary-text"),status=row.querySelector(".notice-work-summary-status");
  wrap.hidden=value?.status==="disabled";
  text.textContent=value?.status==="ready"?value.text:"";
  status.textContent=value?.message??"作業要約を確認しています。";
  row.querySelector(".notice-summary-refresh").disabled=["waiting","summarizing"].includes(value?.status);
 };
 let agentList={agents:[],total:0,working:0,blocked:0}, rosterStatus="connecting";
 const agentStates={working:"作業中",blocked:"確認待ち",idle:"待機中",unknown:"状態不明"};
 const renderAgents=()=>{
   const list=document.getElementById("agent-roster-rows"), filter=document.getElementById("agent-filter").value;
   document.getElementById("agent-roster-summary").textContent=`エージェント一覧（${agentList.total}件・作業中 ${agentList.working}件・確認待ち ${agentList.blocked}件）`;
   const rows=agentList.agents.filter(row=>filter==="all"||row.state===filter);
   list.replaceChildren();
   for(const row of rows){
     const item=document.createElement("li"), open=document.createElement("button"), state=document.createElement("span"), title=document.createElement("span");
     state.className=`agent-state agent-state-${row.state}`;state.textContent=agentStates[row.state]||"状態不明";
     title.textContent=row.title;open.type="button";open.className="agent-row-open";open.title="このエージェントの端末を開く";open.append(state,title);item.append(open);list.append(item);
     open.addEventListener("click",async()=>{open.disabled=true;try{await window.assistant.openAgent({source:row.source});}catch(error){const status=document.getElementById("agent-roster-status");status.hidden=false;status.textContent=error.message;}finally{open.disabled=false;}});
   }
   const status=document.getElementById("agent-roster-status");
   status.textContent=rows.length ? (agentList.total>agentList.agents.length?`全${agentList.total}件のうち先頭${agentList.agents.length}件を表示しています。`:"") : (agentList.total>agentList.agents.length?`表示対象の先頭${agentList.agents.length}件に、該当するエージェントはいません。全${agentList.total}件は操舵室で確認できます。`:rosterStatus==="connected"?"該当するエージェントはいません。":"接続中のマシンに、表示できるエージェントはいません。");
   status.hidden=rows.length>0&&!status.textContent;
 };
 document.getElementById("agent-filter").addEventListener("change",renderAgents);
 let revision = -1;
 const update = state => {
   if (!Number.isSafeInteger(state.revision) || state.revision <= revision) return;
   revision = state.revision;
   currentNotices=state.notices??[];
   agentList=state.agentList||{agents:[],total:0,working:0,blocked:0};rosterStatus=state.status;renderAgents();
   document.getElementById("status").textContent = stateText[state.status] || "接続状態を確認しています。";
   const present=new Set(state.notices.map(notice=>notice.id));
   notification=state.latestNotification??null;
   if(notification?.id&&!present.has(notification.id))readNotificationSequence=Math.max(readNotificationSequence,notification.seq);
   notificationIndicator.hidden=!notification||notification.seq<=readNotificationSequence;
   if(notification){notificationIndicator.textContent=`新しい通知：${notification.title}`;notificationIndicator.title=notification.message;}
   inbox.hidden=state.notices.length===0;
   document.getElementById("notice-section").hidden=inbox.hidden;document.getElementById("notice-section-summary").textContent=`通知・確認待ち（${state.notices.length}件）`;
   for(const [id,row] of noticeRows)if(!present.has(id)){row.remove();noticeRows.delete(id);}
   for (const notice of [...state.notices].reverse()) {
     if(noticeRows.has(notice.id)){
       const row=noticeRows.get(notice.id);
       row.querySelector(".notice-text").textContent=notice.message;
       const title=row.querySelector(".notice-title-button");title.textContent=title.title=notice.title || "通知元";
       renderSummary(row,state.noticeSummaries?.[notice.id]);
       continue;
     }
     const entry = document.createElement("details"); entry.className = "spoken notice";entry.open=true;
     const words=document.createElement("span");words.className="notice-text";words.textContent=notice.message;
     const open=document.createElement("button");open.type="button";open.textContent="小窓で応答";
     open.addEventListener("click",()=>window.assistant.openSource({noticeId:notice.id,destination:"reply"}).catch(error=>{document.getElementById("status").textContent=error.message;}));
     const main=document.createElement("button");main.type="button";main.textContent="操舵室で開く";
     main.addEventListener("click",()=>window.assistant.openSource({noticeId:notice.id,destination:"main"}).catch(error=>{document.getElementById("status").textContent=error.message;}));
     const reply=document.createElement("textarea");reply.rows=2;reply.maxLength=8192;reply.setAttribute("aria-label",`${notice.title || "通知元"}への返答`);
     const submit=document.createElement("button");submit.type="button";submit.textContent="この通知元へ返答";
     const report=error=>{document.getElementById("status").textContent=error.message;};
     let sending=false;submit.addEventListener("click",async()=>{const draft=reply.value;if(sending||!draft.trim())return;sending=true;submit.disabled=true;try{await window.assistant.replySource({noticeId:notice.id,text:draft});if(reply.value===draft)reply.value="";}catch(error){report(error);}finally{sending=false;submit.disabled=false;}});
     const destination=document.createElement("small"),read=document.createElement("button");read.type="button";read.className="notice-title-button";read.textContent=notice.title || "通知元";
     read.title="この通知の内容を確認";
     read.addEventListener("click",()=>window.assistant.readNotice({noticeId:notice.id}).then(()=>{selectNotice(notice.id);acknowledgeNotification(notice.id);}).catch(report));destination.append(read);
     destination.title=notice.title || "通知元";
     const actions=document.createElement("span");actions.className="notice-actions";actions.append(open,main);
     const summary=document.createElement("summary");summary.append(destination);
     const work=document.createElement("div");work.className="notice-work-summary";
     const workTitle=document.createElement("strong");workTitle.textContent="作業要約・判断事項";
     const workText=document.createElement("p");workText.className="notice-work-summary-text";
     const workStatus=document.createElement("p");workStatus.className="notice-work-summary-status";
     const refresh=document.createElement("button");refresh.type="button";refresh.className="notice-summary-refresh";refresh.textContent="要約を再試行";refresh.onclick=()=>window.assistant.refreshNotificationSummary({noticeId:notice.id}).catch(report);
     work.append(workTitle,workStatus,workText,refresh);
     const original=document.createElement("details"),originalTitle=document.createElement("summary");originalTitle.textContent="原文・詳細";original.append(originalTitle,words);
     entry.append(summary,work,original,actions);
     if(notice.kind!=="question")entry.append(reply,submit);
     if(notice.kind==="attention") for(const [keyName,label]of [["Enter","Enterで確認"],["Escape","Escで戻る"],["y","yを送信"],["n","nを送信"]]){
       const key=document.createElement("button");key.type="button";key.textContent=label;key.onclick=async()=>{key.disabled=true;try{await window.assistant.sourceKey({noticeId:notice.id,keyName});}catch(error){report(error);}finally{key.disabled=false;}};entry.append(key);
     }
     renderSummary(entry,state.noticeSummaries?.[notice.id]);noticeRows.set(notice.id,entry);inbox.prepend(entry);
   }
   if(Number.isSafeInteger(state.noticeFocusRevision)&&state.noticeFocusRevision>noticeFocusRevision){
     noticeFocusRevision=state.noticeFocusRevision;selectNotice(state.focusedNoticeId);
   }
 };
 const unsubscribe = window.assistant.onInbox(update);
 window.addEventListener("pagehide", unsubscribe, {once:true});
 update(await window.assistant.inbox());
 const message = document.getElementById("message");
 let draftRevision=-1;
 const updateDraft=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=draftRevision)return;draftRevision=state.revision;if(state.text!==null){message.value=state.text;window.assistantSections.reveal(message);window.assistantSections.fitTextareas();message.focus();void window.assistant.consumeDraft({revision:state.revision}).catch(()=>{});}};
 const offDraft=window.assistant.onDraft(updateDraft);window.addEventListener("pagehide",offDraft,{once:true});window.assistant.draftState().then(updateDraft).catch(()=>{});
 const send = document.getElementById("send");
 const kinds = document.getElementById("agent-kind");
 const start = document.getElementById("start-session");
 const adopt = document.getElementById("adopt-session");
 const sessionStatus = document.getElementById("session-status");
 const models=document.getElementById("agent-model"),efforts=document.getElementById("agent-effort");
 const choiceStatus=document.getElementById("captain-choice-status"),catalogStatus=document.getElementById("model-options-status");
 let choiceLoading=false,choiceSaving=false,choiceValid=true,catalogEpoch=0,modelRows=[],selectedKind="",modelCatalogSource;
 const catalogs=new Map();
 const fill=(select,rows,value)=>{select.replaceChildren();for(const row of rows){const option=document.createElement("option");option.value=row.id;option.textContent=row.label;select.append(option);}select.value=value;};
 const setChoiceDisabled=()=>{
  kinds.disabled=choiceSaving||!!chatState?.busy;
  models.disabled=efforts.disabled=document.getElementById("refresh-models").disabled=choiceLoading||choiceSaving||!!chatState?.busy;
  if(choiceLoading||choiceSaving||!choiceValid)start.disabled=true;
 };
 const fillEfforts=(wanted="",retainSaved=false)=>{
  const row=modelRows.find(m=>m.id===models.value),tiers=row?.efforts??[];
  const rows=[{id:"",label:"エージェントの既定値"},...tiers.map(id=>({id,label:id}))];
  const unconfirmed=modelCatalogSource==="reference"&&row?.efforts.length===0;
  if(retainSaved&&(!row||unconfirmed)&&wanted&&!tiers.includes(wanted))rows.push({id:wanted,label:`保存済み${unconfirmed?"・未確認":""}：${wanted}`});
  fill(efforts,rows,rows.some(r=>r.id===wanted)?wanted:"");
 };
 const loadSelection=async(force=true)=>{
  const kind=kinds.value,epoch=++catalogEpoch;selectedKind=kind;choiceLoading=true;setChoiceDisabled();
  catalogStatus.textContent="モデル候補を読み込んでいます。";if(force)catalogs.delete(kind);
  let catalog;try{if(!catalogs.has(kind))catalogs.set(kind,window.assistant.agentModels({kind,refresh:force}));catalog=await catalogs.get(kind);}catch{catalogs.delete(kind);catalog={models:[],message:"モデル候補を取得できません。既定値と保存済みの指定を表示します。"};}
  if(epoch!==catalogEpoch)return false;
  modelRows=catalog.models??[];modelCatalogSource=catalog.source;const profile=preferences.agentProfiles?.[kind]??{model:"",effort:""};
  const rows=[{id:"",label:"エージェントの既定値"},...modelRows];
  if(profile.model&&!rows.some(r=>r.id===profile.model))rows.push({id:profile.model,label:`保存済み：${profile.model}`});
  fill(models,rows,profile.model);fillEfforts(profile.effort,true);
  catalogStatus.textContent=[catalog.message,catalog.source?`取得元：${({cli:"CLIの候補","local-cache":"CLIのローカルキャッシュ",reference:"参考候補（利用可否は未確認）",unavailable:"未取得"})[catalog.source]}`:"",catalog.fetchedAt!==undefined?`照会日時：${new Date(catalog.fetchedAt).toLocaleString("ja-JP")}（モデル一覧の更新日時ではありません）`:"",catalog.cached?"保存された照会結果を表示しています。":""].filter(Boolean).join(" ");choiceLoading=false;setChoiceDisabled();if(chatState)updateChatControls();
  if(profile.effort!==efforts.value&&modelRows.some(row=>row.id===models.value))await saveChoice();
  return true;
 };
 const saveChoice=async()=>{
  if(choiceLoading||choiceSaving||!kinds.value)return;
  choiceSaving=true;choiceValid=false;setChoiceDisabled();choiceStatus.textContent="選択を保存しています。";
  try{const saved=await window.assistant.chooseCaptain({kind:kinds.value,profile:{model:models.value,effort:efforts.value},notificationSummary:preferences.notificationSummary!==false});Object.assign(preferences,saved);choiceValid=true;choiceStatus.textContent="選択を保存しました。次回の新しい専用セッションから反映します。";}
  catch(error){choiceStatus.textContent=`保存できません：${error.message}。もう一度選択してください。`;}
  finally{choiceSaving=false;setChoiceDisabled();if(chatState)updateChatControls();}
 };
 document.addEventListener("visibilitychange",()=>{++catalogEpoch;catalogs.clear();if(document.hidden){choiceLoading=false;return;}if(kinds.value)void loadSelection(true);});
 document.getElementById("refresh-models").addEventListener("click",()=>void loadSelection(true));
 kinds.addEventListener("change",()=>{void loadSelection().then(current=>{if(current)return saveChoice();});});
 models.addEventListener("change",()=>{fillEfforts(efforts.value);void saveChoice();});
 efforts.addEventListener("change",()=>void saveChoice());
 const updateChatControls=()=>{
  const info=chatState?.session;
  start.disabled=!chatState?.connected||chatState.busy||!chatState.kinds.some(k=>k.kind===kinds.value&&k.available)||!!info&&!["shell","stopped"].includes(info.state)||choiceLoading||choiceSaving||!choiceValid;
  setChoiceDisabled();
 };

 const updateChat = state => {
   if (!Number.isSafeInteger(state.revision) || state.revision <= chatRevision) return;
   const reconnected=state.connected&&!chatState?.connected;
   const connectionChanged=chatState&&state.connected!==chatState.connected;
   chatRevision = state.revision; chatState = state;
   if(reconnected||connectionChanged){++catalogEpoch;catalogs.clear();selectedKind="";}
   const viewport=document.querySelector(".speech-content");
   const follow = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 24;
   const info = state.session;
   const target = info?.agent;
   document.getElementById("session-controls").hidden = false;
   document.getElementById("destination").textContent = info ? `専用アシスタント・${info.kind}・${info.paneId.slice(0,8)}` : "専用アシスタント";
   document.getElementById("connection").hidden = true;
   sessionStatus.textContent = state.hint;
   const canSend = state.connected && !state.busy && info?.state === "ready" && target?.state === "idle";
   message.disabled = send.disabled = !canSend;
   message.placeholder = canSend ? "船長へのメッセージ" : "専用セッションの接続を確認してください";
   const launch=info?.launchSettings, desired=state.launchProfiles?.[info?.kind];
   const requested=launch ? `起動時指定：モデル ${launch.model||"既定値"} / effort ${launch.effort||"既定値"}` : "起動時のモデル・effort指定は不明です";
   const differs=launch&&desired&&(launch.model!==desired.model||launch.effort!==desired.effort);
   document.getElementById("launch-settings").textContent=info ? `${requested}${differs?"。保存済み設定と異なります。停止後、新しく開始すると反映します。":""}（CLI内での変更は追跡しません）` : "種類・モデル・effortは専用セッション欄で選べます。";
   const before = kinds.value || preferences.captainKind || info?.kind;
   const options = state.kinds.filter(kind => ["claude","codex","muse","agy","copilot","grok","cursor"].includes(kind.kind)&&(kind.available||kind.kind===preferences.captainKind));
   const signature = JSON.stringify(options);
   if (kinds.dataset.signature !== signature) {
     kinds.replaceChildren(); kinds.dataset.signature = signature;
     for (const kind of options) {
       const option = document.createElement("option"); option.value = kind.kind; option.textContent = kind.label+(kind.available?"":"（利用不可）");option.disabled=!kind.available;
       kinds.append(option);
     }
     if (options.some(kind => kind.kind === before)) kinds.value = before;
     else if (info && options.some(kind => kind.kind === info.kind)) kinds.value = info.kind;
   }
   if(kinds.value&&kinds.value!==selectedKind&&!choiceSaving)void loadSelection();
   updateChatControls();
   start.textContent = info?.state === "stopped" ? "旧端末を残して新しく開始" : "専用セッションを開始";
   adopt.hidden = !(state.connected && info?.state === "conflict" && info.observedAgent);
   adopt.disabled = state.busy;
   adopt.textContent = info?.observedAgent ? `このエージェントを使う（${info.observedAgent.kind}・${info.observedAgent.instanceId.slice(0,8)}）` : "このエージェントを使う";
   log.querySelectorAll(".chat-message").forEach(element => element.remove());
   for (const entry of state.messages) {
     if(entry.role==="user"&&/\[操舵室の通知まとめ [a-f0-9-]{36}\]/.test(entry.text))continue;
     const paragraph = document.createElement("p"); paragraph.className = `spoken chat-message ${entry.role}`;
     paragraph.textContent = entry.text; log.append(paragraph);
   }
   window.assistantSections.fitTextareas();
   if (follow) viewport.scrollTop = viewport.scrollHeight;
 };
 const report = error => { sessionStatus.textContent = error?.message || "操作を確認できませんでした。"; };
 start.addEventListener("click", () => {
   if (chatState) window.assistant.startSession({ revision: chatState.revision, kind: kinds.value, retry: chatState.session?.state === "stopped" }).catch(report);
 });
 adopt.addEventListener("click", () => {
   const actor = chatState?.session?.observedAgent;
   if (actor) window.assistant.adoptSession({ revision: chatState.revision, instanceId: actor.instanceId }).catch(report);
 });
 document.getElementById("chat").addEventListener("submit", async event => {
   event.preventDefault();
   const actor = chatState?.session?.agent;
   const text = message.value;
   if (!actor || send.disabled || !text.trim()) return;
   try {
     await window.assistant.sendMessage({ revision: chatState.revision, instanceId: actor.instanceId, text });
     if (message.value === text) {message.value = "";window.assistantSections.fitTextareas();}
   } catch (error) { report(error); }
 });
 const unsubscribeChat = window.assistant.onConversation(updateChat);
 window.addEventListener("pagehide", unsubscribeChat, {once:true});
 updateChat(await window.assistant.conversation());
 document.addEventListener("keydown", event => { if (event.key === "Escape") window.assistant.hide(); });
})().catch(() => { document.getElementById("status").textContent = "設定を読み込めませんでした。"; });

(()=>{const stop=document.getElementById("voice-stop");let revision=-1;const update=state=>{if(!Number.isSafeInteger(state.revision)||state.revision<=revision)return;revision=state.revision;stop.hidden=!state.speaking;};const off=window.assistant.onVoice(update);window.addEventListener("pagehide",off,{once:true});window.assistant.voiceState().then(update).catch(()=>{});stop.onclick=()=>window.assistant.stopVoice();})();
