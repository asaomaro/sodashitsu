import type { MachineStatus } from "@wtm/protocol";
import { describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import type { CatalogLoad } from "./MachineCatalog.js";
import type { LinkFailure, MachineLink } from "./MachineLink.js";
import { MANAGER_TIMINGS, MachineManager } from "./MachineManager.js";
import type { MachineProfile } from "./machineRules.js";
import { flush, ManualClock } from "./testing.js";

const A = "a".repeat(32);
const B = "b".repeat(32);
const prof = (over: Partial<MachineProfile> = {}): MachineProfile => ({
  id: A,
  label: "Build",
  target: "you@build",
  enabled: true,
  ...over,
});

/** 偽の Link: テストが online・失敗を起こす。 */
class FakeLink {
  started = 0;
  closed = 0;
  online = false;
  private onlineCbs: (() => void)[] = [];
  private closedCbs: ((f: LinkFailure) => void)[] = [];
  constructor(readonly profile: MachineProfile) {}
  onOnline(cb: () => void): void {
    this.onlineCbs.push(cb);
  }
  onClosed(cb: (f: LinkFailure) => void): void {
    this.closedCbs.push(cb);
  }
  start(): void {
    this.started++;
  }
  close(): void {
    this.closed++;
    this.fail({ kind: "transient", message: "接続を閉じました" });
  }
  up(): void {
    this.online = true;
    for (const cb of this.onlineCbs) cb();
  }
  fail(f: LinkFailure): void {
    this.online = false;
    const cbs = this.closedCbs;
    this.closedCbs = [];
    for (const cb of cbs) cb(f);
  }
}

function setup(initial: CatalogLoad) {
  const clock = new ManualClock();
  let catalog: CatalogLoad = initial;
  let sig = "1";
  const links: FakeLink[] = [];
  const events: MachineStatus[][] = [];
  const logger = new MemoryLogger();
  const mgr = new MachineManager({
    root: "/root",
    clock,
    logger,
    loadCatalog: async () => catalog,
    statCatalog: async () => sig,
    createLink: (p) => {
      const l = new FakeLink(p);
      links.push(l);
      return l as unknown as MachineLink;
    },
  });
  mgr.onChanged((m) => events.push(m));
  const setCatalog = async (c: CatalogLoad): Promise<void> => {
    catalog = c;
    sig = String(Number(sig) + 1);
    clock.advance(MANAGER_TIMINGS.pollMs);
    await flush();
    await flush();
  };
  return { mgr, clock, links, events, logger, setCatalog };
}

const ok = (...machines: MachineProfile[]): CatalogLoad => ({
  kind: "ok",
  data: { version: 1, machines },
});

describe("MachineManager（T7）", () => {
  it("登録簿が無い・空・全台無効なら何も起こさない（AC15）", async () => {
    for (const c of [{ kind: "missing" } as CatalogLoad, ok(), ok(prof({ enabled: false }))]) {
      const t = setup(c);
      await t.mgr.start();
      expect(t.links).toHaveLength(0);
      expect(t.mgr.list()).toEqual([]);
      t.mgr.stop();
    }
  });

  it("有効なマシンに繋ぎ、connecting → online。route は online のときだけ ok、名前・id で引ける", async () => {
    const t = setup(ok(prof(), prof({ id: B, label: "GPU", enabled: false })));
    expect(t.mgr.route("Build")).toEqual({ kind: "offline" }); // 最初の読み込みの前は（登録があるかまだ分からない）503
    expect(t.mgr.route("nope")).toEqual({ kind: "offline" });
    await t.mgr.start();
    expect(t.links).toHaveLength(1);
    expect(t.mgr.list()).toEqual([{ id: A, label: "Build", state: "connecting", message: null }]);
    expect(t.mgr.route("Build")).toEqual({ kind: "offline" });
    t.links[0]!.up();
    expect(t.mgr.list()[0]!.state).toBe("online");
    expect(t.mgr.route("Build")).toMatchObject({ kind: "ok" });
    expect(t.mgr.route(A)).toMatchObject({ kind: "ok" });
    expect(t.mgr.route("GPU")).toEqual({ kind: "unknown" }); // 無効
    expect(t.mgr.route("nope")).toEqual({ kind: "unknown" });
    expect(t.events.map((e) => e[0]?.state)).toEqual(["connecting", "online"]);
    t.mgr.stop();
  });

  it("切れたら 1 秒から倍々（最大 2 分）で繋ぎ直す。試みの間は状態を変えない。attention は 2 分ごと", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    const delays: number[] = [];
    for (let i = 0; i < 9; i++) {
      const before = t.links.length;
      t.links[t.links.length - 1]!.fail({ kind: "transient", message: "切れた" });
      expect(t.mgr.list()[0]).toMatchObject({ state: "reconnecting", message: "切れた" });
      let waited = 0;
      while (t.links.length === before) {
        t.clock.advance(500);
        waited += 500;
      }
      delays.push(waited);
      expect(t.mgr.list()[0]!.state).toBe("reconnecting"); // 試みの間は変えない
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 64000, 120000, 120000]);
    t.links[t.links.length - 1]!.fail({ kind: "attention", message: "認証" });
    expect(t.mgr.list()[0]).toMatchObject({ state: "attention", message: "認証" });
    const n = t.links.length;
    t.clock.advance(MANAGER_TIMINGS.maxBackoffMs - 1);
    expect(t.links).toHaveLength(n);
    t.clock.advance(1);
    expect(t.links).toHaveLength(n + 1);
    t.mgr.stop();
  });

  it("online が 60 秒続いた後の切断だけ間隔を最初に戻す（短い接続では戻さない）", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    const failAndWait = (): number => {
      const before = t.links.length;
      t.links[t.links.length - 1]!.fail({ kind: "transient", message: "x" });
      let waited = 0;
      while (t.links.length === before) {
        t.clock.advance(250);
        waited += 250;
      }
      return waited;
    };
    expect(failAndWait()).toBe(1000);
    expect(failAndWait()).toBe(2000);
    t.links[t.links.length - 1]!.up();
    t.clock.advance(MANAGER_TIMINGS.healthyResetMs - 1000); // 短い
    expect(failAndWait()).toBe(4000);
    t.links[t.links.length - 1]!.up();
    t.clock.advance(MANAGER_TIMINGS.healthyResetMs); // 1 分続いた
    expect(failAndWait()).toBe(1000);
    t.mgr.stop();
  });

  it("登録簿の反映: 名前だけは繋ぎ直さない、宛先の変更は閉じて connecting から、無効化・削除は閉じて消す、追加は繋ぐ", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    t.links[0]!.up();
    await t.setCatalog(ok(prof({ label: "Renamed" })));
    expect(t.links).toHaveLength(1);
    expect(t.mgr.list()[0]).toMatchObject({ label: "Renamed", state: "online" });
    await t.setCatalog(ok(prof({ label: "Renamed", target: "you@other" })));
    expect(t.links[0]!.closed).toBe(1);
    expect(t.links).toHaveLength(2);
    expect(t.mgr.list()[0]).toMatchObject({ state: "connecting" });
    await t.setCatalog(
      ok(
        prof({ label: "Renamed", target: "you@other" }),
        prof({ id: B, label: "GPU", target: "gpu" }),
      ),
    );
    expect(t.links).toHaveLength(3);
    expect(t.mgr.list().map((m) => m.label)).toEqual(["Renamed", "GPU"]);
    await t.setCatalog(
      ok(
        prof({ label: "Renamed", target: "you@other", enabled: false }),
        prof({ id: B, label: "GPU", target: "gpu" }),
      ),
    );
    expect(t.links[1]!.closed).toBe(1);
    expect(t.mgr.list().map((m) => m.label)).toEqual(["GPU"]);
    await t.setCatalog(ok());
    expect(t.links[2]!.closed).toBe(1);
    expect(t.mgr.list()).toEqual([]);
    // 閉じた試みの失敗は繋ぎ直しを呼ばない
    t.clock.advance(MANAGER_TIMINGS.maxBackoffMs * 2);
    expect(t.links).toHaveLength(3);
    t.mgr.stop();
  });

  it("壊れた登録簿は今の接続を保ち、同じ理由の警告は 1 回だけ", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    await t.setCatalog({ kind: "invalid", reason: "broken" });
    await t.setCatalog({ kind: "invalid", reason: "broken" });
    expect(t.links[0]!.closed).toBe(0);
    expect(t.mgr.list()).toHaveLength(1);
    expect(t.logger.lines.filter((e) => /not usable/.test(e.msg))).toHaveLength(1);
    t.mgr.stop();
  });

  it("stop() で全部の試みを閉じ、以後は繋ぎ直さない", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    t.links[0]!.fail({ kind: "transient", message: "x" });
    t.mgr.stop();
    t.clock.advance(MANAGER_TIMINGS.maxBackoffMs);
    expect(t.links).toHaveLength(1);
    expect(t.mgr.list()).toEqual([]);
  });

  it("同じ中身では onChanged を重ねて呼ばない", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    await t.setCatalog(ok(prof()));
    expect(t.events).toHaveLength(1);
    t.mgr.stop();
  });

  it("session の変更も閉じて connecting から繋ぎ直す。ok → missing で 0 台", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    t.links[0]!.up();
    await t.setCatalog(ok(prof({ session: "agents" })));
    expect(t.links[0]!.closed).toBe(1);
    expect(t.links).toHaveLength(2);
    expect(t.links[1]!.profile.session).toBe("agents");
    expect(t.mgr.list()[0]!.state).toBe("connecting");
    await t.setCatalog({ kind: "missing" });
    expect(t.links[1]!.closed).toBe(1);
    expect(t.mgr.list()).toEqual([]);
    t.mgr.stop();
  });

  it("start の中で同期に失敗する試みでも、反映の途中の一覧を配らず、最後に 1 回だけ配る", async () => {
    const clock = new ManualClock();
    const events: MachineStatus[][] = [];
    let catalog: CatalogLoad = ok(prof());
    let sig = "1";
    const mgr = new MachineManager({
      root: "/r",
      clock,
      logger: new MemoryLogger(),
      loadCatalog: async () => catalog,
      statCatalog: async () => sig,
      createLink: (p) => {
        const l = new FakeLink(p);
        l.start = () => l.fail({ kind: "attention", message: "ssh が見つかりません" });
        return l as unknown as MachineLink;
      },
    });
    mgr.onChanged((m) => events.push(m));
    await mgr.start();
    expect(events).toEqual([
      [{ id: A, label: "Build", state: "attention", message: "ssh が見つかりません" }],
    ]);
    // 名前の変更と追加を同時に（追加した方の試みが反映の途中で同期に失敗する）
    catalog = ok(prof({ label: "Renamed" }), prof({ id: B, label: "GPU", target: "gpu" }));
    sig = "2";
    clock.advance(MANAGER_TIMINGS.pollMs);
    await flush();
    await flush();
    expect(events.map((e) => e.map((m) => m.label))).toEqual([["Build"], ["Renamed", "GPU"]]);
    mgr.stop();
  });

  it("読み込みの途中に来た変更も取りこぼさない（読み直しをまとめる）", async () => {
    const clock = new ManualClock();
    let sig = "1";
    const releases: (() => void)[] = [];
    const catalogs: CatalogLoad[] = [
      ok(prof()),
      ok(prof({ label: "Two" })),
      ok(prof({ label: "Three" })),
    ];
    let loads = 0;
    const mgr = new MachineManager({
      root: "/r",
      clock,
      logger: new MemoryLogger(),
      loadCatalog: () =>
        new Promise<CatalogLoad>((resolve) => {
          const c = catalogs[Math.min(loads, catalogs.length - 1)]!;
          loads++;
          releases.push(() => resolve(c));
        }),
      statCatalog: async () => sig,
      createLink: (p) => new FakeLink(p) as unknown as MachineLink,
    });
    const started = mgr.start();
    await flush();
    sig = "2"; // 1 回目の読み込みの途中で変わる
    clock.advance(MANAGER_TIMINGS.pollMs);
    await flush();
    releases.shift()!();
    await flush();
    await flush();
    sig = "3";
    releases.shift()?.();
    await flush();
    clock.advance(MANAGER_TIMINGS.pollMs);
    await flush();
    await flush();
    while (releases.length > 0) {
      releases.shift()!();
      await flush();
      await flush();
    }
    await started;
    expect(mgr.list()[0]!.label).toBe("Three");
    mgr.stop();
  });

  it("stop は ssh の子が終わるのを待ち（引き継ぎの execve の前）、start でもう一度繋ぐ", async () => {
    const t = setup(ok(prof()));
    await t.mgr.start();
    let exit!: () => void;
    (t.links[0] as unknown as { exited: Promise<void> }).exited = new Promise<void>(
      (r) => (exit = r),
    );
    let stopped = false;
    const stopping = t.mgr.stop().then(() => (stopped = true));
    await flush();
    expect(stopped).toBe(false);
    exit();
    await stopping;
    expect(stopped).toBe(true);
    expect(t.links[0]!.closed).toBe(1);
    await t.mgr.start();
    expect(t.links).toHaveLength(2);
    expect(t.mgr.list()[0]!.state).toBe("connecting");
    // 子が終わらなくても上限で抜ける
    (t.links[1] as unknown as { exited: Promise<void> }).exited = new Promise<void>(
      () => undefined,
    );
    const hang = t.mgr.stop(3000);
    t.clock.advance(3000);
    await hang;
  });

  it("listWhenLoaded は最初の読み込みを待ってから一覧を返す（読む前に空を返さない）。読めなければ上限で今の一覧", async () => {
    const t = setup(ok(prof()));
    let got: MachineStatus[] | undefined;
    void t.mgr.listWhenLoaded().then((l) => (got = l));
    await flush();
    expect(got).toBeUndefined();
    await t.mgr.start();
    await flush();
    expect(got?.map((m) => m.label)).toEqual(["Build"]);
    const u = setup(ok(prof()));
    let late: MachineStatus[] | undefined;
    void u.mgr.listWhenLoaded(3000).then((l) => (late = l));
    u.clock.advance(3000);
    await flush();
    expect(late).toEqual([]);
    t.mgr.stop();
  });
});
