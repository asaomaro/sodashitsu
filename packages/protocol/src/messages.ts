import { z } from "zod";
import type { AgentInfo, AgentIntegrationKind, MachineStatus, Pane, ServerSessionEntry, SessionSnapshot, Tab, Workspace, WorkspaceGroup, WorktreeEntry } from "./model.js";
import { THEME_NAMES, type ThemeName } from "./theme.js";
import { IMAGE_CHUNK_BASE64_MAX, IMAGE_MIME_TYPES } from "./image.js";
import { ASK_ANSWER_TEXT_MAX, ASK_MEDIA_FILES_MAX, type AskFeatures, ASK_ASKID_MAX, ASK_ID_MAX, ASK_OPTIONS_MAX, ASK_QUESTIONS_MAX, ASK_TIMEOUT_MAX_MS, ASK_TIMEOUT_MIN_MS, jsonBytes, type AskPending, type AskResult } from "./ask.js";
import {
  DISPLAY_NAME_RE,
  DISPLAY_REPORT_PROBLEMS,
  DISPLAY_RENDER_FEATURES_MAX,
  DISPLAY_WAIT_MAX_MS,
  DISPLAY_WAIT_MIN_MS,
  DISPLAY_WAIT_NAMES_MAX,
  type DisplayChunk,
  type DisplayFeatures,
  type DisplayInfo,
  type DisplaySetResult,
  type DisplayWaitResult,
} from "./display.js";
import { FILE_CHUNK_BASE64_MAX, FILE_NAME_INPUT_MAX, FILE_PATH_MAX, FILE_RESOLVE_MAX_PATHS, type ResolvedFile } from "./file.js";
import { COMMAND_ID_RE, POPUP_RUN_SIZE_MAX, POPUP_RUN_SIZE_MIN, type CommandListResult, type CommandRunResult } from "./commands.js";
import { GraphGetParams, GraphHistoryParams, GraphPauseParams, GraphResumeParams, GraphUpdateParams, type Graph, type GraphHistoryResult } from "./graph.js";
import { CELL_LIMIT_MESSAGE, terminalDimension, VIEW_VISIBLE_PANES_MAX, withinCellLimit } from "./terminalLimits.js";

/**
 * 方式（method）の定義。design.md「WebSocket の通信」の表と、architecture.md「方式の追加と変更」
 * （D30：`client.view` から購読を分離し `pane.subscribe` / `pane.unsubscribe` を新設）を反映する。
 */

const paneId = z.string().min(1);
const workspaceId = z.string().min(1);
const tabId = z.string().min(1);
const splitId = z.string().min(1);
// 20260923-workspace-grouping（タスク点検の指摘：groupId もほかの id と同じく共有 const にする）。
const groupId = z.string().min(1);
// `"external"` = 画面を持たない外部クライアント（`sodactl`。20260923-external-control-api の design D4）。
const clientKind = z.enum(["desktop", "mobile", "external"]);
const splitDirection = z.enum(["right", "down"]);
const dir = z.enum(["left", "right", "up", "down"]);
const rightClickTarget = z.enum(["herdr", "pane"]);
const zoomMode = z.enum(["toggle", "on", "off"]);
// `tab.move`（20260923-missing-keybinding-actions）の方向。herdr の `insert_index` ではなく、対象 tab と
// 隣（巡回込み）を入れ替える方向だけを渡す（design「検討した代替案」）。
const tabMoveDirection = z.enum(["previous", "next"]);

// --- client -----------------------------------------------------------

export const ClientHelloParams = z.object({
  protocol: z.literal(1),
  kind: clientKind,
});
export type ClientHelloParams = z.infer<typeof ClientHelloParams>;
export interface ClientHelloResult {
  clientId: string;
  snapshot: SessionSnapshot;
}

export const ClientViewParams = z.object({
  workspaceId,
  tabId,
  // 大きさは 1 辺 4096・面積 1,000,000 セル、件数は 4096 まで（20260927-server-size-input-limits。外れたら要求ごと invalid_params）。
  visible: z
    .array(z.object({ paneId, cols: terminalDimension, rows: terminalDimension }).refine(withinCellLimit, CELL_LIMIT_MESSAGE))
    .max(VIEW_VISIBLE_PANES_MAX),
});
export type ClientViewParams = z.infer<typeof ClientViewParams>;

export const ClientFitParams = z.object({ enabled: z.boolean() });
export type ClientFitParams = z.infer<typeof ClientFitParams>;

/**
 * このブラウザがいま表示しているテーマ（20260921-theme-settings の design D1）。サーバは色の問い合わせ（OSC 4/10/11/12）の答えに使う
 * だけで、保存もほかのクライアントへの配布もしない。名前を送る（配色は protocol の `TERMINAL_PALETTES` から引く）。
 */
export const ClientThemeParams = z.object({ theme: z.enum(THEME_NAMES) });
export type ClientThemeParams = z.infer<typeof ClientThemeParams>;

export const ClientDetachParams = z.object({});
export type ClientDetachParams = z.infer<typeof ClientDetachParams>;

// --- pane subscription (D30) ------------------------------------------

export const PaneSubscribeParams = z.object({
  paneId,
  scrollbackLines: z.number().int().nonnegative(),
});
export type PaneSubscribeParams = z.infer<typeof PaneSubscribeParams>;
export interface PaneSubscribeResult {
  cols: number;
  rows: number;
}

export const PaneUnsubscribeParams = z.object({ paneId });
export type PaneUnsubscribeParams = z.infer<typeof PaneUnsubscribeParams>;

// --- pane への直結（20260926-pane-direct-connect。herdr の terminal attach）---------------

/**
 * 直結の所有者になり、pane の大きさを `cols`×`rows` にする。別のクライアントが直結していれば、`takeover` が無い限り
 * `pane_attached`。所有者は pane ごとに高々 1 つで、直結中はブラウザのサイズ権限がその pane の大きさを変えない。
 */
export const PaneAttachParams = z
  .object({
    paneId,
    // 1 辺 4096・面積 1,000,000 セルまで（20260927-server-size-input-limits。`sodactl` は 1〜1000 に絞るが、生の `/ws` からも巨大なミラーを作らせない）。
    cols: terminalDimension,
    rows: terminalDimension,
    takeover: z.boolean().optional(),
  })
  .refine(withinCellLimit, CELL_LIMIT_MESSAGE);
export type PaneAttachParams = z.infer<typeof PaneAttachParams>;
export interface PaneAttachResult {
  cols: number;
  rows: number;
}

/** 所有者だけが大きさを変えられる（所有者でなければ `not_attached`）。 */
export const PaneAttachResizeParams = z
  .object({
    paneId,
    cols: terminalDimension,
    rows: terminalDimension,
  })
  .refine(withinCellLimit, CELL_LIMIT_MESSAGE);
export type PaneAttachResizeParams = z.infer<typeof PaneAttachResizeParams>;

/** 所有者なら直結を終える（所有者でなければ何もしない）。 */
export const PaneDetachParams = z.object({ paneId });
export type PaneDetachParams = z.infer<typeof PaneDetachParams>;

// --- 新しく開く場所（20260921-new-terminal-cwd。herdr の `terminal.new_cwd`） ----------------

/**
 * 新しい workspace・tab・分割を**どこで開くかの方針**（ブラウザごとの設定。design D1）。場所を決めるのはサーバ（design D2）。
 * - `follow`: 元の pane の「いまの場所」を引き継ぐ（**ブラウザの設定の既定**）。`sourcePaneId` は元の pane（分割では `pane.split` の
 *   `paneId` が元なので付けない）。
 * - `home`: ホームディレクトリ。 `current`: サーバを起動した場所。 `path`: 指定した場所（`~` はホーム）。
 *   **空文字・相対パスもスキーマは通す**——サーバが「使えない場所」として扱い、代わりの場所で開いて知らせる（design の異常系）。
 *   ここで弾くと、「指定した場所」を選んだまま何も入れていないブラウザの作成が失敗してしまう。
 *
 * **`newCwd` が無い要求は `follow` ではなく「今までどおり」**（古いクライアント・テストのクライアント。design D5）。
 * **場所を明示する `cwd`（worktree を開く）とは別物**——`cwd` があればこちらは見ない（design D5）。
 */
export const NewCwd = z.discriminatedUnion("policy", [
  z.object({ policy: z.literal("follow"), sourcePaneId: paneId.optional() }),
  z.object({ policy: z.literal("home") }),
  z.object({ policy: z.literal("current") }),
  z.object({ policy: z.literal("path"), path: z.string() }),
]);
export type NewCwd = z.infer<typeof NewCwd>;

