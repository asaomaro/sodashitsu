<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from "vue";
import { ConnectionKey } from "../injection.js";
import type { LoginResult } from "../net/ports.js";
import { normalizeRetryAfterSeconds } from "../net/retryAfter.js";
import { useViewStore } from "../store/view.js";

/**
 * ログイン画面（T25。design「接続・ログイン・初回表示」）。token を入力して `POST /api/login` →
 * 成功したら `connect()` で WebSocket を張る（`ConnectionPort.connect` の doc comment のとおり、
 * ログイン後は明示的に呼ぶ必要がある）。URL の `#token=` があれば自動ログインし、
 * `history.replaceState` で URL から消す（token をブラウザの履歴・アドレスバーに残さない）。
 *
 * **失敗は理由ごとに示す**（D105。01 の review ラウンド5 で発見）。以前は全ての失敗を「ログインできませんでした」の
 * 1 文で出していたため、Origin の不一致（403）の利用者が token の誤りと思い込み `soda token reset` へ進んでいた。
 * `#token=` での自動ログインが失敗しても、token は入力欄に残す（URL からは消した後なので、消すと失われる。
 * `--origin` を付けて起動し直した後や、待った後に、そのまま「ログイン」を押し直せる）。
 *
 * **ログインできた後、アプリの画面へ替わるまでは「接続中…」を出し、入力欄とボタンを止める**（D105）。この画面は
 * `authRequired` が下りる（接続が `open` になる）まで出たままなので、以前は `/ws` が 503（サーバの起動の途中。D102）の間、
 * 入力できる状態のまま何も表示せずに残っていた。止めたままにならないよう、接続の確認で再び認証が要ると分かったら
 * （`/api/session` が 401・`/ws` が 4401。`store/view` の `authRequiredCount` が増える）、入力できる状態へ戻して理由を示す。
 */
const conn = inject(ConnectionKey);
if (!conn) throw new Error("LoginView: ConnectionKey が provide されていません");
const view = useViewStore();

/** ログインの失敗（`LoginResult`）と、ログインできた後の接続の確認で認証を求められた場合（`session_rejected`）。 */
type LoginFailure = Extract<LoginResult, { ok: false }> | { ok: false; reason: "session_rejected" };

const token = ref("");
const failure = ref<LoginFailure | null>(null);
/** `POST /api/login` の応答待ち。 */
const pending = ref(false);
/** ログインできて `connect()` した後、アプリの画面へ替わる（この画面が外れる）まで。 */
const connecting = ref(false);
const busy = computed(() => pending.value || connecting.value);

// `conn` を参照するので arrow function にする（`function` 宣言だと const 絞り込みが効かない。T23 で判明）。
const attemptLogin = async (value: string): Promise<void> => {
  pending.value = true;
  failure.value = null;
  try {
    const result = await conn.login(value);
    if (result.ok) {
      connecting.value = true;
      conn.connect();
    } else {
      failure.value = result;
    }
  } catch {
    // `login` は reject しない約束（`ConnectionPort`）だが、万一のときも「届かなかった」として示す。
    failure.value = { ok: false, reason: "network_error" };
  } finally {
    pending.value = false;
  }
};

// ログインできた後の接続の確認で、再び認証を求められた（この画面は出たままなので、`authRequired` ではなく回数で知る）。
watch(
  () => view.authRequiredCount,
  () => {
    if (!connecting.value) return;
    connecting.value = false;
    failure.value = { ok: false, reason: "session_rejected" };
  },
);

