import { stat } from "node:fs/promises";
import type { MachineStatus } from "@wtm/protocol";
import type { Logger } from "../log/Logger.js";
import {
  loadCatalog as defaultLoadCatalog,
  machinesFilePath,
  resolveSelector,
  type CatalogLoad,
} from "./MachineCatalog.js";
import { realClock, type Clock, type MachineLink } from "./MachineLink.js";
import type { MachineProfile } from "./machineRules.js";

/**
 * 手元の `wtm serve` の、保存した SSH のマシンの接続の管理（20260927-multi-host-machines の design「マシンの管理」・architecture の状態図）。
 * 1 台の状態の**唯一の持ち主**。登録簿を 1 秒ごとに確かめて反映し（再起動なしに 2 秒以内）、有効なマシンごとに `MachineLink`（1 回の試み）を作り、
 * 切れたら間隔を延ばして作り直す。登録簿が無い・空・全台が無効なら ssh を起こさない（AC15）。
 */
export const MANAGER_TIMINGS = {
  pollMs: 1_000,
  minBackoffMs: 1_000,
  maxBackoffMs: 120_000,
  /** これだけ online が続いた後の切断だけ、間隔を最初に戻す。 */
  healthyResetMs: 60_000,
} as const;

export interface MachineManagerDeps {
  root: string;
  createLink(profile: MachineProfile): MachineLink;
  logger: Logger;
  clock?: Clock;
  loadCatalog?: (root: string) => Promise<CatalogLoad>;
  /** 登録簿のファイルの変化を見分ける値（無ければ undefined）。既定は mtime・大きさ・inode。 */
  statCatalog?: (root: string) => Promise<string | undefined>;
}

interface Entry {
  profile: MachineProfile;
  state: MachineStatus["state"];
  message: string | null;
  link: MachineLink | undefined;
  attempt: number;
  onlineSince: number | undefined;
  retryTimer: unknown;
}

async function defaultStatCatalog(root: string): Promise<string | undefined> {
  try {
    const s = await stat(machinesFilePath(root));
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    return undefined;
  }
}

export type MachineRoute =
  { kind: "ok"; link: MachineLink } | { kind: "unknown" } | { kind: "offline" };

export class MachineManager {
  private readonly clock: Clock;
  private readonly load: (root: string) => Promise<CatalogLoad>;
  private readonly statFile: (root: string) => Promise<string | undefined>;
  private readonly entries = new Map<string, Entry>();
  private order: string[] = [];
  private readonly listeners: ((machines: MachineStatus[]) => void)[] = [];
  private lastEmitted = "[]";
  private pollTimer: unknown;
  private lastSignature: string | undefined = "<unread>";
  private lastInvalidReason: string | undefined;
  private reloading: Promise<void> | undefined;
  private reloadAgain = false;
  private stopped = false;
  /** 反映の途中（`connect` の中で同期に失敗した試みの報告で、途中の一覧を配らない）。 */
  private reconciling = false;
  /** 最初の読み込みを済ませたか（済ませる前の `route` は、登録があるかまだ分からないので offline＝503）。 */
  private loaded = false;

  constructor(private readonly deps: MachineManagerDeps) {
    this.clock = deps.clock ?? realClock;
    this.load = deps.loadCatalog ?? defaultLoadCatalog;
    this.statFile = deps.statCatalog ?? defaultStatCatalog;
  }

  /** 登録簿を読み、以後 1 秒ごとに変化を見る。最初の読み込みを待てる Promise を返す。`stop` の後にもう一度呼べる（引き継ぎの失敗で戻す）。 */
  start(): Promise<void> {
    this.stopped = false;
    this.lastSignature = "<unread>";
    this.clock.clearInterval(this.pollTimer);
    this.pollTimer = this.clock.setInterval(() => void this.poll(), MANAGER_TIMINGS.pollMs);
    return this.poll();
  }

  /** 全部の ssh を閉じる（リモートの `wtm serve` は動いたまま）。返す Promise は ssh の子が終わる（最大 `waitMs`）まで待つ。 */
  stop(waitMs = 3_000): Promise<void> {
    this.stopped = true;
    this.clock.clearInterval(this.pollTimer);
    const links: MachineLink[] = [];
    for (const e of this.entries.values()) {
      if (e.link) links.push(e.link);
      this.dispose(e);
    }
    this.entries.clear();
    this.order = [];
    this.loaded = false;
    this.emit();
    if (links.length === 0) return Promise.resolve();
    return Promise.race([
      Promise.all(links.map((l) => l.exited)).then(() => undefined),
      new Promise<void>((resolve) => this.clock.setTimeout(resolve, waitMs)),
    ]);
  }

  onChanged(cb: (machines: MachineStatus[]) => void): void {
    this.listeners.push(cb);
  }

  /** 有効なマシンを登録の順に。 */
  list(): MachineStatus[] {
    return this.order.flatMap((id) => {
      const e = this.entries.get(id);
      return e ? [{ id, label: e.profile.label, state: e.state, message: e.message }] : [];
    });
  }

