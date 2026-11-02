import type { ConversationKind } from "@sodashitsu/protocol";
/** Fixed argv per CLI. No kind falls through to another CLI's spelling. */
export function conversationResumeArgs(kind: ConversationKind, id: string, cwd: string): string[] {
  switch (kind) {
    case "claude":
    case "copilot":
      return ["--resume", id];
    case "codex":
      return ["resume", id, "--cd", cwd];
    case "muse":
      return ["resume", id];
    case "agy":
      return ["--conversation", id];
  }
}