/**
 * 作成の結果に載る。**「引き継ぐ」以外の方針で決めた場所が使えず、代わりの場所で開いたときだけ `true`**（知らせるかどうかは
 * サーバが決める。design D9）。それ以外のときは載らない。
 */
export interface CwdFallbackResult {
  cwdFallback?: true;
}

// --- workspace ----------------------------------------------------------

export const WorkspaceCreateParams = z.object({
  /** 呼び出し元の pane（pane の中の sodactl が名乗る）。グラフの自動載せの関係の記録にだけ使う。実在しなければ無視する。 */
  callerPaneId: paneId.optional(),
  /** 場所を明示する（worktree を開く）。**`newCwd` に勝ち、代わりの場所へは回さない**（使えなければ失敗する）。 */
  cwd: z.string().optional(),
  label: z.string().optional(),
  newCwd: NewCwd.optional(),
});
export type WorkspaceCreateParams = z.infer<typeof WorkspaceCreateParams>;
export interface WorkspaceCreateResult extends CwdFallbackResult {
  workspace: Workspace;
  tab: Tab;
  pane: Pane;
}

/** `label: null` で自動の名前に戻す（pane の名前と同じ形。20260921-workspace-auto-label の design D5）。 */
export const WorkspaceRenameParams = z.object({ workspaceId, label: z.string().min(1).nullable() });
export type WorkspaceRenameParams = z.infer<typeof WorkspaceRenameParams>;

export const WorkspaceFocusParams = z.object({ workspaceId });
export type WorkspaceFocusParams = z.infer<typeof WorkspaceFocusParams>;

// `closeLinkedWorktrees`（20260923-workspace-grouping。herdr の `close_group` 相当）：true かつ
// 対象が worktree グループの本体なら、束ねられた worktree も連鎖して閉じる。**省略可**——
// `z.boolean().default(false)` にすると `z.infer` の TS 型で必須フィールドになり、既存の呼び出し元
// （例: `packages/cli/src/commands/workspace.ts`）が型エラーになる（タスク点検の指摘）。既定は
// `SessionService.closeWorkspace(id, closeLinkedWorktrees = false)` 側の JS 既定引数が担う。
export const WorkspaceCloseParams = z.object({ workspaceId, closeLinkedWorktrees: z.boolean().optional() });
export type WorkspaceCloseParams = z.infer<typeof WorkspaceCloseParams>;

// --- workspace のグルーピングと並べ替え（20260923-workspace-grouping） --------------------------

// キーバインド用（delta 指定。tab.move と同じ形）。値は tabMoveDirection と同じだが、
// 対象の種類が違う（tab ではなく workspace）ので別の const として持つ——スキーマの意味を
// 「tab の方向」に固定させないため。
const workspaceMoveDirection = z.enum(["previous", "next"]);
export const WorkspaceMoveParams = z.object({ workspaceId, direction: workspaceMoveDirection });
export type WorkspaceMoveParams = z.infer<typeof WorkspaceMoveParams>;

// D&D 用（anchor 指定）。`workspaceIds` が複数なら、グループの一括移動（herdr の
// `WorkspaceMoveBlockParams` 相当）。単一なら通常の1件ドラッグ。
export const WorkspaceMoveToParams = z.object({
  workspaceIds: z.array(workspaceId).min(1),
  beforeWorkspaceId: workspaceId.nullable(), // null なら末尾へ
});
export type WorkspaceMoveToParams = z.infer<typeof WorkspaceMoveToParams>;

// `workspaceId`（20261004-group-worktree-items）: その workspace の項目を新しいグループへ入れる。**省略可**
// （古い呼び出し元の `{label}` だけが通る。古いサーバはこのキーを黙って落とす）。
export const GroupCreateParams = z.object({ label: z.string().min(1), workspaceId: workspaceId.optional() });
export type GroupCreateParams = z.infer<typeof GroupCreateParams>;
export interface GroupCreateResult {
  group: WorkspaceGroup;
}

export const GroupRenameParams = z.object({ groupId, label: z.string().min(1) });
export type GroupRenameParams = z.infer<typeof GroupRenameParams>;

export const GroupDeleteParams = z.object({ groupId }); // メンバーは外れるだけ（消えない）
export type GroupDeleteParams = z.infer<typeof GroupDeleteParams>;

export const GroupAddMemberParams = z.object({ groupId, workspaceId });
export type GroupAddMemberParams = z.infer<typeof GroupAddMemberParams>;

export const GroupRemoveMemberParams = z.object({ workspaceId }); // 現在のグループから外す
export type GroupRemoveMemberParams = z.infer<typeof GroupRemoveMemberParams>;

// 折りたたみ状態の切り替え（decisions.md D7。design のデータ構造〔WorkspaceGroup.collapsed〕には
// あったが、それを変更する RPC が design に無かったための追加）。**値を渡さずサーバに反転させる**
// （タスク点検の指摘：クライアントが今の値を読んで反転して送る形だと、応答が返る前に連続で
// 呼ばれたとき〔すばやい2回クリック〕両方が同じ古い値から同じ反転値を送ってしまい、2回目が
// 効かなくなる。`pane.zoom` の `mode: "toggle"` と同じ「サーバに決めさせる」考え方に揃えた）。
export const GroupToggleCollapsedParams = z.object({ groupId });
export type GroupToggleCollapsedParams = z.infer<typeof GroupToggleCollapsedParams>;

// --- 項目単位の並べ替え（20261004-group-worktree-items） ---------------------------------------

export const ItemTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("group"), groupId }),
  z.object({ kind: z.literal("workspace"), workspaceId }),
  z.object({ kind: z.literal("ungrouped") }),
]);
// 同じ入れ物の中で `before` の前へ。null は末尾。入れ物が違う・自分自身などは `{moved:false}`（エラーにしない）。
export const ItemMoveParams = z.object({ item: ItemTargetSchema, before: ItemTargetSchema.nullable() });
export type ItemMoveParams = z.infer<typeof ItemMoveParams>;
// 同じ入れ物の中で 1 つ動かす。端では動かない（`{moved:false}`）。
export const ItemMoveByParams = z.object({ item: ItemTargetSchema, direction: z.enum(["previous", "next"]) });
export type ItemMoveByParams = z.infer<typeof ItemMoveByParams>;
export interface ItemMoveResult {
  moved: boolean;
}

// 保存・配信で受ける `SidebarLayout` の形（未知のキーは落とす。項目の参照の中身は問わない）。
export const SidebarLayoutSchema = z.object({
  top: z.array(z.string()),
  groups: z.record(z.string(), z.array(z.string())),
  ungrouped: z.array(z.string()),
});

// --- tab ------------------------------------------------------------------

export const TabCreateParams = z.object({
  /** 呼び出し元の pane（pane の中の sodactl が名乗る）。グラフの自動載せの関係の記録にだけ使う。実在しなければ無視する。 */
  callerPaneId: paneId.optional(),
  workspaceId: workspaceId.optional(),
  label: z.string().optional(),
  newCwd: NewCwd.optional(),
});
export type TabCreateParams = z.infer<typeof TabCreateParams>;
export interface TabCreateResult extends CwdFallbackResult {
  tab: Tab;
  pane: Pane;
}

export const TabRenameParams = z.object({ tabId, label: z.string().min(1) });
export type TabRenameParams = z.infer<typeof TabRenameParams>;

export const TabFocusParams = z.object({ tabId });
export type TabFocusParams = z.infer<typeof TabFocusParams>;

export const TabCloseParams = z.object({ tabId });
export type TabCloseParams = z.infer<typeof TabCloseParams>;

// `tab.move`（20260923-missing-keybinding-actions。herdr の move_tab_previous/move_tab_next 相当）：
// 対象 tab を同じ workspace 内で隣（巡回込み）と入れ替える。結果は `workspace.updated` で配る
// （`tab.rename`/`tab.close` と同じ「空の成功応答＋イベントで実体を配る」形）。
export const TabMoveParams = z.object({ tabId, direction: tabMoveDirection });
export type TabMoveParams = z.infer<typeof TabMoveParams>;

// --- pane -------------------------------------------------------------------

export const PaneSplitParams = z.object({
  /** 呼び出し元の pane（pane の中の sodactl が名乗る）。グラフの自動載せの関係の記録にだけ使う。実在しなければ無視する。 */
  callerPaneId: paneId.optional(),
  paneId,
  direction: splitDirection,
  ratio: z.number().min(0.05).max(0.95).optional(),
  newCwd: NewCwd.optional(),
});
export type PaneSplitParams = z.infer<typeof PaneSplitParams>;
export interface PaneSplitResult extends CwdFallbackResult {
  pane: Pane;
}

