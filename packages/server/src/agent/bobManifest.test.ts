/**
 * Bob Shell の判定ルール（本製品独自。`packages/server/assets/agent-detection/bob.toml`。20261016-bob-shell）のテスト。
 * 画面は、実機（bobshell 2.0.6・120×40）を仮想端末で動かして取ったもの（日本語・英語）を、判定に関わる下の部分だけ写した。
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsManifestSource } from "../infra/FsManifestSource.js";
import { MemoryLogger } from "../log/Logger.js";
import { DefaultManifestStore, type CompiledManifest } from "./ManifestStore.js";
import { evaluate } from "./ManifestEngine.js";

const HERDR_DIR = join(import.meta.dirname, "..", "..", "..", "..", "third_party", "herdr", "agent-detection");
const OWN_DIR = join(import.meta.dirname, "..", "..", "assets", "agent-detection");

const RULE = ` ${"─".repeat(118)}`;
const DIALOG_RULE = `  ${"─".repeat(116)}`;

async function loadBob(): Promise<CompiledManifest> {
  const store = await DefaultManifestStore.load([new FsManifestSource(HERDR_DIR), new FsManifestSource(OWN_DIR)], new MemoryLogger());
  const bob = store.get("bob");
  if (!bob) throw new Error(`bob manifest not loaded: ${JSON.stringify(store.summaries())}`);
  return bob;
}

function stateOf(manifest: CompiledManifest, lines: string[]): string {
  const r = evaluate({ lines, oscTitle: "", oscProgress: null }, manifest);
  return r === "skip" ? "skip" : r.state;
}

const promptBox = (placeholder: string, footer = "  Agent Mode"): string[] => [RULE, `  ❯   ${placeholder}`, RULE, footer];
const EN_PLACEHOLDER = "Build Anything, @ for context, / for commands, $ for skills";
const JA_PLACEHOLDER = "何でも作成、@ でコンテキスト、/ でコマンド、$ で Skill";

const approval = (lang: "en" | "ja"): string[] => [
  "",
  " ❯ Run the shell command 'sleep 5; ls -la' and then tell me how many entries there are.",
  "",
  "",
  DIALOG_RULE,
  lang === "en" ? "  Execute Command" : "  コマンドを実行",
  DIALOG_RULE,
  lang === "en" ? "  Command:          sleep 5; ls -la" : "  コマンド:         ls -la",
  "  Approve commands:",
  "  ┌─────┐┌──┐",
  "  │sleep││ls│",
  "  └─────┘└──┘",
  lang === "en" ? "  → Approve Once" : "  → 一度だけ承認",
  lang === "en" ? "    Always Allow Command for task" : "    タスク用にコマンドを常に許可",
  lang === "en" ? "    Reject" : "    拒否",
  "",
  "    ↑↓ (1/3)",
  "",
  lang === "en" ? "  Wait for input after execution: No (Tab to toggle)" : "  実行後に入力を待機: いいえ (Tabキーで切り替え)",
  "",
  lang === "en" ? "  Press Enter to confirm" : "  Enterキーを押して確認",
  "",
  DIALOG_RULE,
  "",
  "",
];

describe("bob.toml（Bob Shell の画面の判定）", () => {
  it("読み込める（herdr のものと一緒に読み、herdr の kind はそのまま）", async () => {
    const store = await DefaultManifestStore.load([new FsManifestSource(HERDR_DIR), new FsManifestSource(OWN_DIR)], new MemoryLogger());
    expect(store.summaries().find((s) => s.kind === "bob")).toMatchObject({ ok: true, ruleCount: 2 });
    expect(store.get("claude")).toBeDefined();
  });

  it("作業中: 入力の枠のすぐ上が点字のスピナー（英語・日本語）", async () => {
    const bob = await loadBob();
    const en = [" ❯ Run the shell command 'ls -la'.", "", "", " ⠇ Processing… (Enter to steer, Tab to queue)", "", ...promptBox(EN_PLACEHOLDER)];
    const ja = [" ❯ Please just say hello.", "", "", " ⠧ 処理中… (Enterで操作、Tabでキューに追加)", "", ...promptBox(JA_PLACEHOLDER, "  Agent Mode · 19.5k / 270.0k (7%) · 0.039 🅞")];
    expect(stateOf(bob, en)).toBe("working");
    expect(stateOf(bob, ja)).toBe("working");
  });

  it("作業中: 承認したコマンドを動かしている間（出力の後ろにスピナー。枠の下に空行が続く）", async () => {
    const bob = await loadBob();
    const screen = [
      "  Execute Command (executing...)",
      "  Command: sleep 5; ls -la",
      "",
      "",
      " ⠼ Processing… (Enter to steer, Tab to queue)",
      "",
      ...promptBox(EN_PLACEHOLDER, "  Agent Mode · 19.6k / 270.0k (7%) · 0.039 🅞"),
      ...Array<string>(12).fill(""),
    ];
    expect(stateOf(bob, screen)).toBe("working");
  });

  it("承認待ち: コマンドの承認の画面（英語・日本語）", async () => {
    const bob = await loadBob();
    expect(stateOf(bob, approval("en"))).toBe("blocked");
    expect(stateOf(bob, approval("ja"))).toBe("blocked");
  });

  it("承認待ち: 前の返答の Markdown の横線と利用者の発言（`❯`）が、空行を挟んで判定の範囲に入っていても、入力の枠とみなさない", async () => {
    const bob = await loadBob();
    const screen = [
      RULE,
      "",
      "",
      " ❯ Read the file foo.txt",
      DIALOG_RULE,
      "  Read File",
      DIALOG_RULE,
      "  Path: foo.txt",
      "  → Approve Once",
      "    Always Allow",
      "    Reject",
      "    ↑↓ (1/3)",
      "  Press Enter to confirm",
      DIALOG_RULE,
    ];
    expect(stateOf(bob, screen)).toBe("blocked");
  });

  it("承認待ち: フォルダーの信頼の確認", async () => {
    const bob = await loadBob();
    const screen = [
      "",
      DIALOG_RULE,
      "   このフォルダーを信頼しますか?",
      "   フォルダーを信頼すると、Bob Shell が提案するコマンドを実行できるようになります。",
      DIALOG_RULE,
      "   → 1. フォルダーを信頼する (ws)",
      "     2. 親フォルダーを信頼する (bob)",
      "     3. 信頼しない",
      "",
      "     ↑↓ (1/3)",
      "",
      "   ESC キーまたは CTRL+C キーで終了",
      "",
      DIALOG_RULE,
    ];
    expect(stateOf(bob, screen)).toBe("blocked");
  });

  it("待機: 返答の後・起動した直後（英語・日本語）", async () => {
    const bob = await loadBob();
    const answered = [
      "  1. . — the current directory",
      "  2. .. — the parent directory",
      "  The workspace is essentially empty (no files or subdirectories beyond the standard directory entries).",
      "",
      "",
      ...promptBox(EN_PLACEHOLDER, "  Agent Mode · 19.7k / 270.0k (7%) · 0.079 🅞"),
      "",
      "",
    ];
    const started = ["  (ℹ) s-asao@example.com としてログイン中", "", "", ...promptBox(JA_PLACEHOLDER)];
    expect(stateOf(bob, answered)).toBe("idle");
    expect(stateOf(bob, started)).toBe("idle");
  });

  it("待機: 入力の枠が残る一覧に `↑↓ (n/m)` が出ても、承認待ちにしない（負の確認）", async () => {
    const bob = await loadBob();
    const screen = ["  ┌──────┐", "  │/model│", "  └──────┘", "    ↑↓ (2/9)", RULE, "  ❯ /", RULE, "  Agent Mode"];
    expect(stateOf(bob, screen)).toBe("idle");
  });

  it("待機: 返答の本文の途中の点字や、枠から離れた古いスピナーでは作業中にしない（負の確認）", async () => {
    const bob = await loadBob();
    const screen = [" ⠇ Processing… (Enter to steer, Tab to queue)", "• こんにちは！", "", ...promptBox(JA_PLACEHOLDER)];
    expect(stateOf(bob, screen)).toBe("idle");
  });
});
