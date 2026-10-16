import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ManifestSource } from "../infra/ManifestSource.js";
import { FsManifestSource } from "../infra/FsManifestSource.js";
import { MemoryLogger } from "../log/Logger.js";
import { DefaultManifestStore } from "./ManifestStore.js";

const REAL_MANIFEST_DIR = join(import.meta.dirname, "..", "..", "..", "..", "third_party", "herdr", "agent-detection");

/** テスト用の偽の `ManifestSource`（in-memory）。 */
class FakeManifestSource implements ManifestSource {
  constructor(private readonly files: Record<string, string>) {}
  async list(): Promise<string[]> {
    return Object.keys(this.files).filter((n) => n.endsWith(".toml")).sort();
  }
  async read(name: string): Promise<string> {
    const content = this.files[name];
    if (content === undefined) throw new Error(`ENOENT: ${name}`);
    return content;
  }
}

describe("DefaultManifestStore — third_party/herdr/agent-detection の実物（T3 のテスト方針）", () => {
  it("22件全部が読み込めてコンパイルできる（index.toml を除く。U2 の確認と対になる）", async () => {
    const source = new FsManifestSource(REAL_MANIFEST_DIR);
    const logger = new MemoryLogger();
    const store = await DefaultManifestStore.load(source, logger);
    const summaries = store.summaries();
    expect(summaries.length).toBe(22);
    const failed = summaries.filter((s) => !s.ok);
    expect(failed).toEqual([]);
    for (const s of summaries) {
      expect(store.get(s.kind)).toBeDefined();
      expect(s.ruleCount).toBeGreaterThan(0);
    }
  });

  it("claude と codex の manifest が取れ、優先度の異なる複数ルールを持つ", async () => {
    const source = new FsManifestSource(REAL_MANIFEST_DIR);
    const store = await DefaultManifestStore.load(source, new MemoryLogger());
    const claude = store.get("claude");
    expect(claude?.rules.length).toBeGreaterThan(5);
    expect(new Set(claude?.rules.map((r) => r.priority)).size).toBeGreaterThan(1);
    expect(store.get("codex")?.rules.length).toBeGreaterThan(0);
  });
});

