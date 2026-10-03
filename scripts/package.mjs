#!/usr/bin/env node
// 配布用のフォルダ（と tar.gz / zip）を release/ に作る。使い方: node scripts/package.mjs [--no-build] [--no-install] [--no-archive]
//
// 中身（release/sodashitsu-<version>/）:
//   bin/soda, bin/soda.cmd, bin/sodactl, bin/sodactl.cmd   起動用のコマンド（sh と bat）
//   packages/{protocol,client-core,tui,server,cli}/（package.json と dist）, packages/web/dist
//   third_party/, docs/, LICENSE, NOTICE                  サーバが相対パスで読むので、リポジトリと同じ並びで持つ
//   node_modules/                                         本番の依存だけ（node-pty は OS ごとのネイティブなので、作った OS 用）
// サーバは ../../web/dist と ../../../third_party を相対で探すため、packages/ の並びは変えない。
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(cmd, argv, cwd) {
  const r = spawnSync(cmd, argv, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`失敗: ${cmd} ${argv.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

if (!args.has("--no-build")) run(pnpm, ["build"], root);

const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const name = `sodashitsu-${version}`;
const out = join(root, "release", name);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const runtimePackages = ["protocol", "client-core", "tui", "server", "cli"];
for (const p of [...runtimePackages, "web"]) {
  const dist = join(root, "packages", p, "dist");
  if (!existsSync(dist)) {
    console.error(`packages/${p}/dist がありません。先に pnpm build してください。`);
    process.exit(1);
  }
  const dest = join(out, "packages", p);
  mkdirSync(dest, { recursive: true });
  cpSync(dist, join(dest, "dist"), { recursive: true, filter: (s) => !s.endsWith(".map") || p !== "web" });
  if (p !== "web") cpSync(join(root, "packages", p, "package.json"), join(dest, "package.json"));
}
for (const f of ["third_party", "docs", "LICENSE", "NOTICE", "pnpm-workspace.yaml", "pnpm-lock.yaml"]) {
  cpSync(join(root, f), join(out, f), { recursive: true });
}
// lockfile は開発用の全体のものなので、固定ではなく「あれば優先して使う」にとどめる。
// web はサーバが静的ファイルとして配るだけなので、workspace のメンバーにはしない（依存を入れない）。
writeFileSync(join(out, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n  - "!packages/web"\n');
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
writeFileSync(
  join(out, "package.json"),
  JSON.stringify({ name: "sodashitsu", private: true, version, engines: rootPkg.engines, packageManager: rootPkg.packageManager }, null, 2) + "\n",
);

// 起動用のコマンド。シンボリックリンク（/usr/local/bin への ln -s 等）経由でも本体の場所を辿る。
const sh = (pkg) => `#!/bin/sh
# ${pkg === "server" ? "soda" : "sodactl"} の起動用。node（24 以上）が PATH に必要。
self=$0
while [ -h "$self" ]; do
  dir=$(cd "$(dirname "$self")" && pwd)
  self=$(readlink "$self")
  case $self in /*) ;; *) self=$dir/$self ;; esac
done
here=$(cd "$(dirname "$self")" && pwd)
if ! command -v node >/dev/null 2>&1; then
  echo "node が見つかりません（24 以上を入れてください）" >&2
  exit 127
fi
exec node --enable-source-maps "$here/../packages/${pkg}/dist/main.js" "$@"
`;
const bat = (pkg) => `@echo off\r
rem ${pkg === "server" ? "soda" : "sodactl"} launcher. Requires node (24 or later) on PATH.\r
where node >nul 2>nul\r
if errorlevel 1 (\r
  echo node was not found. Install Node.js 24 or later. 1>&2\r
  exit /b 127\r
)\r
node --enable-source-maps "%~dp0..\\packages\\${pkg}\\dist\\main.js" %*\r
exit /b %ERRORLEVEL%\r
`;
mkdirSync(join(out, "bin"));
for (const [cmd, pkg] of [["soda", "server"], ["sodactl", "cli"]]) {
  writeFileSync(join(out, "bin", cmd), sh(pkg));
  chmodSync(join(out, "bin", cmd), 0o755);
  writeFileSync(join(out, "bin", `${cmd}.cmd`), bat(pkg));
}

if (!args.has("--no-install")) {
  run(pnpm, ["install", "--prod", "--no-frozen-lockfile"], out);
}

if (!args.has("--no-archive")) {
  const rel = join(root, "release");
  const tar = spawnSync("tar", ["-czf", `${name}-${process.platform}-${process.arch}.tar.gz`, name], { cwd: rel, stdio: "inherit" });
  if (tar.status !== 0) console.error("tar.gz は作れませんでした（フォルダはできています）");
}
console.log(`\n出力: ${out}`);