export const PaneCloseParams = z.object({ paneId });
export type PaneCloseParams = z.infer<typeof PaneCloseParams>;

export const PaneFocusParams = z.object({ paneId });
export type PaneFocusParams = z.infer<typeof PaneFocusParams>;

export const PaneRenameParams = z.object({ paneId, label: z.string().nullable() });
export type PaneRenameParams = z.infer<typeof PaneRenameParams>;

export const PaneFocusDirectionParams = z.object({ paneId, direction: dir });
export type PaneFocusDirectionParams = z.infer<typeof PaneFocusDirectionParams>;
export interface PaneFocusDirectionResult {
  paneId: string;
}

export const PaneSwapParams = z.object({ paneId, direction: dir });
export type PaneSwapParams = z.infer<typeof PaneSwapParams>;
export interface PaneSwapResult {
  paneId: string;
}

/**
 * 任意の2つの pane を入れ替える（20260923-pane-name-dnd-swap。ドラッグでの入れ替え用）。
 * 既存の `pane.swap`（方向ベース。隣接する pane のみ）とは別方式——キーボード操作の意味を変えない
 * ため（decisions.md D4）。
 */
export const PaneSwapWithParams = z.object({ paneId, otherPaneId: paneId });
export type PaneSwapWithParams = z.infer<typeof PaneSwapWithParams>;
export interface PaneSwapWithResult {
  /** 同一 tab でない・同じ pane 同士等、何も起きなかったときは false（design「エラー処理」）。 */
  ok: boolean;
}

/**
 * 既存の pane（`paneId`）を、別の pane（`targetPaneId`）の縁へ移して分割する
 * （20260924-pane-dnd-split-move。ドラッグでの分割用）。新しい pane は作らない
 * （`pane.split` は新しい PTY を作るのに対し、こちらは既存の pane を動かすだけ。design「対象範囲」）。
 */
export const PaneMoveToEdgeParams = z.object({ paneId, targetPaneId: paneId, edge: z.enum(["top", "bottom", "left", "right"]) });
export type PaneMoveToEdgeParams = z.infer<typeof PaneMoveToEdgeParams>;
export interface PaneMoveToEdgeResult {
  /** 自分自身・同一 tab でない等、何も起きなかったときは false（design「エラー処理」）。 */
  ok: boolean;
}

/**
 * `paneId`（ドラッグした pane。生き残る）が `targetPaneId`（ドロップ先。閉じる）の位置と
 * スペースを引き継ぐ（20260924-pane-dnd-split-move。ドラッグでの分割解除用）。`targetPaneId` の
 * プロセスは実際に終了する（design「振る舞いの詳細」）。
 */
export const PaneReplaceParams = z.object({ paneId, targetPaneId: paneId });
export type PaneReplaceParams = z.infer<typeof PaneReplaceParams>;
export interface PaneReplaceResult {
  /** 自分自身・同一 tab でない等、何も起きなかったときは false（design「エラー処理」）。 */
  ok: boolean;
}

/**
 * 既存の pane（`paneId`）を、別の tab（`targetTabId`）へ移す（20260924-pane-move-cross-tab。
 * ドラッグで tab バーの tab へドロップする用）。対象 tab の focus 中の pane の右へ split で
 * 加わる（design「振る舞いの詳細」）。新しい pane は作らない。
 */
export const PaneMoveToTabParams = z.object({ paneId, targetTabId: tabId });
export type PaneMoveToTabParams = z.infer<typeof PaneMoveToTabParams>;
export interface PaneMoveToTabResult {
  /** 自分自身の tab・存在しない tab 等、何も起きなかったときは false（design「エラー処理」）。 */
  ok: boolean;
}

/**
 * 既存の pane（`paneId`）を、別の workspace（`targetWorkspaceId`）の新しい tab へ移す
 * （20260924-pane-move-cross-tab。ドラッグでサイドバーの workspace 行へドロップする用）。
 */
export const PaneMoveToNewTabParams = z.object({ paneId, targetWorkspaceId: workspaceId });
export type PaneMoveToNewTabParams = z.infer<typeof PaneMoveToNewTabParams>;
export interface PaneMoveToNewTabResult {
  /** 存在しない workspace 等、何も起きなかったときは false（design「エラー処理」。同一
   *  workspace への移動〈新しい tab へ切り出す〉は有効な操作として許容する）。 */
  ok: boolean;
  /** 作られた新しい tab（ok=false のときは無い）。 */
  tab?: Tab;
}

export const PaneZoomParams = z.object({ paneId, mode: zoomMode });
export type PaneZoomParams = z.infer<typeof PaneZoomParams>;

export const PaneResizeParams = z.object({ paneId, direction: dir, amount: z.number() });
export type PaneResizeParams = z.infer<typeof PaneResizeParams>;

export const PaneInputSetParams = z.object({ paneId, rightClick: rightClickTarget });
export type PaneInputSetParams = z.infer<typeof PaneInputSetParams>;

// 20260926-edit-scrollback（herdr の pane.edit_scrollback）。一時ファイルのパスやエディタはサーバが決め、ここでは受け取らない。
export const PaneEditScrollbackParams = z.object({ paneId });
export type PaneEditScrollbackParams = z.infer<typeof PaneEditScrollbackParams>;
export interface PaneEditScrollbackResult {
  pane: Pane;
}

// 20260927-clipboard-image-paste（herdr の remote_image_paste）。画像を分けて送る（decisions D3）。置き場所・名前はサーバが決め、ここでは受け取らない。
// `size` の上限はスキーマに置かない——超えたら `image_too_large` で断る（`invalid_params` では利用者に理由を示せない）。
const uploadId = z.string().min(1).max(64);
export const PaneImageBeginParams = z.object({ paneId, mime: z.enum(IMAGE_MIME_TYPES), size: z.number().int().min(1) });
export type PaneImageBeginParams = z.infer<typeof PaneImageBeginParams>;
export interface PaneImageBeginResult {
  uploadId: string;
}
export const PaneImageChunkParams = z.object({
  uploadId,
  offset: z.number().int().min(0),
  data: z
    .string()
    .min(4)
    .max(IMAGE_CHUNK_BASE64_MAX)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine((s) => s.length % 4 === 0, "base64 length must be a multiple of 4"),
});
export type PaneImageChunkParams = z.infer<typeof PaneImageChunkParams>;
export const PaneImageCommitParams = z.object({ uploadId });
export type PaneImageCommitParams = z.infer<typeof PaneImageCommitParams>;
/** 送信を途中でやめる（ブラウザ側の失敗。サーバの送信の枠を時間切れを待たずに空ける）。知らない id でも成功。 */
export const PaneImageCancelParams = z.object({ uploadId });
export type PaneImageCancelParams = z.infer<typeof PaneImageCancelParams>;
export interface PaneImageCommitResult {
  /** サーバ（pane のマシン）に置いた画像の絶対パス。ブラウザは `isPastablePath` で確かめてから貼る。 */
  path: string;
}