  /** `/ws?machine=` の行き先。曖昧な名前は unknown。 */
  route(selector: string): MachineRoute {
    if (!this.loaded) return { kind: "offline" };
    const profiles = this.order.flatMap((id) => {
      const e = this.entries.get(id);
      return e ? [e.profile] : [];
    });
    const r = resolveSelector(profiles, selector);
    if (r.kind !== "ok") return { kind: "unknown" };
    const e = this.entries.get(r.machine.id);
    if (!e || e.state !== "online" || !e.link?.online) return { kind: "offline" };
    return { kind: "ok", link: e.link };
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;
    const sig = await this.statFile(this.deps.root);
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;
    await this.reload();
  }

  private reload(): Promise<void> {
    if (this.reloading) {
      this.reloadAgain = true;
      return this.reloading;
    }
    const run = (async () => {
      try {
        do {
          this.reloadAgain = false;
          const loaded = await this.load(this.deps.root);
          if (this.stopped) return;
          if (loaded.kind === "invalid") {
            // 今の接続を保ち、同じ理由が続く間は繰り返さない（AC3）。
            if (loaded.reason !== this.lastInvalidReason)
              this.deps.logger.warn(
                "machines.json is not usable; keeping the current machine connections",
                { reason: loaded.reason },
              );
            this.lastInvalidReason = loaded.reason;
            this.loaded = true; // 壊れていても「読んだ」（今の接続を保つ。登録が無ければ unknown）
            continue;
          }
          this.lastInvalidReason = undefined;
          this.loaded = true;
          this.reconcile(loaded.kind === "ok" ? loaded.data.machines.filter((m) => m.enabled) : []);
        } while (this.reloadAgain && !this.stopped);
      } finally {
        // 最後に `reloadAgain` を見たのと同じ流れの中で空にする（その間に来た読み直しの求めを取りこぼさない）。
        this.reloading = undefined;
      }
    })();
    this.reloading = run;
    return run;
  }

  private reconcile(enabled: MachineProfile[]): void {
    this.reconciling = true;
    try {
      this.reconcileEntries(enabled);
    } finally {
      this.reconciling = false;
    }
    this.emit();
  }

  private reconcileEntries(enabled: MachineProfile[]): void {
    const next = new Set(enabled.map((m) => m.id));
    for (const [id, e] of this.entries) {
      if (!next.has(id)) {
        this.dispose(e);
        this.entries.delete(id);
      }
    }
    for (const p of enabled) {
      const e = this.entries.get(p.id);
      if (!e) {
        const entry: Entry = {
          profile: p,
          state: "connecting",
          message: null,
          link: undefined,
          attempt: 0,
          onlineSince: undefined,
          retryTimer: undefined,
        };
        this.entries.set(p.id, entry);
        this.connect(entry);
        continue;
      }
      if (e.profile.target !== p.target || e.profile.session !== p.session) {
        // 行き先が変わった：今の試みを閉じ、初回の試みとしてすぐ繋ぐ。
        this.dispose(e);
        e.profile = p;
        e.state = "connecting";
        e.message = null;
        e.attempt = 0;
        e.onlineSince = undefined;
        this.connect(e);
      } else if (e.profile.label !== p.label) {
        e.profile = p; // 名前だけ：繋ぎ直さない
      }
    }
    this.order = enabled.map((m) => m.id);
  }

  private connect(entry: Entry): void {
    if (this.stopped) return;
    entry.retryTimer = undefined;
    const link = this.deps.createLink(entry.profile);
    entry.link = link;
    link.onOnline(() => {
      if (entry.link !== link) return;
      entry.state = "online";
      entry.message = null;
      entry.onlineSince = this.clock.now();
      this.emit();
    });
    link.onClosed((failure) => {
      if (entry.link !== link) return; // 置き換えた・閉じた試み
      entry.link = undefined;
      if (this.stopped || this.entries.get(entry.profile.id) !== entry) return;
      if (
        entry.onlineSince !== undefined &&
        this.clock.now() - entry.onlineSince >= MANAGER_TIMINGS.healthyResetMs
      )
        entry.attempt = 0;
      entry.onlineSince = undefined;
      entry.state = failure.kind === "attention" ? "attention" : "reconnecting";
      entry.message = failure.message;
      const delay =
        failure.kind === "attention"
          ? MANAGER_TIMINGS.maxBackoffMs
          : Math.min(
              MANAGER_TIMINGS.maxBackoffMs,
              MANAGER_TIMINGS.minBackoffMs * 2 ** entry.attempt,
            );
      entry.attempt++;
      entry.retryTimer = this.clock.setTimeout(() => this.connect(entry), delay);
      this.emit();
    });
    link.start();
  }

  private dispose(e: Entry): void {
    if (e.retryTimer !== undefined) this.clock.clearTimeout(e.retryTimer);
    e.retryTimer = undefined;
    const link = e.link;
    e.link = undefined;
    link?.close();
  }

  private emit(): void {
    if (this.reconciling) return;
    const list = this.list();
    const json = JSON.stringify(list);
    if (json === this.lastEmitted) return;
    this.lastEmitted = json;
    for (const cb of this.listeners) cb(list);
  }
}
