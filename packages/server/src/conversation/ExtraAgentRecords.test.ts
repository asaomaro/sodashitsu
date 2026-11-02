import { afterEach, it, expect, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  readFile,
  appendFile,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConversationService } from "./ConversationService.js";
import { extraRecord, discoverExtra, locateExtra } from "./ExtraAgentRecords.js";
import { UsageInsightsReader } from "../usage/UsageInsights.js";
import { UsageHistoryReader } from "../usage/usageHistory.js";
import { MuseUsageAdapter } from "../usage/museAdapter.js";
const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
const at = "2026-10-15T00:00:00Z",
  id = "01a2a000-0000-7000-8000-000000000001";
const lines = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "soda-extra-records-"));
  dirs.push(home);
  const roots = { home, dataHome: join(home, "data"), copilotHome: join(home, "copilot") };
  const date = new Date(parseInt(id.replaceAll("-", "").slice(0, 12), 16))
    .toISOString()
    .slice(0, 10)
    .split("-");
  const file = join(roots.dataHome, "muse", "sessions", ...date, id, "session.jsonl");
  await mkdir(join(file, ".."), { recursive: true });
  const service = new ConversationService(() => undefined, {
    extraRoots: roots,
    claudeRoots: [],
    codexHome: join(home, "codex"),
  });
  return { home, roots, file, service };
}
const muse = (payload_type: string, payload: unknown, stream = id) => ({
  schema_version: 1,
  payload_schema_version: 1,
  stream: { kind: "session", id: stream },
  recorded_at: Date.parse(at) * 1000,
  payload_type,
  payload,
});
const user = (text: string, stream = id) =>
  muse(
    "runtime.user_intent.accepted",
    {
      surface: "main",
      semantic_kind: { kind: "chat" },
      source_session_id: stream,
      model_messages: [{ content: [{ kind: "text", text }] }],
    },
    stream,
  );
const usage = () =>
  muse("runtime.session", {
    kind: "run",
    event: {
      kind: "goal_usage_attribution",
      record: {
        schema_version: 1,
        usage_family: "provider",
        usage_id: "usage-one",
        quantity: {
          reported: true,
          unit: "tokens",
          input_tokens: 100,
          output_tokens: 20,
          cached_tokens: 30,
        },
      },
    },
  });
it("uses the same exact session for general conversation, past titles and assistant text; omits other streams and unknown schemas", async () => {
  const f = await fixture();
  await writeFile(
    f.file,
    lines(
      user("他の会話", "11111111-1111-4111-8111-111111111111"),
      user("この作業"),
      muse("runtime.session", {
        kind: "run",
        event: { kind: "assistant_message_committed", text: "作業しています" },
      }),
      { ...user("未確認schema"), schema_version: 2 },
    ),
  );
  expect((await f.service.read("muse", id)).messages.map((m) => m.text)).toEqual([
    "この作業",
    "作業しています",
  ]);
  expect((await f.service.sessions({ kind: "muse" })).sessions[0]?.title).toBe("この作業");
  expect(extraRecord(user("質問"), "muse")?.at).toBe(at.replace("Z", ".000Z"));
});
it.each(["copilot", "agy"] as const)(
  "reads %s fixed logs and includes them in past sessions",
  async (kind) => {
    const f = await fixture(),
      file =
        kind === "copilot"
          ? join(f.roots.copilotHome, "session-state", id, "events.jsonl")
          : join(
              f.home,
              ".gemini",
              "antigravity-cli",
              "brain",
              id,
              ".system_generated",
              "logs",
              "transcript.jsonl",
            );
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(
      file,
      lines(
        kind === "copilot"
          ? { type: "user.message", timestamp: at, data: { content: "依頼" } }
          : { type: "USER_INPUT", created_at: at, content: "依頼" },
      ),
    );
    expect((await f.service.read(kind, id)).messages[0]?.text).toBe("依頼");
    expect((await f.service.sessions({ kind })).sessions[0]?.kind).toBe(kind);
  },
);
it.skipIf(process.platform === "win32")(
  "rejects linked parent directories for all three readers",
  async () => {
    const f = await fixture(),
      outside = join(f.home, "outside");
    await mkdir(outside);
    await writeFile(
      join(outside, "events.jsonl"),
      lines({ type: "user.message", data: { content: "private" } }),
    );
    await mkdir(join(f.roots.copilotHome, "session-state"), { recursive: true });
    await symlink(outside, join(f.roots.copilotHome, "session-state", id));
    expect(await locateExtra("copilot", id, f.roots)).toBeNull();
    expect((await discoverExtra("copilot", f.roots)).files).toEqual([]);
    await expect(f.service.read("copilot", id)).rejects.toThrow();
  },
);
it("shares exact reported Muse usage across live, period history and persistent insights, deduplicates and keeps text out of the numeric DB", async () => {
  const f = await fixture();
  await writeFile(f.file, lines(user("PRIVATE_TEXT"), usage(), usage()));
  const range = { from: "2026-10-15", to: "2026-10-15" },
    live = await new MuseUsageAdapter(f.roots).usageFor({
      paneId: "p",
      sessionId: id,
      transcriptPath: undefined,
    });
  expect(live?.tokens).toMatchObject({ total: 120, input: 70, output: 20, cacheRead: 30 });
  const history = await new UsageHistoryReader({
    extraRoots: f.roots,
    claudeRoots: () => [],
    codexHome: () => join(f.home, "codex"),
  }).read(range);
  expect(history.totals.total).toBe(120);
  const options = {
    stateDir: join(f.home, "state"),
    extraRoots: f.roots,
    claudeRoots: () => [],
    codexHome: () => join(f.home, "codex"),
    now: () => Date.parse("2026-11-02T00:00:00Z"),
  };
  const reader = new UsageInsightsReader(options),
    result = await reader.read({ ...range, timezone: "UTC", kind: "muse" });
  expect(result.totals.total).toBe(120);
  expect(
    (await new UsageInsightsReader(options).read({ ...range, timezone: "UTC" })).totals.total,
  ).toBe(120);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_TEXT");
  expect(result.coverage.map((c) => c.kind)).toEqual(["claude", "codex", "muse", "agy", "copilot"]);
});

