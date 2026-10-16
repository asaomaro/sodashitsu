import { KeyRouter, type Action, type KeyInput, type ResolvedKeymap } from "@sodashitsu/client-core";

/**
 * アプリタブのメイン画面の枠（`script.html`）が中継する prefix のキーを、親が受ける係（20261016-app-view-direct-operate）。
 *
 * 枠から届く知らせは**偽れる**（中身のスクリプトは、枠と同じ window にいて、port の知らせを自分で作れる）。そこで、
 * - 実物の `KeyRouter`（利用者の本当の入力の状態）には触らない。**専用の `KeyRouter`**（対応表は実物と同じ）で解釈する。
 * - 実行するのは**許可表の操作だけ**（画面・タブ・ワークスペースを切り替えるだけ。何も壊さない）。閉じる・分割・送る・起動・終了・設定・コマンドの実行は受けない。
 *   prefix の二度押し（端末へ送る列）・直接のキー・モード（navigate・copy・resize）への移動も受けない。
 * - 送りすぎには上限（{@link RELAY_MESSAGE_MAX}・{@link RELAY_ACTION_MAX}／{@link RELAY_WINDOW_MS}）。
 */
export const RELAY_ALLOWED_ACTIONS: ReadonlySet<Action["type"]> = new Set<Action["type"]>([
  "tabDelta",
  "tabIndex",
  "workspaceDelta",
  "workspaceIndex",
]);
/** 1 つの窓の長さと、その中で受ける知らせの数・実行する操作の数の上限。 */
export const RELAY_WINDOW_MS = 1000;
export const RELAY_MESSAGE_MAX = 30;
export const RELAY_ACTION_MAX = 5;

/** 枠が中継する 1 つのキー（`script.html` が本物の keydown から作る）。 */
export interface RelayKey {
  key: string;
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** 枠からの知らせの `input` を検査して読む（純粋）。形が違えば `null`。 */
export function readRelayKey(v: unknown): RelayKey | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const str = (x: unknown, max: number): x is string => typeof x === "string" && x.length >= 1 && x.length <= max;
  if (!str(r["key"], 32) || !(r["code"] === "" || str(r["code"], 32))) return null;
  for (const f of ["ctrl", "alt", "shift", "meta"] as const) if (typeof r[f] !== "boolean") return null;
  return {
    key: r["key"],
    code: r["code"] as string,
    ctrl: r["ctrl"] as boolean,
    alt: r["alt"] as boolean,
    shift: r["shift"] as boolean,
    meta: r["meta"] as boolean,
  };
}

export interface PrefixRelayDeps {
  /** いまのキーの対応表（設定で変えたものに追従する）。 */
  keymap(): ResolvedKeymap;
  /** 許可表の操作を実行する。 */
  run(action: Action): void;
  now?(): number;
  setTimeout?(fn: () => void, ms: number): unknown;
  clearTimeout?(h: unknown): void;
}

export class PrefixRelay {
  private router: KeyRouter | null = null;
  private readonly messages: number[] = [];
  private readonly actions: number[] = [];
  private readonly now: () => number;

  constructor(private readonly deps: PrefixRelayDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** prefix が押された。待ち（次のキーを受ける状態）に入れたら `true`。 */
  start(): boolean {
    if (!this.admit(this.messages, RELAY_MESSAGE_MAX)) return this.pending;
    const router = this.freshRouter();
    this.router = router;
    router.handle(router.prefixKeyInput());
    return this.pending;
  }

  /** prefix のあとのキー。待ちが続くなら `true`（番号選択の途中など）。待ちでなければ捨てる。 */
  key(k: RelayKey): boolean {
    const router = this.router;
    if (router === null || router.mode !== "prefix") return false;
    if (!this.admit(this.messages, RELAY_MESSAGE_MAX)) return this.pending;
    const input: KeyInput = { ...k, type: "keydown", composing: false };
    const decision = router.handle(input);
    if (decision.kind === "action" && RELAY_ALLOWED_ACTIONS.has(decision.action.type) && this.admit(this.actions, RELAY_ACTION_MAX)) {
      this.deps.run(decision.action);
    }
    // 受けない操作（モードへ移る・番号の `pane`/`agent` など）で、専用の router が prefix 以外に居残らないようにする。
    if (router.mode !== "prefix" && router.mode !== "terminal") router.setMode("terminal");
    return this.pending;
  }

  get pending(): boolean {
    return this.router?.mode === "prefix";
  }

  dispose(): void {
    this.router?.setMode("terminal"); // 時計を止める
    this.router = null;
  }

  private freshRouter(): KeyRouter {
    this.router?.setMode("terminal");
    const d = this.deps;
    return new KeyRouter(d.keymap(), {
      now: this.now,
      setTimeout: d.setTimeout ?? ((fn, ms) => window.setTimeout(fn, ms)),
      clearTimeout: d.clearTimeout ?? ((h) => window.clearTimeout(h as number)),
    });
  }

  /** 窓の中の数が上限未満なら数えて `true`。 */
  private admit(log: number[], max: number): boolean {
    const t = this.now();
    while (log.length > 0 && t - log[0]! >= RELAY_WINDOW_MS) log.shift();
    if (log.length >= max) return false;
    log.push(t);
    return true;
  }
}
