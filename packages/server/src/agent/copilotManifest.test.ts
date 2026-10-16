/**
 * GitHub Copilot CLI の判定（herdr の github-copilot.toml ＋ 本製品が足すルール `packages/server/assets/agent-detection/github-copilot-extra.toml`。
 * 20261016-bob-shell）のテスト。画面は、実機（Copilot CLI 1.0.98・120×40）を仮想端末で動かして取ったものの下の部分。
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsManifestSource } from "../infra/FsManifestSource.js";
import { MemoryLogger } from "../log/Logger.js";
import { DefaultManifestStore, type CompiledManifest } from "./ManifestStore.js";
import { evaluate } from "./ManifestEngine.js";

const HERDR_DIR = join(import.meta.dirname, "..", "..", "..", "..", "third_party", "herdr", "agent-detection");
const OWN_DIR = join(import.meta.dirname, "..", "..", "assets", "agent-detection");
const RULE = "─".repeat(120);
const CWD = " /home/user/ws     Session: 0 AIC used ";

async function loadCopilot(): Promise<CompiledManifest> {
  const store = await DefaultManifestStore.load([new FsManifestSource(HERDR_DIR), new FsManifestSource(OWN_DIR)], new MemoryLogger());
  return store.get("copilot")!;
}
function stateOf(m: CompiledManifest, lines: string[]): string {
  const r = evaluate({ lines, oscTitle: "", oscProgress: null }, m);
  return r === "skip" ? "skip" : r.state;
}
const screen = (bar: string): string[] => ["", "", CWD, RULE, "❯ ", RULE, bar];

describe("copilot（herdr のルール＋本製品が足すルール）", () => {
  it("送った直後の `◎ Working esc edit prompt` を作業中にする（herdr のルールだけでは待機になる）", async () => {
    const m = await loadCopilot();
    const lines = screen(" ◎ Working esc edit prompt                                                            Auto → gpt-6-luna");
    expect(stateOf(m, lines)).toBe("working");
    const herdrOnly = (await DefaultManifestStore.load(new FsManifestSource(HERDR_DIR), new MemoryLogger())).get("copilot")!;
    expect(stateOf(herdrOnly, lines)).toBe("idle");
  });

  it("生成中の `○ Working · 104 B esc interrupt` は作業中（herdr のルール）", async () => {
    expect(stateOf(await loadCopilot(), screen(" ○ Working · 104 B esc interrupt                             Auto → gpt-6-luna"))).toBe("working");
  });

  it("コマンドの承認は承認待ち（herdr のルールが、足したルールより先に立つ）", async () => {
    const lines = [
      "│ Do you want to run this command?                                                                                     │",
      "│                                                                                                                      │",
      "│ ❯ 1. Yes                                                                                                             │",
      "│   2. Yes, and don't ask again for `sleep` in this directory (/tmp/.../ws)                                            │",
      "│   3. No, and tell Copilot what to do differently (Esc to stop)                                                       │",
      "│                                                                                                                      │",
      "│ ↑/↓ to navigate · enter to select · esc to cancel                                                                    │",
      "╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯",
    ];
    expect(stateOf(await loadCopilot(), lines)).toBe("blocked");
  });

  it("待機の帯（`← open sidebar · …`）と、上の方に残った `Working` の行は作業中にしない（負の確認）", async () => {
    const m = await loadCopilot();
    const bar = " ← open sidebar · Interactive · Manual Approval · / commands · ? help · tab next tab                  Auto → gpt-6-luna";
    expect(stateOf(m, screen(bar))).toBe("idle");
    expect(stateOf(m, [" ◎ Working esc edit prompt", ...screen(bar)])).toBe("idle");
  });
});
