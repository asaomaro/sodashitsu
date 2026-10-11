<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import QRCode from "qrcode";
const devices = ref<{ id: string; label: string; createdAt: number }[]>([]);
const issued = ref<{ code: string; expiresAt: number } | null>(null);
const enrollment = ref<{ secret: string; uri: string; expiresAt: number } | null>(null);
const label = ref("認証アプリ"),
  code = ref(""),
  error = ref(""),
  busy = ref(false);
const qr = computed(() => {
  if (!enrollment.value) return null;
  const matrix = QRCode.create(enrollment.value.uri, { errorCorrectionLevel: "M" }).modules;
  let path = "";
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.get(y, x)) path += `M${x + 4},${y + 4}h1v1h-1z`;
  return { size: matrix.size + 8, path };
});
async function request(action?: string, data: Record<string, string> = {}) {
  const r = await fetch("/api/login-settings", {
    method: action ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(action
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        }
      : {}),
  });
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "認証し直してください。"
        : "操作できません。コード・有効期限・登録数を確認してください。",
    );
  return r.json();
}
async function run(action?: string, data: Record<string, string> = {}) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const value = await request(action, data);
    if (action === "issue") issued.value = value;
    if (action === "revoke") issued.value = null;
    if (action === "begin") {
      enrollment.value = value;
      code.value = "";
    }
    if (action === "confirm" || action === "cancel") {
      enrollment.value = null;
      code.value = "";
    }
    devices.value = action ? (await request()).devices : value.devices;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "操作できません。";
  } finally {
    busy.value = false;
  }
}
onMounted(() => void run());
</script>
<template>
  <section class="settings-section" aria-labelledby="settings-login">
    <h3 id="settings-login" class="settings-heading">追加ログイン手段</h3>
    <p>通常のトークンに加えて、以下のコードでもログインできます。</p>
    <h4>使い切りコード</h4>
    <button type="button" :disabled="busy" @click="run('issue')">使い切りコードを発行</button>
    <div v-if="issued" class="login-code" role="status">
      <code>{{ issued.code }}</code>
      <span>有効期限: {{ new Date(issued.expiresAt).toLocaleString() }} · 使用は１回</span>
      <button type="button" :disabled="busy" @click="run('revoke')">コードを失効</button>
    </div>
    <p>有効期間は５分です。発行し直すと前のコードは失効します。サーバの再起動でも失効します。</p>
    <h4>認証アプリ</h4>
    <ul v-if="devices.length">
      <li v-for="device in devices" :key="device.id">
        {{ device.label }}
        <button
          type="button"
          :disabled="busy"
          :aria-label="device.label + 'の登録を削除'"
          @click="run('remove', { id: device.id })"
        >
          登録を削除
        </button>
      </li>
    </ul>
    <label>登録名 <input v-model="label" maxlength="64" :disabled="busy" /></label>
    <button
      type="button"
      :disabled="busy || !label.trim() || devices.length >= 8"
      @click="run('begin', { label })"
    >
      認証アプリを登録
    </button>
    <div v-if="enrollment" class="enrollment">
      <p>認証アプリでQRを読み取り、表示された６桁のコードを入力して登録を確定してください。</p>
      <svg
        v-if="qr"
        :viewBox="`0 0 ${qr.size} ${qr.size}`"
        role="img"
        aria-label="認証アプリ登録用QRコード"
        shape-rendering="crispEdges"
      >
        <rect width="100%" height="100%" fill="white" />
        <path :d="qr.path" fill="black" />
      </svg>
      <details>
        <summary>QRを読めない場合</summary>
        <p>
          手動登録キー: <code>{{ enrollment.secret }}</code
          ><br />TOTP・SHA-1・６桁・30秒
        </p>
      </details>
      <form @submit.prevent="run('confirm', { code })">
        <label
          >確認コード
          <input
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            pattern="[0-9]{6}"
            :disabled="busy"
        /></label>
        <button type="submit" :disabled="busy || !/^\d{6}$/.test(code)">登録を確定</button>
        <button
          type="button"
          :disabled="busy"
          @click="
            enrollment = null;
            code = '';
          "
        >
          キャンセル
        </button>
      </form>
    </div>
    <p>
      最大８件登録できます。同じコードは一度だけ使用できます。登録確認で使用したコードも再使用できないため、ログインには次のコードを使ってください。トークンを作り直すと登録も失効します。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
label {
  display: block;
  margin-block: 8px;
}
button {
  margin: 4px 6px 4px 0;
}
input {
  background: var(--soda-input-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
}
.login-code {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.login-code code {
  font-size: 1.3em;
  user-select: all;
  letter-spacing: 0.1em;
}
.enrollment svg {
  display: block;
  width: min(240px, 100%);
  height: auto;
}
.enrollment code {
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
