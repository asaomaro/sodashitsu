<script setup lang="ts">
/**
 * pane の利用状況（情報）の中身（20261010-agent-usage PR4。AC1）。デスクトップの小さな窓（`PaneInfoPopover`）と、1 列の画面の全面のダイアログ（`PaneInfoDialog`）が同じものを使う。
 * **見るだけ**。数字の整形・基準の印・古い値の扱い・アカウントの枠の形は、PR3 のダッシュボードの部品（`dashboardModel.ts`・`AccountCard.vue`）をそのまま使う（二重に作らない）。
 * 値が無いものは「—」（0 と書かない）。数字・モデル名・時刻・ラベルだけを文字として出す（会話の中身・記録の場所は来ない）。
 */
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { paneNameOf, stateLabel } from "@sodashitsu/client-core";
import StateIcon from "../components/StateIcon.vue";
import { ConnectionKey } from "../injection.js";
import { displayStateFor, useSeenStore } from "../store/seen.js";
import { useMachinesStore } from "../store/machines.js";
import { useSessionStore } from "../store/session.js";
import { useUsageStore } from "../store/usage.js";
import { useViewStore } from "../store/view.js";
import AccountCard from "./AccountCard.vue";
import {
  basisDescription,
  basisLabel,
  contextDisplay,
  formatAgo,
  formatCost,
  formatTokens,
  isStale,
  kindLabel,
  NONE,
  totalTokens,
} from "./dashboardModel.js";

const props = defineProps<{ paneId: string; kind: "popover" | "dialog"; active: boolean }>();
const emit = defineEmits<{ close: [] }>();

const view = useViewStore();
const session = useSessionStore();
const seen = useSeenStore();
const usageStore = useUsageStore();
const machines = useMachinesStore();
const conn = inject(ConnectionKey, null);
void conn;

