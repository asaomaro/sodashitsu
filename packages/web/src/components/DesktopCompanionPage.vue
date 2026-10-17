<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useViewStore } from "../store/view.js";
import { DesktopMediaSender, type MediaRequest } from "../desktop/mediaSender.js";
const view = useViewStore();
const status = ref("未接続"),
  error = ref(""),
  request = ref<MediaRequest | null>(null),
  confirmed = ref(false),
  sharing = ref(false);
let ws: WebSocket | undefined, sender: DesktopMediaSender | undefined;
function send(value: unknown) {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536)
    ws.send(JSON.stringify(value));
}
function connect() {
  disconnect();
  error.value = "";
  const url = new URL("/desktop-companion", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  ws = socket;
  socket.onmessage = async (e) => {
    if (ws !== socket) return;
    try {
      const m = JSON.parse(String(e.data));
      if (m.type === "companion_ready") status.value = "共有要求を待っています";
      else if (m.type === "media_request") {
        sender?.stop();
        sender = undefined;
        sharing.value = false;
        request.value = m;
        confirmed.value = false;
        status.value = "共有対象の選択待ち";
      } else if (m.type === "media_stop") {
        if (request.value?.id !== m.id) return;
        sender?.stop();
        sender = undefined;
        request.value = null;
        sharing.value = false;
        status.value = "共有要求を待っています";
      } else if (m.type === "rtc_signal" && request.value?.id === m.id)
        await sender?.signal(m.signal);
      else if (m.type === "media_fallback" && request.value?.id === m.id) sender?.startRelay();
      else if (m.type === "media_feedback" && request.value?.id === m.id)
        sender?.feedback(m.bufferedMs, m.congested);
    } catch {
      stopSharing();
      error.value = "動画共有を続けられません。対象と接続を確認してください。";
    }
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    sender?.stop();
    sender = undefined;
    sharing.value = false;
    request.value = null;
    status.value = "接続終了";
  };
  socket.onerror = () => (error.value = "Bでメディア共有を許可し、ログインして接続してください。");
}
async function start() {
  const current = request.value;
  if (!current || !confirmed.value || sharing.value) return;
  error.value = "";
  sharing.value = true;
  const next = new DesktopMediaSender(
    current,
    send,
    (bytes) => {
      if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 512 * 1024) return false;
      ws.send(bytes);
      return true;
    },
    (value) => (status.value = value),
  );
  sender = next;
  try {
    await next.start();
  } catch (e) {
    next.stop();
    if (sender === next) {
      sender = undefined;
      sharing.value = false;
      error.value = e instanceof Error ? e.message : "共有を開始できません";
    }
  }
}
function stopSharing() {
  sender?.stop();
  sender = undefined;
  sharing.value = false;
}
function disconnect() {
  stopSharing();
  ws?.close();
  ws = undefined;
  request.value = null;
  status.value = "未接続";
}
const heartbeat = setInterval(() => send({ type: "heartbeat" }), 2000);
onBeforeUnmount(() => {
  clearInterval(heartbeat);
  disconnect();
});
</script>
<template>
  <main data-desktop-companion>
    <h1>デスクトップの動画・音声共有（B側）</h1>
    <p>
      対象PCのWindowsブラウザで開いてください。ログイン済みのSodashitsu接続先へ、この画面で選んだモニターを配信します。
    </p>
    <p>
      システム音声はブラウザの選択画面で許可した場合だけ共有します。マイクは取得しません。モニター全体を選び、対象を確認してください。
    </p>
    <p role="status">{{ status }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button :disabled="view.connectionState !== 'open'" @click="connect">共有補助を接続</button
    ><button @click="disconnect">補助を切断</button>
    <section v-if="request">
      <h2>共有要求</h2>
      <p>{{ request.target.title }} — {{ request.target.width }}×{{ request.target.height }}</p>
      <p>
        {{
          request.settings.audio
            ? "音声も要求されています。ブラウザで音声の共有を選んでください。"
            : "音声なし"
        }}
      </p>
      <label
        ><input
          v-model="confirmed"
          type="checkbox"
          :disabled="sharing"
        />選択するモニターが上の対象と同じことを確認しました</label
      >
      <button :disabled="!confirmed || sharing" @click="start">画面を選んで共有開始</button
      ><button :disabled="!sharing" @click="stopSharing">動画・音声を停止</button>
    </section>
    <p>
      補助を閉じると動画・音声は停止し、従来の画像配信へ戻ります。共有窓を閉じると補助側の配信も終了します。
    </p>
  </main>
</template>
<style scoped>
main {
  max-width: 900px;
  margin: 32px auto;
  padding: 20px;
  color: var(--soda-fg, #ddd);
  background: var(--soda-bg, #161b22);
}
button,
label {
  margin: 8px 12px 8px 0;
}
p {
  line-height: 1.6;
}
section {
  border: 1px solid #666;
  padding: 16px;
  margin-top: 16px;
}
label {
  display: block;
}
</style>
