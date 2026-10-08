import { writeFile } from "node:fs/promises";
import { open as fsOpen } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ext, makeHost, sleep, type HostHarness } from "./hostHarness.js";

let h: HostHarness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});
const keyOf = (id: string) => `user:${id}`;
const infoOf = (x: HostHarness, id: string) => x.host.list().extensions.find((e) => e.id === id);
const types = (c: { lines(): Record<string, unknown>[] }) => c.lines().map((l) => l["type"]);

describe("ExtensionHost: 起動と読み直し（T9-2）", () => {
  it("起動で ext.hello → ext.panes の順に書く。環境変数に秘密がなく、作業ディレクトリは homeDir", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    expect(h.spawnCalls).toHaveLength(1);
    expect(h.spawnCalls[0]!.file).toBe("/bin/sh");
    expect(h.spawnCalls[0]!.args).toEqual(["-c", "node a.mjs"]);
    expect(h.spawnCalls[0]!.cwd).toBe("/home/test");
    expect(h.spawnCalls[0]!.env["SODA_EXTENSION_ID"]).toBe("a");
    expect(h.spawnCalls[0]!.env["SODACTL_TOKEN"]).toBeUndefined();
    expect(h.spawnCalls[0]!.env["SODA_PANE_ID"]).toBeUndefined();
    await h.until(() => h!.children[0]!.lines().length >= 2);
    expect(types(h.children[0]!)).toEqual(["ext.hello", "ext.panes"]);
    expect(infoOf(h, "a")).toMatchObject({ state: "running", scope: "user" });
  });

  it("start() を、止めずに 2 回呼んでも spawn は 1 回", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await Promise.all([h.host.start(), h.host.start()]);
    await h.host.start();
    expect(h.spawnCalls).toHaveLength(1);
  });

  it("読み直しの 4 通り: 足す・消す・変える・変えない（runId が同じ）", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a"), ext("b")]);
    await h.host.start();
    const runA = infoOf(h, "a")!.runId;
    const runB = infoOf(h, "b")!.runId;
    expect(h.spawnCalls).toHaveLength(2);
    // 足す
    await h.writeConfig([ext("a"), ext("b"), ext("c")]);
    await h.run(h.host.reload());
    expect(infoOf(h, "c")!.state).toBe("running");
    // 変えない
    expect(infoOf(h, "a")!.runId).toBe(runA);
    expect(infoOf(h, "b")!.runId).toBe(runB);
    expect(h.spawnCalls).toHaveLength(3);
    // 変える（a の command）・消す（b）
    await h.writeConfig([ext("a", { command: "node a2.mjs" }), ext("c")]);
    const p = h.run(h.host.reload());
    await h.until(() => infoOf(h!, "a")?.state === "running" && infoOf(h!, "a")?.runId !== runA, 50);
    await p;
    expect(infoOf(h, "a")!.runId).not.toBe(runA);
    expect(infoOf(h, "b")).toBeUndefined();
    expect(h.spawnCalls.at(-1)!.args).toEqual(["-c", "node a2.mjs"]);
    expect(h.children[0]!.exited).toBe(true); // 古い a
    expect(h.children[1]!.exited).toBe(true); // b
    expect(h.children[2]!.exited).toBe(false); // c は動き続ける
  });

  it("設定が規則の外 → そのファイルの拡張は 0（動いていたものが止まり）、problems に出る", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.writeConfig([ext("a"), ext("B-bad")]);
    const p = h.run(h.host.reload());
    await h.until(() => h!.host.list().extensions.length === 0, 50);
    await p;
    const l = h.host.list();
    expect(l.extensions).toEqual([]);
    expect(l.problems).toHaveLength(1);
    expect(l.problems[0]).toMatchObject({ scope: "user", path: join(h.dir, "extensions.json") });
    expect(h.children[0]!.exited).toBe(true);
  });

  it("enabled: false と、画面で切った記録は disabled。記録が壊れていれば全部 disabled（spawn なし）", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a", { enabled: false }), ext("b"), ext("c")]);
    await h.host.start();
    expect(infoOf(h, "a")).toMatchObject({ state: "disabled", enabledInConfig: false });
    expect(infoOf(h, "b")!.state).toBe("running");
    await h.run(h.host.setEnabled("desktop", keyOf("b"), false));
    expect(infoOf(h, "b")).toMatchObject({ state: "disabled", disabledByUser: true });
    expect(h.spawnCalls).toHaveLength(2); // b, c
    await h.run(h.host.setEnabled("desktop", keyOf("b"), true));
    expect(infoOf(h, "b")!.state).toBe("running");
    await h.run(h.host.stop());
    // 壊れた記録
    await writeFile(join(h.dir, "extension-state.json"), "{ nope", { mode: 0o600 });
    const before = h.spawnCalls.length;
    await h.host.start();
    expect(h.spawnCalls.length).toBe(before);
    expect(h.host.list().extensions.every((e) => e.state === "disabled")).toBe(true);
    expect(h.host.list().problems.some((p) => p.scope === "state")).toBe(true);
    // 入切を 1 つ変えると、作り直す
    await h.run(h.host.setEnabled("desktop", keyOf("c"), true));
    expect(infoOf(h, "b")!.state).toBe("running");
    expect(h.host.list().problems.some((p) => p.scope === "state")).toBe(false);
  });

  it("startOne が、起動の直前に設定を読み直し、digest が違えば起動しない（新しい中身で起動し直される）", async () => {
    let opens = 0;
    h = await makeHost({
      open: async (p, f) => {
        opens += 1;
        if (opens === 2) await writeFile(p, JSON.stringify({ extensions: [{ id: "a", command: "node NEW.mjs" }] }), { mode: 0o600 });
        return fsOpen(p, f);
      },
    });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.until(() => h!.spawnCalls.length >= 1);
    expect(h.spawnCalls).toHaveLength(1);
    expect(h.spawnCalls[0]!.args).toEqual(["-c", "node NEW.mjs"]); // 古い中身では起動していない
  });

  it("startOne が設定を読んでいる途中で stop() → 読み終わっても spawn されない", async () => {
    let release: () => void = () => undefined;
    let opens = 0;
    h = await makeHost({
      open: async (p, f) => {
        opens += 1;
        if (opens === 2) await new Promise<void>((r) => (release = r));
        return fsOpen(p, f);
      },
    });
    await h.writeConfig([ext("a")]);
    const started = h.host.start();
    await h.until(() => opens >= 2);
    await h.run(h.host.stop());
    release();
    await started;
    await sleep(30);
    expect(h.spawnCalls).toHaveLength(0);
  });

  it("stop() の直後に start() で再開し、古い startOne が読み込みの途中にいても、spawn は 1 回だけ（古い世代の startOne が、新しい世代の後から子を起動しない）", async () => {
    let opens = 0;
    let release: () => void = () => undefined;
    const gateP = new Promise<void>((r) => (release = r));
    h = await makeHost({
      open: async (p, f) => {
        opens += 1;
        if (opens === 2) await gateP; // 古い startOne の読み直し
        return fsOpen(p, f);
      },
    });
    await h.writeConfig([ext("a")]);
    const first = h.host.start();
    await h.until(() => opens >= 2);
    await h.run(h.host.stop());
    const second = h.host.start(); // 新しい世代。chain では古い仕事の後ろ
    release();
    await Promise.all([first, second]);
    await sleep(30);
    expect(h.spawnCalls).toHaveLength(1);
    expect(infoOf(h, "a")!.state).toBe("running");
    expect(h.children.filter((c) => !c.exited)).toHaveLength(1);
  });

  it("stop() は chain が詰まっていても（偽の open が返らない）すぐ返る", async () => {
    h = await makeHost({ open: () => new Promise(() => undefined) });
    await h.writeConfig([ext("a")]);
    void h.host.start();
    await sleep(10);
    await h.run(h.host.stop());
    expect(h.spawnCalls).toHaveLength(0);
  });

  it("stop() は closing（止めている途中の起動）も待つ", async () => {
    h = await makeHost({ groupDiesOn: "SIGKILL" });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    // 合図を無視する子を、画面で無効にする（reconcile の 5 が proc.stop を待っている）
    const disabling = h.run(h.host.setEnabled("desktop", keyOf("a"), false));
    await h.until(() => h!.groups.signals(1000).includes("SIGTERM"));
    let stopped = false;
    const stopping = h.host.stop().then(() => (stopped = true));
    await sleep(20);
    expect(stopped).toBe(false); // その子の settled まで待つ
    await h.drive(2600);
    await stopping;
    expect(stopped).toBe(true);
    expect(h.groups.has(1000)).toBe(false);
    await disabling.catch(() => undefined);
    expect(h.spawnCalls).toHaveLength(1);
  });

  it("stopped の間の reload・restart は、spawn せずに今の一覧を返す。setEnabled は記録だけを書く", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.run(h.host.stop());
    const n = h.spawnCalls.length;
    expect((await h.run(h.host.reload())).extensions).toHaveLength(1);
    await h.run(h.host.restart(keyOf("a")));
    await h.run(h.host.setEnabled("desktop", keyOf("a"), false));
    expect(h.spawnCalls.length).toBe(n);
    await h.host.start();
    expect(infoOf(h, "a")!.state).toBe("disabled"); // 記録は残っていた
    expect(h.spawnCalls.length).toBe(n);
  });

  it("restart と reconcile が重なっても、spawn は 1 回（restart の分）", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    const before = infoOf(h, "a")!.runId;
    const both = h.run(Promise.all([h.host.restart(keyOf("a")), h.host.reload()]));
    await h.until(() => h!.children[0]!.exited, 50);
    await both;
    expect(h.spawnCalls).toHaveLength(2);
    expect(infoOf(h, "a")!.runId).not.toBe(before);
  });

  it("restart: 知らない key は not_found", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await expect(h.host.restart("user:zzz")).rejects.toMatchObject({ code: "not_found" });
    expect(() => h!.host.log("user:zzz")).toThrow();
  });

  it("同時に動かす合計の上限: 3 つ目は over_limit で、動いているものは止まらない。空きが出来て reload すると動く", async () => {
    h = await makeHost({ limits: { runningMax: 2 } });
    await h.writeConfig([ext("a"), ext("b"), ext("c")]);
    await h.host.start();
    expect(infoOf(h, "a")!.state).toBe("running");
    expect(infoOf(h, "b")!.state).toBe("running");
    expect(infoOf(h, "c")!.state).toBe("over_limit");
    // 順が前の拡張を足しても、動いているものは譲らない
    await h.writeConfig([ext("0"), ext("a"), ext("b"), ext("c")]);
    await h.run(h.host.reload());
    expect(infoOf(h, "a")!.state).toBe("running");
    expect(infoOf(h, "b")!.state).toBe("running");
    expect(infoOf(h, "0")!.state).toBe("over_limit");
    // 空きが出来る
    await h.writeConfig([ext("0"), ext("a", { enabled: false }), ext("b"), ext("c")]);
    const p = h.run(h.host.reload());
    await h.until(() => infoOf(h!, "a")?.state === "disabled", 50);
    await p;
    expect(infoOf(h, "0")!.state).toBe("running");
    expect(infoOf(h, "c")!.state).toBe("over_limit");
  });

  it("設定を読む処理が 2 秒で返らない → problems に出る。同じファイルへの読み取りを積み上げない。5 秒後に差を埋める仕事を予約（続けて 3 回まで）", async () => {
    let opens = 0;
    let gate = true;
    h = await makeHost({
      open: (p, f) => {
        opens += 1;
        return gate ? new Promise(() => undefined) : fsOpen(p, f);
      },
    });
    await h.writeConfig([ext("a")]);
    const started = h.host.start();
    await h.until(() => opens === 1);
    await h.drive(2100);
    await started;
    expect(h.host.list().problems.some((p) => p.scope === "user")).toBe(true);
    expect(h.spawnCalls).toHaveLength(0);
    // 5 秒後に 1 回予約される。前の読み取りが返っていないので、新しく出さない（opens は増えない）。
    await h.drive(5100);
    expect(opens).toBe(1);
    // 次の操作（setEnabled）が待たされない: 記録のファイルに依らない not_found で即座に返る
    await expect(h.host.setEnabled("desktop", "user:a", false)).rejects.toMatchObject({ code: "not_found" });
    gate = false;
  });

  it("extension.changed は、同じ一覧なら出ない。画面の種類でない接続の setEnabled は invalid_params。list() に command が無い", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a", { command: "node SECRET-COMMAND.mjs --token=XYZ" })]);
    await h.host.start();
    const count = () => h!.events.filter((e) => e.event === "extension.changed").length;
    const c1 = count();
    expect(c1).toBeGreaterThan(0);
    await h.run(h.host.reload());
    expect(count()).toBe(c1);
    expect(h.events.filter((e) => e.event === "extension.changed").every((e) => Object.keys(e.data).length === 0)).toBe(true);
    await expect(h.host.setEnabled("external", keyOf("a"), false)).rejects.toMatchObject({ code: "invalid_params" });
    expect(JSON.stringify(h.host.list())).not.toContain("SECRET-COMMAND");
    expect(JSON.stringify(h.host.list())).not.toContain("XYZ");
  });

  it("面の数（displays）だけが変わっても、extension.changed は出ない", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.until(() => h!.children[0]!.lines().length >= 2);
    const count = () => h!.events.filter((e) => e.event === "extension.changed").length;
    const before = count();
    h.children[0]!.say({ id: 1, method: "display.set", params: { paneId: "p1", name: "m", kind: "panel", format: "html", content: "x" } });
    await h.until(() => h!.displays.countOwned(`ext:${keyOf("a")}:run1`) === 1);
    expect(infoOf(h, "a")!.displays).toBe(1);
    expect(count()).toBe(before);
  });
});

