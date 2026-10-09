<script setup lang="ts">
/**
 * 線の設定（20260927-agent-graph の design「web」の表・「振る舞いの詳細」）。右のパネル（開いている間はグラフの他の操作を止める軽いモーダル。research-ui §2.7）。
 * 新しい線は保存するまでサーバへ送らない（取り消せば線そのものを作らない）。
 *
 * - 保存: 保存ボタン・`Ctrl`/`⌘`＋`Enter`（どの欄でも）・単一行の欄の `Enter`。prompt の欄の `Enter` は改行。IME の変換中は無視。
 * - 取り消し: `Esc`・取り消しボタン・外側のクリック（`requestClose`）。値が変わっていれば「変更を捨てますか」。
 * - 他の画面・sodactl が同じ線を変えた・消したら知らせる（黙って上書きしない。design「エラー処理」）。保存は開いた（最新を読み込んだ）時点の値から
 *   変えた項目だけを送り、最新に重ねる。同じ項目が他でも変わっていれば親が `showConflict` を呼び、送らずに最新の値を出す（統合レビュー R1）。
 * - 承認の代理の「返答まで任せる」には注意を出す（decisions D2）。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import type {
  ApprovalConfig,
  Graph,
  GraphLink,
  LinkKind,
  NodeKey,
  TriggerConfig,
} from "@sodashitsu/protocol";
import {
  LINK_LIMIT_MAX,
  LINK_LIMIT_MIN,
  LINK_LINES_MAX,
  LINK_LINES_MIN,
} from "@sodashitsu/protocol";
import {
  defaultApprovalConfig,
  defaultTriggerConfig,
  LINK_LIMIT_DEFAULT,
  OUTPUT_LINES_DEFAULT,
  OUTPUT_PLACEHOLDER,
  validateLink,
  type GraphIssue,
} from "@sodashitsu/client-core";
import {
  LINK_KIND_NAME,
  linkConfigOf,
  linkDraftOf,
  linkFieldText,
  linkStateText,
  type LinkConfig,
  type LinkField,
  type LinkPanelSave,
} from "./linkText.js";

const props = defineProps<{
  graph: Graph;
  /** 既存の線（新しい線なら null）。ストアの今の値——他で変わればここも変わる。 */
  link: GraphLink | null;
  /** 新しい線の元と先。 */
  newEnds: { from: NodeKey; to: NodeKey } | null;
  /** 既存の線を開いたのに、その線がもう無い（他で消えた）。 */
  gone: boolean;
  nameOf: (key: NodeKey) => string;
  invalid: boolean;
  saving: boolean;
  /** 保存に失敗した理由（サーバ）。 */
  error: string | null;
}>();

const emit = defineEmits<{
  save: [payload: LinkPanelSave];
  cancel: [];
  delete: [];
  pause: [paused: boolean];
  history: [];
  /**
   * 変更があるのに閉じる要求が来た。「変更を捨てますか」は親（`GraphView`）がグラフ画面全体に対してモーダルに出す（パネルの中だけに
   * 重ねると、外を押して抜け出せた。レビュー R2）。捨てるなら親が閉じ、編集に戻るなら `focusFirstField`。
   */
  discardRequest: [];
}>();

interface Form {
  kind: LinkKind;
  from: NodeKey;
  to: NodeKey;
  on: TriggerConfig["on"];
  prompt: string;
  passOutput: boolean;
  outputLines: number;
  whenBusy: TriggerConfig["whenBusy"];
  approvalMode: ApprovalConfig["mode"];
  approvalLines: number;
  limit: number;
}

function formOf(link: GraphLink | null, ends: { from: NodeKey; to: NodeKey } | null): Form {
  const t = link?.trigger ?? defaultTriggerConfig();
  const a = link?.approval ?? defaultApprovalConfig();
  return {
    kind: link?.kind ?? "trigger",
    from: link?.from ?? ends!.from,
    to: link?.to ?? ends!.to,
    on: t.on,
    prompt: t.prompt,
    passOutput: t.output !== null,
    outputLines: t.output?.lines ?? OUTPUT_LINES_DEFAULT,
    whenBusy: t.whenBusy,
    approvalMode: a.mode,
    approvalLines: a.lines,
    limit: link?.limit ?? LINK_LIMIT_DEFAULT,
  };
}

