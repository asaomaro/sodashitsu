import { join } from "node:path";
import { z } from "zod";
import type { LayoutNode, PaneStatus, SplitDirection } from "@sodashitsu/protocol";
import { SidebarLayoutSchema, type NextIdCounters, type SidebarLayout } from "@sodashitsu/protocol";
import { readFileWithBackup, writeFileAtomic, type ReadResult } from "./atomicFile.js";

/**
 * `session.json` の保存形式（design.md「永続化の形式」。`nextId` は architecture.md の独立点検で
 * split/agent の id も持つよう拡張済み）。プロセスの実体は持たない（cwd から新しいシェルを起動して復元する）。
 */
export interface SessionFilePane {
  id: string;
  label: string | null;
  cwd: string;
  shell: string;
  status?: PaneStatus | undefined;
  /**
   * 公式フック連携（20260923-agent-session-resume）が報告した会話/セッション参照。**以前の版の
   * 保存には無い**——無ければ復元時は現状どおりプレーンなシェルになる（`autoLabel` と同じ
   * 「optional 追加・schema 番号は据え置き」方式。design D2）。
   */
  agentSession?: { kind: string; sessionId: string; reportedAt: number } | undefined;
}
export interface SessionFileTab {
  id: string;
  label: string;
  focusedPaneId: string;
  zoomedPaneId: string | null;
  layout: LayoutNode;
  panes: SessionFilePane[];
}
export interface SessionFileWorkspace {
  id: string;
  label: string;
  /**
   * `label` が自動の名前か（20260921-workspace-auto-label）。**以前の版の保存には無い**——無ければ `label` が `"1"`（以前の既定の名前）なら自動と
   * みなす（design D6）。古い版は知らない項目を捨てて読むので、足しても壊れたファイルにはならない。
   */
  autoLabel?: boolean | undefined;
  /** 手動グループの所属先（20260923-workspace-grouping）。**以前の版の保存には無い**——無ければ
   *  null（`autoLabel` と同じ「optional 追加」方式）。 */
  groupId?: string | null | undefined;
  /**
   * 直前の git の判定（20261004-group-worktree-items）。**以前の版の保存には無い**。読み分け: 項目が無い＝まだ一度も確定していない／
   * `null`＝管理外／文字列＝そのリポジトリ（`GitInfo.repoKey`）。復元で `git` を戻す（ブランチ名・件数は最初の確認で入る）。
   */
  repoKey?: string | null | undefined;
  /** linked worktree か。`repoKey` が文字列のときだけ意味を持つ。無ければ false。 */
  isLinkedWorktree?: boolean | undefined;
  cwd: string;
  activeTabId: string;
  tabs: SessionFileTab[];
}
/** 手動グループの実体（20260923-workspace-grouping）。`WorkspaceGroup` の永続化版。 */
export interface SessionFileGroup {
  id: string;
  label: string;
  collapsed: boolean;
}
export interface SessionFileData {
  schema: 1;
  savedAt: string;
  nextId: NextIdCounters;
  workspaces: SessionFileWorkspace[];
  /** **以前の版の保存には無い**——無ければ空配列（20260923-workspace-grouping）。 */
  groups: SessionFileGroup[];
  /**
   * サイドバーの項目の並び（20261004-group-worktree-items）。**以前の版の保存には無い**——無ければ移行待ち（仮の状態）で復元する。
   * 仮の状態の間の保存には書かない（途中で止まっても次の起動が同じ移行をやり直せるように）。
   */
  layout?: SidebarLayout | undefined;
  /** リポジトリの所属（`repoKey` → グループ id）。`layout` と同じく、仮の状態の間は書かない。 */
  repoGroups?: Record<string, string> | undefined;
  focus: { workspaceId: string; tabId: string; paneId: string } | null;
}

export interface SessionFile {
  load(): Promise<ReadResult<SessionFileData>>;
  save(data: SessionFileData): Promise<void>;
}

