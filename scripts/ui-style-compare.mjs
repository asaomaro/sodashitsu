#!/usr/bin/env node
/**
 * 画面の見た目を、変更の前後で画素まで比べる（20261008-ui-style の T2。使い方は `docs/verification.md`）。
 *
 *   node scripts/ui-style-compare.mjs [<比べる元のコミット>] [--style classic|modern] [--out <dir>] [--keep] [--strict]
 *   node scripts/ui-style-compare.mjs --selftest        # 比べる関数そのものの自己テスト（git・ビルドは使わない）
 *
 * 描画の揺れ: 1 枚の中の差が、すべて「各色の成分の差が 1 以下」の画素で、かつ 16 画素以下なら、差ありにせず「揺れ」として別に数える（`--strict` で、揺れも差あり）。
 * 終了コード: 0 = 全部差 0 ／ 1 = 差あり・枚数が期待と違う ／ 2 = 道具の失敗（引数・ビルド・撮影・例外。差の有無は分からない）。
 * 1. 元のコミット（既定 `origin/main`）を `git worktree` で一時の場所へ出し、`pnpm install --frozen-lockfile`・`pnpm build` する。
 * 2. 元のコミットで `packages/e2e/src/specs/ui-style-shots.spec.ts`（いまの作業フォルダのものを写して使う）を流して画像を撮る（様式は、いつも classic）。
 * 3. **いまの作業フォルダも `pnpm build` してから**（古いビルドのまま撮って差 0 と誤らないように）、同じ spec を流して画像を撮る（`--style` で様式を選べる。既定は classic）。
 * 4. 画像を 1 枚ずつ、画素で比べる。許す差は 0。差のある画像の名前・差の画素の数・差の画像の場所を出し、1 枚でも差があれば終了コード 1。
 *
 * **同じ機械の上の、変更の前後の比較**のための道具（機械が違うと文字の描画が違う。基準の画像は、リポジトリに入れない）。
 * 画素の比較は、Playwright が同梱の Chromium の canvas で行う（`pngjs`・`pixelmatch` を足さない）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = "packages/e2e/src/specs/ui-style-shots.spec.ts";

const EXPECTED_SHOTS = 44; // 暗い・明るい各 22 枚（spec が画面を増やしたら、ここも直す）
const JITTER_MAX_COMPONENT = 1; // 揺れとみなす、色の成分の差の上限
const JITTER_MAX_PIXELS = 16; // 揺れとみなす、差の画素の数の上限
const SIGNAL_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

class ToolError extends Error {}
const toolError = (msg) => new ToolError(msg);

// 子プロセスの環境: 画面（DISPLAY・WAYLAND_DISPLAY）を外す（WSLg の環境で、Chromium が画面待ちで止まる）。PATH は、そのまま。
const childEnv = { ...process.env };
delete childEnv.DISPLAY;
delete childEnv.WAYLAND_DISPLAY;

function run(cmd, cmdArgs, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, cmdArgs, { stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...childEnv, ...(opts.env ?? {}) }, cwd: opts.cwd ?? root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    if (opts.quiet) console.error(`${r.stdout ?? ""}${r.stderr ?? ""}`);
    throw toolError(`失敗（${Math.round((Date.now() - t0) / 1000)} 秒${r.signal ? `・${r.signal}` : ""}）: ${cmd} ${cmdArgs.join(" ")}`);
  }
  return r.stdout ?? "";
}

// --- 画素の比較（1 枚ずつ。Playwright 同梱の Chromium の canvas） ---
const require = createRequire(join(root, "packages/e2e/package.json"));

async function openComparer() {
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({ env: childEnv });
  const page = await browser.newPage();
  await page.setContent("<body></body>");
  return { browser, page };
}

/** 2 枚（base64 の PNG）を比べる。差の画素の数（0 = 同じ）・大きさ違い・読めない画像は `diff: -1`（理由つき）。差のあるとき、差の画像（base64）も返す。 */
function compareInPage(page, a64, b64) {
  return page.evaluate(async ([a64, b64]) => {
    const load = async (b64s) => {
      const bin = Uint8Array.from(atob(b64s), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
      ctx.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
    };
    let A;
    let B;
    try {
      A = await load(a64);
      B = await load(b64);
    } catch (e) {
      return { unreadable: String(e).slice(0, 120), diff: -1 };
    }
    if (A.w !== B.w || A.h !== B.h) return { size: `${A.w}x${A.h} ≠ ${B.w}x${B.h}`, diff: -1 };
    const out = new OffscreenCanvas(A.w, A.h);
    const octx = out.getContext("2d");
    const img = octx.createImageData(A.w, A.h);
    let diff = 0;
    let maxComp = 0; // 差のある画素の、色の成分（R・G・B・A）の差の最大
    for (let i = 0; i < A.data.length; i += 4) {
      const same = A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2] && A.data[i + 3] === B.data[i + 3];
      if (same) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 / 4 + 190);
        img.data[i + 3] = 255;
      } else {
        diff++;
        for (let k = 0; k < 4; k++) maxComp = Math.max(maxComp, Math.abs(A.data[i + k] - B.data[i + k]));
        img.data[i] = 255;
        img.data[i + 1] = 0;
        img.data[i + 2] = 0;
        img.data[i + 3] = 255;
      }
    }
    if (diff === 0) return { diff: 0 };
    octx.putImageData(img, 0, 0);
    const blob = await out.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { diff, maxComp, png: btoa(s) };
  }, [a64, b64]);
}

