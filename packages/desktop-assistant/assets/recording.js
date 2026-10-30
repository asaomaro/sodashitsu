"use strict";
(async () => {
  const element = id => document.getElementById(id);
  const status = element("record-status"), preview = element("record-preview");
  let phase = "idle", epoch = 0, token = null, stream = null, recorder = null;
  let chunks = [], size = 0, clip = null, previewUrl = null, ticker = null;
  let operation = null, enabled = false, processing = false, revision = -1, player = null;
  let limit = 25 * 1024 * 1024, deadline = 0, agent = false;
  const supported = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const render = () => {
    element("record-indicator").hidden = phase !== "capturing";
    element("record-stop-visible").disabled = phase !== "capturing" || !!operation;
    element("record-start").disabled = !enabled || !supported || processing || phase !== "idle" || !!operation;
    element("record-stop").disabled = phase !== "capturing" || !!operation;
    element("record-discard").disabled = phase === "idle" && !operation;
    element("record-transcribe").disabled = phase !== "review" || !clip || processing || !!operation;
  };
  const stopTracks = () => {
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    if (ticker) clearInterval(ticker); ticker = null;
  };
  const clearClip = () => {
    if (player) { player.pause(); player.removeAttribute("src"); } player = null;
    preview.textContent = "録音を試聴"; preview.hidden = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; clip = null; chunks = []; size = 0;
  };
  const discard = async oldToken => {
    if (oldToken) await window.assistant.discardRecording({token:oldToken}).catch(() => {});
  };
  const cancel = (reason = "録音を破棄しました。") => {
    ++epoch;
    const old = token; token = null;
    if (recorder?.state === "recording") { try { recorder.stop(); } catch {} }
    recorder = null; stopTracks(); clearClip();
    phase = operation ? "stopping" : "idle"; status.textContent = reason;
    render(); void discard(old);
  };
  const stop = async () => {
    if (phase !== "capturing" || !recorder || operation) return;
    const current = recorder, currentToken = token, generation = epoch;
    const job = {}; operation = job; phase = "stopping";
    status.textContent = "録音を停止しています。"; render();
    try {
      const stopped = new Promise((resolve, reject) => {
        current.onstop = resolve;
        current.onerror = () => reject(Error("録音データを取得できませんでした。"));
      });
      current.stop(); stopTracks(); await stopped;
      if (generation !== epoch) return;
      const recorded = new Blob(chunks, {type:current.mimeType}); chunks = [];
      if (!recorded.size || recorded.size > limit) throw Error("録音が空か、容量上限を超えています。");
      await window.assistant.stopRecording({token:currentToken});
      if (generation !== epoch) return;
      clip = recorded; recorder = null;
      preview.hidden = false;
      phase = "review";
      status.textContent = "録音を停止しました。試聴してから文字起こしできます。録音は5分以内に処理するか破棄してください。";
    } catch (error) { if (generation === epoch) cancel(error?.message || "録音を停止できませんでした。"); }
    finally {
      if (operation === job) { operation = null; if (phase === "stopping") phase = "idle"; }
      render();
    }
  };
  preview.addEventListener("click", () => {
    if (!clip || phase !== "review") return;
    if (player && !player.paused) { player.pause(); preview.textContent = "録音を試聴"; return; }
    const current = new Audio();
    if (player) player.pause();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(clip); current.src = previewUrl; player = current;
    current.onended = () => { if (player === current) preview.textContent = "録音を試聴"; };
    current.play().then(() => { if (player === current) preview.textContent = "試聴を止める"; }).catch(() => {
      if (player === current) status.textContent = "この環境では試聴できません。音声設定を確認するか、そのまま文字起こししてください。";
    });
  });
  element("record-start").addEventListener("click", async () => {
    if (!enabled || !supported || operation || phase !== "idle" || document.hidden) return;
    const generation = ++epoch, started = performance.now(), job = {};
    operation = job; phase = "starting"; clearClip();
    status.textContent = "マイクの許可を確認しています。"; render();
    let granted = null;
    try {
      granted = await window.assistant.beginRecording();
      if (generation !== epoch || document.hidden) { await discard(granted.token); return; }
      token = granted.token; limit = Math.min(25 * 1024 * 1024, granted.maxBytes);
      deadline = started + Math.min(300_000, granted.maxDurationMs) - 1000;
      const media = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if (generation !== epoch || document.hidden) {
        media.getTracks().forEach(track => track.stop()); await discard(granted.token); return;
      }
      stream = media;
      if (performance.now() >= deadline) throw Error("マイクの準備時間が上限を超えました。録音し直してください。");
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(value=>MediaRecorder.isTypeSupported(value));
      if (!mime) throw Error("この環境で録音できる音声形式を確認できません。");
      const current = new MediaRecorder(media,{mimeType:mime,audioBitsPerSecond:64000}); recorder = current;
      current.ondataavailable = event => {
        if (generation !== epoch) return;
        if (size + event.data.size > limit) { cancel("録音の容量上限を超えたため破棄しました。"); return; }
        if (event.data.size) { chunks.push(event.data); size += event.data.size; }
      };
      current.onerror = () => { if (generation === epoch) cancel("マイクの録音を続けられませんでした。"); };
      current.onstop = () => { if (generation === epoch && phase === "capturing") cancel("録音が終了したためデータを破棄しました。録音し直してください。"); };
      media.getTracks().forEach(track => { track.onended = () => { if (generation === epoch && phase === "capturing") cancel("マイクが切断されたため録音を破棄しました。"); }; });
      current.start(1000); phase = "capturing";
      const update = () => {
        if (generation !== epoch) return;
        const remaining = Math.max(0, Math.ceil((deadline-performance.now())/1000));
        status.textContent = `● 録音中（残り${remaining}秒）。停止後に試聴・破棄できます。まだ処理先へ送っていません。`;
        if (!remaining) void stop();
      };
      ticker = setInterval(update,250); update();
    } catch (error) {
      if (generation === epoch) cancel(error?.message || "マイクを利用できません。OSの許可を確認してください。");
      else await discard(granted?.token);
    } finally {
      if (operation === job) { operation = null; if (phase === "starting" || phase === "stopping") phase = "idle"; }
      render();
    }
  });
  element("record-stop").addEventListener("click", () => { void stop(); });
  element("record-stop-visible").addEventListener("click", () => { void stop(); });
  element("record-discard").addEventListener("click", () => cancel());
  element("record-transcribe").addEventListener("click", async () => {
    if (phase !== "review" || !clip || operation || processing) return;
    const current = clip, currentToken = token, generation = epoch, job = {};
    operation = job; phase = "sending"; player?.pause();
    status.textContent = agent ? "確認した録音を専用Codexとその提供元へ送ります。" : "録音をこのPCのWhisperへ渡します。エージェントには送りません。"; render();
    try {
      const bytes = await current.arrayBuffer();
      if (generation !== epoch) return;
      await window.assistant.transcribeRecording({token:currentToken,mime:current.type.toLowerCase(),bytes});
      if (generation === epoch) {
        token = null; clearClip(); phase = "idle";
        status.textContent = agent ? "この窓の録音データを破棄しました。結果は専用エージェントの会話で確認してください。" : "録音データを破棄しました。処理結果は文字起こし欄で確認してください。";
      }
    } catch (error) { if (generation === epoch) cancel(error?.message || "録音の文字起こしを確認できませんでした。"); }
    finally {
      if (operation === job) { operation = null; if (phase === "stopping") phase = "idle"; }
      render();
    }
  });
  const unsubscribeCancel = window.assistant.onRecordingCancelled(event => {
    if (event.token === token) cancel(event.reason || "録音を破棄しました。");
  });
  const updateTools = state => {
    if (!Number.isSafeInteger(state.revision) || state.revision <= revision) return;
    revision = state.revision; enabled = state.transcriptionEnabled; agent = state.transcriptionProvider === "agent";
    element("record-transcribe").textContent = agent ? "録音を専用Codexへ送る" : "録音を文字起こし";
    processing = ["selecting","transcribing","stopping"].includes(state.transcription.status);
    if (!enabled && (phase !== "idle" || operation)) cancel("文字起こしが無効になったため録音を破棄しました。");
    render();
  };
  const unsubscribeTools = window.assistant.onTools(updateTools);
  element("standard-tools").addEventListener("toggle", () => {
    if (!element("standard-tools").open && (phase !== "idle" || operation)) cancel("標準ツールを閉じたため録音を破棄しました。");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancel("吹き出しを隠したため録音を破棄しました。"); });
  window.addEventListener("pagehide", () => { cancel(); unsubscribeCancel(); unsubscribeTools(); }, {once:true});
  if (!supported) status.textContent = "この環境はマイク録音に対応していません。音声ファイルを利用してください。";
  updateTools(await window.assistant.tools());
})().catch(() => { document.getElementById("record-status").textContent = "マイクの録音機能を読み込めませんでした。"; });