// --- 時計（「N 分前」）。見えている間だけ 10 秒ごと ---------------------------------------------------------------------
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
watch(
  () => props.active,
  (a) => {
    if (a) {
      now.value = Date.now();
      if (clock === undefined) clock = setInterval(() => (now.value = Date.now()), 10_000);
    } else if (clock !== undefined) {
      clearInterval(clock);
      clock = undefined;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (clock !== undefined) clearInterval(clock);
});

// --- 中身 -----------------------------------------------------------------------------------------------------------
const pane = computed(() => session.panes.get(props.paneId));
const agent = computed(() => pane.value?.agent ?? null);
const usage = computed(() => usageStore.panes[props.paneId] ?? null);
const state = computed(() => (agent.value ? (displayStateFor(agent.value, seen.getSeenSeq(agent.value.instanceId, agent.value.serverSeenSeq)) ?? "unknown") : null));
const name = computed(() => (pane.value ? (agent.value?.name ?? paneNameOf(pane.value)) : ""));
const tab = computed(() => (pane.value ? session.tabs.get(pane.value.tabId) : undefined));
const workspace = computed(() => (tab.value ? session.workspaces.get(tab.value.workspaceId) : undefined));
const branch = computed(() => workspace.value?.git?.branch ?? null);
const sessionShort = computed(() => {
  const id = pane.value?.agentSession?.sessionId;
  return id ? id.slice(0, 8) : null;
});
const subagentCount = computed(() => agent.value?.subagents?.count ?? null);

const tokenRows = computed(() => {
  const u = usage.value;
  if (!u) return [];
  const t = u.tokens;
  const rows: { label: string; value: number }[] = [];
  const add = (label: string, v: number | undefined): void => {
    if (v !== undefined) rows.push({ label, value: v });
  };
  add("入力", t.input);
  add("出力", t.output);
  add("キャッシュ読み", t.cacheRead);
  add("キャッシュ書き", t.cacheWrite);
  add("推論", t.reasoning);
  return rows;
});
const totalText = computed(() => formatTokens(totalTokens(usage.value)));
const breakdown = computed(() => {
  const b = usage.value?.breakdown;
  if (!b) return null;
  return {
    main: formatTokens(totalTokens({ ...usage.value!, tokens: { ...usage.value!.tokens, ...b.main } })),
    subagents: formatTokens(
      totalTokens({ ...usage.value!, tokens: { basis: usage.value!.tokens.basis, ...b.subagents } }),
    ),
    files: b.subagents.files,
  };
});
const costNote = computed(() => {
  const u = usage.value;
  if (!u || u.costUsd === undefined) return null;
  if (u.costBasis === "cost-state" && u.costAsOf !== undefined) return `${formatAgo(u.costAsOf, now.value)}の時点`;
  if (u.costBasis === "reported") return "見積り";
  return null;
});
const context = computed(() => contextDisplay(usage.value));
const notes = computed(() => {
  const u = usage.value;
  if (!u) return [];
  const out: string[] = [];
  if (u.scanning === true) out.push("読み込み中");
  if (u.partial === true) out.push("一部");
  if (u.updatesStopped === true) out.push("更新停止");
  return out;
});
const stale = computed(() => usage.value !== null && (usage.value.updatesStopped === true || isStale(usage.value.updatedAt, now.value)));
const loading = computed(() => !usageStore.loaded && !usageStore.unsupported && !usageStore.failed);

/** その種類のアカウントの枠（ダッシュボードと同じ形）。 */
const accounts = computed(() => (agent.value ? usageStore.accounts.filter((a) => a.kind === agent.value!.kind) : []));

const stateText = computed(() => stateLabel(state.value) ?? NONE);

// --- 入口 -----------------------------------------------------------------------------------------------------------
function openSubagents(): void {
  const id = props.paneId;
  emit("close");
  view.openDialogWithContext({ kind: "subagents", machineId: machines.selectedId, paneId: id });
}
function openDashboard(): void {
  emit("close");
  view.openDashboard();
}
</script>

<template>
  <section class="pinfo" :class="`pinfo-${kind}`" data-pane-info :data-pane-info-pane="paneId" aria-label="pane の利用状況">
    <p v-if="!agent" class="dash-muted" data-pane-info-noagent>この pane には、エージェントが居ません。</p>
    <template v-else>
      <header class="pinfo-head">
        <StateIcon :state="state" />
        <span class="pinfo-name" :title="name">{{ name }}</span>
        <span class="dash-chip" data-pane-info-kind>{{ kindLabel(agent.kind) }}</span>
      </header>
      <dl class="pinfo-dl">
        <dt>状態</dt>
        <dd data-pane-info-state>{{ stateText }}<span class="dash-muted pinfo-since">（{{ formatAgo(agent.since, now) }}から）</span></dd>
        <dt>モデル</dt>
        <dd data-pane-info-model>{{ usage?.model ?? NONE }}</dd>
      </dl>

      <h3 class="pinfo-sub">このセッションの利用状況</h3>
      <p v-if="usageStore.unsupported" class="dash-muted" role="status" data-pane-info-unsupported>このマシンのサーバは、利用状況に対応していません（サーバを更新すると出ます）。</p>
      <p v-else-if="usageStore.failed" class="dash-muted" role="status" data-pane-info-failed>利用状況を取れませんでした。窓を開き直すと、取り直します。</p>
      <p v-else-if="loading" class="dash-muted" role="status" data-pane-info-loading>読み込んでいます…</p>
      <p v-else-if="!usage" class="dash-muted" data-pane-info-none>このセッションの利用状況は、まだ取れていません（記録が見つからない・対応していない種類・始まったばかり）。</p>
      <dl v-else class="pinfo-dl" :class="{ 'dash-stale': stale }" data-pane-info-usage>
        <dt>トークン</dt>
        <dd data-pane-info-tokens>
          <span class="dash-num">{{ totalText }}</span>
          <span class="dash-muted pinfo-basis" :title="basisDescription(usage.tokens.basis)">{{ basisLabel(usage.tokens.basis) }}</span>
        </dd>
        <template v-for="r in tokenRows" :key="r.label">
          <dt class="pinfo-indent">{{ r.label }}</dt>
          <dd class="dash-num pinfo-indent-value">{{ formatTokens(r.value) }}</dd>
        </template>
        <template v-if="breakdown">
          <dt class="pinfo-indent">主</dt>
          <dd class="dash-num pinfo-indent-value" data-pane-info-main>{{ breakdown.main }}</dd>
          <dt class="pinfo-indent">サブエージェント</dt>
          <dd class="dash-num pinfo-indent-value" data-pane-info-subagent-tokens>{{ breakdown.subagents }}<span class="dash-muted pinfo-basis">{{ breakdown.files }} 件</span></dd>
        </template>
        <dt>コスト</dt>
        <dd data-pane-info-cost>
          <span class="dash-num">{{ formatCost(usage.costUsd) }}</span>
          <span v-if="costNote" class="dash-muted pinfo-basis">{{ costNote }}</span>
        </dd>
        <dt>コンテキスト</dt>
        <dd data-pane-info-context>
          <span
            v-if="context.pct !== null"
            class="dash-bar dash-bar-small"
            role="progressbar"
            aria-label="コンテキストの使用率"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="context.pct"
          >
            <span class="dash-bar-fill" :style="{ width: `${context.pct}%` }" />
          </span>
          <span class="dash-num">{{ context.text }}</span>
          <span v-if="context.pct !== null && usage.contextWindowTokens !== undefined" class="dash-muted pinfo-basis">窓 {{ formatTokens(usage.contextWindowTokens) }}</span>
        </dd>
        <dt>更新</dt>
        <dd data-pane-info-updated :title="new Date(usage.updatedAt).toLocaleString()">
          {{ formatAgo(usage.updatedAt, now) }}
          <span v-if="stale" class="dash-chip">古い</span>
          <span v-for="n in notes" :key="n" class="dash-chip">{{ n }}</span>
        </dd>
      </dl>

      <h3 class="pinfo-sub">セッション</h3>
      <dl class="pinfo-dl">
        <dt>会話の id</dt>
        <dd data-pane-info-session>{{ sessionShort ?? NONE }}</dd>
        <dt>作業フォルダ</dt>
        <dd class="pinfo-path" :title="pane?.cwd" data-pane-info-cwd>{{ pane?.cwd ?? NONE }}</dd>
        <dt>ブランチ</dt>
        <dd data-pane-info-branch>{{ branch ?? NONE }}</dd>
        <dt>サブエージェント</dt>
        <dd data-pane-info-subagents>
          {{ subagentCount === null ? NONE : `${subagentCount} 件` }}
          <button v-if="subagentCount !== null && subagentCount > 0" type="button" class="pinfo-btn" data-pane-info-open-subagents @click="openSubagents">一覧を開く</button>
        </dd>
      </dl>

      <section v-if="accounts.length > 0" class="pinfo-accounts" data-pane-info-accounts aria-label="アカウントの利用枠">
        <h3 class="pinfo-sub">アカウントの利用枠</h3>
        <AccountCard v-for="a in accounts" :key="a.accountKey" :account="a" :now="now" />
      </section>
    </template>
    <div class="pinfo-foot">
      <button type="button" class="pinfo-btn" data-pane-info-open-dashboard @click="openDashboard">ダッシュボードを開く</button>
    </div>
  </section>
</template>

<style scoped>
.pinfo {
  box-sizing: border-box;
  font-size: 0.9em;
  line-height: 1.35;
}
.pinfo-head {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.4em;
}
.pinfo-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.pinfo-sub {
  margin: 0.7em 0 0.25em;
  font-size: 0.9em;
  font-weight: 600;
  opacity: 0.85;
}
.pinfo-dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.15em 0.8em;
  margin: 0;
}
.pinfo-dl dt {
  opacity: 0.7;
}
.pinfo-dl dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.pinfo-indent {
  padding-left: 1em;
}
.pinfo-indent-value {
  opacity: 0.9;
}
.pinfo-basis,
.pinfo-since {
  margin-left: 0.4em;
}
.pinfo-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pinfo-accounts {
  margin-top: 0.4em;
}
.pinfo-foot {
  margin-top: 0.7em;
  display: flex;
  justify-content: flex-end;
}
.pinfo-btn {
  margin-left: 0.4em;
  min-height: var(--soda-shape-control-h, 0);
  padding: 0.15em 0.6em;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-s, 3px);
  font: inherit;
  cursor: pointer;
}
.pinfo-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.dash-num {
  font-variant-numeric: tabular-nums;
}
.pinfo-dialog .pinfo-btn {
  min-height: 44px;
  min-width: 44px;
}
</style>
