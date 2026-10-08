import type { PaneMoveBlock, Workspace } from "@sodashitsu/protocol";

/**
 * pane を別の workspace へ移せるか（20261008-web-tab-dnd。純関数）。サーバ（`SessionModel`）・ブラウザ版・端末版が
 * 同じ関数を使い、配られている `Workspace` の `git.worktreeKey` と `cwd` だけで同じ結果を出す。
 */
type Ws = Pick<Workspace, "id" | "cwd" | "git">;

/** `git.worktreeKey` が文字列ならその値。無ければ null。 */
function keyOf(ws: Ws): string | null {
  const k = ws.git?.worktreeKey;
  return typeof k === "string" && k !== "" ? k : null;
}

/** 末尾の `/`・`\`（Windows の区切り）だけ落とす。根（`/`・`\`）はそのまま。大文字小文字・シンボリックリンクは比べない（断る側に倒れる）。 */
function normalizeCwd(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/, "");
  return trimmed === "" ? cwd.slice(0, 1) || "/" : trimmed;
}

/**
 * pane を source の workspace から target の workspace へ移せるか。移せるなら null、断るなら理由。
 * `lenient`（画面が渡す）: git はあるのに worktreeKey が無い workspace（古いサーバ）が絡むときは断らない（サーバに任せる）。
 */
export function paneMoveBlock(source: Ws, target: Ws, opts?: { lenient?: boolean }): PaneMoveBlock | null {
  if (source.id === target.id) return null;
  const a = keyOf(source);
  const b = keyOf(target);
  if (a !== null && b !== null) return a === b ? null : "different_worktree";
  if (source.git == null && target.git == null) {
    return normalizeCwd(source.cwd) === normalizeCwd(target.cwd) ? null : "different_worktree";
  }
  // git はあるのに worktreeKey が無い workspace が絡む（古いサーバ・古い保存から戻した直後）。
  const noKey = (ws: Ws): boolean => ws.git != null && keyOf(ws) === null;
  if (noKey(source) || noKey(target)) return opts?.lenient ? null : "different_worktree";
  // 片方に key、片方は git が null。
  return "different_worktree";
}

/** 知らせる文言。 */
export function paneMoveBlockMessage(reason: PaneMoveBlock): string {
  switch (reason) {
    case "different_worktree":
      return "別の worktree の workspace へは移せません（同じフォルダを開いた workspace へだけ移せます）";
  }
}
