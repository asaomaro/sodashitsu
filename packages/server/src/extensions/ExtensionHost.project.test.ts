import { open as fsOpen, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RpcError } from "@sodashitsu/protocol";
import { entryDigest, instanceKey } from "./approval.js";
import type { ExtensionEntry } from "./extensionConfig.js";
import { ext, makeHost, sleep, type HostHarness } from "./hostHarness.js";

// 20261007-ext-host T22・T22-2・T22-3：プロジェクトの拡張。承認していないものは、どのきっかけでも実行されない。
let h: HostHarness | undefined;
afterEach(async () => {
  await h?.cleanup();
  h = undefined;
});

const full = (id: string, extra: Partial<ExtensionEntry> = {}): ExtensionEntry => ({ id, command: `node ${id}.mjs`, description: null, enabled: true, allow: [], onUnresponsive: "pass", cwd: null, ...extra });
const pkey = (root: string, id: string) => instanceKey("project", root, id);
const digestOf = (root: string, e: ExtensionEntry) => entryDigest(root, e);
const info = (x: HostHarness, root: string, id: string) => x.host.list().extensions.find((e) => e.key === pkey(root, id));
const approve = (x: HostHarness, root: string, e: ExtensionEntry) => x.approvalStore.decideApproved(root, e.id, digestOf(root, e), e);
const SCREEN = "screen-1";

/** 1 つの workspace（w1。開いた場所はリポジトリの中）を持つ host。 */
async function withRepo(entries: unknown[] | null = [ext("a")], o: Parameters<typeof makeHost>[0] = {}) {
  const x = await makeHost(o);
  const root = await x.makeRepo("repo", entries);
  x.workspaces.set("w1", { cwd: root });
  h = x;
  return { x, root };
}

