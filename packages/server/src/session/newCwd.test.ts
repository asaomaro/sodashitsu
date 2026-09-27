import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { NewCwd, Pane } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expandHome,
  isUsableDir,
  makeNewCwdDeps,
  resolveNewCwd,
  type NewCwdDeps,
} from "./newCwd.js";

/** 使える場所の集合を持つ偽の deps。既定では元の pane p1 がいて、前面の cwd は /live、OSC 7 は無し、記録は /recorded。 */
function deps(o: Partial<NewCwdDeps> & { usable?: string[] } = {}): NewCwdDeps {
  const usable = new Set(
    o.usable ?? [
      "/live",
      "/recorded",
      "/home/u",
      "/start",
      "/fallback",
      "/abs/dir",
      "/home/u/work",
      "/osc7",
    ],
  );
  return {
    liveCwd: o.liveCwd ?? (async (id) => (id === "p1" ? "/live" : null)),
    hintCwd: o.hintCwd ?? (() => null),
    recordedCwd: o.recordedCwd ?? ((id) => (id === "p1" ? "/recorded" : undefined)),
    home: o.home ?? (() => "/home/u"),
    currentDir: o.currentDir ?? "/start",
    isUsableDir: o.isUsableDir ?? (async (p) => usable.has(p)),
    ...(o.liveCwdTimeoutMs !== undefined ? { liveCwdTimeoutMs: o.liveCwdTimeoutMs } : {}),
  };
}
const follow: NewCwd = { policy: "follow" };

afterEach(() => {
  vi.useRealTimers();
});

describe("expandHome", () => {
  it("~ と ~/… と ~\\… だけを展開する", () => {
    expect(expandHome("~", "/home/u")).toBe("/home/u");
    expect(expandHome("~/work", "/home/u")).toBe("/home/u/work");
    expect(expandHome("~\\work", "C:\\Users\\u")).toBe("C:\\Users\\u\\work");
  });

  it("~user や途中の ~ は展開しない", () => {
    expect(expandHome("~alice/work", "/home/u")).toBe("~alice/work");
    expect(expandHome("/tmp/~/x", "/home/u")).toBe("/tmp/~/x");
    expect(expandHome("", "/home/u")).toBe("");
  });
});