// --- 質問のフォーム（`sodactl ask`。ask.ts）-----------------------------------------------------
// 定義・回答はイベントに載せない（全接続に届くため）。イベントは id だけで、中身は `ask.subscribe`・`ask.get` した画面にだけ返す。
const askId = z.string().min(1).max(ASK_ASKID_MAX);
const askAnswerText = z.string().max(ASK_ANSWER_TEXT_MAX);
/** pane のプログラムが質問を出して結果を待つ。結果が決まるまで応答しない（長い要求）。定義の中身は handler の `normalizeAskSpec` が見る。 */
export const AskOpenParams = z.object({
  paneId,
  spec: z.record(z.string(), z.unknown()),
  timeoutMs: z.number().int().min(ASK_TIMEOUT_MIN_MS).max(ASK_TIMEOUT_MAX_MS),
});
export type AskOpenParams = z.infer<typeof AskOpenParams>;
/** この接続を「質問を出せる画面」として登録し、いま待っている質問を受け取る（接続のたびに呼ぶ）。 */
export const AskSubscribeParams = z.object({});
export type AskSubscribeParams = z.infer<typeof AskSubscribeParams>;
export interface AskSubscribeResult {
  asks: AskPending[];
}
export const AskGetParams = z.object({ askId });
export type AskGetParams = z.infer<typeof AskGetParams>;
export const AskAnswerParams = z.object({
  askId,
  // id の長さは定義の検査（`normalizeAskSpec`）がコードポイントで数えるので、ここは UTF-16 の単位（最大で 2 倍）の余裕を持たせる。実際の照合は `checkAskAnswer`（定義の id との一致）。
  answers: z.record(
    z.string().max(ASK_ID_MAX * 2),
    z.union([
      askAnswerText,
      z.array(askAnswerText).max(ASK_OPTIONS_MAX + 1),
      // table: {行の value: 選んだ value}。行の数は選択肢と同じ上限。
      z.record(z.string().max(ASK_ID_MAX * 2), z.string().max(ASK_ID_MAX * 2)).refine((o) => Object.keys(o).length <= ASK_OPTIONS_MAX, "too many rows"),
    ]),
  ),
  custom: z.array(z.string().max(ASK_ID_MAX * 2)).max(ASK_QUESTIONS_MAX).optional(),
  edited: z.array(z.string().max(ASK_ID_MAX * 2)).max(ASK_QUESTIONS_MAX).optional(),
  note: askAnswerText.optional(),
  // 質問ごとの自由記述。キーの数は `checkAskAnswer`（見えている質問にあること）で質問の数以内に収まる。長さの合計の上限も `checkAskAnswer`。
  comments: z.record(z.string().max(ASK_ID_MAX * 2), askAnswerText).optional(),
});
export type AskAnswerParams = z.infer<typeof AskAnswerParams>;
export const AskCancelParams = z.object({ askId });
export type AskCancelParams = z.infer<typeof AskCancelParams>;
/** メディアの 1 片を取る（`ask.subscribe` 済みの画面だけ）。`id` は `AskPending.media` の id、`offset` は生のバイトの位置（`ASK_MEDIA_CHUNK_BYTES` の倍数）。 */
export const AskMediaParams = z.object({
  askId,
  id: z.number().int().min(0).max(ASK_MEDIA_FILES_MAX - 1),
  offset: z.number().int().min(0),
});
export type AskMediaParams = z.infer<typeof AskMediaParams>;
export interface AskMediaResult {
  /** この片（base64。生のバイトは `ASK_MEDIA_CHUNK_BYTES` まで。最後の片以外は 3 の倍数なので文字列のまま連結できる）。 */
  base64: string;
  /** メディア全体の生のバイト数。 */
  size: number;
  /** この片が最後か。 */
  eof: boolean;
}
/** 機能確認（引数なし）。古いサーバは `not_found`（知らない方式）を返す。 */
export const AskFeaturesParams = z.object({});
export type AskFeaturesParams = z.infer<typeof AskFeaturesParams>;
// --- 表示の面（`sodactl display`。display.ts）---------------------------------------------------
// 検査の本体は display.ts の `checkDisplaySet`・`checkDisplayAction`（サーバ・sodactl・ブラウザが同じものを使う）。zod は形の粗い検査だけ。
// `display.set` の中身は、規則の外を `invalid_display`（`display.set` 以外の形の誤りは `invalid_params`）にするため、ここでは型を問わない。
const displayId = z.string().min(1).max(64);
const displayName = z.string().regex(DISPLAY_NAME_RE);
/** `set` の中身（`paneId` を除く）の欄。型の検査は `checkDisplaySet`。 */
const displaySetFields = {
  name: z.unknown().optional(),
  kind: z.unknown().optional(),
  format: z.unknown().optional(),
  content: z.unknown().optional(),
  title: z.unknown().optional(),
  size: z.unknown().optional(),
  ttlMs: z.unknown().optional(),
};
const displayCloseFields = { name: displayName.optional(), all: z.boolean().optional() };
const displayCloseOneOf = (v: { name?: string | undefined; all?: boolean | undefined }): boolean => (v.name !== undefined) !== (v.all === true);
const displayCloseMessage = "exactly one of name or all:true is required";
const displayWaitFields = {
  since: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  epoch: z.string().min(1).max(64).optional(),
  names: z.array(displayName).max(DISPLAY_WAIT_NAMES_MAX).optional(),
  timeoutMs: z.number().int().min(DISPLAY_WAIT_MIN_MS).max(DISPLAY_WAIT_MAX_MS),
};
/** 面を出す・更新する。 */
export const DisplaySetParams = z.object({ paneId, ...displaySetFields });
export type DisplaySetParams = z.infer<typeof DisplaySetParams>;
/** 面を閉じる（`name` か `all: true` のどちらか 1 つ）。 */
export const DisplayCloseParams = z.object({ paneId, ...displayCloseFields }).refine(displayCloseOneOf, displayCloseMessage);
export type DisplayCloseParams = z.infer<typeof DisplayCloseParams>;
export const DisplayListParams = z.object({ paneId });
export type DisplayListParams = z.infer<typeof DisplayListParams>;
/** 出来事を待つ（長い要求。次の出来事か `timeoutMs` まで応答しない）。 */
export const DisplayWaitParams = z.object({ paneId, ...displayWaitFields });
export type DisplayWaitParams = z.infer<typeof DisplayWaitParams>;
/** 機能確認（引数なし）。古いサーバは `not_found`（知らない方式）を返す。 */
/** スクリプトが動く面へデータを送る。`data` は JSON の値（64 KiB までの検査は `checkDisplaySend`）。 */
export const DisplaySendParams = z.object({ paneId, name: displayName, data: z.unknown() });
export type DisplaySendParams = z.infer<typeof DisplaySendParams>;
export const DisplayFeaturesParams = z.object({});
export type DisplayFeaturesParams = z.infer<typeof DisplayFeaturesParams>;
/** この接続を「面を出せる画面」として登録し、全 pane の面の見出しを受け取る（接続のたびに呼ぶ）。`features` の知らない値はサーバが捨てる。 */
export const DisplaySubscribeParams = z.object({ features: z.array(z.string().max(64)).max(DISPLAY_RENDER_FEATURES_MAX) });
export type DisplaySubscribeParams = z.infer<typeof DisplaySubscribeParams>;
export interface DisplaySubscribeResult {
  displays: DisplayInfo[];
}
/** 中身の 1 片を取る（名乗った接続だけ）。`offset` は 0 か `DISPLAY_GET_CHUNK_BYTES` の倍数（倍数の検査はサーバ）。 */
export const DisplayGetParams = z.object({ id: displayId, offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });
export type DisplayGetParams = z.infer<typeof DisplayGetParams>;
/** 利用者の操作を、待っているプログラムへ届ける（名乗った接続だけ）。操作の名前・値の規則と `rev` の範囲はサーバが `checkDisplayAction` などで見る。 */
export const DisplayActionParams = z.object({
  id: displayId,
  rev: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  action: z.string().max(256),
  data: z.record(z.string().max(256), z.unknown()).optional(),
});
export type DisplayActionParams = z.infer<typeof DisplayActionParams>;
/** 利用者が面を閉じる（`id` の 1 つか、`paneId` の pane の全部のどちらか 1 つ）。 */
export const DisplayDismissParams = z.object({ id: displayId.optional(), paneId: paneId.optional() }).refine((v) => (v.id !== undefined) !== (v.paneId !== undefined), "exactly one of id or paneId is required");
export type DisplayDismissParams = z.infer<typeof DisplayDismissParams>;
/**
 * 画面が、枠の異常（別のページへ移った・応答しない）を知らせる。その面を閉じる。
 * `paneId`・`format` は、画面が描いていた枠のもの（任意。サーバは、面がもう無い・形式が替わっているときの数え方に使う）。
 */
export const DisplayReportParams = z.object({
  id: displayId,
  problem: z.enum(DISPLAY_REPORT_PROBLEMS),
  paneId: paneId.optional(),
  format: z.string().max(64).optional(),
});
export type DisplayReportParams = z.infer<typeof DisplayReportParams>;
/** `display.report` の結果。`steals` は `focus_steal` のとき、その pane の今の取られた回数。 */
export interface DisplayReportResult {
  closed: string[];
  steals?: number;
}
export interface DisplaySendResult {
  /** `script-html` を出せると名乗った画面の数（0 でも成功）。 */
  delivered: number;
}
export interface DisplayClosedResult {
  /** 閉じた面の名前（無ければ空）。 */
  closed: string[];
}
export interface DisplayListResult {
  displays: DisplayInfo[];
  /** その pane の出来事の今の通し番号。`events` が、`display.ready` の後の出来事を落とさないよう、ここから待つ。 */
  seq: number;
  /** サーバの起動ごとの印（`seq` と同じサーバのもの）。 */
  epoch: string;
}