// レビュー指摘：以前は schema===1 と workspaces が配列であることしか見ておらず、残りは無検証の `as` キャスト
// だった（D29 の zod パターンから外れていた）。手編集・破損したファイルがここを素通りすると、
// `SessionService.restore()` の中で不意な例外になる。ここで形を検証し、壊れていれば「壊れたファイル」の
// 扱い（バックアップへ退避してフレッシュ起動）に正しく合流させる。
const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("pane"), paneId: z.string() }),
    z.object({
      type: z.literal("split"),
      id: z.string(),
      dir: z.enum(["right", "down"]),
      ratio: z.number(),
      a: LayoutNodeSchema,
      b: LayoutNodeSchema,
    }),
  ]),
);
const SessionFilePaneSchema: z.ZodType<SessionFilePane> = z.object({
  id: z.string(),
  label: z.string().nullable(),
  cwd: z.string(),
  shell: z.string(),
  status: z.enum(["running", "failed"]).optional(),
  agentSession: z.object({ kind: z.string(), sessionId: z.string(), reportedAt: z.number() }).optional(),
});
const SessionFileTabSchema: z.ZodType<SessionFileTab> = z.object({
  id: z.string(),
  label: z.string(),
  focusedPaneId: z.string(),
  zoomedPaneId: z.string().nullable(),
  layout: LayoutNodeSchema,
  panes: z.array(SessionFilePaneSchema),
});
const SessionFileWorkspaceSchema: z.ZodType<SessionFileWorkspace> = z.object({
  id: z.string(),
  label: z.string(),
  autoLabel: z.boolean().optional(),
  // 以前の版の保存には無い——無ければ null として読む（20260923-workspace-grouping）。
  groupId: z.string().nullable().optional(),
  // 以前の版の保存には無い（20261004-group-worktree-items）。
  repoKey: z.string().nullable().optional(),
  isLinkedWorktree: z.boolean().optional(),
  cwd: z.string(),
  activeTabId: z.string(),
  tabs: z.array(SessionFileTabSchema),
});
const SessionFileGroupSchema: z.ZodType<SessionFileGroup> = z.object({
  id: z.string(),
  label: z.string(),
  collapsed: z.boolean(),
});
const NextIdCountersSchema: z.ZodType<NextIdCounters> = z.object({
  w: z.number(),
  t: z.number(),
  p: z.number(),
  s: z.number(),
  a: z.number(),
  // 以前の版の保存には無い——無ければ 1 から採番する（20260923-workspace-grouping）。
  g: z.number().default(1),
});
const SessionFileDataSchema: z.ZodType<SessionFileData> = z.object({
  schema: z.literal(1),
  savedAt: z.string(),
  nextId: NextIdCountersSchema,
  // 以前の版の保存には無い——無ければ空配列（20260923-workspace-grouping）。
  groups: z.array(SessionFileGroupSchema).default([]),
  workspaces: z.array(SessionFileWorkspaceSchema),
  // 以前の版の保存には無い（20261004-group-worktree-items）。
  layout: SidebarLayoutSchema.optional(),
  repoGroups: z.record(z.string(), z.string()).optional(),
  focus: z.object({ workspaceId: z.string(), tabId: z.string(), paneId: z.string() }).nullable(),
});

export class FsSessionFile implements SessionFile {
  private readonly filePath: string;
  private readonly backupsDir: string;

  constructor(stateDir: string) {
    this.filePath = join(stateDir, "session.json");
    this.backupsDir = join(stateDir, "session-backups");
  }

  async load(): Promise<ReadResult<SessionFileData>> {
    return readFileWithBackup(this.filePath, this.backupsDir, (raw) => {
      // `parse` が投げれば「壊れている」扱いになる（readFileWithBackup の契約）。
      return SessionFileDataSchema.parse(JSON.parse(raw));
    });
  }

  async save(data: SessionFileData): Promise<void> {
    await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2));
  }
}

// re-export so callers only need to import from this module for the layout shape
export type { LayoutNode, SplitDirection };
