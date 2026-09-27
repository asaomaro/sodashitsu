<script setup lang="ts">
import { inject } from "vue";
import { ConnectionKey } from "../injection.js";

/**
 * 切り離された画面（T25。design「WebSocket の通信」`client.detach`）。`prefix+q` で自分の接続だけを
 * 切った直後に表示する。自動では再接続しない（design「ブラウザは自動では再接続せず」）ので、
 * 「再接続」ボタンで `connect()` を呼ぶまでこの画面のまま。
 */
const conn = inject(ConnectionKey);
if (!conn) throw new Error("DetachedView: ConnectionKey が provide されていません");

// `conn` を参照するので arrow function にする（`function` 宣言だと const 絞り込みが効かない。T23 で判明）。
const reconnect = (): void => {
  conn.connect();
};
</script>

<template>
  <div class="detached-view">
    <p>このブラウザを切り離しました</p>
    <button type="button" @click="reconnect">再接続</button>
  </div>
</template>

<style scoped>
.detached-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1em;
  min-height: 100vh;
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
}
</style>