/** 受け口（`pane.sock`）の引数: 対象の pane は要求の外側の `paneId` で、引数には持たない。`paneId` を載せたら `invalid_params`（strict）。 */
export const PaneDisplaySetParams = z.strictObject(displaySetFields);
export type PaneDisplaySetParams = z.infer<typeof PaneDisplaySetParams>;
export const PaneDisplayCloseParams = z.strictObject(displayCloseFields).refine(displayCloseOneOf, displayCloseMessage);
export type PaneDisplayCloseParams = z.infer<typeof PaneDisplayCloseParams>;
export const PaneDisplayListParams = z.strictObject({});
export type PaneDisplayListParams = z.infer<typeof PaneDisplayListParams>;
export const PaneDisplayWaitParams = z.strictObject(displayWaitFields);
export type PaneDisplayWaitParams = z.infer<typeof PaneDisplayWaitParams>;
export const PaneDisplaySendParams = z.strictObject({ name: displayName, data: z.unknown() });
export type PaneDisplaySendParams = z.infer<typeof PaneDisplaySendParams>;
export const PaneDisplayFeaturesParams = z.strictObject({});
export type PaneDisplayFeaturesParams = z.infer<typeof PaneDisplayFeaturesParams>;

// 端末のファイルのリンクとドロップ（`file.ts`）。ブラウザ版はローカルのファイルに触れないので、サーバ越しに確かめる・開く・受け取る・送る。
const filePath = z.string().min(1).max(FILE_PATH_MAX);
/** この接続から見たサーバ（リンクを開く方法・ドロップの扱いを「自動」で決める材料）。 */
export const FileInfoParams = z.object({});
export type FileInfoParams = z.infer<typeof FileInfoParams>;
export interface FileInfoResult {
  /**
   * この接続がサーバと同じマシンから来ているか（接続の両端のアドレスで見る。`ssh -L`・ポート転送・コンテナのポートの公開・同じマシンの上の
   * リバースプロキシの後ろでは、別のマシンのブラウザも同じマシンに見える——ブラウザの設定で上書きできる）。中継の接続は常に false。
   */
  sameMachine: boolean;
  /** サーバのマシンでファイルを開く手段（画面と、既定のアプリで開くコマンド）があるか。 */
  canOpen: boolean;
}
/** パスが実在するか確かめる。相対パス・`~` はその pane の今の場所・サーバの利用者のホームから解く。結果は `paths` と同じ並び（無ければ null）。 */
export const FileResolveParams = z.object({ paneId, paths: z.array(filePath).min(1).max(FILE_RESOLVE_MAX_PATHS) });
export type FileResolveParams = z.infer<typeof FileResolveParams>;
export interface FileResolveResult {
  files: (ResolvedFile | null)[];
}
/** サーバのマシンの既定のアプリで開く（`path` は絶対パス）。 */
export const FileOpenParams = z.object({ path: filePath });
export type FileOpenParams = z.infer<typeof FileOpenParams>;
/** ファイルの `offset` から 1 片（`FILE_CHUNK_BYTES` まで）を読む（`path` は絶対パス）。ブラウザは `size`・`mtimeMs` が途中で変わらないことを確かめる。 */
export const FileReadParams = z.object({ path: filePath, offset: z.number().int().min(0) });
export type FileReadParams = z.infer<typeof FileReadParams>;
export interface FileReadResult {
  /** base64。 */
  data: string;
  size: number;
  mtimeMs: number;
}
// ドロップしたファイルを分けて送る。置き場所はサーバが決める（状態ディレクトリの下）。名前はサーバが `sanitizeFileName` で直して使う。
// `size` の上限はスキーマに置かない——超えたら `file_too_large` で断る（画像と同じ）。
export const FileUploadBeginParams = z.object({ paneId, name: z.string().min(1).max(FILE_NAME_INPUT_MAX), size: z.number().int().min(0) });
export type FileUploadBeginParams = z.infer<typeof FileUploadBeginParams>;
export interface FileUploadBeginResult {
  uploadId: string;
}
export const FileUploadChunkParams = z.object({
  uploadId,
  offset: z.number().int().min(0),
  data: z
    .string()
    .min(4)
    .max(FILE_CHUNK_BASE64_MAX)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine((s) => s.length % 4 === 0, "base64 length must be a multiple of 4"),
});
export type FileUploadChunkParams = z.infer<typeof FileUploadChunkParams>;
export const FileUploadCommitParams = z.object({ uploadId });
export type FileUploadCommitParams = z.infer<typeof FileUploadCommitParams>;
/** 送信を途中でやめる（書きかけを消す）。知らない id でも成功。 */
export const FileUploadCancelParams = z.object({ uploadId });
export type FileUploadCancelParams = z.infer<typeof FileUploadCancelParams>;
export interface FileUploadCommitResult {
  /** サーバ（pane のマシン）に置いたファイルの絶対パス。ブラウザは `isPastablePath` で確かめてから貼る。 */
  path: string;
}

// --- layout -----------------------------------------------------------------

export const LayoutSetSplitRatioParams = z.object({
  tabId,
  splitId,
  ratio: z.number().min(0.05).max(0.95),
});
export type LayoutSetSplitRatioParams = z.infer<typeof LayoutSetSplitRatioParams>;

// --- registry (params の型から result の型を引くための対応表) ---------------

// --- worktree（20260920-git-worktree-actions）---------------------------

/**
 * `worktree.list` は**「開く」と「作る」の両方の入口**（herdr と同じ）。
 * 作るときも先に呼ぶのは、パスのプレビューに `worktreeRoot` と `repoName` が要るため。
 */
export const WorktreeListParams = z.object({ workspaceId });
export type WorktreeListParams = z.infer<typeof WorktreeListParams>;
export interface WorktreeListResult {
  /** 作成先の根（`/` 区切りに正規化済み）。 */
  worktreeRoot: string;
  /** 作成先の 2 段目に使うリポジトリの名前。 */
  repoName: string;
  /** 自動生成したブランチ名の候補（入力欄の初期値）。 */
  suggestedBranch: string;
  entries: WorktreeEntry[];
}

/** 作るだけで workspace は開かない（開くのは `workspace.create` の仕事）。 */
export const WorktreeCreateParams = z.object({ workspaceId, branch: z.string().min(1) });
export type WorktreeCreateParams = z.infer<typeof WorktreeCreateParams>;
export interface WorktreeCreateResult {
  /** 作られた作業ツリーのパス。呼び出し側はここを cwd に `workspace.create` する。 */
  path: string;
}

/**
 * 既にある worktree checkout を消す（20260924-worktree-remove）。`workspaceId` は削除対象では
 * なく、実行場所（repo root）を解決するための操作元の workspace——`path` が削除対象
 * （`WorktreeEntry.path`）。対象が現在開いている workspace の cwd と一致すれば、成功後に
 * その workspace も自動的に閉じる（design「振る舞いの詳細」）。
 */
export const WorktreeRemoveParams = z.object({ workspaceId, path: z.string().min(1), force: z.boolean().optional() });
export type WorktreeRemoveParams = z.infer<typeof WorktreeRemoveParams>;

// --- agent integration（20260923-agent-session-resume。6つ追加: 20260923-other-agents-session-resume）---

/** `model.ts` の `AgentIntegrationKind` と値を揃える（別の型なので同期がずれないよう並びも揃える）。 */
const agentIntegrationKind = z.enum(["claude", "codex", "cursor", "copilot", "devin", "droid", "grok", "qwen", "qodercli"]);

// --- session の一覧（20260926-named-session-ui。herdr の `session list` を画面から）------------------

/** 同じ session の根の session の一覧（認証済みの接続だけ。token・パスは返さない）。 */
export const ServerSessionsParams = z.object({});
export type ServerSessionsParams = z.infer<typeof ServerSessionsParams>;
export interface ServerSessionsResult {
  sessions: ServerSessionEntry[];
}

// --- 保存した SSH のマシン（20260927-multi-host-machines）---------------------------------------------

/** 手元の `soda serve` の、有効なマシンの一覧と状態（登録の順）。変化は `machine.changed` でも配る。 */
export const MachineListParams = z.object({});
export type MachineListParams = z.infer<typeof MachineListParams>;
export interface MachineListResult {
  machines: MachineStatus[];
}

// --- 設定の共有とサーバの停止（20260927-cli-mode。design「インターフェース / データ構造」protocol）-----------------

/** `prefs.set` の `patch` と、保存した設定全体の JSON の大きさの上限（バイト。超えたら `invalid_params`）。 */
export const PREFS_MAX_BYTES = 256 * 1024;