/** 待ち時間の表示（60 秒未満は秒、それ以上は分に切り上げる）。`seconds` は `normalizeRetryAfterSeconds` を通した値。 */
function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} 秒` : `${Math.ceil(seconds / 60)} 分`;
}

/**
 * 失敗の理由ごとの文言（D105）。`command` は画面にそのまま写せる形で別の行に出す。`origin` はこのページの Origin
 * （`window.location.origin`）——サーバに許可させる値そのもの。
 */
function failureMessage(f: LoginFailure, origin: string): { text: string; command?: string } {
  switch (f.reason) {
    case "bad_token":
      return {
        text: "token が違います。サーバを起動したときに表示された token（または #token= 付きの URL）を確かめて、入れ直してください。控えが無ければ、soda serve を止めてから soda token reset で作り直せます。",
      };
    case "origin_rejected":
      // サーバは 429 → Origin／Host（403）→ 本文（400）→ token（401）の順に確かめる（`HttpServer.handleLogin`）ので、403 の
      // 時点では token をまだ確かめていない。token が正しいとも誤りとも言わない。
      return {
        text: `このページのアドレス（${origin}）からのログインを、サーバが許可していません。この拒否は token とは関係ありません（token はまだ確かめていません）。サーバのログには origin rejected と出ます。サーバを、今のオプションに次を加えて起動し直してください：`,
        command: `--origin ${origin}`,
      };
    case "rate_limited": {
      // 読めない・信じられない値（0・過去・「Infinity」等）は `normalizeRetryAfterSeconds` が 1 秒か null にする。
      const wait = f.retryAfterSeconds === null ? null : normalizeRetryAfterSeconds(f.retryAfterSeconds);
      return {
        text:
          wait !== null
            ? `ログインの失敗が続いたため、サーバがログインを一時的に止めています（この間は正しい token でも入れません）。${formatWait(wait)}ほど待ってから、やり直してください。`
            : "ログインの失敗が続いたため、サーバがログインを一時的に止めています（この間は正しい token でも入れません。失敗は接続元ごとに 1 分に 5 回・1 時間に 20 回まで）。1 分ほど待ってから、やり直してください（1 時間に 20 回に達したときは、最長 1 時間かかります）。",
      };
    }
    case "network_error":
      return { text: "サーバに接続できません。soda serve が動いているか、開いているアドレス（URL）が正しいかを確かめてください。" };
    case "http_error":
      return { text: `ログインできませんでした（HTTP ${f.status}）。サーバのログを確かめてください。` };
    case "session_rejected":
      return {
        text: "ログインはできましたが、接続の確認でサーバがログインを受け付けませんでした（ブラウザが Cookie を保存していない、またはその間に token が作り直された等）。もう一度ログインしてください。",
      };
  }
}

const message = computed(() => (failure.value ? failureMessage(failure.value, window.location.origin) : null));

function tokenFromHash(): string | null {
  const match = /^#token=(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

function stripHash(): void {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

onMounted(() => {
  const hashToken = tokenFromHash();
  if (!hashToken) return;
  stripHash();
  token.value = hashToken;
  void attemptLogin(hashToken);
});

function onSubmit(): void {
  if (!token.value || busy.value) return;
  void attemptLogin(token.value);
}
</script>

<template>
  <div class="login-view">
    <form class="login-view-form" @submit.prevent="onSubmit">
      <h1>Sodashitsu</h1>
      <label class="login-view-label">
        <span>token</span>
        <input v-model="token" type="password" autocomplete="off" :disabled="busy" />
      </label>
      <button type="submit" :disabled="busy || !token">ログイン</button>
      <p v-if="connecting" class="login-view-status" role="status" aria-live="polite">接続中…<span class="login-view-status-note">（サーバが起動の途中なら、つながるまで少しかかります）</span></p>
      <div v-if="message" class="login-view-error" role="alert">
        <p class="login-view-error-text">{{ message.text }}</p>
        <code v-if="message.command" class="login-view-error-command">{{ message.command }}</code>
      </div>
    </form>
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
}
.login-view-form {
  display: flex;
  flex-direction: column;
  gap: 0.75em;
  width: min(20em, 90vw);
}
.login-view-label {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
}
.login-view-label input {
  font: inherit;
  padding: 0.4em 0.6em;
}
.login-view-status {
  margin: 0;
}
.login-view-status-note {
  font-size: 0.85em;
  opacity: 0.85;
}
.login-view-error {
  color: var(--soda-error-fg, #ff5555);
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.login-view-error-text {
  margin: 0;
  line-height: 1.5;
}
/* `--origin <Origin>` をそのまま写せるように、選択しやすく・折り返せる形で出す（D105）。 */
.login-view-error-command {
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-subtle-bg, rgba(255, 255, 255, 0.08));
  padding: 0.3em 0.5em;
  border-radius: 3px;
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
