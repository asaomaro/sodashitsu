<script setup lang="ts">
import { computed, inject } from "vue";
import { ConnectionKey } from "../injection.js";
import { useViewStore } from "../store/view.js";

/**
 * 接続中・再接続中のオーバーレイ（T25。design「エラー処理 / 異常系」の「WebSocket の切断」：
 * 「ブラウザは『再接続中』を重ねて表示し、1 秒から 30 秒まで間隔を倍にしながら再接続する」）。
 * 再試行そのものは `net/Connection` が自律的に行う。ここが操作を受けるのは `rejected` の「再試行」ボタンだけ（D107）。
 * 接続が `open` でない間は端末への入力を止めている（`main.ts` が `TerminalRegistry.setInputEnabled` を呼ぶ。D95）
 * ので、`connecting`（初回・「再接続」ボタンの直後）と `reconnecting` の両方でそのことを示す。
 * ログイン画面・切り離し画面の間は App.vue が本体ごと差し替えるので、ここは出ない。
 * ダイアログではない（フォーカスを奪わない・Esc で閉じられない）。重ね表示の全体は `pointer-events: none`——
 * scrollback を読む・選択するといった表示側の操作は止めない。ポインタを受けるのは、下の枠（手がかり・`rejected`）だけ
 * （`--origin` の行を選んで写せる・ボタンを押せる。D107）。
 *
 * **`rejected`（D107）**：Cookie は有効だが、このページのアドレス（Host／Origin）をサーバが許可していない（`/api/session` が
 * 403 で、`/ws` も開く前に閉じた。サーバの D106）。`Connection` は自動では繋ぎ直さないので、理由と、写せる形の
 * `--origin <このページの Origin>` の行（ログイン画面の 403 と同じ示し方。D105）と「再試行」ボタンを出す（`--origin` を付けて
 * サーバを起動し直した後に押す）。以前は 401 以外と同じく「再接続中…」のまま理由を示さず繋ぎ直し続けた。
 *
 * **手がかり（`view.originRejectSuspected`。D107）**：`/api/session` は通るのに WebSocket だけが開く前に閉じる試みが続くと
 * （Host を許可内の名前で渡す前段のプロキシの下で、ページの Origin が許可されていない等）、「再接続中…」に、サーバがこの
 * ページの Origin を拒否しているかもしれないことと `--origin` の行を添える。断定はできない（ブラウザは upgrade の状態コードを
 * 見られない）ので、繋ぎ直しは続ける。
 */
const conn = inject(ConnectionKey);
if (!conn) throw new Error("ReconnectOverlay: ConnectionKey が provide されていません");
const view = useViewStore();
const rejected = computed(() => view.connectionState === "rejected");
const title = computed(() => (view.connectionState === "reconnecting" ? "再接続中…" : view.connectionState === "connecting" ? "接続中…" : null));
/** このページの Origin——サーバに許可させる値そのもの（サーバはブラウザが届いた宛先を知りえない。D102・D105）。 */
const origin = window.location.origin;

// `conn` を参照するので arrow function にする（`function` 宣言だと const 絞り込みが効かない。T23 で判明）。
const retry = (): void => {
  conn.connect();
};
</script>

<template>
  <div v-if="rejected" class="reconnect-overlay reconnect-overlay-rejected">
    <div class="reconnect-overlay-panel" role="alert">
      <p class="reconnect-overlay-title">接続できません（このアドレスは許可されていません）</p>
      <p class="reconnect-overlay-text">
        このページのアドレス（{{ origin }}）からの接続を、サーバが許可していません。ログイン（Cookie）は有効です——token を作り直す必要はありません。サーバのログには
        origin rejected と出ます。サーバを、今のオプションに次を加えて起動し直してから「再試行」を押してください：
      </p>
      <code class="reconnect-overlay-command">--origin {{ origin }}</code>
      <p class="reconnect-overlay-note">リバースプロキシの後ろに置いているときは、プロキシが元の Host をそのまま渡しているかも確かめてください。</p>
      <button type="button" class="reconnect-overlay-retry" @click="retry">再試行</button>
    </div>
  </div>
  <div v-else-if="title" class="reconnect-overlay" role="status" aria-live="polite">
    <span class="reconnect-overlay-title">{{ title }}</span>
    <span class="reconnect-overlay-note">つながるまで入力できません</span>
    <div v-if="view.originRejectSuspected" class="reconnect-overlay-panel reconnect-overlay-hint">
      <p class="reconnect-overlay-text">
        つながらない状態が続いています。ログイン（Cookie）は有効なのに WebSocket だけがつながらないので、サーバがこのページのアドレス（{{
          origin
        }}）を拒否しているかもしれません（リバースプロキシの後ろ等）。サーバのログに origin rejected と出ていれば、今のオプションに次を加えて起動し直してください（起動の途中なら、しばらく待てばつながります。繋ぎ直しは続けています）：
      </p>
      <code class="reconnect-overlay-command">--origin {{ origin }}</code>
    </div>
  </div>
</template>

<style scoped>
.reconnect-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  align-items: center;
  justify-content: center;
  background: var(--soda-backdrop-strong, rgba(0, 0, 0, 0.5));
  color: var(--soda-fg, #f8f8f2);
  z-index: 900;
  pointer-events: none;
}
.reconnect-overlay-note {
  font-size: 0.85em;
  opacity: 0.85;
}
/* 理由と「再試行」の枠（D107）。枠だけがポインタを受ける（背後の端末の scrollback は読める・選べる）。 */
.reconnect-overlay-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6em;
  width: min(36em, 90vw);
  padding: 1em 1.2em;
  background: var(--soda-menu-bg, #282a36);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 6px;
  pointer-events: auto;
}
.reconnect-overlay-panel p {
  margin: 0;
  line-height: 1.5;
}
.reconnect-overlay-rejected .reconnect-overlay-title {
  font-weight: bold;
  color: var(--soda-error-fg, #ff5555);
}
/* `--origin <Origin>` をそのまま写せるように、選択しやすく・折り返せる形で出す（ログイン画面の 403 と同じ。D105）。 */
.reconnect-overlay-command {
  background: var(--soda-subtle-bg, rgba(255, 255, 255, 0.08));
  padding: 0.3em 0.5em;
  border-radius: 3px;
  overflow-wrap: anywhere;
  user-select: all;
}
.reconnect-overlay-retry {
  align-self: flex-start;
  font: inherit;
  padding: 0.3em 1em;
}
</style>
