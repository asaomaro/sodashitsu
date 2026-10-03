import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 同期スクリプト `scripts/sync-ask-form.mjs` と、写した先 `third_party/ask-form/` のテスト
 * （20261003-ask-form-component の design「写した先と同期」・AC1）。
 * - 写した先の実物: `SOURCE.json` のハッシュと一致するか（＝手で直していないか）。
 * - スクリプト: mkdtemp の中に作った小さな git リポジトリから、mkdtemp の中の写し先（`--dest`）へ写す。
 *   **実物の `third_party/ask-form/` へは書かない**。public_docs の clone も要らない（ネットワークも使わない）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "sync-ask-form.mjs");
const REAL_DEST = join(here, "..", "third_party", "ask-form");
const SOURCE_PATH = "docs/ClaudeCode/skills/other/ask-form";
const FILES = ["ask-form.js", "fixtures/normalize.json", "fixtures/collect.json"] as const;

/** spawnSync はイベントループを止めるので vitest の testTimeout では打ち切れない。子そのものに上限を付ける。 */
const SPAWN_TIMEOUT_MS = 30_000;

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

interface SourceJson {
  repository: string;
  commit: string;
  path: string;
  retrieved: string;
  version: string;
  files: Record<string, string>;
}

let root: string;
let repo: string;
let dest: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "soda-sync-ask-form-test-"));
  repo = join(root, "repo");
  dest = join(root, "dest");
  await mkdir(repo, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** 利用者の git の設定（署名・フック等）を持ち込まない環境。 */
function env(): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    HOME: root,
    LC_ALL: "C.UTF-8",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
}

function git(...args: string[]): string {
  const r = spawnSync("git", ["-C", repo, ...args], {
    env: env(),
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function runSync(...args: string[]): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    env: env(),
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** 改行の混ざった・末尾に改行の無い中身（バイトをそのまま写すことを見るため）。 */
const JS_V1 = "// 部品\r\nconst VERSION = '9.8.7';\nexport const x = 1;";
const NORMALIZE = '{\n "cases": []\n}\n';
const COLLECT = '{"cases":[]}';
/** 不正な UTF-8 のバイト（0xff 0xfe）を含む中身。文字列を経由すると U+FFFD に化けて別のバイトになる。 */
const NOT_UTF8 = Buffer.from([0x7b, 0xff, 0xfe, 0x0d, 0x0a, 0x7d]);

/** 一時のリポジトリに 3 ファイルを置いてコミットし、そのコミット（40 桁）を返す。 */
async function commitSource(
  files: Partial<Record<(typeof FILES)[number], string | Buffer>>,
): Promise<string> {
  if (!existsSync(join(repo, ".git"))) git("init", "-q");
  for (const [f, content] of Object.entries(files)) {
    const p = join(repo, SOURCE_PATH, f);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content);
  }
  // 改行を変換させない（写した先と同じ `-text`。利用者の core.autocrlf に依らない）。
  await writeFile(join(repo, ".gitattributes"), "* -text\n");
  git("add", "-A");
  git("commit", "-q", "-m", "source");
  return git("rev-parse", "HEAD");
}

const allFiles = {
  "ask-form.js": JS_V1,
  "fixtures/normalize.json": NORMALIZE,
  "fixtures/collect.json": COLLECT,
};

async function readSourceJson(dir: string): Promise<SourceJson> {
  return JSON.parse(await readFile(join(dir, "SOURCE.json"), "utf8")) as SourceJson;
}

describe("写した先（third_party/ask-form/）", () => {
  it("各ファイルの sha256 が SOURCE.json と一致する（手で直していない）", async () => {
    const source = await readSourceJson(REAL_DEST);
    expect(Object.keys(source.files).sort()).toEqual([...FILES].sort());
    for (const f of FILES) {
      const actual = sha256(await readFile(join(REAL_DEST, f)));
      expect(actual, `${f}: 期待 ${source.files[f]}／実際 ${actual}`).toBe(source.files[f]);
    }
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(source.path).toBe(SOURCE_PATH);
  });

  it("SOURCE.json の version は、写した ask-form.js の VERSION の行と同じ", async () => {
    const source = await readSourceJson(REAL_DEST);
    const js = await readFile(join(REAL_DEST, "ask-form.js"), "utf8");
    const m = /^const VERSION = '([^']+)';/m.exec(js);
    expect(m?.[1]).toBeDefined();
    expect(source.version).toBe(m?.[1]);
  });

  it("--check が終了コード 0", () => {
    const r = runSync("--check");
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
  });
});