describe("ExtensionHost: 終わったときと起動し直し（T9-3）", () => {
  const crash = async (x: HostHarness, i: number, code = 1) => {
    x.children[i]!.exit(code);
    await x.until(() => infoOf(x, "a")?.state !== "running", 20);
  };

  it("落ちた後の間隔 1・2・4・8 秒、5 回目で failed。60 秒動いた後は 1 秒へ戻る", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    for (const [i, delay] of [1000, 2000, 4000, 8000].entries()) {
      await crash(h, i);
      expect(infoOf(h, "a")).toMatchObject({ state: "backoff", failures: i + 1 });
      await h.drive(delay - 100);
      expect(h.spawnCalls).toHaveLength(i + 1);
      await h.drive(200);
      await h.until(() => h!.spawnCalls.length === i + 2);
    }
    await crash(h, 4);
    expect(infoOf(h, "a")).toMatchObject({ state: "failed", failures: 5 });
    await h.drive(120_000, 5000);
    expect(h.spawnCalls).toHaveLength(5); // failed は起動し直さない
    // reload で戻る → 60 秒動いた後は 1 秒へ戻る
    await h.run(h.host.reload());
    expect(infoOf(h, "a")!.state).toBe("running");
    await h.drive(61_000, 5000);
    await crash(h, 5);
    expect(infoOf(h, "a")).toMatchObject({ state: "backoff", failures: 1 });
  }, 30_000);

  it("bad_lines で止まった回も、落ちた回に数える", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    for (let i = 0; i < 20; i++) h.children[0]!.stdout.write("bad\n");
    await h.until(() => infoOf(h!, "a")?.state === "backoff", 50);
    expect(infoOf(h, "a")).toMatchObject({ failures: 1, lastExit: { reason: "bad_lines" } });
  });

  it("終了コード 0 → exited（起動し直さない）。reload・restart で戻る", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await crash(h, 0, 0);
    expect(infoOf(h, "a")).toMatchObject({ state: "exited", lastExit: { code: 0, reason: "exited" } });
    await h.drive(70_000, 5000);
    expect(h.spawnCalls).toHaveLength(1);
    await h.run(h.host.reload());
    expect(infoOf(h, "a")!.state).toBe("running");
    await crash(h, 1, 0);
    await h.run(h.host.restart(keyOf("a")));
    expect(infoOf(h, "a")!.state).toBe("running");
    expect(h.spawnCalls).toHaveLength(3);
  });

  it("落ちた後・時間が来る前に、設定ファイルを書き換える → 時間が来ても古い中身では spawn されない", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await crash(h, 0);
    await h.writeConfig([ext("a", { command: "node CHANGED.mjs" })]);
    await h.drive(1200);
    await h.until(() => h!.spawnCalls.length === 2);
    expect(h.spawnCalls[1]!.args).toEqual(["-c", "node CHANGED.mjs"]);
    // 中身は変わったので、digest が違う登録として起動し直される（古い中身では起動していない）
    expect(h.spawnCalls.filter((c) => c.args[1] === "node a.mjs")).toHaveLength(1);
  });

  it("backoff の拡張がある状態で stop() → start() → 起動し直される。stop() の後に来た backoff のタイマーは何もしない", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await crash(h, 0);
    await h.run(h.host.stop());
    await h.drive(5000);
    expect(h.spawnCalls).toHaveLength(1);
    await h.host.start();
    expect(infoOf(h, "a")!.state).toBe("running");
    expect(h.spawnCalls).toHaveLength(2);
  });

  it("stop が 3 秒で返った後に、新しい起動 → 古い子の exit が遅れて届いても、新しい起動の面・状態・runs が変わらない", async () => {
    h = await makeHost({ groupDiesOn: "never" });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    const stopping = h.host.stop();
    await h.drive(3200);
    await stopping;
    await h.host.start();
    expect(h.spawnCalls).toHaveLength(2);
    const runId = infoOf(h, "a")!.runId;
    await h.until(() => h!.children[1]!.lines().length >= 2);
    h.children[1]!.say({ id: 1, method: "display.set", params: { paneId: "p1", name: "m", kind: "panel", format: "html", content: "x" } });
    await h.until(() => h!.displays.countOwned(`ext:${keyOf("a")}:run2`) === 1);
    h.children[0]!.exit(1); // 古い子が、いまごろ終わった
    await sleep(30);
    expect(infoOf(h, "a")).toMatchObject({ state: "running", runId, displays: 1 });
  });

  it("finishRun の後に、その起動の display.set が遅れて届いても、台帳が呼ばれない（面が出来ない）", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.until(() => h!.children[0]!.lines().length >= 2);
    const c = h.children[0]!;
    await h.run(h.host.setEnabled("desktop", keyOf("a"), false));
    c.say({ id: 1, method: "display.set", params: { paneId: "p1", name: "m", kind: "panel", format: "html", content: "x" } });
    await sleep(30);
    expect(h.displays.list("p1").displays).toEqual([]);
  });

  it("終わったら、その起動の札の面だけが closeOwned される（次の起動の面は残る）", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.until(() => h!.children[0]!.lines().length >= 2);
    h.children[0]!.say({ id: 1, method: "display.set", params: { paneId: "p1", name: "m", kind: "panel", format: "html", content: "x" } });
    await h.until(() => h!.displays.list("p1").displays.length === 1);
    h.displays.set("p1", { name: "plain", kind: "panel", format: "text", content: "z" });
    await crash(h, 0);
    expect(h.displays.list("p1").displays.map((d) => d.name)).toEqual(["plain"]);
    await h.drive(1200);
    await h.until(() => h!.children.length === 2);
    await h.until(() => h!.children[1]!.lines().length >= 2);
    h.children[1]!.say({ id: 1, method: "display.set", params: { paneId: "p1", name: "m", kind: "panel", format: "html", content: "y" } });
    await h.until(() => h!.displays.list("p1").displays.length === 2);
  });

  it("backoff の時間が来たときに枠が無ければ over_limit", async () => {
    h = await makeHost({ limits: { runningMax: 1 } });
    await h.writeConfig([ext("a"), ext("b")]);
    await h.host.start();
    expect(infoOf(h, "b")!.state).toBe("over_limit");
    await crash(h, 0);
    // a の枠が空いた → reconcile はしないが、b は over_limit のまま。a の backoff の時間が来る前に b を動かす（reload）
    await h.run(h.host.reload());
    expect(infoOf(h, "b")!.state).toBe("running");
    await h.drive(1200);
    await h.until(() => infoOf(h!, "a")?.state === "over_limit");
  });

  it("onExit の中で例外が出ても、捕まらない拒否にならない", async () => {
    const rejections: unknown[] = [];
    const onRej = (r: unknown) => rejections.push(r);
    process.on("unhandledRejection", onRej);
    try {
      h = await makeHost();
      await h.writeConfig([ext("a")]);
      await h.host.start();
      // 一覧の組み立てが投げる状況を作る（bus の購読者が投げても握りつぶされる）
      h.bus.subscribe(() => {
        throw new Error("subscriber");
      });
      await crash(h, 0);
      await sleep(30);
    } finally {
      process.off("unhandledRejection", onRej);
    }
    expect(rejections).toEqual([]);
  });
});

