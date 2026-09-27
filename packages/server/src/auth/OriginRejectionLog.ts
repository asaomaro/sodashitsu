import type { Logger } from "../log/Logger.js";
import { LogThrottle, monotonicNow } from "../log/LogThrottle.js";
import type { OriginPolicy } from "./OriginPolicy.js";

/**
 * Origin/Host で拒否したときのログ（`origin rejected`）に添える対処（D102）。許可リストはこのマシンのインタフェースから
 * しか作れないので、ポート転送・リバースプロキシ・Tailscale の名前で開く構成では利用者が `--origin` で教える必要がある。
 */
export const ORIGIN_REJECTED_HINT = "ブラウザで開いた Origin がこのマシンのアドレスに無いなら soda serve --origin <その Origin> で許可できます";

/** ログに書く Origin・Host の上限（文字数）。ヘッダは認証前の相手が自由に送れる（Node の既定で 1 行あたり約 16KB）。 */
export const ORIGIN_LOG_MAX_CHARS = 200;
/** 同じ（接続元・Origin・Host）の拒否を書く間隔の下限。 */
export const ORIGIN_LOG_WINDOW_MS = 60_000;
/** 間引きの表の上限。超えたら空にする（認証前の相手が組み合わせを変えて表を無制限に膨らませないため）。 */
export const ORIGIN_LOG_MAX_ENTRIES = 1000;
/**
 * 組を問わず、`ORIGIN_LOG_WINDOW_MS` の間に書く行数の上限。組ごとの間引きだけでは、相手が Origin・Host を毎回変えれば
 * 毎回 1 行を書かせられる（独立点検の指摘）ので、全体でも抑える。超えた分は次に書く行の `suppressedOverall` に載せる。
 */
export const ORIGIN_LOG_MAX_LINES_PER_WINDOW = 20;

export interface OriginRejection {
  path: string;
  remoteAddress: string;
  origin: string | undefined;
  host: string | undefined;
}

export interface OriginRejectionLogOptions {
  /** 時計（ms。既定は単調な `monotonicNow`——壁時計は戻りうる。D103 の独立点検 #8）。テストで差し替える。 */
  now?: () => number;
  /** `--origin` で許可した Origin（ログに添える。利用者が渡した値との食い違いを確かめられるように）。 */
  extraOrigins?: readonly string[];
  /** 全体の上限（既定 `ORIGIN_LOG_MAX_LINES_PER_WINDOW`。テストで表の上限だけを確かめるときに外す）。 */
  maxLinesPerWindow?: number;
}

/**
 * Origin/Host の検査と、拒否のログ（`HttpServer` の `/api/login`・`/api/session`（D106。`admitGet`）と `WsServerWs` の
 * `/ws` で共通。design「エラー処理 / 異常系」の「Origin の不一致」・D102・D103）。`composeServer` が 1 つを作って両方に渡す（**必須の依存**。省けたころは、省くと
 * `extraOrigins` の無い別の実体を黙って作り、間引きの状態も分かれていた。D103）。拒否は認証の前に起きるので、誰でも
 * 何度でも起こせる——`server.log` はローテーションしないので、**同じ（接続元・Origin・Host）は 60 秒に 1 回だけ書き**
 * （その間に書かなかった件数は次の行の `suppressed` に載せる）、Origin・Host は 200 文字で切る。間引きの表は 1000 件を
 * 超えたら空にする。組を変え続ける相手に備えて、全体でも 60 秒に 20 行までにする（`LogThrottle`。超えた分は件数だけ
 * 次に書く行の `suppressedOverall` に載せる）。行には `--origin` で許可した Origin（`extraOrigins`）も添える。
 */
export class OriginRejectionLog {
  private readonly now: () => number;
  /** キー（切り詰めた接続元・Origin・Host）→ 最後に書いた時刻と、その後に書かなかった件数。 */
  private readonly lastLogged = new Map<string, { at: number; suppressed: number }>();
  private readonly extraOrigins: readonly string[];
  /** 組を問わない全体の上限（60 秒に 20 行）。 */
  private readonly overall: LogThrottle;