describe("sync-ask-form.mjs（写す）", () => {
  it("一時の git リポジトリから 3 ファイルをバイトのまま写し、SOURCE.json を書く", async () => {
    const commit = await commitSource(allFiles);
    const r = runSync("--from", repo, "--commit", commit.slice(0, 8), "--dest", dest);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);

    for (const f of FILES) {
      expect((await readFile(join(dest, f))).equals(Buffer.from(allFiles[f]))).toBe(true);
    }
    const source = await readSourceJson(dest);
    // 短いコミットを渡しても、記録は 40 桁。
    expect(source.commit).toBe(commit);
    expect(source.repository).toBe("https://github.com/asaomaro/public_docs");
    expect(source.path).toBe(SOURCE_PATH);
    expect(source.version).toBe("9.8.7");
    expect(source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(source.files).toEqual({
      "ask-form.js": sha256(Buffer.from(JS_V1)),
      "fixtures/normalize.json": sha256(Buffer.from(NORMALIZE)),
      "fixtures/collect.json": sha256(Buffer.from(COLLECT)),
    });
    expect(runSync("--check", "--dest", dest).code).toBe(0);
    expect(runSync("--check", "--from", repo, "--dest", dest).code).toBe(0);
  });

  it("不正な UTF-8 のバイトもそのまま写す（文字列を経由しない）", async () => {
    const commit = await commitSource({ ...allFiles, "fixtures/collect.json": NOT_UTF8 });
    const r = runSync("--from", repo, "--commit", commit, "--dest", dest);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);

    const copied = await readFile(join(dest, "fixtures", "collect.json"));
    expect([...copied]).toEqual([...NOT_UTF8]);
    expect((await readSourceJson(dest)).files["fixtures/collect.json"]).toBe(sha256(NOT_UTF8));
    expect(runSync("--check", "--from", repo, "--dest", dest).code).toBe(0);
  });

  it("同じコミット・同じ中身の写し直しでは retrieved を変えず、中身の違うコミットでは今日（UTC）にする", async () => {
    const first = await commitSource(allFiles);
    expect(runSync("--from", repo, "--commit", first, "--dest", dest).code).toBe(0);

    // 取得日を別の日付に書き換えてから、同じコミットで写し直す。
    const OLD = "2001-02-03";
    const source = await readSourceJson(dest);
    expect(source.retrieved).not.toBe(OLD);
    await writeFile(
      join(dest, "SOURCE.json"),
      JSON.stringify({ ...source, retrieved: OLD }, null, 2) + "\n",
    );
    expect(runSync("--from", repo, "--commit", first, "--dest", dest).code).toBe(0);
    expect((await readSourceJson(dest)).retrieved).toBe(OLD);

    // 中身の違うコミットで写し直すと、今日の日付（UTC。日付の変わり目をまたいでも落ちないよう、前後の両方を許す）。
    const second = await commitSource({ ...allFiles, "fixtures/collect.json": COLLECT + "\n" });
    const utcDate = (): string => new Date().toISOString().slice(0, 10);
    const before = utcDate();
    expect(runSync("--from", repo, "--commit", second, "--dest", dest).code).toBe(0);
    const after = utcDate();
    const updated = await readSourceJson(dest);
    expect(updated.commit).toBe(second);
    expect([before, after]).toContain(updated.retrieved);
  });

  it("作業ツリーの状態に依らない（コミットの中身を写し、元の作業ツリーは変えない）", async () => {
    const commit = await commitSource(allFiles);
    const dirty = join(repo, SOURCE_PATH, "ask-form.js");
    await writeFile(dirty, "// 編集中\n");

    expect(runSync("--from", repo, "--commit", commit, "--dest", dest).code).toBe(0);
    expect(await readFile(join(dest, "ask-form.js"), "utf8")).toBe(JS_V1);
    // 元の作業ツリーの編集中のファイルはそのまま・HEAD も動いていない。
    expect(await readFile(dirty, "utf8")).toBe("// 編集中\n");
    expect(git("rev-parse", "HEAD")).toBe(commit);
    // （`git()` は前後の空白を落とすので、先頭の空白〔index は変わっていない〕は付けずに比べる）
    expect(git("status", "--porcelain")).toBe(`M ${SOURCE_PATH}/ask-form.js`);
  });

  it("VERSION の行が無ければ version は unknown（誤りにしない）", async () => {
    const commit = await commitSource({ ...allFiles, "ask-form.js": "export const x = 1;\n" });
    const r = runSync("--from", repo, "--commit", commit, "--dest", dest);
    expect(r.code).toBe(0);
    expect((await readSourceJson(dest)).version).toBe("unknown");
  });
});