describe("ExtensionHost: pane の一覧と、出来事の渡し方（T9-4）", () => {
  const panesLines = (c: { lines(): Record<string, unknown>[] }) => c.lines().filter((l) => l["type"] === "ext.panes");

  it("pane を足す・消すと、新しい一覧の行が届く。中身が同じなら届かない", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.until(() => panesLines(h!.children[0]!).length === 1);
    h.bus.publish({ event: "layout.updated", data: {} } as never);
    h.clock.advance(150);
    await sleep(10);
    expect(panesLines(h.children[0]!)).toHaveLength(1); // 同じ
    h.panes.set("p3", { workspaceId: "w1" });
    h.bus.publish({ event: "pane.created", data: {} } as never);
    h.clock.advance(150);
    await h.until(() => panesLines(h!.children[0]!).length === 2);
    h.panes.delete("p1");
    h.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as never);
    h.clock.advance(150);
    await h.until(() => panesLines(h!.children[0]!).length === 3);
    const last = panesLines(h.children[0]!).at(-1) as { panes: { id: string }[] };
    expect(last.panes.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("pane.updated が 50ms おきに続いても、500ms 以内に作り直される", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.until(() => panesLines(h!.children[0]!).length === 1);
    h.panes.set("p9", { workspaceId: "w1" });
    for (let t = 0; t < 500; t += 50) {
      h.bus.publish({ event: "pane.updated", data: {} } as never);
      h.clock.advance(50);
    }
    await h.until(() => panesLines(h!.children[0]!).length === 2);
  });

  it("stopped の間は、bus の受け手がタイマーを掛けない", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    await h.run(h.host.stop());
    const before = h.clock.pending();
    h.bus.publish({ event: "pane.created", data: {} } as never);
    expect(h.clock.pending()).toBe(before);
  });

  it("bus の受け手の中で例外が出ても、publish の呼び出し元へ伝わらない（一覧の組み立てが投げても）", async () => {
    h = await makeHost();
    await h.writeConfig([ext("a")]);
    await h.host.start();
    expect(() => h!.bus.publish({ event: "pane.created", data: {} } as never)).not.toThrow();
    expect(() => h!.clock.advance(1000)).not.toThrow();
  });

  const startWithFace = async (x: HostHarness, pane = "p2") => {
    await x.writeConfig([ext("a")]);
    await x.host.start();
    await x.until(() => x.children[0]!.lines().length >= 2);
    x.children[0]!.say({ id: 1, method: "display.set", params: { paneId: pane, name: "m", kind: "panel", format: "html", content: "x" } });
    await x.until(() => x.displays.list(pane).displays.length === 1);
    x.displays.subscribe("b1", ["panel", "actions"]);
    return x.children[0]!;
  };

  it("範囲の外の pane の面への display.action は、拡張へ渡らず、面が閉じて out_of_scope が届く", async () => {
    const scope = { out: new Set<string>() };
    h = await makeHost({ inScope: (_e, p) => !scope.out.has(p) });
    const c = await startWithFace(h);
    const id = h.displays.list("p2").displays[0]!.id;
    h.displays.action("b1", { id, rev: 1, action: "go" });
    await h.until(() => c.lines().some((l) => l["type"] === "display.action"));
    scope.out.add("p2");
    h.displays.action("b1", { id, rev: 1, action: "secret" });
    expect(c.lines().filter((l) => l["type"] === "display.action")).toHaveLength(1);
    await h.until(() => h!.displays.list("p2").displays.length === 0);
    await h.until(() => c.lines().some((l) => l["type"] === "display.closed" && l["reason"] === "out_of_scope"));
  });

  it("範囲の外の pane の display.closed（利用者が閉じた）は、理由が out_of_scope に替わって届く。pane が閉じたときは pane_closed のまま", async () => {
    const scope = { out: new Set<string>() };
    h = await makeHost({ inScope: (_e, p) => !scope.out.has(p) });
    const c = await startWithFace(h);
    scope.out.add("p2");
    const id = h.displays.list("p2").displays[0]!.id;
    h.displays.dismiss("b1", { id });
    await h.until(() => c.lines().some((l) => l["type"] === "display.closed"));
    expect(c.lines().find((l) => l["type"] === "display.closed")!["reason"]).toBe("out_of_scope");
    // pane が閉じた
    scope.out.clear();
    c.say({ id: 2, method: "display.set", params: { paneId: "p1", name: "q", kind: "panel", format: "html", content: "x" } });
    await h.until(() => h!.displays.list("p1").displays.length === 1);
    h.panes.delete("p1");
    scope.out.add("p1");
    h.bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as never);
    await h.until(() => c.lines().some((l) => l["type"] === "display.closed" && l["name"] === "q"));
    expect(c.lines().find((l) => l["type"] === "display.closed" && l["name"] === "q")!["reason"]).toBe("pane_closed");
  });

  it("台帳の受け手の中では台帳を呼ばない（closeOwned は microtask で呼ばれる）", async () => {
    const scope = { out: new Set<string>() };
    h = await makeHost({ inScope: (_e, p) => !scope.out.has(p) });
    await startWithFace(h);
    let calls = 0;
    const orig = h.displays.closeOwned.bind(h.displays);
    h.displays.closeOwned = ((...a: Parameters<typeof orig>) => {
      calls += 1;
      return orig(...a);
    }) as typeof orig;
    scope.out.add("p2");
    const id = h.displays.list("p2").displays[0]!.id;
    h.displays.action("b1", { id, rev: 1, action: "x" });
    expect(calls).toBe(0); // 受け手の中（同期）では呼ばれていない
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it("bus のイベントが 1 つも出なくても、2 秒（scopeReviewMs）で、範囲の外の pane の面が消える", async () => {
    const scope = { out: new Set<string>() };
    h = await makeHost({ inScope: (_e, p) => !scope.out.has(p) });
    const c = await startWithFace(h);
    scope.out.add("p2");
    h.clock.advance(1900);
    expect(h.displays.list("p2").displays).toHaveLength(1);
    h.clock.advance(200);
    expect(h.displays.list("p2").displays).toHaveLength(0);
    await h.until(() => c.lines().some((l) => l["type"] === "display.closed" && l["reason"] === "out_of_scope"));
  });
});