  constructor(
    private readonly logger: Logger,
    private readonly origins: OriginPolicy,
    opts: OriginRejectionLogOptions = {},
  ) {
    this.now = opts.now ?? monotonicNow;
    this.extraOrigins = opts.extraOrigins ?? [];
    this.overall = new LogThrottle({
      windowMs: ORIGIN_LOG_WINDOW_MS,
      maxLines: opts.maxLinesPerWindow ?? ORIGIN_LOG_MAX_LINES_PER_WINDOW,
      now: this.now,
    });
  }

  /**
   * Origin/Host を確かめる（判定 → 記録 → 403 を 1 か所に。D103）。許可するなら true。許可しないなら `record` で記録して
   * から `deny`（呼び出し側の 403 の応答）を呼び、false を返す。ポート転送・リバースプロキシ・Tailscale の名前など、
   * ブラウザが開いた宛先がこのマシンのインタフェースに無い構成で起きる。ブラウザからは 403 の理由が見えないので、ログに
   * 残さないと利用者は token の誤りと思い込む（ブラウザが開いた Origin を `--origin` で渡せば許可できる）。
   */
  admit(r: OriginRejection, deny: () => void): boolean {
    return this.gate(this.origins.isAllowed(r.origin, r.host), r, deny);
  }

  /**
   * Origin を付けないことがある GET（`/api/session`）向けの `admit`（D106）。ブラウザは同じオリジンの GET に Origin を
   * 付けないので、**Host を許可ホスト（と `--origin` の Origin のホスト）に照らし**、Origin が付いていればそれも `admit` と
   * 同じ規則で確かめる（付いていて許可外なら拒否）。記録・`deny` は `admit` と同じ（間引きの状態も共有する）。
   */
  admitGet(r: OriginRejection, deny: () => void): boolean {
    const allowed = r.origin !== undefined ? this.origins.isAllowed(r.origin, r.host) : this.origins.isHostAllowed(r.host);
    return this.gate(allowed, r, deny);
  }

  private gate(allowed: boolean, r: OriginRejection, deny: () => void): boolean {
    if (allowed) return true;
    this.record(r);
    deny();
    return false;
  }

  record(r: OriginRejection): void {
    const remoteAddress = truncate(r.remoteAddress) ?? "";
    const origin = truncate(r.origin);
    const host = truncate(r.host);
    const key = JSON.stringify([remoteAddress, origin ?? null, host ?? null]);
    const now = this.now();
    const prev = this.lastLogged.get(key);
    if (prev && now - prev.at < ORIGIN_LOG_WINDOW_MS) {
      prev.suppressed += 1;
      return;
    }
    const overall = this.overall.take();
    if (overall === undefined) return; // 全体の上限を超えた（件数は LogThrottle が数え、次に書く行に渡す）
    if (!prev && this.lastLogged.size >= ORIGIN_LOG_MAX_ENTRIES) this.lastLogged.clear();
    this.lastLogged.set(key, { at: now, suppressed: 0 });
    const suppressedOverall = overall.suppressed;
    this.logger.warn("origin rejected", {
      path: r.path,
      remoteAddress,
      origin,
      host,
      allowed: this.origins.allowedHostPorts(),
      ...(this.extraOrigins.length > 0 ? { extraOrigins: [...this.extraOrigins] } : {}),
      ...(prev && prev.suppressed > 0 ? { suppressed: prev.suppressed } : {}),
      ...(suppressedOverall > 0 ? { suppressedOverall } : {}),
      hint: ORIGIN_REJECTED_HINT,
    });
  }
}

function truncate(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v.length > ORIGIN_LOG_MAX_CHARS ? `${v.slice(0, ORIGIN_LOG_MAX_CHARS)}…(${v.length} chars)` : v;
}
