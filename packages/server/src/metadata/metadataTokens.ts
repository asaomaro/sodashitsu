import { RpcError, type MetadataTokenEntry } from "@wtm/protocol";

/**
 * 独自トークン（herdr の workspace / pane metadata tokens。20260927-sidebar-row-tokens）の**規則そのもの**——整え方・検査・帳簿。
 * 時計は引数で受け、session・bus・タイマーを知らない（配線は `MetadataService.ts`。architecture.md「コンポーネント」）。
 *
 * 規則と数値は herdr の一次資料に 1:1 で合わせる（research F1〜F7）:
 * `herdr/src/app/api_helpers.rs:202-280`（上限・`normalize_metadata_source`・`normalize_metadata_ttl`・`normalize_metadata_tokens`）、
 * `herdr/src/metadata_tokens.rs`（`sequence_is_fresh`・`accept_sequence`・`MetadataTokens::patch`・`expire_at`・`key_count_after_patch`）。
 */

export const METADATA_TTL_MIN_MS = 1;
export const METADATA_TTL_MAX_MS = 86_400_000;
export const METADATA_SOURCE_MAX_CHARS = 80;
export const MAX_TOKENS_PER_REPORT = 16;
export const MAX_TOKENS_PER_TARGET = 32;
export const MAX_TOKEN_NAME_LEN = 32;
export const MAX_TOKEN_VALUE_CHARS = 80;
export const MAX_SEQUENCE_SOURCES = 32;

const SOURCE_PATTERN = /^[A-Za-z0-9:._-]+$/;
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Unicode の一般カテゴリ Cc（Rust の `char::is_control` と同じ集合）。 */
const CONTROL_CHARS = /\p{Cc}/gu;
/** 前後の Unicode の White_Space（Rust の `str::trim` と同じ集合。JS の `trim` は U+0085 を残し U+FEFF を除くので使わない）。 */
const EDGE_WHITE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;

function trimWhiteSpace(s: string): string {
  return s.replace(EDGE_WHITE_SPACE, "");
}

/** 前後の空白を除き、空・80 文字（コードポイント）超・文字種の外なら `invalid_metadata_source`（herdr と同じ文言）。 */
export function normalizeMetadataSource(raw: string): string {
  const value = trimWhiteSpace(raw);
  if (value === "") throw new RpcError("invalid_metadata_source", "metadata source must not be empty");
  if (Array.from(value).length > METADATA_SOURCE_MAX_CHARS) {
    throw new RpcError("invalid_metadata_source", `metadata source must be ${METADATA_SOURCE_MAX_CHARS} characters or fewer`);
  }
  if (!SOURCE_PATTERN.test(value)) {
    throw new RpcError(
      "invalid_metadata_source",
      "metadata source may contain only ASCII letters, digits, colon, dot, underscore, and hyphen",
    );
  }
  return value;
}

/** 無ければ null（期限なし）。1 未満・86400000 超は `invalid_metadata_ttl`。 */
export function normalizeMetadataTtl(ttlMs: number | undefined): number | null {
  if (ttlMs === undefined) return null;
  if (ttlMs < METADATA_TTL_MIN_MS) throw new RpcError("invalid_metadata_ttl", `metadata ttl_ms must be at least ${METADATA_TTL_MIN_MS}`);
  if (ttlMs > METADATA_TTL_MAX_MS) throw new RpcError("invalid_metadata_ttl", `metadata ttl_ms must be ${METADATA_TTL_MAX_MS} or less`);
  return ttlMs;
}

/**
 * 値を整える: 前後の空白を除く → 制御文字を除く → 先頭から 80 文字（コードポイント）→ もう一度前後の空白を除く。空なら null（消去）。
 * herdr の `value.trim().chars().filter(!is_control).take(80)` → 空白だけなら None → `trim` と同じ順（research F3）。
 */
export function normalizeMetadataValue(raw: string): string | null {
  const cleaned = trimWhiteSpace(
    Array.from(trimWhiteSpace(raw).replace(CONTROL_CHARS, ""))
      .slice(0, MAX_TOKEN_VALUE_CHARS)
      .join(""),
  );
  return cleaned === "" ? null : cleaned;
}

