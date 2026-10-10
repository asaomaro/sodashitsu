import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * 偽のエージェント（PATH の先頭に置いた偽の `claude`・`codex`）を使う試験の守り（20261010-e2e-fake-agent）。
 * pane のシェルは、利用者の rc を読む（製品の既定）。この機械の `~/.bashrc` は PATH の先頭へ `~/.local/bin`（実物の `claude`）を足し直すので、
 * 偽の `claude` を PATH に置いただけでは、pane に `claude` と打ち込んで**実物の Claude Code が起動する**ことがある（費用・利用者の枠・記録）。
 * 打ち込みの前に、pane の中で `command -v <name>` が、偽のものを指すことを確かめ、違えば**打ち込まずに落とす**。
 *
 * `write` は、その pane のシェルへ入力を送る関数。`fakeDir` は、偽の実行ファイルを置いたフォルダ。`scratchDir` は、答えを受け取る一時のフォルダ。
 */
export async function assertPaneResolvesFake(opts: {
  write: (input: string) => void;
  name: string;
  fakeDir: string;
  scratchDir: string;
  timeoutMs?: number;
}): Promise<void> {
  const out = join(opts.scratchDir, `which-${opts.name}-${randomBytes(4).toString("hex")}`);
  // 書き終えてから見せる（途中の読みを避ける）。`command -v` は、実行しない。
  opts.write(`command -v ${opts.name} > ${out}.tmp && mv ${out}.tmp ${out}\r`);
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  while (!existsSync(out)) {
    if (Date.now() > deadline) throw new Error(`fake-agent guard: the pane's shell did not answer \`command -v ${opts.name}\` (refusing to launch anything)`);
    await new Promise((r) => setTimeout(r, 25));
  }
  const resolved = (await readFile(out, "utf8")).trim();
  await rm(out, { force: true });
  let ok = false;
  try {
    ok = resolved !== "" && (await realpath(dirname(resolved))) === (await realpath(opts.fakeDir));
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      `fake-agent guard: \`${opts.name}\` resolves to ${resolved === "" ? "(nothing)" : resolved} in the pane's shell, not the fake in ${opts.fakeDir}. ` +
        "The shell probably re-orders PATH from the user's rc (HOME / ~/.bashrc); refusing to launch the real agent.",
    );
  }
}