it("keeps usage-unavailable Antigravity sessions visible without calling them model invocations", async () => {
  const f = await fixture(),
    file = join(
      f.home,
      ".gemini",
      "antigravity-cli",
      "brain",
      id,
      ".system_generated",
      "logs",
      "transcript.jsonl",
    );
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, lines({ type: "USER_INPUT", created_at: at, content: "PRIVATE_TEXT" }));
  const result = await new UsageInsightsReader({
    stateDir: join(f.home, "state"),
    extraRoots: f.roots,
    claudeRoots: () => [],
    codexHome: () => join(f.home, "codex"),
    now: () => Date.parse("2026-11-02T00:00:00Z"),
  }).read({ from: "2026-10-15", to: "2026-10-15", timezone: "UTC" });
  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0]).toMatchObject({ kind: "agy", calls: 0, total: 0 });
  expect(result.byKind[0]?.key).toBe("agy");
  expect(result.totals.calls).toBe(0);
});
it("advances beyond oversized Muse trace records and recovers later reported usage", async () => {
  const f = await fixture();
  await writeFile(
    f.file,
    lines(user("before")) + "x".repeat(5 * 1024 * 1024) + "\n" + lines(usage()),
  );
  const adapter = new MuseUsageAdapter(f.roots),
    source = { paneId: "p", sessionId: id, transcriptPath: undefined };
  let result = null;
  for (let i = 0; i < 5; i++) result = await adapter.usageFor(source);
  expect(result?.tokens.total).toBe(120);
  expect(result?.scanning).toBe(false);
});

it("normalizes actual Antigravity completed-step counters and tool records without converting context or tool output into usage", async () => {
  const f = await fixture(),
    file = join(
      f.home,
      ".gemini",
      "antigravity-cli",
      "brain",
      id,
      ".system_generated",
      "logs",
      "transcript.jsonl",
    );
  await mkdir(join(file, ".."), { recursive: true });
  const row = {
    type: "PLANNER_RESPONSE",
    status: "DONE",
    step_index: 1,
    created_at: at,
    input_tokens: 6749,
    output_tokens: 41,
    cache_read_tokens: 0,
    tool_calls: [{ name: "read_file", args: { Path: '"/private/skills/review/SKILL.md"' } }],
  };
  await writeFile(
    file,
    lines(row, row, { type: "GENERIC", created_at: at, content: "PRIVATE_TOOL_OUTPUT" }),
  );
  const result = await new UsageInsightsReader({
    stateDir: join(f.home, "state"),
    extraRoots: f.roots,
    claudeRoots: () => [],
    codexHome: () => join(f.home, "codex"),
    now: () => Date.parse("2026-11-02T00:00:00Z"),
  }).read({ from: "2026-10-15", to: "2026-10-15", timezone: "UTC" });
  expect(result.totals.total).toBe(6790);
  expect(result.totals.tools).toBe(1);
  expect(result.tools[0]).toMatchObject({ category: "skill", basis: "inferred", name: "review" });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_TOOL_OUTPUT|private\/skills/);
});

it.skipIf(process.platform === "win32")(
  "preserves partial projection failures across unchanged reads and retries changed records",
  async () => {
    const f = await fixture(),
      bin = join(f.home, "bin"),
      log = join(f.home, "attempts");
    await mkdir(bin);
    const script = join(bin, "muse");
    await writeFile(
      script,
      `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(log)},'attempt\\n');process.exit(1);`,
    );
    await chmod(script, 0o755);
    vi.stubEnv("PATH", bin + ":" + process.env.PATH);
    await writeFile(
      f.file,
      lines(usage(), muse("runtime.session", { kind: "run", event: { kind: "tool_started" } })),
    );
    const options = {
        stateDir: join(f.home, "state"),
        extraRoots: f.roots,
        claudeRoots: () => [],
        codexHome: () => join(f.home, "codex"),
        now: () => Date.parse("2026-11-02T00:00:00Z"),
      },
      range = { from: "2026-10-15", to: "2026-10-15", timezone: "UTC" };
    expect((await new UsageInsightsReader(options).read(range)).partial).toBe(true);
    expect((await new UsageInsightsReader(options).read(range)).partial).toBe(true);
    expect((await readFile(log, "utf8")).split("attempt").length - 1).toBe(1);
    await appendFile(
      f.file,
      lines(muse("runtime.session", { kind: "run", event: { kind: "tool_started" } })),
    );
    await new UsageInsightsReader(options).read(range);
    expect((await readFile(log, "utf8")).split("attempt").length - 1).toBe(2);
  },
);
