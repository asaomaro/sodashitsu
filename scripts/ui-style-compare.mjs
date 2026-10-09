#!/usr/bin/env node
/**
 * 画面の見た目を、変更の前後で画素まで比べる（20261008-ui-style の T2。使い方は `docs/verification.md`）。
 *
 *   node scripts/ui-style-compare.mjs [<比べる元のコミット>] [--style classic|modern] [--out <dir>] [--keep]
 *
 * 1. 元のコミット（既定 `origin/main`）を `git worktree` で一時の場所へ出し、`pnpm install --frozen-lockfile`・`pnpm build` する。
 * 2. 元のコミットで `packages/e2e/src/specs/ui-style-shots.spec.ts`（いまの作業フォルダのものを写して使う）を流して画像を撮る（様式は、いつも classic）。
 * 3. いまの作業フォルダで同じ spec を流して画像を撮る（`--style` で様式を選べる。既定は classic）。
 * 4. 画像を 1 枚ずつ、画素で比べる。許す差は 0。差のある画像の名前・差の画素の数・差の画像の場所を出し、1 枚でも差があれば終了コード 1。
 *
 * **同じ機械の上の、変更の前後の比較**のための道具（機械が違うと文字の描画が違う。基準の画像は、リポジトリに入れない）。
 * 画素の比較は、Playwright が同梱の Chromium の canvas で行う（`pngjs`・`pixelmatch` を足さない）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = "packages/e2e/src/specs/ui-style-shots.spec.ts";

const args = process.argv.slice(2);
let baseRef = "origin/main";
let style = "classic";
let outDir = join(tmpdir(), `ui-style-compare-${process.pid}`);
let keep = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--style") style = args[++i];
  else if (a === "--out") outDir = resolve(args[++i]);
  else if (a === "--keep") keep = true;
  else if (a.startsWith("--")) fail(`知らない引数: ${a}`);
  else baseRef = a;
}
if (style !== "classic" && style !== "modern") fail("--style は classic か modern");

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

// 子プロセスの環境: 画面（DISPLAY・WAYLAND_DISPLAY）を外す（WSLg の環境で、Chromium が画面待ちで止まる）。PATH は、そのまま。
const childEnv = { ...process.env };
delete childEnv.DISPLAY;
delete childEnv.WAYLAND_DISPLAY;

function run(cmd, cmdArgs, opts = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, cmdArgs, { stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit", env: { ...childEnv, ...(opts.env ?? {}) }, cwd: opts.cwd ?? root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    if (opts.quiet) console.error(`${r.stdout ?? ""}${r.stderr ?? ""}`);
    fail(`失敗（${Math.round((Date.now() - t0) / 1000)} 秒）: ${cmd} ${cmdArgs.join(" ")}`);
  }
  return r.stdout ?? "";
}

const t0 = Date.now();
const sha = run("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { quiet: true }).trim();
const baseTree = join(tmpdir(), `ui-style-base-${sha.slice(0, 12)}-${process.pid}`);
const baseShots = join(outDir, "base");
const headShots = join(outDir, "head");
const diffShots = join(outDir, "diff");
for (const d of [baseShots, headShots, diffShots]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}

function shoot(cwd, dir, uiStyle) {
  const t = Date.now();
  run("pnpm", ["exec", "playwright", "test", "ui-style-shots", "--workers=1", "--reporter=line"], {
    cwd: join(cwd, "packages/e2e"),
    quiet: true,
    env: { UI_STYLE_SHOTS_DIR: dir, UI_STYLE: uiStyle },
  });
  return Math.round((Date.now() - t) / 1000);
}

let secBase = 0;
let secHead = 0;
try {
  console.log(`元: ${baseRef} (${sha.slice(0, 10)})`);
  run("git", ["worktree", "add", "--detach", baseTree, sha], { quiet: true });
  console.log("元を install・build する…");
  run("pnpm", ["install", "--frozen-lockfile"], { cwd: baseTree, quiet: true });
  run("pnpm", ["build"], { cwd: baseTree, quiet: true });
  copyFileSync(join(root, SPEC), join(baseTree, SPEC)); // 元に spec が無くても撮れるように、いまのものを使う
  console.log("元を撮る…");
  secBase = shoot(baseTree, baseShots, "classic");
  console.log(`いまを撮る（様式: ${style}）…`);
  secHead = shoot(root, headShots, style);
} finally {
  if (!keep) {
    spawnSync("git", ["worktree", "remove", "--force", baseTree], { cwd: root, stdio: "ignore" });
    rmSync(baseTree, { recursive: true, force: true });
    spawnSync("git", ["worktree", "prune"], { cwd: root, stdio: "ignore" });
  } else console.log(`元の作業フォルダを残した: ${baseTree}`);
}

// --- 画素の比較 ---
const require = createRequire(join(root, "packages/e2e/package.json"));
const { chromium } = require("@playwright/test");
const namesOf = (d) => readdirSync(d).filter((f) => f.endsWith(".png")).sort();
const baseNames = namesOf(baseShots);
const headNames = namesOf(headShots);
const all = [...new Set([...baseNames, ...headNames])].sort();

const browser = await chromium.launch({ env: childEnv });
const page = await browser.newPage();
await page.setContent("<canvas id=a></canvas><canvas id=b></canvas><canvas id=d></canvas>");
const results = [];
for (const name of all) {
  if (!baseNames.includes(name) || !headNames.includes(name)) {
    results.push({ name, missing: baseNames.includes(name) ? "いまに無い" : "元に無い", diff: -1 });
    continue;
  }
  const a = readFileSync(join(baseShots, name)).toString("base64");
  const b = readFileSync(join(headShots, name)).toString("base64");
  const r = await page.evaluate(async ([a64, b64]) => {
    const load = async (b64s) => {
      const bin = Uint8Array.from(atob(b64s), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
      ctx.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
    };
    const A = await load(a64);
    const B = await load(b64);
    if (A.w !== B.w || A.h !== B.h) return { size: `${A.w}x${A.h} ≠ ${B.w}x${B.h}`, diff: -1 };
    const out = new OffscreenCanvas(A.w, A.h);
    const octx = out.getContext("2d");
    const img = octx.createImageData(A.w, A.h);
    let diff = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const same = A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2] && A.data[i + 3] === B.data[i + 3];
      if (same) {
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 / 4 + 190);
        img.data[i + 3] = 255;
      } else {
        diff++;
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
    return { diff, png: btoa(s) };
  }, [a, b]);
  if (r.diff !== 0 && r.png) writeFileSync(join(diffShots, name), Buffer.from(r.png, "base64"));
  results.push({ name, ...r });
}
await browser.close();

const bad = results.filter((r) => r.diff !== 0);
console.log(`\n比べた画像: ${all.length} 枚（元 ${baseNames.length}・いま ${headNames.length}）`);
for (const r of bad) {
  console.log(`  差あり: ${r.name} — ${r.missing ?? r.size ?? `${r.diff} 画素`}${r.diff > 0 ? `（差の画像: ${join(diffShots, r.name)}）` : ""}`);
}
console.log(`差のある画像: ${bad.length} 枚 / ${all.length} 枚`);
console.log(`かかった時間: 元を撮る ${secBase} 秒・いまを撮る ${secHead} 秒・全体 ${Math.round((Date.now() - t0) / 1000)} 秒`);
console.log(`画像の場所: ${outDir}（base・head・diff）`);
process.exit(bad.length === 0 && all.length > 0 ? 0 : 1);