describe("プロジェクトの拡張の状態（T22）", () => {
  it("記録なし → pending で、spawn が呼ばれない", async () => {
    const { x, root } = await withRepo();
    await x.host.start();
    expect(x.spawnCalls).toHaveLength(0);
    expect(info(x, root, "a")).toMatchObject({ scope: "project", state: "pending", root, approval: { status: "none", command: "node a.mjs", cwd: root, deniedBefore: false, approvedAlive: false } });
    expect(info(x, root, "a")!.approval!.digest).toBe(digestOf(root, full("a")));
  });

  it("承認の記録あり → 動く。作業ディレクトリは根・環境変数に SODA_PROJECT_ROOT・hello に scope と root", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    expect(x.spawnCalls).toHaveLength(1);
    expect(x.spawnCalls[0]!.cwd).toBe(root);
    expect(x.spawnCalls[0]!.env["SODA_PROJECT_ROOT"]).toBe(root);
    expect(x.spawnCalls[0]!.env["SODA_EXTENSION_SCOPE"]).toBe("project");
    await x.until(() => x.children[0]!.lines().length >= 1);
    expect(x.children[0]!.lines()[0]).toMatchObject({ type: "ext.hello", extension: { id: "a", scope: "project", root } });
    expect(info(x, root, "a")).toMatchObject({ state: "running", approval: { status: "approved" } });
  });

  it("denied の記録 → denied で spawn なし。enabled: false で未承認 → disabled（pending ではない）", async () => {
    const { x, root } = await withRepo([ext("a"), ext("off", { enabled: false })]);
    await x.approvalStore.decideDenied(root, "a", digestOf(root, full("a")));
    await x.host.start();
    expect(x.spawnCalls).toHaveLength(0);
    expect(info(x, root, "a")!.state).toBe("denied");
    expect(info(x, root, "off")!.state).toBe("disabled");
    expect(info(x, root, "off")!.approval!.status).toBe("none");
  });

  it("利用者の拡張と同じ id でも、key が違う（利用者 user:a・プロジェクト project:<根の SHA>:a）", async () => {
    const { x, root } = await withRepo();
    await x.writeConfig([ext("a")]);
    await x.host.start();
    expect(x.host.list().extensions.map((e) => e.key).sort()).toEqual([pkey(root, "a"), "user:a"].sort());
    expect(info(x, root, "a")!.state).toBe("pending");
    expect(x.host.list().extensions.find((e) => e.key === "user:a")!.state).toBe("running");
    expect(x.spawnCalls).toHaveLength(1);
  });

  it("設定ファイルが誤り（cwd つき）→ その根の拡張は 1 つも採らず、problems に理由（コマンドの文字列を含まない）", async () => {
    const { x, root } = await withRepo([ext("a", { cwd: "/tmp", command: "node SECRET.mjs" })]);
    await x.host.start();
    expect(x.host.list().extensions).toEqual([]);
    const p = x.host.list().problems.find((q) => q.scope === "project");
    expect(p).toMatchObject({ root, path: join(root, ".soda", "extensions.json") });
    expect(p!.problem).toContain("cwd");
    expect(JSON.stringify(x.host.list())).not.toContain("SECRET");
  });

  it("git の外の workspace の根は無く、拡張なし", async () => {
    const { x } = await withRepo();
    x.workspaces.set("w1", { cwd: "/w1" });
    await x.host.start();
    expect(x.host.list().extensions).toEqual([]);
  });

  describe("承認が無ければ、どのきっかけでも spawn が呼ばれない（AC18）", () => {
    it("start・workspace.created・reload・restart・setEnabled(true)・stop→start", async () => {
      const { x, root } = await withRepo();
      await x.host.start();
      const key = pkey(root, "a");
      const none = () => expect(x.spawnCalls).toHaveLength(0);
      none();
      const other = await x.makeRepo("other", [ext("b")]);
      x.addWorkspace("w2", other, "p9");
      await x.drive(1500);
      none(); // workspace.created
      expect(info(x, other, "b")!.state).toBe("pending");
      await x.run(x.host.reload());
      none();
      await x.run(x.host.restart(key)).catch(() => undefined);
      none();
      await x.run(x.host.setEnabled(SCREEN, key, false));
      await x.run(x.host.setEnabled(SCREEN, key, true));
      none();
      await x.run(x.host.stop());
      await x.host.start();
      await x.drive(1500);
      none();
      expect(info(x, root, "a")!.state).toBe("pending");
    });

    it("上限の空きで枠が空いても、承認が無ければ起動しない", async () => {
      const { x, root } = await withRepo([ext("a"), ext("b")], { limits: { runningMax: 1 } });
      await x.writeConfig([ext("u")]);
      await x.host.start();
      expect(x.spawnCalls).toHaveLength(1); // 利用者の u だけ
      await x.writeConfig([]);
      await x.run(x.host.reload());
      expect(x.spawnCalls).toHaveLength(1);
      expect(info(x, root, "a")!.state).toBe("pending");
    });
  });

  describe("起動の直前の確かめ直し（startOne の 3・4）", () => {
    it("承認 → 設定ファイルを書き換え → 拡張を落とす → 時間を進める → spawn されず pending（AC21）", async () => {
      const { x, root } = await withRepo();
      await approve(x, root, full("a"));
      await x.host.start();
      expect(x.spawnCalls).toHaveLength(1);
      await x.writeProjectConfig(root, [ext("a", { command: "node evil.mjs" })]);
      x.children[0]!.exit(1); // reload を待たずに落ちる
      await x.drive(3000);
      expect(x.spawnCalls).toHaveLength(1);
      expect(info(x, root, "a")!.state).toBe("pending");
      expect(info(x, root, "a")!.approval!.command).toBe("node evil.mjs");
    });

    it("承認して動かす → 承認の記録から、その 1 件を直接消す（見張りの前）→ 拡張を落とす → 時間を進める → spawn されない", async () => {
      const { x, root } = await withRepo(undefined, { timings: { approvalsPollMs: 3_600_000 } });
      await approve(x, root, full("a"));
      await x.host.start();
      expect(x.spawnCalls).toHaveLength(1);
      await x.approvalStore.revoke(root, "a"); // reconcile の判定はまだ eligible のまま
      x.children[0]!.exit(1);
      await x.drive(3000);
      expect(x.spawnCalls).toHaveLength(1);
      expect(info(x, root, "a")!.state).toBe("pending");
    });

    it("承認 → 別の中身に書き換え（pending）→ 承認した中身へ戻す → 聞き直されずに動く", async () => {
      const { x, root } = await withRepo();
      await approve(x, root, full("a"));
      await x.host.start();
      await x.writeProjectConfig(root, [ext("a", { command: "node other.mjs" })]);
      await x.run(x.host.reload());
      expect(info(x, root, "a")!.state).toBe("pending");
      expect(x.spawnCalls).toHaveLength(1);
      await x.writeProjectConfig(root, [ext("a")]);
      await x.run(x.host.reload());
      expect(info(x, root, "a")!.state).toBe("running");
      expect(x.spawnCalls).toHaveLength(2);
    });

    it("画面の入切で切って入れ直しても、承認は保たれる。denied は、入切・restart のあとも denied", async () => {
      const { x, root } = await withRepo([ext("a"), ext("d")]);
      await approve(x, root, full("a"));
      await x.approvalStore.decideDenied(root, "d", digestOf(root, full("d")));
      await x.host.start();
      const ka = pkey(root, "a");
      const kd = pkey(root, "d");
      await x.run(x.host.setEnabled(SCREEN, ka, false));
      expect(info(x, root, "a")!.state).toBe("disabled");
      expect(info(x, root, "a")!.approval!.status).toBe("approved");
      await x.run(x.host.setEnabled(SCREEN, ka, true));
      expect(info(x, root, "a")!.state).toBe("running");
      await x.run(x.host.setEnabled(SCREEN, kd, false));
      await x.run(x.host.setEnabled(SCREEN, kd, true));
      await x.run(x.host.restart(kd)).catch(() => undefined);
      expect(info(x, root, "d")!.state).toBe("denied");
      // 起動したのは、承認した a だけ（最初と、入れ直した後の 2 回）。d は 1 回も起動しない。
      expect(x.spawnCalls.map((c) => c.env["SODA_EXTENSION_ID"])).toEqual(["a", "a"]);
    });

    it("A を承認 → B が denied → C に書き換え: previous は A・deniedBefore が真・approvedAlive が真", async () => {
      const { x, root } = await withRepo([ext("a", { command: "node C.mjs" })]);
      await approve(x, root, full("a", { command: "node A.mjs" }));
      await x.approvalStore.decideDenied(root, "a", digestOf(root, full("a", { command: "node B.mjs" })));
      await x.host.start();
      const v = info(x, root, "a")!;
      expect(v.state).toBe("pending");
      expect(v.approval).toMatchObject({ status: "none", deniedBefore: true, approvedAlive: true, previous: { command: "node A.mjs" } });
    });
  });

  describe("寿命と一覧", () => {
    it("最後の workspace が消えると止まり、一覧から消える。記録は残り、approvals に active: false で出る", async () => {
      const { x, root } = await withRepo();
      await approve(x, root, full("a"));
      await x.host.start();
      expect(info(x, root, "a")!.state).toBe("running");
      expect(x.host.list().approvals).toEqual([expect.objectContaining({ root, id: "a", active: true })]);
      x.removeWorkspace("w1");
      await x.drive(1500);
      expect(info(x, root, "a")).toBeUndefined();
      expect(x.groups.has(1000)).toBe(false);
      expect(x.host.list().approvals).toEqual([expect.objectContaining({ root, id: "a", active: false })]);
      // 開き直すと、承認は保たれて動く（記録は消えていない）。
      x.addWorkspace("w1", root, "p1");
      await x.drive(1500);
      expect(info(x, root, "a")!.state).toBe("running");
    });

    it("同じ根の workspace が 2 つ → 1 つ消えても動き続け、2 つ目も消えると止まる", async () => {
      const { x, root } = await withRepo();
      await approve(x, root, full("a"));
      await x.host.start();
      x.addWorkspace("w2", root, "p8");
      await x.drive(1500);
      expect(x.spawnCalls).toHaveLength(1);
      x.removeWorkspace("w2");
      await x.drive(1500);
      expect(info(x, root, "a")!.state).toBe("running");
      x.removeWorkspace("w1");
      await x.drive(1500);
      expect(info(x, root, "a")).toBeUndefined();
    });

    it("33 個の根 → 辞書順で 33 個目は読まれず（open の記録）、problems に出る", async () => {
      const opened: string[] = [];
      const { x } = await withRepo(null, {
        projectFile: {
          open: (p, f) => {
            opened.push(p);
            return fsOpen(p, f);
          },
        },
      });
      const roots: string[] = [];
      for (let i = 0; i < 33; i++) {
        const r = await x.makeRepo(`r${String(i).padStart(2, "0")}`, [ext("e")]);
        roots.push(r);
        x.workspaces.set(`ws${i}`, { cwd: r });
      }
      x.workspaces.delete("w1");
      await x.host.start();
      const last = [...roots].sort()[32]!;
      expect(opened.some((p) => p.startsWith(last))).toBe(false);
      expect(opened.some((p) => p.startsWith([...roots].sort()[0]!))).toBe(true);
      expect(x.host.list().problems.some((p) => p.root === last)).toBe(true);
    });

    it("根を引く処理が返らない workspace があっても、ほかの根の拡張は動き、5 秒後に差を埋める仕事が予約される", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const { x, root } = await withRepo(undefined, {
        projectRoot: {
          realpath: async (p) => {
            if (p.includes("hang")) await gate;
            return (await import("node:fs/promises")).realpath(p);
          },
        },
      });
      await approve(x, root, full("a"));
      const hang = await x.makeRepo("hang", [ext("h")]);
      x.addWorkspace("w2", hang, "p9");
      const p = x.host.start();
      await x.run(p);
      expect(info(x, root, "a")!.state).toBe("running");
      expect(info(x, hang, "h")).toBeUndefined(); // 根なしとして覚えない
      release();
      await x.drive(7000);
      expect(info(x, hang, "h")!.state).toBe("pending"); // 差を埋める仕事が予約されて、根が引けた
    });
  });

  describe("承認の記録の見張りと、読めないとき（止める側に倒す）", () => {
    it("別の ApprovalStore（別の session のつもり）で記録を消す → 見張りの 1 回（approvalsPollMs）で止まる", async () => {
      const { x, root } = await withRepo(undefined, { timings: { approvalsPollMs: 100 } });
      await approve(x, root, full("a"));
      await x.host.start();
      expect(info(x, root, "a")!.state).toBe("running");
      const { ApprovalStore } = await import("./ApprovalStore.js");
      await new ApprovalStore(x.dir).revoke(root, "a");
      await x.drive(500, 50);
      expect(info(x, root, "a")!.state).toBe("pending");
      expect(x.groups.has(1000)).toBe(false);
      expect(x.events.filter((e) => e.event === "extension.changed").length).toBeGreaterThan(0);
    });

    it("承認の記録を壊す → 全部が pending（動く側に倒れない）。動いていたものも止まる", async () => {
      const { x, root } = await withRepo(undefined, { timings: { approvalsPollMs: 100 } });
      await approve(x, root, full("a"));
      await x.host.start();
      await writeFile(join(x.dir, "extension-approvals.json"), "{こわれた", { mode: 0o600 });
      await x.drive(500, 50);
      expect(info(x, root, "a")!.state).toBe("pending");
      expect(x.host.list().problems.some((p) => p.path.endsWith("extension-approvals.json"))).toBe(true);
    });

    it("設定の読み込みが時間切れ（現状維持）の間に承認の記録が消えても、承認の側は止める（混ぜない）", async () => {
      let hang = false;
      const { x, root } = await withRepo(undefined, {
        timings: { approvalsPollMs: 3_600_000 },
        projectFile: {
          open: (p, f) => (hang ? new Promise(() => undefined) : fsOpen(p, f)),
        },
      });
      await approve(x, root, full("a"));
      await x.host.start();
      expect(info(x, root, "a")!.state).toBe("running");
      hang = true;
      await x.approvalStore.revoke(root, "a");
      await x.run(x.host.reload()); // プロジェクトの設定が時間切れ → 現状維持。でも承認の記録は読める
      expect(info(x, root, "a")!.state).toBe("pending");
      expect(x.groups.has(1000)).toBe(false);
    });

    it("承認の記録の読み込みが時間切れ → 承認待ちとして扱い、動いていたものも止める", async () => {
      let hang = false;
      const { x, root } = await withRepo(undefined, {
        timings: { approvalsPollMs: 3_600_000 },
        approvalOpen: (p, f) => (hang ? new Promise(() => undefined) : fsOpen(p, f)),
      });
      await approve(x, root, full("a"));
      await x.host.start();
      expect(info(x, root, "a")!.state).toBe("running");
      hang = true;
      await x.run(x.host.reload());
      expect(info(x, root, "a")!.state).toBe("pending");
      expect(x.groups.has(1000)).toBe(false);
    });
  });
});

