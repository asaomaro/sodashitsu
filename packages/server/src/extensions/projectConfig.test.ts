import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXTENSIONS_FILE_MAX_BYTES } from "@sodashitsu/protocol";
import { loadProjectExtensionsFile } from "./extensionConfig.js";

// 20261007-ext-host T20：プロジェクトの設定の読み方。他人のリポジトリを開いただけで中のプログラムが動く道にしないための、場所・持ち主・形の検査。
const file = (extensions: unknown[]): string => JSON.stringify({ extensions });
const ENTRY = { id: "a", command: "node a.mjs" };

describe.skipIf(process.platform === "win32")("loadProjectExtensionsFile", () => {
  let tmp: string;
  let root: string;
  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "soda-proj-")));
    root = join(tmp, "repo");
    await mkdir(join(root, ".soda"), { recursive: true });
  });
  afterEach(async () => {
    await chmod(tmp, 0o755).catch(() => undefined);
    await rm(tmp, { recursive: true, force: true });
  });
  const cfg = () => join(root, ".soda", "extensions.json");
  const write = (text: string, mode = 0o600) => writeFile(cfg(), text, { mode });

  it("ふつうの設定を読む（path・groupWritable つき）", async () => {
    await write(file([ENTRY]));
    const r = await loadProjectExtensionsFile(root);
    expect(r.problem).toBeNull();
    expect(r.entries).toEqual([{ id: "a", command: "node a.mjs", description: null, enabled: true, allow: [], onUnresponsive: "pass", cwd: null }]);
    expect(r.path).toBe(cfg());
    expect(r.groupWritable).toBe(false);
  });

  it(".soda も設定ファイルも無い → 空（誤りではない）", async () => {
    expect((await loadProjectExtensionsFile(root)).problem).toBeNull();
    await rm(join(root, ".soda"), { recursive: true });
    const r = await loadProjectExtensionsFile(root);
    expect(r).toMatchObject({ entries: [], problem: null });
  });

  it(".soda がリンク → 誤り", async () => {
    await rm(join(root, ".soda"), { recursive: true });
    const other = join(tmp, "other");
    await mkdir(other);
    await writeFile(join(other, "extensions.json"), file([ENTRY]), { mode: 0o600 });
    await symlink(other, join(root, ".soda"));
    const r = await loadProjectExtensionsFile(root);
    expect(r.entries).toEqual([]);
    expect(r.problem).toContain(".soda がリンクです");
  });

  it("extensions.json がリンク → 誤り", async () => {
    await writeFile(join(tmp, "real.json"), file([ENTRY]), { mode: 0o600 });
    await symlink(join(tmp, "real.json"), cfg());
    const r = await loadProjectExtensionsFile(root);
    expect(r.entries).toEqual([]);
    expect(r.problem).toContain("シンボリックリンク");
  });

  it("FIFO → 止まらずに誤り", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("mkfifo", [cfg()]);
    const r = await loadProjectExtensionsFile(root);
    expect(r.entries).toEqual([]);
    expect(r.problem).not.toBeNull();
  });

  it("64 KiB 超 → 誤り", async () => {
    await write(" ".repeat(EXTENSIONS_FILE_MAX_BYTES + 1));
    const r = await loadProjectExtensionsFile(root);
    expect(r.problem).toContain("大きすぎます");
  });

  it("cwd を書いた 1 件 → 誤り／17 件 → 誤り", async () => {
    await write(file([{ ...ENTRY, cwd: "/tmp" }]));
    expect((await loadProjectExtensionsFile(root)).problem).toContain("cwd");
    await write(file(Array.from({ length: 17 }, (_, i) => ({ id: `e${i}`, command: "x" }))));
    expect((await loadProjectExtensionsFile(root)).problem).toContain("16 件まで");
  });

  it("ファイル・.soda・根のどれかが other から書ける → 誤り（読まない）", async () => {
    await write(file([ENTRY]));
    for (const target of [cfg(), join(root, ".soda"), root]) {
      await chmod(target, target === cfg() ? 0o602 : 0o757);
      const r = await loadProjectExtensionsFile(root);
      expect(r.entries, target).toEqual([]);
      expect(r.problem, target).toContain("ほかの利用者が書ける場所の設定は、読みません");
      await chmod(target, target === cfg() ? 0o600 : 0o755);
    }
    expect((await loadProjectExtensionsFile(root)).problem).toBeNull();
  });

  it("グループが書ける → 読めて groupWritable: true", async () => {
    await write(file([ENTRY]), 0o660);
    await chmod(cfg(), 0o660);
    const r = await loadProjectExtensionsFile(root);
    expect(r.problem).toBeNull();
    expect(r.entries).toHaveLength(1);
    expect(r.groupWritable).toBe(true);
  });

  it("持ち主が自分でない（偽の getuid）→ 誤り", async () => {
    await write(file([ENTRY]));
    const me = process.getuid!();
    const r = await loadProjectExtensionsFile(root, { getuid: () => me + 1 });
    expect(r.entries).toEqual([]);
    expect(r.problem).toContain("ほかの利用者が書ける場所の設定は、読みません");
  });

  describe("根より上（偽の stat）", () => {
    const real = async (p: string) => (await import("node:fs/promises")).stat(p);
    it("根の親が other から書けてスティッキーなし → 誤り、スティッキーあり（/tmp の形）→ 読める", async () => {
      await write(file([ENTRY]));
      const stat = async (p: string) => {
        const s = await real(p);
        return p === tmp ? { uid: s.uid, mode: 0o40777 } : s;
      };
      const bad = await loadProjectExtensionsFile(root, { stat });
      expect(bad.entries).toEqual([]);
      expect(bad.problem).toContain("差し替えられる場所");
      const stat2 = async (p: string) => {
        const s = await real(p);
        return p === tmp ? { uid: s.uid, mode: 0o41777 } : s;
      };
      const ok = await loadProjectExtensionsFile(root, { stat: stat2 });
      expect(ok.problem).toBeNull();
      expect(ok.entries).toHaveLength(1);
    });
    it("根より上の持ち主が root → 読める。ほかの利用者 → 誤り。グループが書ける祖先 → groupWritable", async () => {
      await write(file([ENTRY]));
      const me = process.getuid!();
      const withParent = (patch: { uid?: number; mode?: number }) => async (p: string) => {
        const s = await real(p);
        return p === tmp ? { uid: patch.uid ?? s.uid, mode: patch.mode ?? s.mode } : s;
      };
      expect((await loadProjectExtensionsFile(root, { stat: withParent({ uid: 0 }) })).problem).toBeNull();
      expect((await loadProjectExtensionsFile(root, { stat: withParent({ uid: me + 5 }) })).problem).toContain("差し替えられる場所");
      const g = await loadProjectExtensionsFile(root, { stat: withParent({ mode: 0o40775 }) });
      expect(g.problem).toBeNull();
      expect(g.groupWritable).toBe(true);
    });
  });

  it("realpath が決まった場所と違う（途中のリンク）→ 誤り", async () => {
    await write(file([ENTRY]));
    const r = await loadProjectExtensionsFile(root, { realpath: async () => "/somewhere/else/extensions.json" });
    expect(r.entries).toEqual([]);
    expect(r.problem).toContain("リンク");
  });

  it("誤りの文に、設定の中身（コマンドの文字列）を入れない", async () => {
    await write(file([{ ...ENTRY, command: "node SECRET-TOKEN-123.mjs", cwd: "/tmp" }]));
    const r = await loadProjectExtensionsFile(root);
    expect(r.problem).not.toBeNull();
    expect(r.problem).not.toContain("SECRET-TOKEN-123");
  });
});
