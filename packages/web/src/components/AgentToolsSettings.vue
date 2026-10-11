<script setup lang="ts">
import {
  AGENT_HEADER_ACTIONS,
  HEADER_ACTION_LABELS,
  SummarySettingsSchema,
  type AgentHeaderAction,
} from "@sodashitsu/protocol";
import { ref } from "vue";
import { useSettingsStore } from "../store/settings.js";
const settings = useSettingsStore(),
  error = ref("");
function toggle(action: AgentHeaderAction) {
  settings.setAgentHeaderActions(
    settings.agentHeaderActions.includes(action)
      ? settings.agentHeaderActions.filter((a) => a !== action)
      : [...settings.agentHeaderActions, action],
  );
}
function update(key: "kind" | "model" | "sessionId", event: Event) {
  const r = SummarySettingsSchema.safeParse({
    ...settings.summarySettings,
    ...(key === "kind" ? { sessionId: "" } : {}),
    [key]: (event.target as HTMLInputElement).value,
  });
  if (r.success) {
    settings.setSummarySettings(r.data);
    error.value = "";
  } else error.value = "モデル名・セッションIDの形式を確認してください。";
}
</script>
<template>
  <section class="settings-section" aria-labelledby="settings-agent-tools">
    <h3 id="settings-agent-tools" class="settings-heading">ペインのエージェント操作</h3>
    <p>ヘッダーに表示する操作を選択します。対応しないエージェントでは表示されません。</p>
    <div class="agent-tool-options">
      <label v-for="action in AGENT_HEADER_ACTIONS" :key="action"
        ><input
          type="checkbox"
          :checked="settings.agentHeaderActions.includes(action)"
          @change="toggle(action)"
        />{{ HEADER_ACTION_LABELS[action] }}</label
      >
    </div>
    <h4>会話の要約</h4>
    <label
      >要約するエージェント
      <select :value="settings.summarySettings.kind" @change="update('kind', $event)">
        <option value="claude">Claude Code</option>
        <option value="codex">Codex</option>
      </select></label
    >
    <label
      >モデル（空欄はエージェントの既定）
      <input :value="settings.summarySettings.model" @change="update('model', $event)"
    /></label>
    <label
      >要約専用セッションID（空欄は新規）
      <input :value="settings.summarySettings.sessionId" @change="update('sessionId', $event)"
    /></label>
    <p>
      会話記録を読む別セッションで要約します。元の会話には送信しません。既存の要約専用セッションを続ける場合は、結果に表示されたIDを指定します。
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
label {
  display: block;
  margin-block: 8px;
}
.agent-tool-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
input,
select {
  background: var(--soda-input-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
}
option {
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
}
</style>