/**
 * 端末版の節（`SharedPrefs.tui`。外側の端末向けの好み。どの端末版でも同じ値を使ってよいので共有する）。
 * 型は「行儀のよいクライアントが書く形」。**読む側は型を信じずに正規化する**（web の `load*` と同じく、壊れた値は既定へ落とす）。
 */
export interface SharedTuiPrefs {
  mouseCapture?: boolean;
  copyOnSelect?: boolean;
  notifyDelivery?: "auto" | "osc9" | "osc99" | "osc777" | "bell" | "off";
  /** サイドバーの既定の幅（列）。 */
  sidebarCols?: number;
  /** 1 列表示に切り替える幅（列）。 */
  narrowThreshold?: number;
  [key: string]: unknown;
}

/**
 * 共有する設定（web の `soda.prefs.v1` から端末ごとの項目〔`DEVICE_LOCAL_PREF_KEYS`〕を除いたもの）。型は web が書く形
 * （`packages/web/src/store/{settings,view,notifications,onboarding}.ts` の保存の形。中身の細かい形は client-core の各 `load*`・`serialize*` が持つ）。
 * **型は約束であって検査ではない**——サーバは値の形を問わずに保存し（下のスキーマ）、版の違うクライアントが混ざると知らない項目・壊れた値も届くので、
 * 読む側は必ず `load*` で正規化する。
 */
export interface SharedPrefs {
  /** キーの割り当て（client-core の `serializeKeyPrefs` の形。既定との差だけ）。 */
  keys?: Record<string, unknown>;
  theme?: ThemeName;
  themeAuto?: boolean;
  themeLight?: ThemeName | null;
  themeDark?: ThemeName | null;
  /** 色の上書き（web の `serializeThemeOverrides` の形）。 */
  themeOverrides?: Record<string, unknown>;
  statusSymbols?: boolean;
  keyboardLockInFullscreen?: boolean;
  paneFrameThickness?: "thin" | "default" | "thick";
  paneAgentNameVisible?: boolean;
  tabBarPosition?: "top" | "bottom";
  /** tab バーの右端（client-core の `TabBarRightEntry[]`）。 */
  tabBarRight?: unknown[];
  tabBarRightSeparator?: string;
  paneOuterBorders?: boolean;
  paneBorders?: "always" | "auto" | "off";
  paneGaps?: boolean;
  /** サイドバーの行の並び（client-core の `serializeSidebarRows` の形）。 */
  sidebarRows?: Record<string, unknown>;
  scrollback?: "auto" | number;
  newCwdPolicy?: NewCwd["policy"];
  newCwdPath?: string;
  /**
   * Windows で pane のシェル（PowerShell・cmd）にプロンプトのたびに場所を知らせる設定を差し込むか（20260928-windows-pane-cwd の D-6）。
   * 既定は入（boolean でなければ入）。サーバが pane を開くたびに読む（次に開く pane から効く）。
   */
  shellCwdTracking?: boolean;
  /**
   * スクリプトが動く表示（`script-html`。`sodactl display`）を出せるか（20261007-soda-extensions。利用者の決定）。**既定は無効**（`true` のときだけ有効。サーバも web も同じ規則で読む）。
   * サーバが `DisplayService` の `set`・`send` で見る。有効 → 無効にすると、出ている `script-html` の面は全部閉じる（理由 `script_disabled`）。
   * `prefs.set`（ログイン済みの接続）でだけ変えられ、`pane.sock` からは変えられない。
   */
  displayScriptEnabled?: boolean;
  notify?: { toast?: boolean; desktop?: boolean; sound?: boolean };
  notifyHintPending?: boolean;
  notifyHintDone?: boolean;
  agentSort?: "grouped" | "priority";
  workspaceSort?: "opened" | "name";
  collapsedAutoGroups?: string[];
  /** 「グループなし」の見出しを畳んでいるか（共有。端末ごとの設定ではない。追補 01 B）。 */
  ungroupedCollapsed?: boolean;
  onboarding?: boolean;
  tui?: SharedTuiPrefs;
  /** 知らない項目（新しい版のクライアントが書いたもの）も捨てずに持つ。 */
  [key: string]: unknown;
}

/**
 * `SharedPrefs` の実行時のスキーマ。**値の形はサーバで問わない**（オブジェクトであることだけ）——読む側が正規化するので、版の違うクライアントが混ざっても
 * 知らない項目・知らない値を捨てずに保存する（`passthrough`）。キー `__proto__` は zod が落とす（プロトタイプを差し替えない）。型は上の `SharedPrefs` として
 * 扱う（形を確かめていないので、`as` で型だけを付ける。読む側の正規化が前提）。
 */
export const SharedPrefs = z.object({ tui: z.object({}).passthrough().optional() }).passthrough() as unknown as z.ZodType<SharedPrefs>;

/** 端末ごとに持ち、共有しない項目（web の localStorage に残す。design「設定」）。 */
export const DEVICE_LOCAL_PREF_KEYS = [
  "sidebarWidth",
  "sidebarCollapsed",
  "fileLocality",
  "sidebarSectionRatio",
  "sidebarSectionsCollapsed",
  // 表示の面（パネル）の幅（pane の id → px）。pane の id はマシンごとに違うので共有しない（20261007-soda-extensions）。
  "displayPanelWidths",
] as const;

/** 共有の設定を読む。`rev` は保存のたびに +1（0 = サーバが一度も保存していない。web の初回の移行の目印）。 */
export const PrefsGetParams = z.object({});
export type PrefsGetParams = z.infer<typeof PrefsGetParams>;
export interface PrefsResult {
  prefs: SharedPrefs;
  rev: number;
}

/**
 * 共有の設定を項目ごとに上書きする（浅いマージ。`keys` 等は項目ごとに丸ごと置き換え）。`baseRev` は送った側が見ていた rev（今は記録だけで拒まない。
 * 最後の書き込みが勝つ）。保存した後の全体が `PREFS_MAX_BYTES` を超えるならサーバが `invalid_params` で断る。
 */
export const PrefsSetParams = z.object({
  patch: SharedPrefs.refine((p) => jsonBytes(p) <= PREFS_MAX_BYTES, "prefs too large"),
  baseRev: z.number().int().min(0).optional(),
});
export type PrefsSetParams = z.infer<typeof PrefsSetParams>;

/** サーバを止める。応答を返してから通常の停止（SIGTERM・`soda session stop` と同じ手順）に入る。 */
export const ServerStopParams = z.object({});
export type ServerStopParams = z.infer<typeof ServerStopParams>;

export const AgentIntegrationStatusParams = z.object({});
export type AgentIntegrationStatusParams = z.infer<typeof AgentIntegrationStatusParams>;

/** 対象1エージェント分の状態（design「3. RPC 方式」）。 */
export interface AgentIntegrationStatus {
  /** PATH 上に実行ファイルが見つかるか（情報提供のみ。無くても導入操作は妨げない）。 */
  cliDetected: boolean;
  /** 対象の hooks 設定に本製品のフックが登録されているか（都度判定。design D4）。 */
  installed: boolean;
  /** 導入済みだが、本製品のフックが足りない・スクリプトが古い（［更新］で足せる）。無ければ false 扱い（20261004-subagent-display）。 */
  needsUpdate?: boolean;
}
export interface AgentIntegrationStatusResult {
  /** herdr の `resume_agents_on_restore` に相当（design D3）。 */
  autoResumeEnabled: boolean;
  agents: Record<AgentIntegrationKind, AgentIntegrationStatus>;
}

export const AgentIntegrationInstallParams = z.object({ kind: agentIntegrationKind });
export type AgentIntegrationInstallParams = z.infer<typeof AgentIntegrationInstallParams>;
export interface AgentIntegrationInstallResult {
  ok: boolean;
  /** 失敗理由、または「既に導入済みです」等の補足（無ければ null）。 */
  message: string | null;
}

export const AgentIntegrationUninstallParams = z.object({ kind: agentIntegrationKind });
export type AgentIntegrationUninstallParams = z.infer<typeof AgentIntegrationUninstallParams>;
export type AgentIntegrationUninstallResult = AgentIntegrationInstallResult;

export const AgentIntegrationSetAutoResumeParams = z.object({ enabled: z.boolean() });
export type AgentIntegrationSetAutoResumeParams = z.infer<typeof AgentIntegrationSetAutoResumeParams>;

// --- agent への入力（20260926-agent-prompt-send-keys。herdr の agent.prompt / agent.send_keys）---

