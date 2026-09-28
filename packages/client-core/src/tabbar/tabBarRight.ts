/**
 * タブバーの外観設定（20260922-tabbar-pane-appearance。herdr の `ui.tab_bar_*` 相当。pane の枠の描画モードは
 * `layout/paneChrome.ts`。design「インターフェース / データ構造」）。
 *
 * herdr の自由度（strftime 書式・任意コマンド）はそのまま持ち込まず、日時はプリセット選択、固定文字列は
 * 1 行のテキスト入力に絞る（Command 種別は対象外。requirements 対象外）。
 */

/** tab バーの位置。 */
export type TabBarPosition = "top" | "bottom";
const TAB_BAR_POSITIONS: readonly TabBarPosition[] = ["top", "bottom"];

/** tab バー右端の日時エントリの表示プリセット（herdr の strftime の自由書式は持ち込まない）。 */
export type DatetimeFormat = "time" | "time-seconds" | "date" | "date-time";
const DATETIME_FORMATS: readonly DatetimeFormat[] = ["time", "time-seconds", "date", "date-time"];

/** tab バー右端の 1 エントリ（herdr の `Command` 種別は対象外）。 */
export type TabBarRightEntry =
  | { kind: "zoom" }
  | { kind: "hostname" }
  | { kind: "datetime"; format: DatetimeFormat }
  | { kind: "text"; text: string };

/** herdr の上限を踏襲（`MAX_TAB_BAR_RIGHT_ENTRIES`）。 */
export const MAX_TAB_BAR_RIGHT_ENTRIES = 16;
/** herdr の `MAX_STATUS_TEXT_CHARS` を踏襲。固定文字列エントリの上限。 */
export const MAX_TAB_BAR_TEXT_CHARS = 80;
/** herdr に上限は無いが、本製品では暴走防止に上限を設ける（herdr との違い）。 */
export const MAX_TAB_BAR_SEPARATOR_CHARS = 8;

/** 保存された位置を読む。2 値のどちらでもなければ既定の "top"。 */
export function loadTabBarPosition(raw: unknown): TabBarPosition {
  return TAB_BAR_POSITIONS.includes(raw as TabBarPosition) ? (raw as TabBarPosition) : "top";
}

function isDatetimeFormat(v: unknown): v is DatetimeFormat {
  return DATETIME_FORMATS.includes(v as DatetimeFormat);
}

/** 制御文字を取り除く（herdr の `sanitize_separator`/`sanitize_literal_text` に相当）。 */
function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex -- 制御文字そのものを取り除くための意図的な範囲指定
  return value.replace(/[\u0000-\u001f\u007f]/g, "");
}

/**
 * コード単位（UTF-16）ではなく**コードポイント単位**で切り詰める——`String.prototype.slice` は
 * サロゲートペア（絵文字等）の境界を割ることがあり、上限ちょうどで孤立サロゲートが残る壊れた文字列に
 * なりうる（タスク点検で発見）。`Array.from` は文字列をコードポイント単位でイテレートする。
 */
function truncateByCodePoints(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

/** 固定文字列エントリの値を整える（制御文字除去＋上限で切り詰め）。 */
export function sanitizeTabBarText(raw: string): string {
  return truncateByCodePoints(stripControlChars(raw), MAX_TAB_BAR_TEXT_CHARS);
}

/** 区切り文字列を整える（制御文字除去＋上限で切り詰め）。 */
function sanitizeSeparator(raw: string): string {
  return truncateByCodePoints(stripControlChars(raw), MAX_TAB_BAR_SEPARATOR_CHARS);
}

/** 保存値 1 件を読む。壊れていれば null（呼び出し側でその項目だけ落とす）。 */
function loadEntry(raw: unknown): TabBarRightEntry | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  switch (r["kind"]) {
    case "zoom":
      return { kind: "zoom" };
    case "hostname":
      return { kind: "hostname" };
    case "datetime":
      return isDatetimeFormat(r["format"]) ? { kind: "datetime", format: r["format"] } : null;
    case "text":
      return typeof r["text"] === "string"
        ? { kind: "text", text: sanitizeTabBarText(r["text"]) }
        : null;
    default:
      return null;
  }
}

/**
 * 保存された右端エントリの並びを読む。**先頭 `MAX_TAB_BAR_RIGHT_ENTRIES` 件だけを見て**（それを超えた分は
 * 見ずに切り詰める。herdr の `MAX_TAB_BAR_RIGHT_ENTRIES` と同じ位置基準——16 件目より後を走査して有効な
 * ものを拾い直すことはしない）、その中の不正な要素は個別に落とす。結果は 16 件より少なくなりうる。
 */
export function loadTabBarRightEntries(raw: unknown): TabBarRightEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: TabBarRightEntry[] = [];
  for (const item of raw.slice(0, MAX_TAB_BAR_RIGHT_ENTRIES)) {
    const entry = loadEntry(item);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** 保存された区切り文字列を読む。文字列でなければ既定の半角スペース 1 つ。 */
export function loadTabBarRightSeparator(raw: unknown): string {
  return typeof raw === "string" ? sanitizeSeparator(raw) : " ";
}

const DATETIME_INTL_OPTIONS: Record<DatetimeFormat, Intl.DateTimeFormatOptions> = {
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  "time-seconds": { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" },
  date: { year: "numeric", month: "2-digit", day: "2-digit" },
  "date-time": {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
};

/** 日時エントリの表示文字列（`Intl.DateTimeFormat` ベースの固定 4 プリセット。herdr の strftime は持ち込まない）。 */
export function formatDatetime(format: DatetimeFormat, now: Date): string {
  return new Intl.DateTimeFormat("ja-JP", DATETIME_INTL_OPTIONS[format]).format(now);
}