const form = reactive<Form>(formOf(props.link, props.newEnds));
/** 開いた時点（または「最新を読み込む」の時点）の値。変更の有無と、他での変更の判定に使う。 */
let initial = JSON.stringify(form);
let baseConfig = configKey(props.link);
/** 既存の線の、開いた（最新を読み込んだ）時点の設定。保存はここからの差分（統合レビュー R1）。 */
let baseLink: LinkConfig | null = props.link ? linkConfigOf(props.link) : null;
const changedElsewhere = ref(false);
/** 保存しようとしたら、変えた項目が他でも変わっていた（送っていない）。その項目。 */
const conflictFields = ref<LinkField[] | null>(null);
const conflictText = computed(() =>
  conflictFields.value && props.link
    ? conflictFields.value.map((f) => linkFieldText(f, props.link!)).join("・")
    : "",
);
const issues = ref<GraphIssue[]>([]);
const rootEl = ref<HTMLElement | null>(null);

function configKey(link: GraphLink | null): string {
  if (!link) return "";
  return JSON.stringify([link.trigger ?? null, link.approval ?? null, link.limit]);
}

watch(
  () => configKey(props.link),
  (now) => {
    if (props.link && now !== baseConfig) changedElsewhere.value = true;
  },
);

const isNew = computed(() => props.link === null && !props.gone);
const dirty = computed(() => JSON.stringify(form) !== initial);
const kindName = computed(() => LINK_KIND_NAME[form.kind]);
const heading = computed(() => {
  const title = `${props.nameOf(form.from)} → ${props.nameOf(form.to)}`;
  return isNew.value
    ? `新しい線: ${title}（${kindName.value}）`
    : `線: ${title}（${kindName.value}）`;
});
const promptHasOutput = computed(() => form.prompt.includes(OUTPUT_PLACEHOLDER));

function reloadLatest(): void {
  Object.assign(form, formOf(props.link, props.newEnds));
  initial = JSON.stringify(form);
  baseConfig = configKey(props.link);
  baseLink = props.link ? linkConfigOf(props.link) : null;
  changedElsewhere.value = false;
  conflictFields.value = null;
  issues.value = [];
}

/** 保存が他の変更と重なった（親の `GraphView` が呼ぶ）。送らずに、重なった項目の最新の値を出す。 */
function showConflict(fields: LinkField[]): void {
  conflictFields.value = fields;
}

function swapEnds(): void {
  const f = form.from;
  form.from = form.to;
  form.to = f;
}

/** 範囲内の整数か（空の欄は v-model.number で文字列の "" になる）。 */
function inRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** 範囲外・空の数は黙って丸めず、検証のエラーとして見せる（g03 点検）。 */
function rangeIssues(): GraphIssue[] {
  const out: GraphIssue[] = [];
  const bad = (message: string): void => {
    out.push({ code: "config_mismatch", message });
  };
  if (!inRange(form.limit, LINK_LIMIT_MIN, LINK_LIMIT_MAX))
    bad(`上限は ${LINK_LIMIT_MIN}〜${LINK_LIMIT_MAX} の整数で入れてください。`);
  if (
    form.kind === "trigger" &&
    form.passOutput &&
    !inRange(form.outputLines, LINK_LINES_MIN, LINK_LINES_MAX)
  )
    bad(`受け渡す行数は ${LINK_LINES_MIN}〜${LINK_LINES_MAX} の整数で入れてください。`);
  if (form.kind === "approval" && !inRange(form.approvalLines, LINK_LINES_MIN, LINK_LINES_MAX))
    bad(`渡す行数は ${LINK_LINES_MIN}〜${LINK_LINES_MAX} の整数で入れてください。`);
  return out;
}

/** 送るもの（`rangeIssues` が空のときだけ呼ぶ）。 */
function payload(): LinkPanelSave {
  const p: LinkPanelSave = { kind: form.kind, from: form.from, to: form.to, limit: form.limit };
  if (props.link) {
    p.id = props.link.id;
    if (baseLink) p.base = baseLink;
  }
  if (form.kind === "trigger") {
    p.trigger = {
      on: form.on,
      prompt: form.prompt,
      output: form.passOutput ? { lines: form.outputLines } : null,
      whenBusy: form.whenBusy,
    };
  }
  if (form.kind === "approval") p.approval = { mode: form.approvalMode, lines: form.approvalLines };
  return p;
}

function save(): void {
  if (props.saving || props.gone) return;
  const range = rangeIssues();
  if (range.length > 0) {
    issues.value = range;
    return;
  }
  const p = payload();
  // 保存の前にサーバと同じ検証（client-core の validateLink）。
  const found = validateLink(props.graph, linkDraftOf(p));
  issues.value = found;
  if (found.length > 0) return;
  emit("save", p);
}