describe("承認の操作（T22-2）", () => {
  it("approve → 動く。deny → denied・spawn なし。deny の後の restart でも spawn なし", async () => {
    const { x, root } = await withRepo([ext("a"), ext("d")]);
    await x.host.start();
    const ka = pkey(root, "a");
    const kd = pkey(root, "d");
    await x.run(x.host.approve(SCREEN, ka, digestOf(root, full("a"))));
    expect(info(x, root, "a")!.state).toBe("running");
    expect(x.spawnCalls).toHaveLength(1);
    await x.run(x.host.deny(SCREEN, kd, digestOf(root, full("d"))));
    expect(info(x, root, "d")!.state).toBe("denied");
    await x.run(x.host.restart(kd)).catch(() => undefined);
    expect(x.spawnCalls).toHaveLength(1);
    // 後で approve → 動く。
    await x.run(x.host.approve(SCREEN, kd, digestOf(root, full("d"))));
    expect(info(x, root, "d")!.state).toBe("running");
  });

  it("revoke → 止まって pending（disabled の拡張でも記録が消える）。revoke の後の restart でも spawn なし", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    await x.run(x.host.revoke(SCREEN, root, "a"));
    expect(info(x, root, "a")!.state).toBe("pending");
    expect(x.groups.has(1000)).toBe(false);
    await x.run(x.host.restart(pkey(root, "a"))).catch(() => undefined);
    expect(x.spawnCalls).toHaveLength(1);
    // disabled の拡張の記録も消える
    await approve(x, root, full("a"));
    await x.run(x.host.reload());
    await x.run(x.host.setEnabled(SCREEN, pkey(root, "a"), false));
    await x.run(x.host.revoke(SCREEN, root, "a"));
    expect((await x.approvalStore.load()).find(root, "a")).toBeUndefined();
    expect(info(x, root, "a")!.state).toBe("disabled");
  });

  it("いま workspace が無い根の記録を revoke → 消える（開き直すと pending）", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    x.removeWorkspace("w1");
    await x.drive(1500);
    expect(x.host.list().approvals).toHaveLength(1);
    await x.run(x.host.revoke(SCREEN, root, "a"));
    expect(x.host.list().approvals).toEqual([]);
    x.addWorkspace("w1", root, "p1");
    await x.drive(1500);
    expect(info(x, root, "a")!.state).toBe("pending");
  });

  it("古い digest の approve → extension_stale・記録は書かれない", async () => {
    const { x, root } = await withRepo();
    await x.host.start();
    const stale = digestOf(root, full("a", { command: "node old.mjs" }));
    await expect(x.run(x.host.approve(SCREEN, pkey(root, "a"), stale))).rejects.toMatchObject({ code: "extension_stale" });
    await expect(x.run(x.host.deny(SCREEN, pkey(root, "a"), stale))).rejects.toMatchObject({ code: "extension_stale" });
    expect((await x.approvalStore.load()).records).toEqual([]);
    expect(x.spawnCalls).toHaveLength(0);
  });

  it("disabled の拡張・利用者の拡張・無い key への approve → not_found", async () => {
    const { x, root } = await withRepo([ext("a", { enabled: false })]);
    await x.writeConfig([ext("u")]);
    await x.host.start();
    await expect(x.run(x.host.approve(SCREEN, pkey(root, "a"), digestOf(root, full("a", { enabled: false }))))).rejects.toMatchObject({ code: "not_found" });
    await expect(x.run(x.host.approve(SCREEN, "user:u", "0".repeat(64)))).rejects.toMatchObject({ code: "not_found" });
    await expect(x.run(x.host.approve(SCREEN, "project:none:zz", "0".repeat(64)))).rejects.toMatchObject({ code: "not_found" });
  });

  it("desired に無い (根, id) を revoke → extension.changed が出る（approvals も比べる対象）。記録のファイルを外から書き換える → 見張りが拾って出る", async () => {
    const { x, root } = await withRepo(undefined, { timings: { approvalsPollMs: 100 } });
    const elsewhere = await x.makeRepo("elsewhere", [ext("z")]); // workspace は無いが、ディレクトリと設定ファイルは有る（掃除の対象にならない）
    await x.approvalStore.decideApproved(elsewhere, "z", "a".repeat(64), full("z"));
    await x.host.start();
    const count = () => x.events.filter((e) => e.event === "extension.changed").length;
    const before = count();
    await x.run(x.host.revoke(SCREEN, elsewhere, "z"));
    expect(count()).toBeGreaterThan(before);
    const b2 = count();
    const { ApprovalStore } = await import("./ApprovalStore.js");
    await new ApprovalStore(x.dir).decideDenied(root, "a", "b".repeat(64));
    await x.drive(500, 50);
    expect(count()).toBeGreaterThan(b2);
  });

  it("画面の種類でない接続の approve・deny・revoke → invalid_params", async () => {
    const { x, root } = await withRepo(undefined, { isScreenKind: (id) => id === SCREEN });
    await x.host.start();
    const d = digestOf(root, full("a"));
    for (const f of [() => x.host.approve("ext", pkey(root, "a"), d), () => x.host.deny("ext", pkey(root, "a"), d), () => x.host.revoke("ext", root, "a")]) {
      await expect(f()).rejects.toMatchObject({ code: "invalid_params" });
    }
    expect(x.spawnCalls).toHaveLength(0);
  });

  it("記録の書き込みが誤り（鍵のファイルを取れない）→ 誤りを返し、状態が変わらない", async () => {
    const { x, root } = await withRepo(undefined, { approvalDeps: { timeoutMs: 200, lockRetryMs: 10 } });
    await x.host.start();
    await writeFile(join(x.dir, "extension-approvals.json.lock"), "other:mark", { mode: 0o600 });
    await expect(x.run(x.host.approve(SCREEN, pkey(root, "a"), digestOf(root, full("a"))))).rejects.toBeInstanceOf(RpcError);
    expect(info(x, root, "a")!.state).toBe("pending");
    expect(x.spawnCalls).toHaveLength(0);
  });

  it("動いている数が 32（上限）のときの approve → over_limit（動いているものは止まらない）", async () => {
    const { x, root } = await withRepo([ext("a")], { limits: { runningMax: 1 } });
    await x.writeConfig([ext("u")]);
    await x.host.start();
    expect(x.spawnCalls).toHaveLength(1);
    await x.run(x.host.approve(SCREEN, pkey(root, "a"), digestOf(root, full("a"))));
    expect(info(x, root, "a")!.state).toBe("over_limit");
    expect(x.host.list().extensions.find((e) => e.key === "user:u")!.state).toBe("running");
    expect(x.spawnCalls).toHaveLength(1);
  });

  it("stopped の間は、記録だけを書く（起動は、次の start()）", async () => {
    const { x, root } = await withRepo();
    await x.host.start();
    await x.run(x.host.stop());
    await x.run(x.host.approve(SCREEN, pkey(root, "a"), digestOf(root, full("a"))));
    expect(x.spawnCalls).toHaveLength(0);
    expect((await x.approvalStore.load()).lookup(root, "a", digestOf(root, full("a"))).status).toBe("approved");
    await x.host.start();
    expect(x.spawnCalls).toHaveLength(1);
  });
});