describe("DefaultManifestStore — 検証（herdr の validate_manifest を移植。D46）", () => {
  const INDEX = `schema_version = 1\n[[agents]]\nid = "x"\npath = "x.toml"\n`;

  async function loadOne(xToml: string): Promise<{ ok: boolean; error: string | null }> {
    const source = new FakeManifestSource({ "index.toml": INDEX, "x.toml": xToml });
    const store = await DefaultManifestStore.load(source, new MemoryLogger());
    const [summary] = store.summaries();
    return { ok: summary!.ok, error: summary!.error };
  }

  it("ルールが0件なら無効", async () => {
    const r = await loadOne(`id = "x"\n`);
    expect(r.ok).toBe(false);
  });

  it("空の id は無効", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = ""\nstate = "idle"\ncontains = ["a"]\n`);
    expect(r.ok).toBe(false);
  });

  it("skip_state_update は state=unknown を要求する", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\nskip_state_update = true\ncontains = ["a"]\n`);
    expect(r.ok).toBe(false);
  });

  it("skip_state_update は state 自体を省略しても無効（herdr は「明示的に unknown」を要求する。省略時の\
既定値埋め込みでは区別できない。review 指摘。should）", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nskip_state_update = true\ncontains = ["a"]\n`);
    expect(r.ok).toBe(false);
  });

  it("state を省略した通常のルール（skip_state_update 無し）は unknown として読み込める（herdr の\
unwrap_or(AgentState::Unknown)）", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\ncontains = ["a"]\n`);
    expect(r.ok).toBe(true);
  });

  it("skip_state_update と visible_* の同時指定は無効", async () => {
    const r = await loadOne(
      `id = "x"\n[[rules]]\nid = "r1"\nstate = "unknown"\nskip_state_update = true\nvisible_idle = true\ncontains = ["a"]\n`,
    );
    expect(r.ok).toBe(false);
  });

  it("未知の region 名は無効", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\nregion = "nonexistent_region"\ncontains = ["a"]\n`);
    expect(r.ok).toBe(false);
  });

  it("top_non_empty_lines は min_engine_version >= 3 を要求する", async () => {
    const withoutVersion = await loadOne(
      `id = "x"\nmin_engine_version = 2\n[[rules]]\nid = "r1"\nstate = "idle"\nregion = "top_non_empty_lines(3)"\ncontains = ["a"]\n`,
    );
    expect(withoutVersion.ok).toBe(false);
    const withVersion = await loadOne(
      `id = "x"\nmin_engine_version = 3\n[[rules]]\nid = "r1"\nstate = "idle"\nregion = "top_non_empty_lines(3)"\ncontains = ["a"]\n`,
    );
    expect(withVersion.ok).toBe(true);
  });

  it("top_non_empty_lines(0) は先頭ゼロ・0件を許さない（herdr の top_region_count）", async () => {
    const r = await loadOne(`id = "x"\nmin_engine_version = 3\n[[rules]]\nid = "r1"\nstate = "idle"\nregion = "top_non_empty_lines(0)"\ncontains = ["a"]\n`);
    expect(r.ok).toBe(false);
  });

  it("肯定の matcher が無い gate は無効", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\nnot = [{ contains = ["a"] }]\n`);
    expect(r.ok).toBe(false);
  });

  it("空の not gate は無効", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\ncontains = ["a"]\nnot = [{}]\n`);
    expect(r.ok).toBe(false);
  });

  it("壊れた正規表現は無効", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\nregex = ["[unterminated"]\n`);
    expect(r.ok).toBe(false);
  });

  it("gate の深さが上限（8）を超えたら無効", async () => {
    let nested = `{ contains = ["a"] }`;
    for (let i = 0; i < 9; i++) nested = `{ all = [${nested}] }`;
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\nall = [${nested}]\n`);
    expect(r.ok).toBe(false);
  });

  it("ルール数が上限（128）を超えたら無効（review 指摘。should。未検証だった検証上限）", async () => {
    const rules = (n: number): string =>
      Array.from({ length: n }, (_, i) => `[[rules]]\nid = "r${i}"\nstate = "idle"\ncontains = ["a${i}"]\n`).join("");
    const atLimit = await loadOne(`id = "x"\n${rules(128)}`);
    expect(atLimit.ok).toBe(true);
    const overLimit = await loadOne(`id = "x"\n${rules(129)}`);
    expect(overLimit.ok).toBe(false);
  });

  it("1つの gate の直接の matcher 数が上限（32）を超えたら無効（review 指摘。should。未検証だった検証上限）", async () => {
    const contains = (n: number): string => `[${Array.from({ length: n }, (_, i) => `"a${i}"`).join(", ")}]`;
    const atLimit = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\ncontains = ${contains(32)}\n`);
    expect(atLimit.ok).toBe(true);
    const overLimit = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\ncontains = ${contains(33)}\n`);
    expect(overLimit.ok).toBe(false);
  });

  it("index.toml が読めない/壊れていても起動は続ける（要約が0件になるだけ）", async () => {
    const source = new FakeManifestSource({});
    const store = await DefaultManifestStore.load(source, new MemoryLogger());
    expect(store.summaries()).toEqual([]);
    expect(store.get("claude")).toBeUndefined();
  });

  it("正しい manifest はロードできる（対照）", async () => {
    const r = await loadOne(`id = "x"\n[[rules]]\nid = "r1"\nstate = "idle"\ncontains = ["a"]\n`);
    expect(r.ok).toBe(true);
  });
});

// 20261016-bob-shell: 本製品独自のルールの置き場所を、herdr のものの後に読む。
describe("DefaultManifestStore — 複数の置き場所", () => {
  const rule = (state: string) => `id = "x"\n[[rules]]\nid = "r"\nstate = "${state}"\nregion = "whole_recent"\ncontains = ["a"]\n`;
  const index = (id: string) => `schema_version = 1\n[[agents]]\nid = "${id}"\npath = "${id}.toml"\n`;

  const rule2 = (id: string, state: string) => `[[rules]]\nid = "${id}"\nstate = "${state}"\nregion = "whole_recent"\ncontains = ["a"]\n`;

  it("後の置き場所の新しい kind を足し、同じ kind はルールを後ろに足す（先のルールは消さない）。要約は kind ごとに 1 件", async () => {
    const first = new FakeManifestSource({ "index.toml": index("x"), "x.toml": rule("working") });
    const second = new FakeManifestSource({
      "index.toml": `${index("x")}[[agents]]\nid = "y"\npath = "y.toml"\n`,
      "x.toml": `id = "x"\n${rule2("extra", "blocked")}`,
      "y.toml": rule("blocked").replace('id = "x"', 'id = "y"'),
    });
    const logger = new MemoryLogger();
    const store = await DefaultManifestStore.load([first, second], logger);
    expect(store.get("x")?.rules.map((r) => [r.id, r.state])).toEqual([["r", "working"], ["extra", "blocked"]]);
    expect(store.get("y")?.rules[0]?.state).toBe("blocked");
    expect(store.summaries().map((s) => [s.kind, s.ruleCount])).toEqual([["x", 2], ["y", 1]]);
  });

  it("足すルールの id が先のルールと重なる・先の kind が読めていないときは、足さずに警告する（先のルールはそのまま）", async () => {
    const first = new FakeManifestSource({
      "index.toml": `${index("x")}[[agents]]\nid = "z"\npath = "z.toml"\n`,
      "x.toml": rule("working"),
      "z.toml": "this is not toml = = =",
    });
    const second = new FakeManifestSource({
      "index.toml": `${index("x")}[[agents]]\nid = "z"\npath = "z.toml"\n`,
      "x.toml": `id = "x"\n${rule2("r", "blocked")}`,
      "z.toml": rule("blocked").replace('id = "x"', 'id = "z"'),
    });
    const logger = new MemoryLogger();
    const store = await DefaultManifestStore.load([first, second], logger);
    expect(store.get("x")?.rules.map((r) => [r.id, r.state])).toEqual([["r", "working"]]);
    expect(store.get("z")).toBeUndefined();
    const ignored = logger.lines.filter((l) => l.msg === "agent manifest extension ignored").map((l) => l.fields?.kind);
    expect(ignored).toEqual(["x", "z"]);
  });

  it("足すと 1 種類のルールの上限（128）を超えるなら足さない。足したときの min_engine_version は大きいほう", async () => {
    const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => rule2(`${prefix}${i}`, "working")).join("");
    const first = new FakeManifestSource({ "index.toml": `${index("x")}[[agents]]\nid = "w"\npath = "w.toml"\n`, "x.toml": `id = "x"\n${many("a", 100)}`, "w.toml": `id = "w"\nmin_engine_version = 1\n${rule2("a", "working")}` });
    const second = new FakeManifestSource({
      "index.toml": `${index("x")}[[agents]]\nid = "w"\npath = "w.toml"\n`,
      "x.toml": `id = "x"\n${many("b", 29)}`,
      "w.toml": `id = "w"\nmin_engine_version = 2\n${rule2("b", "blocked")}`,
    });
    const logger = new MemoryLogger();
    const store = await DefaultManifestStore.load([first, second], logger);
    expect(store.get("x")?.rules).toHaveLength(100);
    expect(logger.lines).toContainEqual(expect.objectContaining({ msg: "agent manifest extension ignored", fields: expect.objectContaining({ kind: "x" }) }));
    expect(store.get("w")?.rules).toHaveLength(2);
    expect(store.get("w")?.minEngineVersion).toBe(2);
  });

  it("実物: herdr の 22 件に、本製品独自の bob を足して 23 件。copilot は herdr のルールに 1 件足される", async () => {
    const own = new FsManifestSource(join(import.meta.dirname, "..", "..", "assets", "agent-detection"));
    const store = await DefaultManifestStore.load([new FsManifestSource(REAL_MANIFEST_DIR), own], new MemoryLogger());
    expect(store.summaries().filter((s) => s.ok)).toHaveLength(23);
    expect(store.get("bob")).toBeDefined();
    const herdrOnly = await DefaultManifestStore.load(new FsManifestSource(REAL_MANIFEST_DIR), new MemoryLogger());
    const ids = store.get("copilot")!.rules.map((r) => r.id);
    expect(ids).toEqual([...herdrOnly.get("copilot")!.rules.map((r) => r.id), "status_bar_working"]);
  });
});
