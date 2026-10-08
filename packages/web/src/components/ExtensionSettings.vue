<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, reactive, ref } from "vue";
import { ExtensionControllerKey } from "../injection.js";
import { approvalStatusText, showPath } from "../extensions/approvalView.js";
import { lastExitText, problemView, scopeText, scriptDisabledNote, sanitizeLogLine, stateMark, stateText, stateTone } from "../extensions/extensionView.js";
import { useExtensionsStore } from "../store/extensions.js";
import { useSettingsStore } from "../store/settings.js";

/**
 * 設定の節「拡張」（20261007-ext-host。PR2）。設定（`extensions.json`）に登録した拡張の一覧・状態・入切・起動し直し・ログ。
 * **サーバ全体**の設定（ブラウザごとではない）。`SettingsDialog.vue` の `.settings-body` の直下に置く（左のメニューが見出しから拾う）。
 *
 * 操作中（二重押しの防止）は、`disabled` ではなく `aria-disabled`（押された操作は `ExtensionController` が捨てる）——`disabled` にすると、押した瞬間にフォーカスが失われる。
 * 作者の説明・id・パスは **`v-html` を使わない**（文字として出す）。利用者の拡張のコマンドの文字列は、サーバが送らない（`ExtensionInfo` に無い）ので、ここには出ない。
 *
 * プロジェクトの設定と承認（PR3）: プロジェクトの行に［確認］（承認待ち・「承認しない」。承認のダイアログを開く）と［承認を取り消す］（承認の記録が残っているもの）、
 * 節の末尾に「承認の記録」（いま開いていないリポジトリの分も。［記録を消す］）。**一覧は並べ替えない**（操作中の行のフォーカスが `body` に落ちるため）。
 * 承認待ちには、見出しの下の件数と印・行の目立つ表示で気づけるようにする（フォーカスは動かさない）。
 */

const store = useExtensionsStore();
const settings = useSettingsStore();
const controller = inject(ExtensionControllerKey, null);

/** 並びは、サーバの返す順（設定に書いた順）のまま。状態で並べ替えると、操作した行が動いて、フォーカスと開いているログが失われる。状態は行の中で見せる。 */
const rows = computed(() => store.list?.extensions ?? []);
const problems = computed(() => (store.list?.problems ?? []).map(problemView));
const pendingCount = computed(() => rows.value.filter((e) => e.state === "pending").length);
const records = computed(() => store.list?.approvals ?? []);

/** key → 開いているログ（行・捨てた行数）。 */
const logs = reactive<Record<string, { lines: string[]; dropped: number } | undefined>>({});
const logEls = new Map<string, HTMLElement>();
const message = reactive<{ text: string; warn: boolean }>({ text: "", warn: false });
const reloading = ref(false);
/** key → 済んだ操作の知らせ（数秒で消える）。 */
const doneNotes = reactive<Record<string, string | undefined>>({});
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const DONE_NOTE_MS = 4000;

onBeforeUnmount(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
});

function noteDone(key: string, text: string): void {
  doneNotes[key] = text;
  const old = timers.get(key);
  if (old) clearTimeout(old);
  timers.set(
    key,
    setTimeout(() => {
      doneNotes[key] = undefined;
      timers.delete(key);
    }, DONE_NOTE_MS),
  );
}

async function reload(): Promise<void> {
  if (!controller || reloading.value) return;
  message.text = "";
  message.warn = false;
  reloading.value = true;
  try {
    const r = await controller.reload();
    if (r === "ok") {
      const n = store.list?.problems.length ?? 0;
      message.warn = n > 0;
      message.text = n > 0 ? `設定を読み直しましたが、問題が ${n} 件あります（下を見てください）。` : "設定を読み直しました。";
    } else if (r === "failed") {
      message.warn = true;
      message.text = "設定を読み直せませんでした。";
    }
  } finally {
    reloading.value = false;
  }
}

async function setEnabled(e: { key: string; id: string }, enabled: boolean): Promise<void> {
  const r = await controller?.setEnabled(e.key, enabled);
  if (r === "done") noteDone(e.key, enabled ? "有効にしました。" : "無効にしました。");
}

async function restart(e: { key: string }): Promise<void> {
  const r = await controller?.restart(e.key);
  if (r === "done") noteDone(e.key, "起動し直しました。");
}

async function loadLog(key: string): Promise<void> {
  if (!controller) return;
  const r = await controller.log(key);
  if (r === null) return;
  logs[key] = { lines: r.lines.map(sanitizeLogLine), dropped: r.dropped };
  await nextTick();
  const el = logEls.get(key);
  if (el) el.scrollTop = el.scrollHeight; // 末尾が見える
}