describe("範囲（T22-3）", () => {
  /** 2 つのリポジトリ（A・B）を、それぞれの workspace（w1・w2）で開き、A の拡張だけを承認して動かす。 */
  async function twoRepos() {
    const { x, root } = await withRepo([ext("a")]);
    const other = await x.makeRepo("other", [ext("b")]);
    x.addWorkspace("w2", other, "q1");
    await approve(x, root, full("a"));
    await x.host.start();
    await x.drive(1500);
    return { x, root, other, c: x.children[0]! };
  }
  const set = (c: { say(l: unknown): void }, id: number, paneId: string, name = "m") =>
    c.say({ id, method: "display.set", params: { paneId, name, kind: "panel", format: "html", content: "x" } });
  const result = (c: { lines(): Record<string, unknown>[] }, id: number) => c.lines().find((l) => l["type"] === "ext.result" && l["id"] === id);

  it("別の根の workspace の pane への display.set は not_found（無い pane と、同じ code・同じ文）", async () => {
    const { x, c } = await twoRepos();
    set(c, 1, "q1");
    set(c, 2, "no-such-pane");
    await x.until(() => result(c, 1) !== undefined && result(c, 2) !== undefined);
    const r1 = result(c, 1) as { ok: boolean; error: { code: string; message: string } };
    const r2 = result(c, 2) as { ok: boolean; error: { code: string; message: string } };
    expect(r1.ok).toBe(false);
    // 無い pane と同じ code・同じ文（pane の id だけが違う）。範囲の外の pane が「ある」ことが、拡張に分からない。
    expect(r1.error.code).toBe("not_found");
    expect(r1.error.message.replace("q1", "<id>")).toBe(r2.error.message.replace("no-such-pane", "<id>"));
    set(c, 3, "p1");
    await x.until(() => result(c, 3) !== undefined);
    expect((result(c, 3) as { ok: boolean }).ok).toBe(true);
  });

  it("ext.panes に、別の根・根の無い workspace の pane が出ない", async () => {
    const { x, c } = await twoRepos();
    x.workspaces.set("w3", { cwd: "/w3" });
    x.panes.set("r1", { workspaceId: "w3" });
    x.bus.publish({ event: "pane.created", data: {} } as never);
    await x.drive(800);
    const last = c.lines().filter((l) => l["type"] === "ext.panes").at(-1) as { panes: { id: string }[] };
    expect(last.panes.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("pane が別の根の workspace へ移る（bus のイベントなし）→ 見直しの 1 回で面が消え、display.closed（out_of_scope）が届き、その後の display.set は not_found", async () => {
    const { x, c } = await twoRepos();
    set(c, 1, "p1");
    await x.until(() => x.displays.list("p1").displays.length === 1);
    x.panes.set("p1", { workspaceId: "w2" });
    await x.drive(2500);
    expect(x.displays.list("p1").displays).toHaveLength(0);
    expect(c.lines().some((l) => l["type"] === "display.closed" && l["reason"] === "out_of_scope")).toBe(true);
    set(c, 2, "p1");
    await x.until(() => result(c, 2) !== undefined);
    expect((result(c, 2) as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("移った後・見直しの前に、その面の display.action が来ても、拡張へ渡らない", async () => {
    const { x, c } = await twoRepos();
    set(c, 1, "p1");
    await x.until(() => x.displays.list("p1").displays.length === 1);
    x.displays.subscribe("b1", ["panel", "actions"]);
    const id = x.displays.list("p1").displays[0]!.id;
    x.panes.set("p1", { workspaceId: "w2" });
    x.displays.action("b1", { id, rev: 1, action: "secret" });
    expect(c.lines().filter((l) => l["type"] === "display.action")).toHaveLength(0);
  });

  it("reload の直後（根を引き直している途中）に範囲の検査が走っても、古い対応表で答える", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let blocking = false;
    const { x, root } = await withRepo(undefined, {
      projectRoot: {
        realpath: async (p) => {
          if (blocking) await gate;
          return (await import("node:fs/promises")).realpath(p);
        },
      },
    });
    await approve(x, root, full("a"));
    await x.host.start();
    await x.drive(1500);
    const c = x.children[0]!;
    blocking = true;
    const p = x.host.reload();
    await sleep(20);
    set(c, 1, "p1");
    await x.until(() => result(c, 1) !== undefined);
    expect((result(c, 1) as { ok: boolean }).ok).toBe(true); // 空の表を見せない
    blocking = false;
    release();
    await x.run(p);
  });

  it("利用者の拡張は、どの pane も範囲の中", async () => {
    const { x } = await withRepo(null);
    await x.writeConfig([ext("u")]);
    x.addWorkspace("w2", "/elsewhere", "q1");
    await x.host.start();
    const c = x.children[0]!;
    set(c, 1, "q1");
    await x.until(() => result(c, 1) !== undefined);
    expect((result(c, 1) as { ok: boolean }).ok).toBe(true);
  });
});

describe("承認の記録の掃除（D13 の 1）", () => {
  const records = async (x: HostHarness) => (await x.approvalStore.load()).records.map((r) => `${r.root}:${r.id}`);

  it("workspace が 1 つも無く、根のディレクトリが無くなっていたら、次の reconcile で、その根の承認の記録を消す。同じ場所に置いた別のものは、聞き直される", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    expect(info(x, root, "a")!.state).toBe("running");
    x.removeWorkspace("w1");
    await rm(root, { recursive: true, force: true });
    await x.drive(1500);
    expect(await records(x)).toEqual([]);
    expect(x.host.list().approvals).toEqual([]);
    // 同じ場所に、同じ登録の別のリポジトリを置いて開く → 承認の記録が無いので、聞かれる（pending）。
    await x.makeRepo("repo", [ext("a")]);
    x.addWorkspace("w1", root, "p1");
    await x.drive(1500);
    expect(info(x, root, "a")!.state).toBe("pending");
    expect(x.spawnCalls).toHaveLength(1);
  });

  it("R3 根のディレクトリは有り、.soda/extensions.json だけが無くなっている（ブランチの切り替え）は、消さない", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    x.removeWorkspace("w1");
    await rm(join(root, ".soda"), { recursive: true, force: true });
    await x.drive(1500);
    expect(await records(x)).toEqual([`${root}:a`]);
  });

  it("「承認しない」（denied）の記録は、消さない。承認と両方ある記録は、承認だけを消して、denied を残す", async () => {
    const { x, root } = await withRepo([ext("a"), ext("d"), ext("b")]);
    await x.approvalStore.decideDenied(root, "d", digestOf(root, full("d")));
    await approve(x, root, full("a"));
    await approve(x, root, full("b"));
    await x.approvalStore.decideDenied(root, "b", digestOf(root, full("b", { command: "node other.mjs" })));
    await x.host.start();
    x.removeWorkspace("w1");
    await rm(root, { recursive: true, force: true });
    await x.drive(1500);
    const left = (await x.approvalStore.load()).records;
    expect(left.map((r) => `${r.id}:${r.approved ? "A" : ""}${r.denied ? "D" : ""}`).sort()).toEqual(["b:D", "d:D"]);
  });

  it("R1 workspace は開いたまま、根のディレクトリが無くなった（ディスクが外れた）→ 消さない（承認も「承認しない」も）。戻れば、そのまま", async () => {
    const { x, root } = await withRepo([ext("a"), ext("d")]);
    await approve(x, root, full("a"));
    await x.approvalStore.decideDenied(root, "d", digestOf(root, full("d")));
    await x.host.start();
    await rm(root, { recursive: true, force: true });
    await x.run(x.host.reload());
    await x.drive(1500);
    expect((await records(x)).sort()).toEqual([`${root}:a`, `${root}:d`]);
    await x.makeRepo("repo", [ext("a"), ext("d")]);
    await x.run(x.host.reload());
    expect(info(x, root, "d")!.state).toBe("denied");
    expect(info(x, root, "a")!.state).toBe("running");
  });

  it("R2 起動のとき、根のディレクトリが無い（ディスクがまだ繋がっていない）が、workspace は残っている → 消さない", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.approvalStore.decideDenied(root, "z", digestOf(root, full("z")));
    await rm(root, { recursive: true, force: true });
    await x.host.start();
    await x.drive(1500);
    expect((await records(x)).sort()).toEqual([`${root}:a`, `${root}:z`]);
  });

  it("workspace の開いた場所が根の下（サブフォルダ）にあれば、根を引けなくても候補にしない", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    x.workspaces.set("w1", { cwd: join(root, "sub", "dir") });
    await rm(root, { recursive: true, force: true });
    await x.run(x.host.reload());
    await x.drive(1500);
    expect(await records(x)).toEqual([`${root}:a`]);
  });

  it("根の親のディレクトリも無い（もっと上が外れている）なら、消さない", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    x.removeWorkspace("w1");
    await rm(join(x.dir, "repos"), { recursive: true, force: true }); // 根も、その親も無い
    await x.drive(1500);
    expect(await records(x)).toEqual([`${root}:a`]);
  });

  it("根のディレクトリも設定ファイルも有る間は、workspace が無くても残す（開き直すと、承認済みでそのまま動く）", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    x.removeWorkspace("w1");
    await x.drive(1500);
    expect(await records(x)).toEqual([`${root}:a`]);
    x.addWorkspace("w1", root, "p1");
    await x.drive(1500);
    expect(info(x, root, "a")!.state).toBe("running");
  });

  it("その根の workspace が（別のものでも）開いている間は、ディレクトリが無くなっても消さない", async () => {
    const { x, root } = await withRepo();
    await approve(x, root, full("a"));
    await x.host.start();
    await rm(join(root, ".soda"), { recursive: true, force: true });
    x.bus.publish({ event: "workspace.updated", data: { workspace: { id: "w1" } as never } });
    await x.run(x.host.reload());
    expect(await records(x)).toEqual([`${root}:a`]);
  });

  it("根を引けなかった workspace がある間（時間切れ）は、確かめない。確かめが時間切れ・読めないときも、消さない", async () => {
    let hang = false;
    const { x, root } = await withRepo(undefined, {
      projectRoot: { realpath: async (p) => (hang && p.includes("hang") ? new Promise<string>(() => undefined) : (await import("node:fs/promises")).realpath(p)) },
    });
    await approve(x, root, full("a"));
    await x.host.start();
    x.removeWorkspace("w1");
    await rm(root, { recursive: true, force: true });
    hang = true;
    const stuck = await x.makeRepo("hang", [ext("h")]);
    x.addWorkspace("w2", stuck, "p9");
    await x.drive(1500);
    expect(await records(x)).toEqual([`${root}:a`]); // w2 の根が引けない間は、消さない
    hang = false;
    // 確かめが EIO なら、消さない。
    const { x: y, root: r2 } = await withRepo(undefined, {
      pathExists: async () => {
        throw Object.assign(new Error("io"), { code: "EIO" });
      },
    });
    await approve(y, r2, full("a"));
    await y.host.start();
    y.removeWorkspace("w1");
    await y.drive(1500);
    expect(await records(y)).toEqual([`${r2}:a`]);
  });
});