const namesOf = (d) => readdirSync(d).filter((f) => f.endsWith(".png")).sort();

/** 2 つのフォルダの画像を、名前ごとに比べる。片方にしか無い画像・読めない画像・大きさ違いも、差あり（`diff !== 0`）として返す。 */
async function compareDirs(page, baseDir, headDir, diffDir, strict = false) {
  const baseNames = namesOf(baseDir);
  const headNames = namesOf(headDir);
  const all = [...new Set([...baseNames, ...headNames])].sort();
  const results = [];
  for (const name of all) {
    if (!baseNames.includes(name) || !headNames.includes(name)) {
      results.push({ name, missing: baseNames.includes(name) ? "いまに無い" : "元に無い", diff: -1 });
      continue;
    }
    const r = await compareInPage(page, readFileSync(join(baseDir, name)).toString("base64"), readFileSync(join(headDir, name)).toString("base64"));
    if (r.png) writeFileSync(join(diffDir, name), Buffer.from(r.png, "base64"));
    // 描画の揺れ: 差が「各成分の差 1 以下」の画素だけで、かつ 16 画素以下なら、差ありにせず「揺れ」として別に数える（`--strict` なら差あり）。
    const jitter = !strict && r.diff > 0 && r.maxComp <= JITTER_MAX_COMPONENT && r.diff <= JITTER_MAX_PIXELS;
    results.push({ name, ...r, ...(jitter ? { jitter: true, diff: 0, jitterPixels: r.diff } : {}) });
  }
  return { results, baseCount: baseNames.length, headCount: headNames.length };
}