async function toggleLog(key: string): Promise<void> {
  if (logs[key] !== undefined) {
    logs[key] = undefined;
    return;
  }
  await loadLog(key);
}

function setLogEl(key: string, el: unknown): void {
  if (el instanceof HTMLElement) logEls.set(key, el);
  else logEls.delete(key);
}

/** 承認のダイアログを開く（利用者が押したときだけ開く）。 */
function review(e: { key: string }): void {
  store.openApproval(e.key);
}

async function revoke(e: { root?: string; id: string; key: string }): Promise<void> {
  if (e.root === undefined) return;
  const r = await controller?.revoke(e.root, e.id);
  if (r === "done") noteDone(e.key, "承認の記録を消しました。");
}

async function revokeRecord(r: { root: string; id: string }): Promise<void> {
  await controller?.revoke(r.root, r.id);
}

function isOn(e: { state: string; enabledInConfig: boolean; disabledByUser: boolean }): boolean {
  return e.enabledInConfig && !e.disabledByUser;
}
</script>

<template>
  <section class="settings-section" aria-labelledby="settings-extensions">
    <h3 id="settings-extensions" class="settings-heading">拡張</h3>
    <p class="settings-note">
      設定に登録したプログラム（拡張）を Sodashitsu が起動し、表示の面などを出せるようにします。拡張はあなたの OS の利用者の権限で動き、隔離されません。
      この設定は<strong>サーバ全体</strong>で共有されます（ブラウザごとではありません）。書き方は docs/extensions.md。
      リポジトリの <code>.soda/extensions.json</code> に書いた拡張は、あなたが承認したものだけ動きます。
    </p>
    <p v-if="pendingCount > 0" class="settings-note ext-warn ext-pending-summary" data-ext-pending-summary>
      <span class="ext-mark" aria-hidden="true">⚠</span> 承認待ちのプロジェクトの拡張が {{ pendingCount }} 件あります（各行の［確認］で内容を確かめて、決めてください）。
    </p>
    <p v-if="store.list" class="settings-note">
      利用者の設定の場所: <code class="ext-path">{{ store.list.userConfigPath }}</code>
    </p>
    <p class="ext-actions">
      <button
        type="button"
        class="settings-btn"
        data-ext-reload
        :disabled="!controller || store.supported === false"
        :aria-disabled="reloading ? 'true' : undefined"
        :aria-busy="reloading ? 'true' : undefined"
        @click="reload"
      >
        {{ reloading ? "読み直し中…" : "読み直す" }}
      </button>
      <span class="settings-note ext-message" :class="{ 'ext-warn': message.warn }" role="status" aria-live="polite" data-ext-message>{{ message.text }}</span>
    </p>
    <p v-if="store.supported === false" class="settings-note" data-ext-unsupported>このサーバは拡張に対応していません。</p>
    <p v-else-if="store.supported === null && store.loadFailed" class="settings-note ext-warn" role="alert" data-ext-load-failed>
      拡張の一覧を取れませんでした。［読み直す］で取り直せます。
    </p>
    <p v-else-if="store.supported === null" class="settings-note">確認中…</p>
    <template v-else>
      <ul v-if="problems.length > 0" class="settings-list ext-problems" data-ext-problems>
        <li v-for="(p, i) in problems" :key="i" class="settings-note ext-warn ext-problem">
          <span class="ext-mark" aria-hidden="true">⚠</span> 設定の問題: <code class="ext-path">{{ p.path }}</code>: {{ p.text }}
        </li>
      </ul>
      <p v-if="rows.length === 0" class="settings-note" data-ext-empty>登録された拡張はありません。</p>
      <ul v-else class="settings-list ext-list">
        <li
          v-for="e in rows"
          :key="e.key"
          class="ext-row"
          :class="[stateTone(e.state) ? `ext-row-${stateTone(e.state)}` : '', { 'ext-row-busy': store.busy.has(e.key), 'ext-row-pending': e.state === 'pending' }]"
          :aria-busy="store.busy.has(e.key) ? 'true' : undefined"
          :data-ext-id="e.id"
          :data-ext-state="e.state"
        >
          <div class="ext-head">
            <span class="ext-id">{{ e.id }}</span>
            <span class="ext-scope">{{ scopeText(e) }}</span>
            <span v-if="e.onUnresponsive === 'block'" class="ext-scope">応答しないときは止める</span>
          </div>
          <p v-if="e.description" class="settings-note ext-desc">{{ e.description }}</p>
          <p v-if="e.allow.length > 0" class="settings-note">許可: {{ e.allow.join("、") }}</p>
          <p v-if="scriptDisabledNote(e, settings.displayScriptEnabled)" class="settings-note ext-warn" data-ext-script-off>
            {{ scriptDisabledNote(e, settings.displayScriptEnabled) }}
          </p>
          <p class="ext-state" :class="stateTone(e.state) ? `ext-state-${stateTone(e.state)}` : ''" data-ext-state-text>
            <span v-if="stateMark(e.state)" class="ext-mark" aria-hidden="true">{{ stateMark(e.state) }}</span>
            {{ stateText(e) }}<template v-if="e.displays > 0">（面 {{ e.displays }} 件）</template><template v-if="store.busy.has(e.key)">（処理中…）</template>
          </p>
          <p v-if="lastExitText(e.lastExit)" class="settings-note">{{ lastExitText(e.lastExit) }}</p>
          <template v-if="e.scope === 'project' && e.approval">
            <p class="settings-note" data-ext-approval-status>承認: {{ approvalStatusText(e.approval) }}</p>
            <p v-if="e.approval.approvedAlive && e.approval.status !== 'approved'" class="settings-note" data-ext-approval-alive>
              前に承認した中身の記録が残っています（登録が、その中身へ戻ると、確認なしで動きます）。
            </p>
            <p v-if="e.approval.groupWritable" class="settings-note ext-warn" data-ext-group-writable>
              <span class="ext-mark" aria-hidden="true">⚠</span> この設定ファイル（か、その場所）は、同じグループのほかの利用者が書き換えられます。
            </p>
            <p class="settings-note ext-config-path" data-ext-config-path>設定ファイル: <code class="ext-path">{{ showPath(e.configPath) }}</code></p>
          </template>
          <div class="ext-ops">
            <button
              type="button"
              role="switch"
              class="settings-switch ext-switch"
              :aria-checked="isOn(e)"
              :aria-label="`拡張 ${e.id} を有効にする`"
              :disabled="!e.enabledInConfig"
              :aria-disabled="store.busy.has(e.key) ? 'true' : undefined"
              data-ext-switch
              @click="setEnabled(e, !isOn(e))"
            >
              <span class="settings-mark">{{ isOn(e) ? "入" : "切" }}</span>
              <span>有効</span>
            </button>
            <button type="button" class="settings-btn" :disabled="!isOn(e)" :aria-disabled="store.busy.has(e.key) ? 'true' : undefined" data-ext-restart :aria-label="`拡張 ${e.id} を起動し直す`" @click="restart(e)">
              {{ store.busy.has(e.key) ? "処理中…" : "起動し直す" }}
            </button>
            <button type="button" class="settings-btn" data-ext-log-toggle :aria-expanded="logs[e.key] !== undefined" :aria-label="`拡張 ${e.id} のログ`" @click="toggleLog(e.key)">
              ログ
            </button>
            <button
              v-if="e.scope === 'project' && (e.state === 'pending' || e.state === 'denied')"
              type="button"
              class="settings-btn ext-review"
              data-ext-review
              :aria-label="`拡張 ${e.id} の内容を確認する`"
              @click="review(e)"
            >
              確認
            </button>
            <button
              v-if="e.scope === 'project' && e.approval?.approvedAlive"
              type="button"
              class="settings-btn"
              data-ext-revoke
              :aria-disabled="store.busy.has(`revoke:${e.root}\0${e.id}`) ? 'true' : undefined"
              :aria-label="`拡張 ${e.id} の承認を取り消す`"
              @click="revoke(e)"
            >
              承認を取り消す
            </button>
            <button v-if="logs[e.key] !== undefined" type="button" class="settings-btn" data-ext-log-refresh :aria-label="`拡張 ${e.id} のログを更新する`" @click="loadLog(e.key)">更新</button>
          </div>
          <p class="settings-note ext-done" role="status" aria-live="polite" data-ext-done>{{ doneNotes[e.key] ?? "" }}</p>
          <template v-if="logs[e.key] !== undefined">
            <p v-if="(logs[e.key]?.dropped ?? 0) > 0" class="settings-note">あふれて捨てた行: {{ logs[e.key]?.dropped }}</p>
            <pre :ref="(el) => setLogEl(e.key, el)" class="ext-log" data-ext-log tabindex="0" :aria-label="`拡張 ${e.id} の標準エラーの記録`">{{ (logs[e.key]?.lines ?? []).length > 0 ? logs[e.key]?.lines.join("\n") : "（記録はありません）" }}</pre>
          </template>
        </li>
      </ul>
      <details v-if="records.length > 0" class="ext-records" data-ext-records>
        <summary>承認の記録（{{ records.length }} 件。いま開いていないリポジトリの分も）</summary>
        <ul class="settings-list ext-record-list">
          <li v-for="r in records" :key="`${r.root}\0${r.id}`" class="ext-record" data-ext-record>
            <span class="ext-id">{{ r.id }}</span>
            <code class="ext-path">{{ showPath(r.root) }}</code>
            <span class="settings-note">
              <template v-if="r.approvedAt">承認: {{ r.approvedAt }}</template>
              <template v-if="r.approvedAt && r.deniedAt">　</template>
              <template v-if="r.deniedAt">承認しない: {{ r.deniedAt }}</template>
              <template v-if="!r.active">　（いま開いていません）</template>
            </span>
            <button type="button" class="settings-btn" data-ext-record-delete :aria-label="`${r.id}（${showPath(r.root)}）の承認の記録を消す`" @click="revokeRecord(r)">記録を消す</button>
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
/* `SettingsDialog.vue` の同名のクラスと同じ見た目（`scoped` なので親から効かず、値をそろえるだけ。`KeySettings.vue` と同じ流儀）。 */
.settings-heading {
  margin: 0 0 0.5em;
  font-size: 0.95em;
}
.settings-note {
  margin: 0.3em 0 0;
  font-size: 0.85em;
  opacity: 0.8;
}
.settings-list {
  list-style: none;
  margin: 0.6em 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8em;
}
.settings-btn {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.15em 0.7em;
  min-height: 1.75rem;
  cursor: pointer;
}
.settings-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.settings-switch {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.15em 0.6em;
  min-height: 1.75rem;
  cursor: pointer;
  text-align: left;
}
.settings-switch:disabled {
  opacity: 0.5;
  cursor: default;
}
.settings-mark {
  flex: none;
  min-width: 2em;
  text-align: center;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 3px;
  padding: 0 0.2em;
}
.settings-switch[aria-checked="true"] .settings-mark {
  background: var(--soda-menu-active-bg, #44475a);
}
.ext-actions .settings-btn {
  flex: none;
  white-space: nowrap;
}
.ext-actions {
  display: flex;
  align-items: center;
  gap: 0.8em;
  margin: 0.6em 0 0;
}
.ext-path {
  overflow-wrap: anywhere;
}
.ext-row {
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.5em 0.7em;
}
.ext-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2em 0.8em;
}
.ext-id {
  font-weight: bold;
  overflow-wrap: anywhere;
}
.ext-scope {
  font-size: 0.8em;
  opacity: 0.75;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 3px;
  padding: 0 0.4em;
  overflow-wrap: anywhere;
}
.ext-desc {
  overflow-wrap: anywhere;
}
.ext-warn {
  opacity: 1;
  border-left: 3px solid var(--soda-warn-fg, #e0a030);
  padding-left: 0.5em;
  color: var(--soda-warn-fg, inherit);
}
.ext-state {
  margin: 0.4em 0 0;
}
.ext-mark {
  display: inline-block;
  min-width: 1.2em;
  text-align: center;
  font-weight: bold;
}
/* 失敗・待ちは、色（既存のトークン）に加えて、印と文言でも見分ける。 */
.ext-state-error {
  color: var(--soda-error-fg, #ff5555);
  font-weight: bold;
}
.ext-state-warn {
  color: var(--soda-warn-fg, #e0a030);
}
.ext-row-error {
  border-left: 3px solid var(--soda-error-fg, #ff5555);
}
.ext-row-warn {
  border-left: 3px solid var(--soda-warn-fg, #e0a030);
}
.ext-row-busy {
  border-style: dashed;
}
/* 承認待ちは、色に加えて、太い枠・「承認待ち」の文言・見出しの下の件数でも見分ける。 */
.ext-row-pending {
  border-left: 4px solid var(--soda-warn-fg, #e0a030);
}
.ext-records {
  margin-top: 0.8em;
}
.ext-record {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2em 0.8em;
}
.ext-row-busy .settings-btn,
.ext-row-busy .settings-switch {
  cursor: progress;
}
.ext-done {
  min-height: 1.2em;
  margin: 0.2em 0 0;
}
.ext-problem {
  opacity: 1;
}
.ext-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-top: 0.5em;
}
.ext-log {
  margin: 0.5em 0 0;
  max-height: 14em;
  overflow: auto;
  font-size: 0.8em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.4em 0.6em;
}
</style>