/** 閉じる要求（Esc・取り消しボタン・外側のクリック）。変更があれば確認。 */
function requestClose(): void {
  if (dirty.value && !props.gone) {
    emit("discardRequest");
    return;
  }
  emit("cancel");
}

/** 「変更を捨てますか」で編集に戻った。 */
function focusFirstField(): void {
  void nextTick(() =>
    rootEl.value
      ?.querySelector<HTMLElement>("select, textarea, input")
      ?.focus({ preventScroll: true }),
  );
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    requestClose();
    return;
  }
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    ev.stopPropagation();
    save();
    return;
  }
  const t = ev.target as HTMLElement;
  if (ev.key === "Enter" && !ev.shiftKey && (t.tagName === "INPUT" || t.tagName === "SELECT")) {
    const type = (t as HTMLInputElement).type;
    if (type !== "checkbox" && type !== "radio") {
      ev.preventDefault();
      ev.stopPropagation();
      save();
      return;
    }
  }
  // パネルの中のキーをグラフの操作（1・+・Delete 等）へ渡さない。
  ev.stopPropagation();
}

onMounted(() => {
  void nextTick(() =>
    rootEl.value?.querySelector<HTMLElement>("select, textarea, input, button")?.focus(),
  );
});

defineExpose({ requestClose, focusFirstField, showConflict });
</script>