describe("sync-ask-form.mjs（--check）", () => {
  it("写した後に 1 バイト変えると終了コード 1 で、どのファイルかと期待・実際のハッシュを言う", async () => {
    const commit = await commitSource(allFiles);
    expect(runSync("--from", repo, "--commit", commit, "--dest", dest).code).toBe(0);

    const target = join(dest, "fixtures", "normalize.json");
    const bytes = await readFile(target);
    bytes[0] = bytes[0] === 0x20 ? 0x0a : 0x20;
    await writeFile(target, bytes);

    const r = runSync("--check", "--dest", dest);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("fixtures/normalize.json");
    expect(r.stderr).toContain(sha256(Buffer.from(NORMALIZE)));
    expect(r.stderr).toContain(sha256(bytes));
    // 変えていないファイルは挙げない。
    expect(r.stderr).not.toContain("ask-form.js");
    expect(r.stderr).not.toContain("collect.json");
  });

  it("写した先のファイルが無ければ終了コード 1", async () => {
    const commit = await commitSource(allFiles);
    expect(runSync("--from", repo, "--commit", commit, "--dest", dest).code).toBe(0);
    await rm(join(dest, "ask-form.js"));
    const r = runSync("--check", "--dest", dest);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("ask-form.js");
  });

  it("--from を付けると元の同じコミットとも比べる（SOURCE.json とファイルを揃えて書き換えても 1）", async () => {
    const commit = await commitSource(allFiles);
    expect(runSync("--from", repo, "--commit", commit, "--dest", dest).code).toBe(0);

    // 写した先のファイルと SOURCE.json のハッシュを、手で揃えて書き換える（SOURCE.json だけを見る検査は通る）。
    const edited = Buffer.from(COLLECT + " ");
    await writeFile(join(dest, "fixtures", "collect.json"), edited);
    const source = await readSourceJson(dest);
    source.files["fixtures/collect.json"] = sha256(edited);
    await writeFile(join(dest, "SOURCE.json"), JSON.stringify(source, null, 2) + "\n");

    expect(runSync("--check", "--dest", dest).code).toBe(0);
    const r = runSync("--check", "--from", repo, "--dest", dest);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("fixtures/collect.json");
  });
});

