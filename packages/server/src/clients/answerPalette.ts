import {
  DEFAULT_THEME,
  DEFAULT_THEME_NAME,
  TERMINAL_PALETTES,
  THEME_APPEARANCE,
  type Pane,
  type PaneId,
  type Tab,
  type TabId,
  type TerminalPalette,
  type ThemeName,
} from "@sodashitsu/protocol";
import type { ClientRecord, ClientRegistry } from "./ClientRegistry.js";

/** `answerPaletteFor`/`answerAppearanceFor` が引く先（`composeServer.ts` では `session` と `ClientRegistry`）。 */
export interface AnswerPaletteDeps {
  getPane(id: PaneId): Pane | undefined;
  getTab(id: TabId): Tab | undefined;
  clients: Pick<ClientRegistry, "get" | "list">;
}

/**
 * pane が今どのテーマで見られているかを解決する（20260921-theme-settings の design D6。
 * **Mirror が問い合わせを受けた瞬間に呼ぶ**——保持しない。権限者の移動・切断・テーマの変更が
 * そのまま次の答えに効く）。`answerPaletteFor`（色）・`answerAppearanceFor`（明暗。
 * 20260924-dark-mode-report）が共有する優先順位。
 *
 * 1. pane の tab のサイズを決めているクライアント（`Tab.sizeOwnerClientId`）が伝えたテーマ（`client.theme`）。
 * 2. その人がいない・まだ伝えていないなら、その tab を表示していて（`client.view` の `tabId`）テーマを伝えたクライアントのうち、
 *    `lastActedAt`（最後に入力・フォーカス・レイアウト・作る操作をした時刻。資格を問わず `ClientRegistry.touch` で進み、接続しただけでは 0。
 *    decisions D7・D13）が最新のもの——fit していないモバイル（サイズを決めない）だけが見ている場合もその配色になる。
 * 3. pane・tab がまだ引けない（新しい pane はシェルの起動の猶予の後にモデルへ入る）・その tab に答えられる人がいない（新しい tab は
 *    `client.view` が届くまで誰も見ていない）なら、テーマを伝えた全クライアントのうち `lastActedAt` が最新のもの——作った本人（作る方式の
 *    受け口が作る前に `touch` する。decisions D8・D13。起動の直後に明暗を調べるアプリにも、作った人の配色で答える）。
 * 4. 何も解決できなければ `null`（呼び出し側が既定〔dracula〕にフォールバックする）。
 */
function resolveThemeFor(paneId: PaneId, deps: AnswerPaletteDeps): ThemeName | null {
  const pane = deps.getPane(paneId);
  const tab = pane ? deps.getTab(pane.tabId) : undefined;
  if (tab) {
    const owner = tab.sizeOwnerClientId !== null ? deps.clients.get(tab.sizeOwnerClientId) : undefined;
    if (owner?.theme) return owner.theme;
    const viewer = latestWithTheme(deps.clients.list(), (c) => c.view?.tabId === tab.id);
    if (viewer) return viewer;
  }
  return latestWithTheme(deps.clients.list(), () => true);
}

export function answerPaletteFor(paneId: PaneId, deps: AnswerPaletteDeps): TerminalPalette {
  const name = resolveThemeFor(paneId, deps);
  return name ? TERMINAL_PALETTES[name] : DEFAULT_THEME;
}

/** pane が今どちらの明暗で見られているか（20260924-dark-mode-report）。`resolveThemeFor` と同じ優先順位。 */
export function answerAppearanceFor(paneId: PaneId, deps: AnswerPaletteDeps): "light" | "dark" {
  const name = resolveThemeFor(paneId, deps);
  return THEME_APPEARANCE[name ?? DEFAULT_THEME_NAME];
}

/** テーマを伝えたクライアントのうち、条件に合って `lastActedAt` が最新のもののテーマ（同じなら先に接続したほう）。 */
function latestWithTheme(clients: readonly ClientRecord[], match: (c: ClientRecord) => boolean): ThemeName | null {
  let latest: ClientRecord | undefined;
  for (const c of clients) {
    if (c.theme === null || !match(c)) continue;
    if (!latest || c.lastActedAt > latest.lastActedAt) latest = c;
  }
  return latest?.theme ?? null;
}

/**
 * `composeServer.ts` の「後から埋める箱」（design D6）。`TerminalManager` は `ClientRegistry` より先に作るので、配色・明暗を引く関数を先に渡し、
 * `attach` で中身を埋める。**埋まる前に呼ばれたら dracula（明暗は dark）**（保険。いまの `composeServer.ts` では pane を作る復元は `listen()` の中で、
 * `attach` より後なので起きない）。
 */
export function createPaletteSource(): {
  paletteFor(paneId: PaneId): TerminalPalette;
  appearanceFor(paneId: PaneId): "light" | "dark";
  attach(deps: AnswerPaletteDeps): void;
} {
  let deps: AnswerPaletteDeps | null = null;
  return {
    paletteFor: (paneId) => (deps ? answerPaletteFor(paneId, deps) : DEFAULT_THEME),
    appearanceFor: (paneId) => (deps ? answerAppearanceFor(paneId, deps) : THEME_APPEARANCE[DEFAULT_THEME_NAME]),
    attach: (d) => {
      deps = d;
    },
  };
}