<template>
  <section
    ref="rootEl"
    class="link-panel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="link-panel-heading"
    @keydown="onKeydown"
    @pointerdown.stop
  >
    <h3 id="link-panel-heading" class="link-panel-heading">{{ heading }}</h3>

    <p v-if="gone" class="link-panel-note" role="alert">
      この線はほかの画面・sodactl で削除されました。
    </p>
    <p v-else-if="conflictFields" class="link-panel-note link-panel-conflict" role="alert">
      ほかの画面・sodactl で同じ項目が変わりました:
      {{ conflictText }}。保存していません（上書きしません）。 最新を読み込んでから直してください。
      <button type="button" class="link-panel-reload" @click="reloadLatest">最新を読み込む</button>
    </p>
    <p v-else-if="changedElsewhere" class="link-panel-note" role="alert">
      この線はほかの画面・sodactl
      で変わりました。保存すると、ここで変えた項目だけを最新の設定に重ねます（同じ項目がほかでも変わっていれば保存しません）。
      <button type="button" class="link-panel-reload" @click="reloadLatest">最新を読み込む</button>
    </p>

    <fieldset v-if="isNew" class="link-panel-field">
      <legend>種類</legend>
      <label><input v-model="form.kind" type="radio" value="trigger" /> トリガ（状態で送る）</label>
      <label><input v-model="form.kind" type="radio" value="supervise" /> 監督</label>
      <label><input v-model="form.kind" type="radio" value="approval" /> 承認の代理</label>
    </fieldset>

    <div class="link-panel-ends">
      <template v-if="form.kind === 'trigger'">
        <span>元: {{ nameOf(form.from) }}</span>
        <span>先: {{ nameOf(form.to) }}</span>
      </template>
      <template v-else>
        <span>配下: {{ nameOf(form.from) }}</span>
        <span>監督役: {{ nameOf(form.to) }}</span>
      </template>
      <button v-if="isNew" type="button" class="link-panel-swap" @click="swapEnds">
        向きを入れ替える
      </button>
    </div>

    <template v-if="form.kind === 'trigger'">
      <label class="link-panel-field">
        元が
        <select v-model="form.on" class="link-panel-on">
          <option value="done">完了した</option>
          <option value="blocked">承認待ちになった</option>
        </select>
        とき、先へ送る
      </label>
      <label class="link-panel-field link-panel-column">
        送る文面
        <textarea v-model="form.prompt" class="link-panel-prompt" rows="5"></textarea>
      </label>
      <label class="link-panel-field">
        <input v-model="form.passOutput" type="checkbox" class="link-panel-pass" />
        元の画面の末尾
        <input
          v-model.number="form.outputLines"
          type="number"
          class="link-panel-lines"
          :min="LINK_LINES_MIN"
          :max="LINK_LINES_MAX"
          :disabled="!form.passOutput"
          aria-label="受け渡す行数"
        />
        行を受け渡す
      </label>
      <p v-if="form.passOutput" class="link-panel-hint">
        {{
          promptHasOutput
            ? "文面の {output} の位置に差し込みます。"
            : "文面の末尾に足します（{output} を書けばその位置へ）。"
        }}
      </p>
      <label class="link-panel-field">
        先が作業中なら
        <select v-model="form.whenBusy" class="link-panel-busy">
          <option value="wait">手が空くまで待つ（最長 30 分）</option>
          <option value="skip">見送る</option>
        </select>
      </label>
    </template>

    <template v-if="form.kind === 'approval'">
      <label class="link-panel-field">
        監督役に
        <select v-model="form.approvalMode" class="link-panel-mode">
          <option value="notify">知らせるだけ（返答は人）</option>
          <option value="delegate">返答まで任せる</option>
        </select>
      </label>
      <p v-if="form.approvalMode === 'delegate'" class="link-panel-warn" role="note">
        ⚠ 監督役のエージェントが承認に答えます（人の承認をエージェントに任せます）。
      </p>
      <label class="link-panel-field">
        渡す画面の末尾
        <input
          v-model.number="form.approvalLines"
          type="number"
          class="link-panel-approval-lines"
          :min="LINK_LINES_MIN"
          :max="LINK_LINES_MAX"
        />
        行
      </label>
    </template>

    <p v-if="form.kind === 'supervise'" class="link-panel-hint">
      監督役に配下の pane と sodactl での操作方法を知らせます（配下が変わると知らせ直します）。
    </p>

    <label class="link-panel-field">
      上限
      <input
        v-model.number="form.limit"
        type="number"
        class="link-panel-limit"
        :min="LINK_LIMIT_MIN"
        :max="LINK_LIMIT_MAX"
      />
      回（達したら一時停止）
    </label>

    <div v-if="link" class="link-panel-status">
      <span
        >実行 {{ link.count }}/{{ link.limit }}・{{
          linkStateText(link, { invalid, graphPaused: graph.paused })
        }}</span
      >
      <button
        v-if="link.paused"
        type="button"
        class="link-panel-resume"
        @click="emit('pause', false)"
      >
        再開（回数を 0 に戻す）
      </button>
      <button v-else type="button" class="link-panel-pause" @click="emit('pause', true)">
        一時停止
      </button>
      <button type="button" class="link-panel-history" @click="emit('history')">履歴</button>
    </div>

    <ul v-if="issues.length > 0 || error" class="link-panel-issues" role="alert">
      <li v-for="(i, n) in issues" :key="n">{{ i.message }}</li>
      <li v-if="error">{{ error }}</li>
    </ul>

    <div class="link-panel-actions">
      <button v-if="link" type="button" class="link-panel-delete" @click="emit('delete')">
        削除…
      </button>
      <span class="link-panel-spacer"></span>
      <button type="button" class="link-panel-cancel" @click="requestClose">取り消し</button>
      <button type="button" class="link-panel-save" :disabled="saving || gone" @click="save">
        保存
      </button>
    </div>
    <p class="link-panel-hint">Ctrl+Enter で保存・Esc で取り消し</p>
  </section>
</template>

<style scoped>
.link-panel {
  position: relative;
  box-sizing: border-box;
  width: 360px;
  max-width: 100%;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--soda-shape-pad-x, 12px);
  overflow-y: auto;
  border-left: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 13px;
}
.link-panel-heading {
  margin: 0;
  font-size: 14px;
}
.link-panel-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  border: none;
  padding: 0;
}
.link-panel-column {
  flex-direction: column;
  align-items: stretch;
}
.link-panel-prompt {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  resize: vertical;
}
.link-panel-lines,
.link-panel-limit,
.link-panel-approval-lines {
  width: 5em;
}
.link-panel-ends {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.link-panel-hint {
  margin: 0;
  font-size: 11px;
  opacity: 0.8;
}
.link-panel-note,
.link-panel-warn {
  margin: 0;
  color: var(--soda-warn-fg, #ffb86c);
}
.link-panel-issues {
  margin: 0;
  padding-left: 1.2em;
  color: var(--soda-error-fg, #ff5555);
}
.link-panel-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.link-panel-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.link-panel-spacer {
  flex: 1;
}
.link-panel button {
  padding: 3px 10px;
  min-height: var(--soda-shape-control-h, 0);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  cursor: pointer;
}
.link-panel-save {
  border-color: var(--soda-accent, #6070a1) !important;
}
.link-panel-delete {
  color: var(--soda-error-fg, #ff5555) !important;
}
</style>