describe("sync-ask-form.mjs（使い方の誤り・取れない → 終了コード 2）", () => {
  it("引数が足りない・知らない引数・値の無い引数", async () => {
    expect(runSync().code).toBe(2);
    expect(runSync("--from", repo).code).toBe(2);
    expect(runSync("--commit", "HEAD").code).toBe(2);
    expect(runSync("--bogus").code).toBe(2);
    expect(runSync("--from").code).toBe(2);
    expect(runSync("--check", "--commit", "HEAD", "--dest", dest).code).toBe(2);
    expect(existsSync(dest)).toBe(false);
  });

  it("値を取る引数の次が -- で始まるなら、値として飲み込まない", async () => {
    const commit = await commitSource(allFiles);
    const r = runSync("--from", "--check", "--dest", dest);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("--from には値が要ります");
    const r2 = runSync("--from", repo, "--commit", commit, "--dest", "--check");
    expect(r2.code).toBe(2);
    expect(r2.stderr).toContain("--dest には値が要ります");
    expect(existsSync(dest)).toBe(false);
  });

  it("--from が git のリポジトリでない", async () => {
    const plain = join(root, "plain");
    await mkdir(plain);
    // 上の階層のリポジトリを拾わない（GIT_CEILING_DIRECTORIES は使わず、mkdtemp の中＝リポジトリの外であることに頼る）。
    const r = runSync("--from", plain, "--commit", "HEAD", "--dest", dest);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("git のリポジトリではありません");
    expect(runSync("--from", join(root, "nowhere"), "--commit", "HEAD", "--dest", dest).code).toBe(
      2,
    );
    expect(existsSync(dest)).toBe(false);
  });

  it("コミットが無い", async () => {
    await commitSource(allFiles);
    const r = runSync(
      "--from",
      repo,
      "--commit",
      "0123456789abcdef0123456789abcdef01234567",
      "--dest",
      dest,
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("コミットがありません");
    expect(existsSync(dest)).toBe(false);
  });

  it("ファイルが無い（1 つでも欠けたら何も書かない）", async () => {
    const commit = await commitSource({
      "ask-form.js": JS_V1,
      "fixtures/normalize.json": NORMALIZE,
    });
    const r = runSync("--from", repo, "--commit", commit, "--dest", dest);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("fixtures/collect.json");
    expect(existsSync(dest)).toBe(false);
  });

  it("--check で SOURCE.json が無い", async () => {
    await mkdir(dest);
    const r = runSync("--check", "--dest", dest);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("SOURCE.json");
  });

  it("--dest が既存のファイルなら、理由を 1 行出して終了コード 2（スタックトレースを出さない）", async () => {
    const commit = await commitSource(allFiles);
    await writeFile(dest, "ファイル\n");
    const r = runSync("--from", repo, "--commit", commit, "--dest", dest);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/^sync-ask-form: 書き込めません: [^\n]*\n$/);
    expect(r.stderr).not.toMatch(/^\s+at /m);
    expect(await readFile(dest, "utf8")).toBe("ファイル\n");
  });

  it("途中で書けなければ、元のファイルを変えず、一時ファイルも残さない", async () => {
    const first = await commitSource(allFiles);
    expect(runSync("--from", repo, "--commit", first, "--dest", dest).code).toBe(0);
    const sourceBefore = await readFile(join(dest, "SOURCE.json"));

    // fixtures をファイルに替える: ask-form.js を書いた後、fixtures/ の下を書く所で失敗する。
    await rm(join(dest, "fixtures"), { recursive: true });
    await writeFile(join(dest, "fixtures"), "");
    const second = await commitSource({ ...allFiles, "ask-form.js": JS_V1 + "\n// 新しい版\n" });
    const r = runSync("--from", repo, "--commit", second, "--dest", dest);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^sync-ask-form: 書き込めません: [^\n]*\n$/);

    // 新しい ask-form.js と古い SOURCE.json の組み合わせを残さない。
    expect(await readFile(join(dest, "ask-form.js"), "utf8")).toBe(JS_V1);
    expect((await readFile(join(dest, "SOURCE.json"))).equals(sourceBefore)).toBe(true);
    expect((await readdir(dest)).sort()).toEqual(["SOURCE.json", "ask-form.js", "fixtures"]);
  });
});
