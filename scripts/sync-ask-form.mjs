#!/usr/bin/env node
// ask-form の部品（`<ask-form>`）と共通の試験データを、手元の public_docs の clone から third_party/ask-form/ へ写す。
//
// 使い方:
//   node scripts/sync-ask-form.mjs --from <public_docs の clone> --commit <コミット>   写して SOURCE.json を書く
//   node scripts/sync-ask-form.mjs --check [--from <clone>]                          写した先が SOURCE.json と一致するか（--from があれば元の同じコミットとも）
//   （どちらも --dest <フォルダ> で写した先を替えられる。既定は third_party/ask-form。テストが一時のフォルダへ向けるためのもの）
//
// 決まり:
//   - 取り方は `git -C <from> show <commit>:<path>/<file>`。作業ツリーの状態に依らず、<from> へは何も書かない（チェックアウトも切り替えない）。
//   - ネットワークは使わない。
//   - 写したファイルは 1 バイトも変えない（git が返したバイトをそのまま書く。改行・文字コードを触らない）。
// 終了コード: 0 成功／1 食い違い（--check）／2 使い方の誤り・取れない。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 出どころ（SOURCE.json にそのまま書く）。 */
const REPOSITORY = "https://github.com/asaomaro/public_docs";
const SOURCE_PATH = "docs/ClaudeCode/skills/other/ask-form";
/** 写すファイル（<SOURCE_PATH> からの相対。写した先でも同じ並び）。 */
const FILES = ["ask-form.js", "fixtures/normalize.json", "fixtures/collect.json"];
const USAGE = `使い方:
  node scripts/sync-ask-form.mjs --from <public_docs の clone> --commit <コミット> [--dest <フォルダ>]
  node scripts/sync-ask-form.mjs --check [--from <clone>] [--dest <フォルダ>]`;