describe("ExtensionHost: 設定・無効の記録が読めないとき（時間切れ）は現状維持。拒否は止める", () => {
  function gatedOpen() {
    const g = { on: false, release: () => undefined as void };
    const gateP = new Promise<void>((r) => (g.release = r));
    const open = async (p: string, f: number) => {
      if (g.on) await gateP;
      return fsOpen(p, f);
    };
    return { g, open };
  }

  it("時間切れでは、動いている拡張が止まらない（runId が同じ）。一覧に待っている旨の problems が出る。読めるようになれば戻る", async () => {
    const { g, open } = gatedOpen();
    h = await makeHost({ open });
    await h.writeConfig([ext("a"), ext("b")]);
    await h.host.start();
    const runA = infoOf(h, "a")!.runId;
    g.on = true;
    await h.run(h.host.reload());
    expect(infoOf(h, "a")).toMatchObject({ state: "running", runId: runA });
    expect(infoOf(h, "b")!.state).toBe("running");
    expect(h.children.every((c) => !c.exited)).toBe(true);
    expect(h.host.list().problems.some((p) => p.scope === "user" && p.problem.includes("時間内"))).toBe(true);
    g.on = false;
    g.release();
    await h.drive(6000);
    expect(h.host.list().problems).toEqual([]);
    expect(infoOf(h, "a")!.runId).toBe(runA);
  });

  it("時間切れの間、落ちた拡張は起動し直されず「waiting」になる。読めるようになったら起動し直される", async () => {
    const { g, open } = gatedOpen();
    h = await makeHost({ open });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    h.children[0]!.exit(1);
    await h.until(() => infoOf(h!, "a")?.state === "backoff", 20);
    g.on = true;
    await h.drive(4000);
    expect(infoOf(h, "a")!.state).toBe("waiting");
    expect(h.spawnCalls).toHaveLength(1);
    g.on = false;
    g.release();
    await h.drive(7000);
    await h.until(() => h!.spawnCalls.length === 2);
    expect(infoOf(h, "a")!.state).toBe("running");
  });

  it("時間切れの最中の setEnabled(false) で、その拡張が止まる（ほかは止まらない）。list は disabled。true は読めたときだけ起動する", async () => {
    const { g, open } = gatedOpen();
    h = await makeHost({ open });
    await h.writeConfig([ext("a"), ext("b")]);
    await h.host.start();
    g.on = true;
    await h.run(h.host.setEnabled("desktop", keyOf("a"), false));
    expect(infoOf(h, "a")).toMatchObject({ state: "disabled", disabledByUser: true });
    expect(h.children[0]!.exited).toBe(true);
    expect(h.children[1]!.exited).toBe(false);
    expect(infoOf(h, "b")!.state).toBe("running");
    // true は、読めないうちは起動しない
    await h.run(h.host.setEnabled("desktop", keyOf("a"), true));
    expect(h.spawnCalls).toHaveLength(2);
    g.on = false;
    g.release();
    await h.drive(7000);
    await h.until(() => h!.spawnCalls.length === 3);
    expect(infoOf(h, "a")!.state).toBe("running");
  });

  it("時間切れの最中の reload の結果に、設定を読めなかったことが出る", async () => {
    const { g, open } = gatedOpen();
    h = await makeHost({ open });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    g.on = true;
    const res = await h.run(h.host.reload());
    expect(res.problems.some((p) => p.scope === "user" && p.problem.includes("設定を読めないので、前の状態のまま"))).toBe(true);
    expect(res.extensions[0]!.state).toBe("running");
    g.on = false;
    g.release();
  });

  it("無効の記録の読み込みが時間切れでも、動いている拡張は止まらない", async () => {
    let blockState = false;
    let release: () => void = () => undefined;
    const gateP = new Promise<void>((r) => (release = r));
    h = await makeHost({
      stateOpen: async (p, f) => {
        if (blockState) await gateP;
        return fsOpen(p, f);
      },
    });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    blockState = true;
    await h.run(h.host.reload());
    expect(infoOf(h, "a")!.state).toBe("running");
    expect(h.host.list().problems.some((p) => p.scope === "state")).toBe(true);
    release();
    blockState = false;
  });

  it("拒否（規則の外）は、いままでどおり止める。時間切れの後でも", async () => {
    const { g, open } = gatedOpen();
    h = await makeHost({ open });
    await h.writeConfig([ext("a")]);
    await h.host.start();
    g.on = true;
    await h.run(h.host.reload());
    g.on = false;
    g.release();
    await h.writeConfig([ext("a"), ext("BAD")]);
    await h.drive(6000);
    expect(h.host.list().extensions).toEqual([]);
    expect(h.children[0]!.exited).toBe(true);
  });
});
