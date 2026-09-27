import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsAgentIntegrationInstaller } from "../packages/server/src/agent/AgentIntegrationInstaller.js";

/**
 * 移行スクリプト `scripts/migrate-from-wtm.sh` の統合テスト（20260927-rename-sodashitsu の design「テスト」）。
 * **利用者の本物の状態に触れない**: 各テストは mkdtemp の根の中に HOME・XDG_STATE_HOME・CLAUDE_CONFIG_DIR・CODEX_HOME・DEVIN_CONFIG_DIR を作り、
 * sh に渡す環境は一から組む（`process.env` を広げない——広げると本物の CLAUDE_CONFIG_DIR 等が漏れる）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "migrate-from-wtm.sh");
const HOOK_ASSET = join(here, "..", "packages", "server", "assets", "agent-hook-report.cjs");
const KINDS = ["claude", "codex", "cursor", "copilot", "devin", "droid", "grok", "qwen"] as const;
type Kind = (typeof KINDS)[number];

let root: string;
let home: string;
let xdg: string;
let claudeDir: string;
let codexDir: string;
let devinDir: string;
let oldState: string;
let newState: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "soda-migrate-test-"));
  home = join(root, "home");
  xdg = join(root, "xdg");
  claudeDir = join(root, "claude");
  codexDir = join(root, "codex");
  devinDir = join(root, "devin");
  for (const d of [home, xdg]) await mkdir(d, { recursive: true });
  oldState = join(xdg, "web-tn-multiplexer");
  newState = join(xdg, "sodashitsu");
});

afterEach(async () => {
  for (const c of children.splice(0)) c.kill("SIGKILL");
  await rm(root, { recursive: true, force: true });
});

function env(): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    HOME: home,
    XDG_STATE_HOME: xdg,
    CLAUDE_CONFIG_DIR: claudeDir,
    CODEX_HOME: codexDir,
    DEVIN_CONFIG_DIR: devinDir,
    LC_ALL: "C.UTF-8",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
  };
}

/** spawnSync はイベントループを止めるので vitest の testTimeout では打ち切れない。子そのものに上限を付ける。 */
const SPAWN_TIMEOUT_MS = 30_000;

function runMigrate(...args: string[]): { code: number | null; stdout: string; stderr: string } {
  return runMigrateWith(env(), ...args);
}