/**
 * 本文の上限（UTF-8 のバイト数）。INPUT フレームの上限（server `WsGateway.ts` の MAX_INPUT_FRAME_BYTES）と同じ値。
 * RPC は JSON で運ぶので、制御文字の多い本文は JSON の上で膨らみ（1 文字 6 バイト）、WebSocket の上限（4MB）で先に切断されうる。
 */
export const MAX_AGENT_PROMPT_BYTES = 1024 * 1024;

/**
 * 空の本文はスキーマでは弾かない（サーバが `empty_agent_prompt` で返す。herdr と同じ code）。
 * `instanceId` を渡すと、その pane のエージェントがそれと違えば何も書かずに `agent_not_found`（呼び出し側が見た
 * エージェントから入れ替わっていたら送らない）。
 */
export const AgentPromptParams = z.object({
  paneId,
  instanceId: z.string().min(1).optional(),
  text: z.string().refine((t) => new TextEncoder().encode(t).byteLength <= MAX_AGENT_PROMPT_BYTES, "text too large"),
});
export type AgentPromptParams = z.infer<typeof AgentPromptParams>;
export interface AgentPromptResult {
  /** 送信を始める時点のエージェント。 */
  agent: AgentInfo;
}

export const AgentSendKeysParams = z.object({
  paneId,
  instanceId: z.string().min(1).optional(),
  keys: z.array(z.string()).min(1).max(256),
});
export type AgentSendKeysParams = z.infer<typeof AgentSendKeysParams>;

/**
 * 名前を付ける／外す（20260926-agent-start-rename。herdr の agent.rename）。`name: null` で外す。書式はスキーマでは弾かない
 * （サーバが `invalid_agent_name` で返す。herdr と同じ code）。`instanceId` の扱いは `AgentPromptParams` と同じ。
 */
export const AgentRenameParams = z.object({
  paneId,
  instanceId: z.string().min(1).optional(),
  name: z.string().nullable(),
});
export type AgentRenameParams = z.infer<typeof AgentRenameParams>;
export interface AgentRenameResult {
  /** 名前を変えた後のエージェント。 */
  agent: AgentInfo;
}

/**
 * 空いているシェル pane でエージェントを起動する（20260926-agent-start。herdr の agent.start）。名前の書式・kind・引数・timeout の範囲は
 * スキーマでは弾かない（サーバが herdr と同じ code で返す）。打ち込んだ時点で応答し、起動完了は呼び出し側がイベントで待つ。
 */
export const AgentStartParams = z.object({
  /** 呼び出し元の pane（pane の中の sodactl が名乗る）。グラフの自動載せの関係の記録にだけ使う。実在しなければ無視する。 */
  callerPaneId: paneId.optional(),
  name: z.string(),
  kind: z.string(),
  paneId,
  args: z.array(z.string()),
  timeoutMs: z.number().int().optional(),
});
export type AgentStartParams = z.infer<typeof AgentStartParams>;
export interface AgentStartResult {
  paneId: string;
  name: string;
  kind: string;
  /** 実行ファイルと引数（クォートする前）。 */
  argv: string[];
}

// --- 独自コマンド（20260927-custom-command-keys。herdr の `[[keys.command]]`） -----------------------------

/** 一覧（コマンドの文字列を含まない）。 */
export const CommandListParams = z.object({});
export type CommandListParams = z.infer<typeof CommandListParams>;
/** サーバの `commands.json` を読み直す（`reload_config` から送る）。結果は全クライアントへ `command.updated` でも配る。 */
export const CommandReloadParams = z.object({});
export type CommandReloadParams = z.infer<typeof CommandReloadParams>;
/**
 * 独自コマンドを走らせる。受け取るのは id・フォーカス中の pane の id・popup の端末の大きさ（ブラウザが pane の領域から決める）だけで、
 * **コマンドの文字列はブラウザから受け取らない**（サーバは id で `commands.json` の定義を引く）。宣言に無い項目は取り除かれる。
 */
export const CommandRunParams = z.object({
  commandId: z.string().regex(COMMAND_ID_RE),
  paneId,
  cols: z.number().int().min(POPUP_RUN_SIZE_MIN).max(POPUP_RUN_SIZE_MAX).optional(),
  rows: z.number().int().min(POPUP_RUN_SIZE_MIN).max(POPUP_RUN_SIZE_MAX).optional(),
});
export type CommandRunParams = z.infer<typeof CommandRunParams>;
/** 自分が開いた popup を閉じる（コマンドを止める）。 */
export const CommandPopupCloseParams = z.object({ popupId: paneId });
export type CommandPopupCloseParams = z.infer<typeof CommandPopupCloseParams>;

// --- 独自トークン（20260927-sidebar-row-tokens。herdr の workspace.report_metadata / pane.report_metadata） ----------------

/** 1 回の要求の組の数の上限（重複を除く前。大きさの抑え。整えた後の上限〔16〕はサーバが見る）。 */
export const METADATA_TOKEN_ENTRIES_MAX = 256;
/** `source`・`name`・`value` の生の長さ（整える前）の上限。値は 80 文字に切り詰めるので、これを超える値に意味は無い（decisions D7）。 */
export const METADATA_RAW_TEXT_MAX = 4096;

/**
 * 設定（`value` が文字列）か消去（`value: null`）の 1 組。**map ではなく配列**で受ける（decisions D7）——JSON のオブジェクトを zod の record で読むと、
 * キー `__proto__` が黙って消える。同じ名前は後の組が勝つ。
 */
const metadataTokenEntry = z.object({
  name: z.string().max(METADATA_RAW_TEXT_MAX),
  value: z.string().max(METADATA_RAW_TEXT_MAX).nullable(),
});
export type MetadataTokenEntry = z.infer<typeof metadataTokenEntry>;

/** 整え方・上限・`seq`・`ttlMs` の範囲の検査はサーバ（herdr と同じ code で返す）。スキーマは形と生の大きさだけを見る。 */
const metadataReport = {
  source: z.string().max(METADATA_RAW_TEXT_MAX),
  tokens: z.array(metadataTokenEntry).max(METADATA_TOKEN_ENTRIES_MAX),
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  ttlMs: z.number().int().optional(),
};

export const WorkspaceReportMetadataParams = z.object({ workspaceId, ...metadataReport });
export type WorkspaceReportMetadataParams = z.infer<typeof WorkspaceReportMetadataParams>;
export const PaneReportMetadataParams = z.object({ paneId, ...metadataReport });
export type PaneReportMetadataParams = z.infer<typeof PaneReportMetadataParams>;