/**
 * 1 回の報告の組を、名前 → 値（null＝消去）の表にする。**同じ名前は後の組が勝つ**（herdr は HashMap に順に入れる）。数えるのは残った異なる名前。
 * 組が 0・17 以上・名前が空・33 文字以上・`[A-Za-z0-9_-]` の外は `invalid_metadata_token`。
 */
export function normalizeMetadataTokens(entries: readonly MetadataTokenEntry[]): Map<string, string | null> {
  const patch = new Map<string, string | null>();
  for (const { name, value } of entries) {
    // 後が勝つ: 前の位置を消してから入れ直す（反映の順も後の指定に揃える）。
    patch.delete(name);
    patch.set(name, value);
  }
  if (patch.size === 0) throw new RpcError("invalid_metadata_token", "missing token to set or clear");
  if (patch.size > MAX_TOKENS_PER_REPORT) {
    throw new RpcError("invalid_metadata_token", `a metadata report may update at most ${MAX_TOKENS_PER_REPORT} tokens`);
  }
  const out = new Map<string, string | null>();
  for (const [name, value] of patch) {
    if (name === "" || name.length > MAX_TOKEN_NAME_LEN || !NAME_PATTERN.test(name)) {
      throw new RpcError("invalid_metadata_token", `invalid metadata token key: ${name}`);
    }
    out.set(name, value === null ? null : normalizeMetadataValue(value));
  }
  return out;
}

interface TokenEntry {
  value: string;
  /** 締め切り（単調な時計の ms）。無期限は null。 */
  expiresAt: number | null;
}

/** 1 つの対象（workspace・pane）の独自トークンと、`seq` の記録。 */
export class MetadataTokenBook {
  private readonly entries = new Map<string, TokenEntry>();
  private readonly sequences = new Map<string, number>();

  /** `seq` が無い・その source の記録が無い・記録より大きい、のどれかなら新しい。 */
  isFresh(source: string, seq: number | undefined): boolean {
    if (seq === undefined) return true;
    const last = this.sequences.get(source);
    return last === undefined || seq > last;
  }

  /** いまの名前に、値ありの名前を足し値なしの名前を除いた数。 */
  keyCountAfterPatch(patch: ReadonlyMap<string, string | null>): number {
    const keys = new Set(this.entries.keys());
    for (const [name, value] of patch) {
      if (value === null) keys.delete(name);
      else keys.add(name);
    }
    return keys.size;
  }

  /** `seq` を受け付ける。記録の無い source が 33 個目なら `limit`（消去・期限で枠は戻らない）。 */
  acceptSequence(source: string, seq: number | undefined): "accepted" | "stale" | "limit" {
    if (seq === undefined) return "accepted";
    if (!this.isFresh(source, seq)) return "stale";
    if (!this.sequences.has(source) && this.sequences.size >= MAX_SEQUENCE_SOURCES) return "limit";
    this.sequences.set(source, seq);
    return "accepted";
  }

  /** 反映する。値ありは値と締め切りを入れ（前と同じなら変化なし）、値なしは消す（あったときだけ変化あり）。変わったかを返す。 */
  patch(patch: ReadonlyMap<string, string | null>, ttlMs: number | null, now: number): boolean {
    const expiresAt = ttlMs === null ? null : now + ttlMs;
    let changed = false;
    for (const [name, value] of patch) {
      if (value === null) {
        if (this.entries.delete(name)) changed = true;
        continue;
      }
      const prev = this.entries.get(name);
      if (prev && prev.value === value && prev.expiresAt === expiresAt) continue;
      this.entries.set(name, { value, expiresAt });
      changed = true;
    }
    return changed;
  }

  /** 締め切りが `now` 以前のものを消す。変わったかを返す。 */
  expireAt(now: number): boolean {
    let changed = false;
    for (const [name, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(name);
        changed = true;
      }
    }
    return changed;
  }

  /** 最も早い締め切り（無ければ null）。 */
  nextExpiry(): number | null {
    let min: number | null = null;
    for (const entry of this.entries.values()) {
      if (entry.expiresAt !== null && (min === null || entry.expiresAt < min)) min = entry.expiresAt;
    }
    return min;
  }

  /** 値の表（`Object.fromEntries`＝定義で入れるので `__proto__` もただの名前になる）。1 つも無ければ null。 */
  values(): Record<string, string> | null {
    if (this.entries.size === 0) return null;
    return Object.fromEntries([...this.entries].map(([name, entry]) => [name, entry.value]));
  }
}