/** 使い方の誤り・取れない（終了コード 2）。 */
function die(message) {
  console.error(`sync-ask-form: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { check: false, from: undefined, commit: undefined, dest: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") {
      opts.check = true;
    } else if (a === "--from" || a === "--commit" || a === "--dest") {
      const v = argv[++i];
      if (v === undefined || v === "") die(`${a} に値がありません\n${USAGE}`);
      opts[a.slice(2)] = v;
    } else {
      die(`知らない引数: ${a}\n${USAGE}`);
    }
  }
  return opts;
}

/** git を走らせ、stdout をバイトのまま返す（失敗したら null と理由）。 */
function git(from, args) {
  const r = spawnSync("git", ["-C", from, ...args], { maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { out: null, why: r.error.message };
  if (r.status !== 0) return { out: null, why: r.stderr.toString("utf8").trim() };
  return { out: r.stdout, why: "" };
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** <from> の <commit> を 40 桁にする（リポジトリでない・コミットが無いなら終了コード 2）。 */
function resolveCommit(from, commit) {
  if (!existsSync(from)) die(`--from のフォルダがありません: ${from}`);
  const inside = git(from, ["rev-parse", "--git-dir"]);
  if (inside.out === null) die(`--from が git のリポジトリではありません: ${from}\n${inside.why}`);
  const full = git(from, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]);
  if (full.out === null) die(`コミットがありません: ${commit}（${from}）`);
  return full.out.toString("utf8").trim();
}

/** <commit> の 3 ファイルを読む（1 つでも無ければ、何も書かずに終了コード 2）。 */
function readSource(from, commit) {
  const files = new Map();
  for (const f of FILES) {
    const r = git(from, ["show", `${commit}:${SOURCE_PATH}/${f}`]);
    if (r.out === null) die(`ファイルが取れません: ${commit}:${SOURCE_PATH}/${f}\n${r.why}`);
    files.set(f, r.out);
  }
  return files;
}

/** 写した `ask-form.js` の `const VERSION = '…'` の行から版を読む（読めなければ "unknown"。誤りにしない）。 */
function readVersion(js) {
  const m = /^const VERSION = ['"]([^'"]+)['"];/m.exec(js.toString("utf8"));
  return m ? m[1] : "unknown";
}

function readSourceJson(dest) {
  const p = join(dest, "SOURCE.json");
  if (!existsSync(p)) die(`SOURCE.json がありません: ${p}`);
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (
      typeof j !== "object" ||
      j === null ||
      typeof j.commit !== "string" ||
      typeof j.files !== "object" ||
      j.files === null
    ) {
      die(`SOURCE.json の形が違います: ${p}`);
    }
    return j;
  } catch (e) {
    return die(`SOURCE.json が読めません: ${p}\n${e instanceof Error ? e.message : String(e)}`);
  }
}

function sync(opts, dest) {
  if (opts.from === undefined || opts.commit === undefined)
    die(`--from と --commit が要ります\n${USAGE}`);
  const commit = resolveCommit(opts.from, opts.commit);
  const files = readSource(opts.from, commit);
  const hashes = Object.fromEntries(FILES.map((f) => [f, sha256(files.get(f))]));

  // 同じコミット・同じ中身を写し直しただけなら、取得日は前のまま（差分を作らない）。
  let retrieved = new Date().toISOString().slice(0, 10);
  const prevPath = join(dest, "SOURCE.json");
  if (existsSync(prevPath)) {
    try {
      const prev = JSON.parse(readFileSync(prevPath, "utf8"));
      if (
        prev.commit === commit &&
        JSON.stringify(prev.files) === JSON.stringify(hashes) &&
        typeof prev.retrieved === "string"
      ) {
        retrieved = prev.retrieved;
      }
    } catch {
      // 前の記録が読めないなら、新しく書く。
    }
  }

  for (const f of FILES) {
    const p = join(dest, f);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, files.get(f));
  }
  const source = {
    repository: REPOSITORY,
    commit,
    path: SOURCE_PATH,
    retrieved,
    version: readVersion(files.get("ask-form.js")),
    files: hashes,
  };
  writeFileSync(prevPath, JSON.stringify(source, null, 2) + "\n");
  console.log(
    `sync-ask-form: ${commit} から ${FILES.length} ファイルを ${dest} へ写しました（version ${source.version}）`,
  );
}

function check(opts, dest) {
  if (opts.commit !== undefined)
    die(`--check に --commit は付けられません（比べるのは SOURCE.json のコミット）\n${USAGE}`);
  const source = readSourceJson(dest);
  const original =
    opts.from === undefined ? null : readSource(opts.from, resolveCommit(opts.from, source.commit));
  const diffs = [];
  for (const f of FILES) {
    const want = source.files[f];
    const p = join(dest, f);
    if (typeof want !== "string") {
      diffs.push(`${f}: SOURCE.json にハッシュがありません`);
      continue;
    }
    if (!existsSync(p)) {
      diffs.push(`${f}: 写した先にファイルがありません`);
      continue;
    }
    const got = sha256(readFileSync(p));
    if (got !== want) diffs.push(`${f}: SOURCE.json と違います（期待 ${want}／実際 ${got}）`);
    if (original !== null) {
      const src = sha256(original.get(f));
      if (src !== want)
        diffs.push(
          `${f}: 元（${source.commit}）と SOURCE.json が違います（元 ${src}／SOURCE.json ${want}）`,
        );
    }
  }
  if (diffs.length > 0) {
    console.error(`sync-ask-form: 食い違いがあります（${dest}）`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exit(1);
  }
  console.log(
    `sync-ask-form: ${dest} は SOURCE.json（${source.commit}）と一致しています${original === null ? "" : "（元とも一致）"}`,
  );
}

const opts = parseArgs(process.argv.slice(2));
const dest = opts.dest === undefined ? join(root, "third_party", "ask-form") : resolve(opts.dest);
if (opts.check) check(opts, dest);
else sync(opts, dest);