export const METHOD_SCHEMAS = {
  "client.hello": ClientHelloParams,
  "client.view": ClientViewParams,
  "client.fit": ClientFitParams,
  "client.theme": ClientThemeParams,
  "client.detach": ClientDetachParams,
  "pane.subscribe": PaneSubscribeParams,
  "pane.unsubscribe": PaneUnsubscribeParams,
  "pane.attach": PaneAttachParams,
  "pane.attach_resize": PaneAttachResizeParams,
  "pane.detach": PaneDetachParams,
  "workspace.create": WorkspaceCreateParams,
  "workspace.rename": WorkspaceRenameParams,
  "workspace.focus": WorkspaceFocusParams,
  "workspace.close": WorkspaceCloseParams,
  "workspace.move": WorkspaceMoveParams,
  "workspace.move_to": WorkspaceMoveToParams,
  "workspace.report_metadata": WorkspaceReportMetadataParams,
  "group.create": GroupCreateParams,
  "group.rename": GroupRenameParams,
  "group.delete": GroupDeleteParams,
  "group.add_member": GroupAddMemberParams,
  "group.remove_member": GroupRemoveMemberParams,
  "group.toggle_collapsed": GroupToggleCollapsedParams,
  "item.move": ItemMoveParams,
  "item.move_by": ItemMoveByParams,
  "tab.create": TabCreateParams,
  "tab.rename": TabRenameParams,
  "tab.focus": TabFocusParams,
  "tab.close": TabCloseParams,
  "tab.move": TabMoveParams,
  "pane.split": PaneSplitParams,
  "pane.close": PaneCloseParams,
  "pane.focus": PaneFocusParams,
  "pane.rename": PaneRenameParams,
  "pane.report_metadata": PaneReportMetadataParams,
  "pane.focus_direction": PaneFocusDirectionParams,
  "pane.swap": PaneSwapParams,
  "pane.swap_with": PaneSwapWithParams,
  "pane.move_to_edge": PaneMoveToEdgeParams,
  "pane.replace": PaneReplaceParams,
  "pane.move_to_tab": PaneMoveToTabParams,
  "pane.move_to_new_tab": PaneMoveToNewTabParams,
  "pane.zoom": PaneZoomParams,
  "pane.resize": PaneResizeParams,
  "pane.input.set": PaneInputSetParams,
  "pane.edit_scrollback": PaneEditScrollbackParams,
  "pane.image.begin": PaneImageBeginParams,
  "pane.image.chunk": PaneImageChunkParams,
  "pane.image.commit": PaneImageCommitParams,
  "pane.image.cancel": PaneImageCancelParams,
  "ask.open": AskOpenParams,
  "ask.subscribe": AskSubscribeParams,
  "ask.get": AskGetParams,
  "ask.answer": AskAnswerParams,
  "ask.cancel": AskCancelParams,
  "ask.media": AskMediaParams,
  "ask.features": AskFeaturesParams,
  "display.set": DisplaySetParams,
  "display.close": DisplayCloseParams,
  "display.list": DisplayListParams,
  "display.wait": DisplayWaitParams,
  "display.features": DisplayFeaturesParams,
  "display.send": DisplaySendParams,
  "display.subscribe": DisplaySubscribeParams,
  "display.get": DisplayGetParams,
  "display.action": DisplayActionParams,
  "display.dismiss": DisplayDismissParams,
  "display.report": DisplayReportParams,
  "file.info": FileInfoParams,
  "file.resolve": FileResolveParams,
  "file.open": FileOpenParams,
  "file.read": FileReadParams,
  "file.upload.begin": FileUploadBeginParams,
  "file.upload.chunk": FileUploadChunkParams,
  "file.upload.commit": FileUploadCommitParams,
  "file.upload.cancel": FileUploadCancelParams,
  "layout.set_split_ratio": LayoutSetSplitRatioParams,
  "worktree.list": WorktreeListParams,
  "worktree.create": WorktreeCreateParams,
  "worktree.remove": WorktreeRemoveParams,
  "agent_integration.status": AgentIntegrationStatusParams,
  "agent_integration.install": AgentIntegrationInstallParams,
  "agent_integration.uninstall": AgentIntegrationUninstallParams,
  "agent_integration.set_auto_resume": AgentIntegrationSetAutoResumeParams,
  "agent.prompt": AgentPromptParams,
  "agent.send_keys": AgentSendKeysParams,
  "agent.rename": AgentRenameParams,
  "agent.start": AgentStartParams,
  "server.sessions": ServerSessionsParams,
  "machine.list": MachineListParams,
  "command.list": CommandListParams,
  "command.reload": CommandReloadParams,
  "command.run": CommandRunParams,
  "command.popup_close": CommandPopupCloseParams,
  "prefs.get": PrefsGetParams,
  "prefs.set": PrefsSetParams,
  // エージェントの連携のグラフ（20260927-agent-graph）。
  "graph.get": GraphGetParams,
  "graph.update": GraphUpdateParams,
  "graph.pause": GraphPauseParams,
  "graph.resume": GraphResumeParams,
  "graph.history": GraphHistoryParams,
  "server.stop": ServerStopParams,
} as const;

export type MethodName = keyof typeof METHOD_SCHEMAS;

export interface MethodResultMap {
  "client.hello": ClientHelloResult;
  "client.view": Record<string, never>;
  "client.fit": Record<string, never>;
  "client.theme": Record<string, never>;
  "client.detach": Record<string, never>;
  "pane.subscribe": PaneSubscribeResult;
  "pane.unsubscribe": Record<string, never>;
  "pane.attach": PaneAttachResult;
  "pane.attach_resize": Record<string, never>;
  "pane.detach": Record<string, never>;
  "workspace.create": WorkspaceCreateResult;
  "workspace.rename": Record<string, never>;
  "workspace.focus": Record<string, never>;
  "workspace.close": Record<string, never>;
  "workspace.move": Record<string, never>;
  "workspace.move_to": Record<string, never>;
  "workspace.report_metadata": Record<string, never>;
  "group.create": GroupCreateResult;
  "group.rename": Record<string, never>;
  "group.delete": Record<string, never>;
  "group.add_member": Record<string, never>;
  "group.remove_member": Record<string, never>;
  "group.toggle_collapsed": Record<string, never>;
  "item.move": ItemMoveResult;
  "item.move_by": ItemMoveResult;
  "tab.create": TabCreateResult;
  "tab.rename": Record<string, never>;
  "tab.focus": Record<string, never>;
  "tab.close": Record<string, never>;
  "tab.move": Record<string, never>;
  "pane.split": PaneSplitResult;
  "pane.close": Record<string, never>;
  "pane.focus": Record<string, never>;
  "pane.rename": Record<string, never>;
  "pane.report_metadata": Record<string, never>;
  "pane.focus_direction": PaneFocusDirectionResult;
  "pane.swap": PaneSwapResult;
  "pane.swap_with": PaneSwapWithResult;
  "pane.move_to_edge": PaneMoveToEdgeResult;
  "pane.replace": PaneReplaceResult;
  "pane.move_to_tab": PaneMoveToTabResult;
  "pane.move_to_new_tab": PaneMoveToNewTabResult;
  "pane.zoom": Record<string, never>;
  "pane.resize": Record<string, never>;
  "pane.input.set": Record<string, never>;
  "pane.edit_scrollback": PaneEditScrollbackResult;
  "pane.image.begin": PaneImageBeginResult;
  "pane.image.chunk": Record<string, never>;
  "pane.image.commit": PaneImageCommitResult;
  "pane.image.cancel": Record<string, never>;
  "ask.open": AskResult;
  "ask.subscribe": AskSubscribeResult;
  "ask.get": AskPending;
  "ask.answer": Record<string, never>;
  "ask.cancel": Record<string, never>;
  "ask.media": AskMediaResult;
  "ask.features": AskFeatures;
  "display.set": DisplaySetResult;
  "display.close": DisplayClosedResult;
  "display.list": DisplayListResult;
  "display.wait": DisplayWaitResult;
  "display.features": DisplayFeatures;
  "display.subscribe": DisplaySubscribeResult;
  "display.get": DisplayChunk;
  "display.action": Record<string, never>;
  "display.dismiss": DisplayClosedResult;
  "display.report": DisplayReportResult;
  "display.send": DisplaySendResult;
  "file.info": FileInfoResult;
  "file.resolve": FileResolveResult;
  "file.open": Record<string, never>;
  "file.read": FileReadResult;
  "file.upload.begin": FileUploadBeginResult;
  "file.upload.chunk": Record<string, never>;
  "file.upload.commit": FileUploadCommitResult;
  "file.upload.cancel": Record<string, never>;
  "layout.set_split_ratio": Record<string, never>;
  "worktree.list": WorktreeListResult;
  "worktree.create": WorktreeCreateResult;
  /** 成功時のみ返る（`pane.close` と同じ形。失敗は例外——`{ok:false}` は無い）。 */
  "worktree.remove": Record<string, never>;
  "agent_integration.status": AgentIntegrationStatusResult;
  "agent_integration.install": AgentIntegrationInstallResult;
  "agent_integration.uninstall": AgentIntegrationUninstallResult;
  "agent_integration.set_auto_resume": Record<string, never>;
  "agent.prompt": AgentPromptResult;
  "agent.send_keys": Record<string, never>;
  "agent.rename": AgentRenameResult;
  "agent.start": AgentStartResult;
  "server.sessions": ServerSessionsResult;
  "machine.list": MachineListResult;
  "command.list": CommandListResult;
  "command.reload": CommandListResult;
  "command.run": CommandRunResult;
  "command.popup_close": Record<string, never>;
  "prefs.get": PrefsResult;
  "prefs.set": PrefsResult;
  "graph.get": Graph;
  "graph.update": Graph;
  "graph.pause": Graph;
  "graph.resume": Graph;
  "graph.history": GraphHistoryResult;
  "server.stop": Record<string, never>;
}

export type ParamsOf<M extends MethodName> = z.infer<(typeof METHOD_SCHEMAS)[M]>;
export type ResultOf<M extends MethodName> = MethodResultMap[M];

// --- envelope (newline-delimited JSON over the single WebSocket) -----------

export interface RequestEnvelope<M extends MethodName = MethodName> {
  id: string;
  method: M;
  params: ParamsOf<M>;
}

export interface SuccessEnvelope<M extends MethodName = MethodName> {
  id: string;
  result: ResultOf<M>;
}

export interface ErrorEnvelope {
  id: string;
  error: { code: string; message: string };
}