describe("無効の記録: プロジェクトの key を残す（D13 の 2）", () => {
  it("プロジェクトの拡張を画面で無効にして、その workspace を閉じ、ほかの拡張を入切しても、開き直すと無効のまま（承認が残っていても起動しない）", async () => {
    const { x, root } = await withRepo();
    await x.writeConfig([ext("u")]);
    await approve(x, root, full("a"));
    await x.host.start();
    expect(info(x, root, "a")!.state).toBe("running");
    await x.run(x.host.setEnabled(SCREEN, pkey(root, "a"), false));
    x.removeWorkspace("w1");
    await x.drive(1500);
    expect(info(x, root, "a")).toBeUndefined();
    // ほかの拡張（利用者の u）を 1 回入切する。
    await x.run(x.host.setEnabled(SCREEN, "user:u", false));
    await x.run(x.host.setEnabled(SCREEN, "user:u", true));
    x.addWorkspace("w1", root, "p1");
    await x.drive(1500);
    expect(info(x, root, "a")!.state).toBe("disabled");
    expect(x.spawnCalls.filter((c) => c.env["SODA_EXTENSION_ID"] === "a")).toHaveLength(1); // 最初の起動だけ
  });
});

describe("プロジェクトの拡張に渡す PATH（D13 の 3）", () => {
  const unsafe = ":/usr/bin:.:rel/bin:/opt/x::";
  it("プロジェクトの拡張の PATH から、空の要素・.・相対の要素を落とす。利用者の拡張の PATH は変えない", async () => {
    const { x, root } = await withRepo([ext("a")], { baseEnv: { PATH: unsafe } });
    await x.writeConfig([ext("u")]);
    await approve(x, root, full("a"));
    await x.host.start();
    const byId = (id: string) => x.spawnCalls.find((c) => c.env["SODA_EXTENSION_ID"] === id)!;
    expect(byId("a").env["PATH"]).toBe("/usr/bin:/opt/x");
    expect(byId("u").env["PATH"]).toBe(unsafe);
  });
});