function runMigrateWith(
  e: NodeJS.ProcessEnv,
  ...args: string[]
): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync("sh", [SCRIPT, ...args], {
    env: e,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** 出力のうち、指定した接頭辞の行から接頭辞を除いたもの（`予定:` と `済み:` の突き合わせ）。 */
function linesWith(out: string, prefix: string): string[] {
  return out
    .split("\n")
    .filter((l) => l.startsWith(prefix))
    .map((l) => l.slice(prefix.length));
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, {
    cwd,
    env: env(),
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

/** 根の下の全エントリ（パス・種類・中身のハッシュ・権限）。前後で比べて「何も変えていない」を確かめる。 */
async function snapshot(dir = root): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const name of (await readdir(d)).sort()) {
      const p = join(d, name);
      const st = await lstat(p);
      const rel = relative(root, p);
      if (st.isSymbolicLink()) out.push(`${rel} -> ${await readlink(p)}`);
      else if (st.isDirectory()) {
        out.push(`${rel}/ ${(st.mode & 0o777).toString(8)}`);
        await walk(p);
      } else {
        const hash = createHash("sha256")
          .update(await readFile(p))
          .digest("hex")
          .slice(0, 16);
        out.push(`${rel} ${(st.mode & 0o777).toString(8)} ${hash}`);
      }
    }
  }
  await walk(dir);
  return out;
}

async function write(p: string, content: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
}

const exists = async (p: string): Promise<boolean> =>
  lstat(p).then(
    () => true,
    () => false,
  );

/** 古い状態ディレクトリ（既定と名前付き session・落ちた残りのロック・画像・レイアウト）。 */
async function makeOldState(opts: { worktreeCwd?: string } = {}): Promise<void> {
  const layout = JSON.stringify({ schema: 1, workspaces: [{ cwd: opts.worktreeCwd ?? "/tmp" }] });
  await write(join(oldState, "session.json"), layout);
  await write(join(oldState, "auth.json"), '{"token":"x"}');
  await write(join(oldState, "wtm.lock"), "999999999\n" + hostname() + "\n"); // 落ちた残り（pid は存在しない）
  await write(
    join(oldState, "clipboard-images", "wtm-image-20260101T000000Z-0123456789abcdef.png"),
    "png",
  );
  await write(join(oldState, "sessions", "work", "session.json"), layout);
  await write(
    join(oldState, "sessions", "work", "commands.json"),
    '{"commands":[{"id":"note","type":"shell","command":"cd \\"$WTM_ACTIVE_PANE_CWD\\" && echo $WTM_COMMAND_ID"}]}',
  );
  await write(
    join(
      oldState,
      "sessions",
      "work",
      "clipboard-images",
      "wtm-image-20260101T000000Z-fedcba9876543210.png",
    ),
    "png2",
  );
}

/** CLI のキャッシュ（cookie の名前が古い）。 */
async function makeOldCli(): Promise<void> {
  await write(
    join(home, ".wtmctl", "session.json"),
    JSON.stringify({
      sessions: {
        "http://127.0.0.1:7780": { cookie: "wtm_session=abc", createdAt: "2026-01-01T00:00:00Z" },
      },
    }),
  );
}

/** 実物の repo と、古い置き場の worktree（`<置き場>/<repo 名>/<slug>`）。 */
async function makeOldWorktree(): Promise<{ repo: string; oldWt: string; newWt: string }> {
  const repo = join(root, "repos", "app");
  await mkdir(repo, { recursive: true });
  git(repo, "init", "-q");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  const oldWt = join(home, ".wtm", "worktrees", "app", "feat");
  git(repo, "worktree", "add", "-q", oldWt, "-b", "feat");
  return { repo, oldWt, newWt: join(home, ".sodashitsu", "worktrees", "app", "feat") };
}

function installerFor(): FsAgentIntegrationInstaller {
  return new FsAgentIntegrationInstaller(
    HOOK_ASSET,
    {
      PATH: "",
      CLAUDE_CONFIG_DIR: claudeDir,
      CODEX_HOME: codexDir,
      DEVIN_CONFIG_DIR: devinDir,
    } as NodeJS.ProcessEnv,
    home,
  );
}

/** kind ごとの設定ファイルと hooks の場所（`AgentIntegrationInstaller.ts` の HOOK_SPECS と同じ）。 */
function locations(kind: Kind): { config: string; hooks: string } {
  switch (kind) {
    case "claude":
      return { config: join(claudeDir, "settings.json"), hooks: join(claudeDir, "hooks") };
    case "codex":
      return { config: join(codexDir, "hooks.json"), hooks: join(codexDir, "hooks") };
    case "cursor":
      return { config: join(home, ".cursor", "hooks.json"), hooks: join(home, ".cursor", "hooks") };
    case "copilot":
      return {
        config: join(home, ".copilot", "hooks", "soda-agent-report.json"),
        hooks: join(home, ".copilot", "hooks"),
      };
    case "devin":
      return { config: join(devinDir, "hooks.json"), hooks: join(devinDir, "hooks") };
    case "droid":
      return {
        config: join(home, ".factory", "hooks.json"),
        hooks: join(home, ".factory", "hooks"),
      };
    case "grok":
      return {
        config: join(home, ".grok", "hooks", "soda-agent-report.json"),
        hooks: join(home, ".grok", "hooks"),
      };
    case "qwen":
      return { config: join(home, ".qwen", "settings.json"), hooks: join(home, ".qwen", "hooks") };
  }
}

const OLD_SCRIPT = "// old hook script: reads WTM_PANE_ID\n";
const OTHER_TOOL_JSON = '{"hooks":{"sessionStart":[{"type":"command","bash":"other-tool"}]}}';

/**
 * 古い wtm が導入したのと同じ hook を作る: 今の（改名後の）導入の処理で書き、名前だけ古い名前へ戻す（形は名前以外同じ。research F4.3）。
 * 他製品のエントリを先に置いておき、移行がそれに触れないことを見る。
 */
async function makeOldHooks(): Promise<Map<Kind, { oldConfig: string; oldConfigBytes: string }>> {
  const installer = installerFor();
  const result = new Map<Kind, { oldConfig: string; oldConfigBytes: string }>();
  for (const kind of KINDS) {
    const { config, hooks } = locations(kind);
    if (kind === "copilot" || kind === "grok") {
      // hooks/*.json を読む 2 種は、他製品の設定が同じ hooks/ の別のファイルにある。
      await write(join(hooks, "other-tool.json"), OTHER_TOOL_JSON);
    } else {
      await write(
        config,
        JSON.stringify({
          other: { keep: true },
          hooks: { SessionStart: [{ command: "other-tool" }] },
          SessionStart: [{ command: "other-tool" }],
        }),
      );
    }
    expect(await installer.install(kind)).toEqual({ ok: true, message: null });
    const content = (await readFile(config, "utf8")).replaceAll(
      "soda-agent-report",
      "wtm-agent-report",
    );
    await rm(config);
    const oldConfig =
      kind === "copilot" || kind === "grok" ? join(hooks, "wtm-agent-report.json") : config;
    await write(oldConfig, content);
    await rm(join(hooks, "soda-agent-report.cjs"));
    await write(join(hooks, "wtm-agent-report.cjs"), OLD_SCRIPT);
    expect((await installer.status(kind)).installed).toBe(false); // 名前が古いままでは、新しいアプリは導入済みと見ない
    result.set(kind, { oldConfig, oldConfigBytes: content });
  }
  return result;
}

describe("migrate-from-wtm.sh", () => {
  it("--dry-run は予定を出すだけで、何も変えない", async () => {
    await makeOldState();
    await makeOldCli();
    await makeOldWorktree();
    await makeOldHooks();
    const before = await snapshot();
    const r = runMigrate("--dry-run");
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`予定: 状態ディレクトリを移す: ${oldState} → ${newState}`);
    expect(r.stdout).toContain("予定: CLI のキャッシュを移す");
    expect(r.stdout).toContain("予定: worktree の置き場を移す");
    expect(r.stdout).toContain("予定: worktree のリンクを直す（git worktree repair）");
    expect(r.stdout).toContain("予定: claude の hook の設定を書き換える");
    expect(r.stdout).toMatch(
      /移行: \d+ 件の操作を行う予定です（--dry-run なので何も変えていません）。/,
    );
    expect(r.stdout).not.toContain("済み:");
    expect(await snapshot()).toEqual(before);
  });

  it("全部を移す: 状態ディレクトリ・sessions・ロック・画像・CLI のキャッシュ・worktree と repair・レイアウトのパス・8 種の hook", async () => {
    const { repo, oldWt, newWt } = await makeOldWorktree();
    await makeOldState({ worktreeCwd: oldWt });
    await makeOldCli();
    const hooks = await makeOldHooks();
    const oldSessionJson = await readFile(join(oldState, "session.json"), "utf8");

    const plan = runMigrate("--dry-run");
    expect(plan.code).toBe(0);
    const planned = linesWith(plan.stdout, "予定: ");
    const r = runMigrate();
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`済み: 状態ディレクトリを移す: ${oldState} → ${newState}`);
    // 行ったことの一覧は、予定と同じ操作が同じ順に並ぶ（AC10）。件数も最終行に出る。
    expect(linesWith(r.stdout, "済み: ")).toEqual(planned);
    // 状態ディレクトリ 1・ロック 1・画像 2・独自コマンド 1・CLI 2・worktree 3（移動・repair・空の ~/.wtm）・レイアウト 2・hook 8 種 × 2
    expect(planned).toHaveLength(28);
    expect(r.stdout).toContain(
      `移行: ${planned.length} 件の操作を行いました。ブラウザでは一度ログインし直してください`,
    );
    expect(r.stdout).not.toContain("予定:");

    // 状態ディレクトリ（AC6）
    expect(await exists(oldState)).toBe(false);
    expect(await readFile(join(newState, "auth.json"), "utf8")).toBe('{"token":"x"}');
    expect(await exists(join(newState, "wtm.lock"))).toBe(false);
    expect(await readFile(join(newState, "soda.lock"), "utf8")).toContain("999999999");
    expect(await readdir(join(newState, "clipboard-images"))).toEqual([
      "soda-image-20260101T000000Z-0123456789abcdef.png",
    ]);
    expect(await readdir(join(newState, "sessions", "work", "clipboard-images"))).toEqual([
      "soda-image-20260101T000000Z-fedcba9876543210.png",
    ]);

    // 独自コマンドの環境変数の名前（cross 点検）
    const commands = await readFile(join(newState, "sessions", "work", "commands.json"), "utf8");
    expect(commands).toContain("$SODA_ACTIVE_PANE_CWD");
    expect(commands).toContain("$SODA_COMMAND_ID");
    expect(commands).not.toContain("WTM_");
    expect(
      await readFile(join(newState, "sessions", "work", "commands.json.bak-wtm-migration"), "utf8"),
    ).toContain("WTM_");

    // CLI のキャッシュ（AC7）
    expect(await exists(join(home, ".wtmctl"))).toBe(false);
    const cli = await readFile(join(home, ".sodactl", "session.json"), "utf8");
    expect(cli).toContain('"cookie":"soda_session=abc"');
    expect(cli).not.toContain("wtm_session");
    expect(
      await readFile(join(home, ".sodactl", "session.json.bak-wtm-migration"), "utf8"),
    ).toContain("wtm_session=abc");

    // worktree（AC8）: 元の repo から新しいパスが見え、worktree の中で git が使える
    expect(await exists(join(home, ".wtm"))).toBe(false);
    expect(git(repo, "worktree", "list", "--porcelain")).toContain(`worktree ${newWt}\n`);
    expect(git(newWt, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feat");
    // レイアウトの古い worktree のパスは新しいパスへ（既定と名前付き session の両方）
    for (const f of [
      join(newState, "session.json"),
      join(newState, "sessions", "work", "session.json"),
    ]) {
      const s = await readFile(f, "utf8");
      expect(s).toContain(newWt);
      expect(s).not.toContain("/.wtm/");
    }
    expect(await readFile(join(newState, "session.json.bak-wtm-migration"), "utf8")).toBe(
      oldSessionJson,
    );

    // hook（AC9）: 新しいアプリが導入済みと見る・スクリプトは同梱の新しい版・元はバックアップに残る・他製品のエントリは残る
    const installer = installerFor();
    const asset = await readFile(HOOK_ASSET, "utf8");
    for (const kind of KINDS) {
      const { config, hooks: hooksDir } = locations(kind);
      const { oldConfig, oldConfigBytes } = hooks.get(kind)!;
      expect((await installer.status(kind)).installed, kind).toBe(true);
      const now = await readFile(config, "utf8");
      expect(now, kind).not.toContain("wtm-agent-report");
      expect(now, kind).toBe(oldConfigBytes.replaceAll("wtm-agent-report", "soda-agent-report"));
      if (kind !== "copilot" && kind !== "grok")
        expect(JSON.parse(now).other, kind).toEqual({ keep: true });
      expect(await readFile(`${oldConfig}.bak-wtm-migration`, "utf8"), kind).toBe(oldConfigBytes);
      if (oldConfig !== config) {
        expect(await exists(oldConfig), kind).toBe(false);
        expect(await readFile(join(hooksDir, "other-tool.json"), "utf8"), kind).toBe(
          OTHER_TOOL_JSON,
        );
      }
      expect(await readFile(join(hooksDir, "soda-agent-report.cjs"), "utf8"), kind).toBe(asset);
      expect(await exists(join(hooksDir, "wtm-agent-report.cjs")), kind).toBe(false);
      expect(
        await readFile(join(hooksDir, "wtm-agent-report.cjs.bak-wtm-migration"), "utf8"),
        kind,
      ).toBe(OLD_SCRIPT);
    }
  });

  it("2 回目は何も変えずに「移すものがありません」で終了コード 0", async () => {
    await makeOldState();
    await makeOldCli();
    await makeOldWorktree();
    await makeOldHooks();
    expect(runMigrate().code).toBe(0);
    const before = await snapshot();
    const r = runMigrate();
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("移すものがありません");
    expect(await snapshot()).toEqual(before);
  });

  describe("古いサーバが動いていれば、何も変えずに断る", () => {
    async function liveLock(lockPath: string, host = hostname()): Promise<void> {
      const child = spawn("sleep", ["300"], { stdio: "ignore" });
      children.push(child);
      await write(lockPath, `${child.pid}\n${host}\n`);
    }

    it("既定の session のロックの持ち主が動いている", async () => {
      await makeOldState();
      await makeOldCli();
      await liveLock(join(oldState, "wtm.lock"));
      const before = await snapshot();
      const r = runMigrate();
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("古い wtm serve が動いています");
      expect(r.stderr).toContain("何も変えていません");
      expect(r.stdout).toBe("");
      expect(await snapshot()).toEqual(before);
    });

    it("名前付き session のロックの持ち主が動いている（--dry-run でも断る）", async () => {
      await makeOldState();
      await liveLock(join(oldState, "sessions", "work", "wtm.lock"));
      const before = await snapshot();
      for (const args of [[], ["--dry-run"]]) {
        const r = runMigrate(...args);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain(join(oldState, "sessions", "work", "wtm.lock"));
      }
      expect(await snapshot()).toEqual(before);
    });

    it("ps が無い環境（busybox 等）でも kill -0 で見つける", async () => {
      await makeOldState();
      await liveLock(join(oldState, "wtm.lock"));
      const bin = join(root, "bin-without-ps");
      await mkdir(bin);
      for (const tool of [
        "sh",
        "dirname",
        "uname",
        "sed",
        "tr",
        "awk",
        "grep",
        "ls",
        "mv",
        "cp",
        "rm",
        "mkdir",
        "rmdir",
        "git",
      ]) {
        const found = spawnSync("sh", ["-c", `command -v ${tool}`], {
          encoding: "utf8",
        }).stdout.trim();
        expect(found, tool).not.toBe("");
        await symlink(found, join(bin, tool));
      }
      const before = await snapshot();
      const r = runMigrateWith({ ...env(), PATH: bin });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("古い wtm serve が動いています");
      expect(await snapshot()).toEqual(before);
    });

    it("他の利用者のプロセス（kill -0 が EPERM）も ps で動いていると見る（pid 1）", async () => {
      // root で走らせると kill -0 1 が成功するので ps の道を通らない（それでも断ることは同じ）。
      await makeOldState();
      await write(join(oldState, "wtm.lock"), `1\n${hostname()}\n`);
      const before = await snapshot();
      const r = runMigrate();
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("古い wtm serve が動いています（pid 1。");
      expect(await snapshot()).toEqual(before);
    });

    it("pid が 0 のロックは落ちた残りとみなして移す", async () => {
      await makeOldState();
      await write(join(oldState, "wtm.lock"), `0\n${hostname()}\n`);
      const r = runMigrate();
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
      expect(await readFile(join(newState, "soda.lock"), "utf8")).toBe(`0\n${hostname()}\n`);
    });

    it("別のホストのロックは生死を確かめられないので断る", async () => {
      await makeOldState();
      await write(join(oldState, "wtm.lock"), `999999999\nsome-other-host-${process.pid}\n`);
      const before = await snapshot();
      const r = runMigrate();
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("別のホスト");
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("移動先が既にあれば、何も変えずに断る（上書きしない）", () => {
    // 根の場所は beforeEach で決まるので、置く場所と衝突の場所は関数で遅らせて求める。
    const cases: [string, () => string, ("dir" | "file" | "symlink")?][] = [
      ["状態ディレクトリ", () => join(xdg, "sodashitsu", "x"), "dir"],
      ["CLI のキャッシュ", () => join(home, ".sodactl", "x"), "dir"],
      ["worktree の置き場", () => join(home, ".sodashitsu", "worktrees", "x"), "dir"],
      ["hook のスクリプト", () => join(claudeDir, "hooks", "soda-agent-report.cjs")],
      [
        "hook の設定（名前も変わる）",
        () => join(home, ".copilot", "hooks", "soda-agent-report.json"),
      ],
      ["hook の設定のバックアップ", () => join(codexDir, "hooks.json.bak-wtm-migration")],
      [
        "hook の設定（名前も変わる）のバックアップ",
        () => join(home, ".grok", "hooks", "wtm-agent-report.json.bak-wtm-migration"),
      ],
      [
        "hook のスクリプトのバックアップ",
        () => join(home, ".grok", "hooks", "wtm-agent-report.cjs.bak-wtm-migration"),
      ],
      [
        "状態ディレクトリの中の新しい名前のロック",
        () => join(oldState, "sessions", "work", "soda.lock"),
      ],
      [
        "状態ディレクトリの中の新しい名前の画像",
        () =>
          join(oldState, "clipboard-images", "soda-image-20260101T000000Z-0123456789abcdef.png"),
      ],
      ["CLI のキャッシュ（壊れたシンボリックリンク）", () => join(home, ".sodactl"), "symlink"],
      [
        "CLI のキャッシュのバックアップ",
        () => join(home, ".wtmctl", "session.json.bak-wtm-migration"),
      ],
      ["レイアウトのバックアップ", () => join(oldState, "session.json.bak-wtm-migration")],
    ];
    for (const [name, conflictOf, kind = "file"] of cases) {
      it(name, async () => {
        const { oldWt } = await makeOldWorktree();
        await makeOldState({ worktreeCwd: oldWt });
        await write(join(oldState, "sessions", "work", "wtm.lock"), "999999999\n");
        await makeOldCli();
        await makeOldHooks();
        const placed = conflictOf();
        if (kind === "symlink") await symlink(join(root, "missing-target"), placed);
        else await write(placed, "already here");
        const conflict = kind === "dir" ? dirname(placed) : placed; // ディレクトリの移動先は、その中に置いたファイルではなくディレクトリ自体を報告する
        const before = await snapshot();
        const r = runMigrate();
        expect(r.code).toBe(1);
        expect(r.stderr).toContain(`移動先が既にあります`);
        expect(r.stderr).toContain(conflict);
        expect(r.stdout).toBe("");
        expect(await snapshot()).toEqual(before);
      });
    }

    it("理由はすべて集めてから一度に出す", async () => {
      await makeOldState();
      await makeOldCli();
      await write(join(xdg, "sodashitsu", "x"), "new");
      await write(join(home, ".sodactl", "x"), "new");
      const r = runMigrate();
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(join(xdg, "sodashitsu"));
      expect(r.stderr).toContain(join(home, ".sodactl"));
    });

    it("移す元が無い項目の移動先は検査しない（移行済みの置き場があっても断らない）", async () => {
      await mkdir(join(xdg, "sodashitsu"), { recursive: true });
      await mkdir(join(home, ".sodactl"), { recursive: true });
      await makeOldWorktree();
      const r = runMigrate();
      expect(r.stderr).toBe("");
      expect(r.code).toBe(0);
      expect(r.stdout).toContain("済み: worktree の置き場を移す");
    });
  });

  it("`.` で始まる repo 名の worktree も repair する・HOME の末尾の / を落としてレイアウトのパスを書き換える", async () => {
    const repo = join(root, "repos", ".dotfiles");
    await mkdir(repo, { recursive: true });
    git(repo, "init", "-q");
    git(repo, "commit", "-q", "--allow-empty", "-m", "init");
    const oldWt = join(home, ".wtm", "worktrees", ".dotfiles", "feat");
    git(repo, "worktree", "add", "-q", oldWt, "-b", "feat");
    await makeOldState({ worktreeCwd: oldWt });
    const r = runMigrateWith({ ...env(), HOME: `${home}/` });
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const newWt = join(home, ".sodashitsu", "worktrees", ".dotfiles", "feat");
    expect(git(repo, "worktree", "list", "--porcelain")).toContain(`worktree ${newWt}\n`);
    expect(await readFile(join(newState, "session.json"), "utf8")).toContain(newWt);
  });

  describe("移すのに要るものが無ければ、何も変えずに断る", () => {
    /** スクリプトを一時の「リポジトリ」に写す（同梱の hook のスクリプトの場所はスクリプトの場所から決まる）。 */
    async function copiedScript(asset: string | undefined): Promise<string> {
      const repoRoot = join(root, "checkout");
      const copy = join(repoRoot, "scripts", "migrate-from-wtm.sh");
      await write(copy, await readFile(SCRIPT, "utf8"));
      if (asset !== undefined)
        await write(join(repoRoot, "packages", "server", "assets", "agent-hook-report.cjs"), asset);
      return copy;
    }

    for (const [name, asset, message] of [
      ["同梱の hook のスクリプトが無い", undefined, "同梱の hook のスクリプトが見つかりません"],
      [
        "同梱の hook のスクリプトが古い版（SODA_PANE_ID を読まない）",
        OLD_SCRIPT,
        "同梱の hook のスクリプトが古い版です",
      ],
    ] as const) {
      it(name, async () => {
        await makeOldHooks();
        const copy = await copiedScript(asset);
        const before = await snapshot();
        const r = spawnSync("sh", [copy], {
          env: env(),
          encoding: "utf8",
          timeout: SPAWN_TIMEOUT_MS,
        });
        expect(r.status).toBe(1);
        expect(r.stderr).toContain(message);
        expect(r.stdout).toBe("");
        expect(await snapshot()).toEqual(before);
      });
    }

    it("worktree を移すのに git が無い", async () => {
      await makeOldWorktree();
      // git 以外の、スクリプトが使う道具だけを置いた PATH。
      const bin = join(root, "bin-without-git");
      await mkdir(bin);
      for (const tool of [
        "sh",
        "dirname",
        "uname",
        "sed",
        "tr",
        "ps",
        "awk",
        "grep",
        "ls",
        "mv",
        "cp",
        "rm",
        "mkdir",
        "rmdir",
      ]) {
        const found = spawnSync("sh", ["-c", `command -v ${tool}`], {
          encoding: "utf8",
        }).stdout.trim();
        expect(found, tool).not.toBe("");
        await symlink(found, join(bin, tool));
      }
      const before = await snapshot();
      const r = runMigrateWith({ ...env(), PATH: bin });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("git が見つかりません");
      expect(await snapshot()).toEqual(before);
    });
  });

  it("移す元が何も無ければ「移すものがありません」で 0", async () => {
    const r = runMigrate();
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("移すものがありません");
  });

  it("手で入れた skill は変えずに案内だけする", async () => {
    await write(join(claudeDir, "skills", "wtmctl", "SKILL.md"), "old skill");
    const before = await snapshot();
    const r = runMigrate();
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(
      `注意: 手で入れた skill ${join(claudeDir, "skills", "wtmctl")} は変えていません`,
    );
    expect(await snapshot()).toEqual(before);
  });

  it("古い worktree のパスの Claude Code の会話の記録は変えずに案内だけする", async () => {
    await makeOldWorktree();
    const project = join(claudeDir, "projects", "-home-u--wtm-worktrees-app-feat");
    await write(join(project, "s.jsonl"), "{}");
    const r = runMigrate();
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(
      `注意: Claude Code の会話の記録 ${project} は古い worktree のパスの名前のままです`,
    );
    expect(await readFile(join(project, "s.jsonl"), "utf8")).toBe("{}");
  });

  it("使い方の誤りは終了コード 2", () => {
    const r = runMigrate("--bogus");
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("不明な引数です: --bogus");
  });

  it("環境変数の上書きが無ければ、hook は HOME の下の既定の場所を見る", async () => {
    await write(
      join(home, ".claude", "settings.json"),
      '{"hooks":{"SessionStart":[{"hooks":[{"command":"node \\"x/wtm-agent-report.cjs\\" claude"}]}]}}',
    );
    const r = runMigrateWith({
      PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      HOME: home,
      XDG_STATE_HOME: xdg,
      LC_ALL: "C.UTF-8",
    });
    expect(r.code).toBe(0);
    expect(await readFile(join(home, ".claude", "settings.json"), "utf8")).toContain(
      "soda-agent-report.cjs",
    );
    expect(await exists(join(home, ".claude", "settings.json.bak-wtm-migration"))).toBe(true);
  });
});