describe("resolveNewCwd — 引き継ぐ（follow）", () => {
  // **読み直しの的**（負の対照）：いまの場所と記録が違うときに、いまの場所が勝つ。読み直しを外すと /recorded になって落ちる。
  it("元の pane のいまの場所で開く（記録より、その時点で読み直した値が勝つ）", async () => {
    expect(await resolveNewCwd(follow, "p1", "/fallback", deps())).toEqual({
      cwd: "/live",
      fellBack: false,
    });
  });

  it("いまの場所が読めない（null）ときは、記録された場所で開き、知らせない（AC5・design D4）", async () => {
    const d = deps({ liveCwd: async () => null });
    expect(await resolveNewCwd(follow, "p1", "/fallback", d)).toEqual({
      cwd: "/recorded",
      fellBack: false,
    });
  });

  it("読み直しが reject しても作成は失敗させず、記録された場所で開く（Windows の部品が読めない等）", async () => {
    const d = deps({ liveCwd: () => Promise.reject(new Error("windows-process-tree missing")) });
    expect(await resolveNewCwd(follow, "p1", "/fallback", d)).toEqual({
      cwd: "/recorded",
      fellBack: false,
    });
  });

  it("読み直しが同期で投げても記録された場所で開く", async () => {
    const d = deps({
      liveCwd: () => {
        throw new Error("boom");
      },
    });
    expect(await resolveNewCwd(follow, "p1", "/fallback", d)).toEqual({
      cwd: "/recorded",
      fellBack: false,
    });
  });

  it("読み直しが上限（既定 200ms）を超えたら、記録された場所で開く", async () => {
    vi.useFakeTimers();
    const d = deps({ liveCwd: () => new Promise<string | null>(() => undefined) }); // 決して解決しない
    const pending = resolveNewCwd(follow, "p1", "/fallback", d);
    await vi.advanceTimersByTimeAsync(199);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled, "上限の前には決まらない").toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ cwd: "/recorded", fellBack: false });
  });

  // Windows は前面の cwd を読めない（null）のに、プロセスの走査は待たされる。上限を超えても、同期で読める OSC 7 は捨てない（decisions D9）。
  it("読み直しが上限を超えても、OSC 7 があればその場所で開く", async () => {
    vi.useFakeTimers();
    const d = deps({
      liveCwd: () => new Promise<string | null>(() => undefined),
      hintCwd: () => "/osc7",
    });
    const pending = resolveNewCwd(follow, "p1", "/fallback", d);
    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toEqual({ cwd: "/osc7", fellBack: false });
  });

  it("前面の cwd が無い・reject したときは OSC 7、それも無ければ記録された場所", async () => {
    const osc7 = () => "/osc7";
    expect(
      (
        await resolveNewCwd(
          follow,
          "p1",
          "/fallback",
          deps({ liveCwd: async () => null, hintCwd: osc7 }),
        )
      ).cwd,
    ).toBe("/osc7");
    const rejects = async (): Promise<string | null> =>
      Promise.reject(new Error("no process tree"));
    expect(
      (await resolveNewCwd(follow, "p1", "/fallback", deps({ liveCwd: rejects, hintCwd: osc7 })))
        .cwd,
    ).toBe("/osc7");
    expect(
      (await resolveNewCwd(follow, "p1", "/fallback", deps({ liveCwd: async () => null }))).cwd,
    ).toBe("/recorded");
  });

  it("前面の cwd と OSC 7 の両方があれば、前面の cwd が勝つ（入れ子のシェル・OSC 7 を出さない子。design D2）", async () => {
    expect(
      (await resolveNewCwd(follow, "p1", "/fallback", deps({ hintCwd: () => "/osc7" }))).cwd,
    ).toBe("/live");
  });

  it("OSC 7 は前面プロセスを調べた後に読む（調べている間に届いた分を取りこぼさない）", async () => {
    let hint: string | null = null;
    const d = deps({
      liveCwd: async () => {
        hint = "/osc7";
        return null;
      },
      hintCwd: () => hint,
    });
    expect((await resolveNewCwd(follow, "p1", "/fallback", d)).cwd).toBe("/osc7");
  });

  it("上限より先に読めたら、上限のタイマーを残さない", async () => {
    vi.useFakeTimers();
    expect(await resolveNewCwd(follow, "p1", "/fallback", deps())).toEqual({
      cwd: "/live",
      fellBack: false,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("元の pane が無い（sourcePaneId が無い・その pane が無い）ときは、1 段目の代わりで開き、知らせない（AC5）", async () => {
    expect(await resolveNewCwd(follow, undefined, "/fallback", deps())).toEqual({
      cwd: "/fallback",
      fellBack: false,
    });
    expect(await resolveNewCwd(follow, "p-gone", "/fallback", deps())).toEqual({
      cwd: "/fallback",
      fellBack: false,
    });
  });

  it("いまの場所が消えていたら（cd した先が削除された）、1 段目の代わりで開き、知らせない", async () => {
    const d = deps({ usable: ["/recorded", "/fallback", "/start"] }); // /live は使えない
    expect(await resolveNewCwd(follow, "p1", "/fallback", d)).toEqual({
      cwd: "/fallback",
      fellBack: false,
    });
  });

  // 分割の「引き継ぐ」で cd した先が消されると、1 段目の代わり（source.cwd）も同じ消えた場所になる（design D3）。
  it("1 段目の代わりも使えなければ、サーバを起動した場所で開く", async () => {
    const d = deps({ usable: ["/start"] });
    expect(await resolveNewCwd(follow, "p1", "/gone", d)).toEqual({
      cwd: "/start",
      fellBack: false,
    });
  });
});

describe("resolveNewCwd — ホーム・起動した場所・指定した場所", () => {
  it("ホームで開く（AC6）", async () => {
    expect(await resolveNewCwd({ policy: "home" }, undefined, "/fallback", deps())).toEqual({
      cwd: "/home/u",
      fellBack: false,
    });
  });

  it("サーバを起動した場所で開く（AC7）", async () => {
    expect(await resolveNewCwd({ policy: "current" }, undefined, "/fallback", deps())).toEqual({
      cwd: "/start",
      fellBack: false,
    });
  });

  it("指定した場所で開く。~ はホームとして扱う（AC8）", async () => {
    expect(
      await resolveNewCwd({ policy: "path", path: "/abs/dir" }, undefined, "/fallback", deps()),
    ).toEqual({ cwd: "/abs/dir", fellBack: false });
    expect(
      await resolveNewCwd({ policy: "path", path: "~/work" }, undefined, "/fallback", deps()),
    ).toEqual({ cwd: "/home/u/work", fellBack: false });
  });

  it("指定した場所は正規化する（末尾の / や .. を残さない）", async () => {
    const d = deps();
    expect(
      (await resolveNewCwd({ policy: "path", path: "~/" }, undefined, "/fallback", d)).cwd,
    ).toBe("/home/u");
    expect(
      (await resolveNewCwd({ policy: "path", path: "/abs/x/../dir/" }, undefined, "/fallback", d))
        .cwd,
    ).toBe("/abs/dir");
  });

  it("元の pane は見ない（読み直しも呼ばない）", async () => {
    const liveCwd = vi.fn(async () => "/live");
    await resolveNewCwd({ policy: "home" }, "p1", "/fallback", deps({ liveCwd }));
    expect(liveCwd).not.toHaveBeenCalled();
  });

  // AC9（decisions D1）：使えない場所は 1 段目の代わりで開き、**知らせる**（fellBack）。
  it.each([
    ["無い場所", { policy: "path", path: "/nope" }],
    ["相対パス", { policy: "path", path: "work/dir" }],
    ["空文字", { policy: "path", path: "" }],
    ["~user", { policy: "path", path: "~alice/work" }],
  ] as const)(
    "指定した場所が使えない（%s）ときは、1 段目の代わりで開き、知らせる",
    async (_label, req) => {
      expect(await resolveNewCwd(req, undefined, "/fallback", deps())).toEqual({
        cwd: "/fallback",
        fellBack: true,
      });
    },
  );

  // 本物の `isUsableDir` は相対パスをサーバのプロセスの cwd から解決するので「使える」と答えうる。それでも拒むのは
  // `Workspace.cwd` に相対のまま入れないため（git の情報・worktree・復元が使う）。
  it.each(["work/dir", "~alice/work"])("相対パス（%s）は、その場所が使えても拒む", async (path) => {
    const d = deps({ usable: ["/fallback", "work/dir", "~alice/work"] });
    expect(await resolveNewCwd({ policy: "path", path }, undefined, "/fallback", d)).toEqual({
      cwd: "/fallback",
      fellBack: true,
    });
  });

  it("ホーム・起動した場所が使えないときも知らせる（decisions D5）", async () => {
    const d = deps({ usable: ["/fallback"] });
    expect(await resolveNewCwd({ policy: "home" }, undefined, "/fallback", d)).toEqual({
      cwd: "/fallback",
      fellBack: true,
    });
    expect(await resolveNewCwd({ policy: "current" }, undefined, "/fallback", d)).toEqual({
      cwd: "/fallback",
      fellBack: true,
    });
  });

  it("1 段目の代わりも使えなければ、サーバを起動した場所で開き、知らせる", async () => {
    expect(
      await resolveNewCwd(
        { policy: "path", path: "/nope" },
        undefined,
        "/gone",
        deps({ usable: ["/start"] }),
      ),
    ).toEqual({
      cwd: "/start",
      fellBack: true,
    });
  });
});

describe("makeNewCwdDeps（本番のつなぎ方）", () => {
  const pane = (cwd: string) => ({ id: "p1", cwd }) as unknown as Pane;
  function wiring(
    o: {
      fgCwd?: string | null;
      hint?: string | null;
      foregroundRejects?: boolean;
      host?: boolean;
    } = {},
  ) {
    const foreground = vi.fn(async () => {
      if (o.foregroundRejects) throw new Error("no process tree");
      return o.fgCwd === undefined ? null : { pid: 999, exe: "bash", argv: ["bash"], cwd: o.fgCwd };
    });
    const host = { pid: 4242, mirror: { cwdHint: () => o.hint ?? null } };
    const d = makeNewCwdDeps({
      terminals: { get: (id) => (o.host === false || id !== "p1" ? undefined : (host as never)) },
      inspector: { foreground },
      getPane: (id) => (id === "p1" ? pane("/recorded") : undefined),
      currentDir: "/start",
    });
    return { d, foreground };
  }

  // 別の pid を読む・常に null を返す、のつなぎ間違いを捕まえる。
  it("元の pane の TerminalHost の pid で foreground() を呼び、その cwd を返す", async () => {
    const { d, foreground } = wiring({ fgCwd: "/live" });
    expect(await d.liveCwd("p1")).toBe("/live");
    expect(foreground).toHaveBeenCalledWith(4242);
  });

  it("前面の cwd と OSC 7 は別々に返す（どちらを使うかは resolveNewCwd が決める）", async () => {
    const both = wiring({ fgCwd: "/live", hint: "/osc7" }).d;
    expect(await both.liveCwd("p1")).toBe("/live");
    expect(both.hintCwd("p1")).toBe("/osc7");
    expect(
      await wiring({ fgCwd: null, hint: "/osc7" }).d.liveCwd("p1"),
      "前面の cwd が無ければ null（OSC 7 を混ぜない）",
    ).toBeNull();
  });

  it("ホームと使えるかの判定は、渡さなければ本物を使う", async () => {
    const d = makeNewCwdDeps({
      terminals: { get: () => undefined },
      inspector: { foreground: async () => null },
      getPane: () => undefined,
      currentDir: "/start",
    });
    expect(d.home()).toBe(homedir());
    expect(d.isUsableDir).toBe(isUsableDir);
  });

  it("foreground() が reject しても投げず null を返す", async () => {
    expect(await wiring({ foregroundRejects: true, hint: "/osc7" }).d.liveCwd("p1")).toBeNull();
  });

  it("端末が無ければ null、記録はモデルの Pane.cwd", async () => {
    const { d } = wiring({ host: false });
    expect(await d.liveCwd("p1")).toBeNull();
    expect(d.hintCwd("p1")).toBeNull();
    expect(d.recordedCwd("p1")).toBe("/recorded");
    expect(d.recordedCwd("p-gone")).toBeUndefined();
    expect(d.currentDir).toBe("/start");
  });
});

// 使えない場所（無い・ディレクトリでない・入れない）の判定。偽の deps では見えないので本物の一時ディレクトリで確かめる。
describe("isUsableDir", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) {
      await chmod(join(dir, "locked"), 0o700).catch(() => undefined);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("ディレクトリなら使える、ファイル・無い場所は使えない", async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-newcwd-"));
    // 実行できるファイルにする——入れるか（X_OK）だけでは、ファイルをディレクトリと取り違える（Windows の X_OK は有無だけを見る）。
    await writeFile(join(dir, "file"), "x", { mode: 0o755 });
    expect(await isUsableDir(dir)).toBe(true);
    expect(await isUsableDir(join(dir, "file"))).toBe(false);
    expect(await isUsableDir(join(dir, "missing"))).toBe(false);
  });

  // 検索（実行）の権限を外しても root は入れてしまい、Windows には無い。
  const posixNonRoot = process.platform !== "win32" && process.getuid?.() !== 0;
  it.runIf(posixNonRoot)("入れない（実行の権限が無い）ディレクトリは使えない", async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-newcwd-"));
    await mkdir(join(dir, "locked"), { mode: 0o600 });
    expect(await isUsableDir(join(dir, "locked"))).toBe(false);
  });

  it.runIf(process.platform !== "win32")(
    "ディレクトリへのシンボリックリンクは使え、ファイルへのリンクは使えない",
    async () => {
      dir = await mkdtemp(join(tmpdir(), "soda-newcwd-"));
      await writeFile(join(dir, "file"), "x");
      await symlink(dir, join(dir, "to-dir"));
      await symlink(join(dir, "file"), join(dir, "to-file"));
      expect(await isUsableDir(join(dir, "to-dir"))).toBe(true);
      expect(await isUsableDir(join(dir, "to-file"))).toBe(false);
    },
  );
});