// --- 自己テスト: 比べる関数が、差を見つけ、失敗を失敗として扱うこと ---
async function selftest() {
  const dir = mkdtempSync(join(tmpdir(), "ui-style-selftest-"));
  const { browser, page } = await openComparer();
  try {
    // n 画素（1 行目の左から）の赤の成分を delta だけ上げた画像。n = 0 なら、元の画像。
    const png = (w, h, n = 0, delta = 0) =>
      page.evaluate(
        async ([w, h, n, delta]) => {
          const c = new OffscreenCanvas(w, h);
          const ctx = c.getContext("2d");
          ctx.fillStyle = "rgb(30,40,50)";
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = "rgb(200,100,50)";
          ctx.fillRect(1, 1, 3, 3);
          for (let i = 0; i < n; i++) {
            ctx.fillStyle = `rgb(${30 + delta},40,50)`;
            ctx.fillRect(6 + i, h - 1, 1, 1);
          }
          const buf = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
          let s = "";
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          return btoa(s);
        },
        [w, h, n, delta],
      );
    const put = (d, name, b64) => writeFileSync(join(d, name), Buffer.from(b64, "base64"));
    const a = join(dir, "a");
    const b = join(dir, "b");
    const d = join(dir, "d");
    for (const x of [a, b, d]) mkdirSync(x);
    put(a, "same.png", await png(40, 10));
    put(b, "same.png", await png(40, 10));
    put(a, "onepixel.png", await png(40, 10));
    put(b, "onepixel.png", await png(40, 10, 1, 40));
    put(a, "size.png", await png(40, 10));
    put(b, "size.png", await png(41, 10));
    put(a, "onlybase.png", await png(40, 10));
    put(b, "onlyhead.png", await png(40, 10));
    put(a, "broken.png", await png(40, 10));
    writeFileSync(join(b, "broken.png"), "これは PNG ではない");
    // 描画の揺れの境目（成分の差 1・2、画素の数 16・17）。
    for (const [name, n, delta] of [["j-1px-d1", 1, 1], ["j-16px-d1", 16, 1], ["j-17px-d1", 17, 1], ["j-1px-d2", 1, 2], ["j-16px-d2", 16, 2]]) {
      put(a, `${name}.png`, await png(40, 10));
      put(b, `${name}.png`, await png(40, 10, n, delta));
    }
    const { results } = await compareDirs(page, a, b, d);
    const strictByName = Object.fromEntries((await compareDirs(page, a, b, d, true)).results.map((r) => [r.name, r]));
    const by = Object.fromEntries(results.map((r) => [r.name, r]));
    const checks = [
      ["同じ画像は差 0", by["same.png"].diff === 0],
      ["1 画素だけ違う画像は、差 1 画素", by["onepixel.png"].diff === 1 && existsSync(join(d, "onepixel.png"))],
      ["大きさの違う画像は差あり", by["size.png"].diff === -1 && typeof by["size.png"].size === "string"],
      ["元にしか無い画像は差あり", by["onlybase.png"].diff === -1 && by["onlybase.png"].missing === "いまに無い"],
      ["いまにしか無い画像は差あり", by["onlyhead.png"].diff === -1 && by["onlyhead.png"].missing === "元に無い"],
      ["読めない画像は差あり（落ちずに、理由が付く）", by["broken.png"].diff === -1 && typeof by["broken.png"].unreadable === "string"],
      ["成分の差 1・1 画素は、揺れ（差 0 として数え、揺れとして印が付く）", by["j-1px-d1.png"].diff === 0 && by["j-1px-d1.png"].jitter === true],
      ["成分の差 1・16 画素は、揺れ（上限ちょうど）", by["j-16px-d1.png"].diff === 0 && by["j-16px-d1.png"].jitter === true && by["j-16px-d1.png"].jitterPixels === 16],
      ["成分の差 1・17 画素は、差あり", by["j-17px-d1.png"].diff === 17 && !by["j-17px-d1.png"].jitter],
      ["成分の差 2・1 画素は、差あり", by["j-1px-d2.png"].diff === 1 && !by["j-1px-d2.png"].jitter],
      ["成分の差 2・16 画素は、差あり", by["j-16px-d2.png"].diff === 16 && !by["j-16px-d2.png"].jitter],
      ["--strict では、揺れも差あり", strictByName["j-1px-d1.png"].diff === 1 && strictByName["j-16px-d1.png"].diff === 16 && !strictByName["j-1px-d1.png"].jitter],
      ["差 0 でない画像は、全部で 8 枚（揺れは数えない）", results.filter((r) => r.diff !== 0).length === 8],
    ];
    let failed = 0;
    for (const [label, ok] of checks) {
      console.log(`${ok ? "OK  " : "NG  "} ${label}`);
      if (!ok) failed++;
    }
    if (failed > 0) throw toolError(`自己テストが ${failed} 件失敗`);
    console.log("自己テスト: すべて通った");
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- 本体 ---
let baseTree = null;
let keep = false;
let cleaned = false;
/** 一時の worktree を片づける（何度呼んでも 1 回だけ。`--keep` のときは残す）。 */
function cleanup() {
  if (cleaned || baseTree === null) return;
  cleaned = true;
  if (keep) {
    console.log(`元の作業フォルダを残した: ${baseTree}`);
    return;
  }
  const remove = () => {
    spawnSync("git", ["worktree", "remove", "--force", baseTree], { cwd: root, stdio: "ignore" });
    rmSync(baseTree, { recursive: true, force: true });
    spawnSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
  };
  remove();
  // 中断のとき、子の Playwright のワーカーが、少し遅れて書き込みを続けることがある。落ち着くのを待って、もう一度片づける。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  if (existsSync(baseTree)) remove();
}
for (const sig of Object.keys(SIGNAL_CODES)) {
  process.on(sig, () => {
    cleanup();
    process.exit(SIGNAL_CODES[sig]);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let baseRef = "origin/main";
  let style = "classic";
  let outDir = null;
  let strict = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--selftest") return selftest();
    if (a === "--style") style = args[++i];
    else if (a === "--out") outDir = resolve(args[++i] ?? "");
    else if (a === "--keep") keep = true;
    else if (a === "--strict") strict = true;
    else if (a.startsWith("--")) throw toolError(`知らない引数: ${a}`);
    else baseRef = a;
  }
  if (style !== "classic" && style !== "modern") throw toolError("--style は classic か modern");
  outDir ??= join(tmpdir(), `ui-style-compare-${process.pid}`);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) throw toolError(`--out は空か、無いフォルダを指定してください（中身を消さないため）: ${outDir}`);

  const t0 = Date.now();
  const sha = run("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { quiet: true }).trim();
  const baseShots = join(outDir, "base");
  const headShots = join(outDir, "head");
  const diffShots = join(outDir, "diff");
  for (const d of [baseShots, headShots, diffShots]) mkdirSync(d, { recursive: true });

  const shoot = (cwd, dir, uiStyle) => {
    const t = Date.now();
    run("pnpm", ["exec", "playwright", "test", "ui-style-shots", "--workers=1", "--reporter=line"], { cwd: join(cwd, "packages/e2e"), quiet: true, env: { UI_STYLE_SHOTS_DIR: dir, UI_STYLE: uiStyle } });
    return Math.round((Date.now() - t) / 1000);
  };

  let secBase = 0;
  let secHead = 0;
  try {
    console.log(`元: ${baseRef} (${sha.slice(0, 10)})。\`git fetch\` はしない（${baseRef} が古ければ、古い元と比べる）`);
    baseTree = join(tmpdir(), `ui-style-base-${sha.slice(0, 12)}-${process.pid}`);
    run("git", ["worktree", "add", "--detach", baseTree, sha], { quiet: true });
    console.log("元を install・build する…");
    run("pnpm", ["install", "--frozen-lockfile"], { cwd: baseTree, quiet: true });
    run("pnpm", ["build"], { cwd: baseTree, quiet: true });
    copyFileSync(join(root, SPEC), join(baseTree, SPEC)); // 元に spec が無くても撮れるように、いまのものを使う
    console.log("元を撮る…");
    secBase = shoot(baseTree, baseShots, "classic");
    console.log("いまを build する…（古いビルドのまま撮らないため）");
    run("pnpm", ["build"], { cwd: root, quiet: true });
    console.log(`いまを撮る（様式: ${style}）…`);
    secHead = shoot(root, headShots, style);
  } finally {
    cleanup();
  }

  const { browser, page } = await openComparer();
  let report;
  try {
    report = await compareDirs(page, baseShots, headShots, diffShots, strict);
  } finally {
    await browser.close();
  }
  const { results, baseCount, headCount } = report;
  const bad = results.filter((r) => r.diff !== 0);
  console.log(`\n比べた画像: ${results.length} 枚（元 ${baseCount}・いま ${headCount}。期待 ${EXPECTED_SHOTS}）`);
  for (const r of bad) console.log(`  差あり: ${r.name} — ${r.missing ?? r.size ?? (r.unreadable ? `読めない（${r.unreadable}）` : `${r.diff} 画素`)}${r.diff > 0 ? `（差の画像: ${join(diffShots, r.name)}）` : ""}`);
  const countOk = baseCount === EXPECTED_SHOTS && headCount === EXPECTED_SHOTS;
  if (!countOk) console.log(`  枚数が期待（${EXPECTED_SHOTS}）と違う: 元 ${baseCount}・いま ${headCount}（spec が画面を増減したなら EXPECTED_SHOTS を直す）`);
  const jitters = results.filter((r) => r.jitter);
  console.log(`差のある画像: ${bad.length} 枚 / ${results.length} 枚`);
  console.log(`揺れ（各成分の差 ${JITTER_MAX_COMPONENT} 以下・${JITTER_MAX_PIXELS} 画素以下。差ありにしない）: ${jitters.length} 枚${jitters.length ? ` — ${jitters.map((r) => `${r.name}（${r.jitterPixels} 画素）`).join("・")}` : ""}${strict ? "（--strict: 揺れも差あり）" : ""}`);
  console.log(`かかった時間: 元を撮る ${secBase} 秒・いまを撮る ${secHead} 秒・全体 ${Math.round((Date.now() - t0) / 1000)} 秒`);
  console.log(`画像の場所: ${outDir}（base・head・diff）`);
  return bad.length === 0 && countOk ? 0 : 1;
}

main().then(
  (code) => process.exit(code ?? 0),
  (e) => {
    cleanup();
    console.error(e instanceof ToolError ? e.message : e);
    process.exit(2);
  },
);
