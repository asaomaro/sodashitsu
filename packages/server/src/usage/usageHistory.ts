import { createHash } from "node:crypto";
import { opendir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  UsageHistoryParams,
  RpcError,
  type UsageHistory,
  type HistoryTokens,
  type HistoryGroup,
} from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";
import { claudeRoots, SESSION_ID_RE } from "./claudeSource.js";
import { safeModel } from "./claudeScan.js";
const zero = (): HistoryTokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
const valid = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1e12;
interface Event {
  at: number;
  kind: string;
  model: string;
  session: string;
  tokens: HistoryTokens;
}
export interface HistoryOptions {
  claudeRoots?: () => string[];
  codexHome?: () => string;
  now?: () => number;
}
/** On-demand bounded numeric scan. No conversation text or paths are returned or retained. */
export class UsageHistoryReader {
  private active = 0;
  private cache = new Map<string, { at: number; result: UsageHistory }>();
  constructor(private readonly options: HistoryOptions = {}) {}
  read(raw: UsageHistoryParams, check: () => void = () => undefined): Promise<UsageHistory> {
    check();
    const range = UsageHistoryParams.parse(raw),
      key = `${range.from}:${range.to}`,
      now = (this.options.now ?? Date.now)();
    const old = this.cache.get(key);
    if (old && now >= old.at && now - old.at < 30000) return Promise.resolve(old.result);
    if (this.active >= 2)
      return Promise.reject(
        new RpcError("agent_pane_busy", "履歴を集計中です。完了後に再試行してください"),
      );
    this.active++;
    const result = this.load(range, now, check)
      .then((value) => {
        this.cache.set(key, { at: now, result: value });
        if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
        return value;
      })
      .finally(() => {
        this.active--;
      });
    return result;
  }
  private async load(
    range: UsageHistoryParams,
    now: number,
    check: () => void,
  ): Promise<UsageHistory> {
    const from = Date.parse(range.from + "T00:00:00Z"),
      until = Date.parse(range.to + "T00:00:00Z") + 86400000;
    const events = new Map<string, Event>();
    let budget = 64 * 1024 * 1024,
      entries = 0,
      files = 0,
      excluded = 0,
      partial = false;
    const deadline = performance.now() + 4000;
    const running = () => {
      check();
      const ok =
        entries < 20000 &&
        files < 512 &&
        budget > 0 &&
        performance.now() < deadline &&
        events.size < 100000;
      if (!ok) partial = true;
      return ok;
    };
    const add = (key: string, event: Event) => {
      if (!Number.isFinite(event.at)) {
        excluded++;
        return;
      }
      if (event.at < from || event.at >= until) return;
      const old = events.get(key);
      // Claude can repeat the same response in separate content blocks; keep the final/largest usage once.
      if (!old || event.tokens.total > old.tokens.total) events.set(key, event);
    };
    const read = async (file: string, kind: "claude" | "codex", session: string) => {
      if (!running()) return;
      files++;
      const opened = await openVerified(file).catch(() => null);
      if (!opened) {
        partial = true;
        return;
      }
      try {
        const count = Math.min(opened.st.size, 2 * 1024 * 1024, budget),
          start = opened.st.size - count;
        budget -= count;
        if (start > 0) partial = true;
        const text = (await readRange(opened.fd, start, count)).toString("utf8");
        const lines = text.split("\n");
        lines.pop();
        if (start > 0) lines.shift();
        let model = "不明",
          previous: Record<string, number> | null = start ? null : {};
        for (const line of lines) {
          if (!running()) break;
          if (
            !line.includes('"usage"') &&
            !line.includes('"token_count"') &&
            !line.includes('"turn_context"')
          )
            continue;
          let row: any;
          try {
            row = JSON.parse(line);
          } catch {
            partial = true;
            continue;
          }
          if (!row || typeof row !== "object") continue;
          if (kind === "claude") {
            const message = row.message,
              u = message?.usage;
            if (row.type !== "assistant" || !u || row.isSidechain) continue;
            if (typeof message.id !== "string" || message.id.length > 256) {
              excluded++;
              continue;
            }
            const keys = [
              "input_tokens",
              "output_tokens",
              "cache_read_input_tokens",
              "cache_creation_input_tokens",
            ];
            if (
              !valid(u.input_tokens) ||
              !valid(u.output_tokens) ||
              keys.some((k) => u[k] !== undefined && !valid(u[k]))
            ) {
              excluded++;
              continue;
            }
            const tokens = {
              input: u.input_tokens,
              output: u.output_tokens,
              cacheRead: u.cache_read_input_tokens ?? 0,
              cacheWrite: u.cache_creation_input_tokens ?? 0,
              total: 0,
            };
            tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
            add(`${kind}:${session}:${message.id}`, {
              at: typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN,
              kind,
              model: safeModel(message.model) ?? "不明",
              session,
              tokens,
            });
          } else {
            if (row.type === "turn_context") {
              model = safeModel(row.payload?.model) ?? "不明";
              continue;
            }
            if (row.type !== "event_msg" || row.payload?.type !== "token_count") continue;
            const u = row.payload.info?.total_token_usage;
            if (!u || !valid(u.input_tokens) || !valid(u.output_tokens)) continue;
            const current: Record<string, number> = {
              input: u.input_tokens,
              output: u.output_tokens,
              cached: valid(u.cached_input_tokens) ? u.cached_input_tokens : 0,
            };
            const before = previous;
            previous = current;
            if (!before) {
              excluded++;
              continue;
            } // A tail's first cumulative count has no known baseline.
            const input = current.input! - (before.input ?? 0),
              output = current.output! - (before.output ?? 0),
              cached = current.cached! - (before.cached ?? 0);
            if (input < 0 || output < 0 || cached < 0 || cached > input) {
              partial = true;
              excluded++;
              continue;
            }
            if (input + output === 0) continue;
            const tokens = {
              input: input - cached,
              output,
              cacheRead: cached,
              cacheWrite: 0,
              total: input + output,
            };
            add(
              `${kind}:${session}:${row.timestamp}:${current.input}:${current.output}:${current.cached}`,
              {
                at: typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN,
                kind,
                model,
                session,
                tokens,
              },
            );
          }
        }
      } finally {
        await opened.fd.close();
      }
    };
    const walk = async (
      root: string,
      kind: "claude" | "codex",
      depth: number,
      namespace: string,
    ): Promise<void> => {
      if (!running()) return;
      try {
        const directory = await opendir(root);
        for await (const child of directory) {
          entries++;
          if (!running()) break;
          if (child.isSymbolicLink()) {
            partial = true;
            continue;
          }
          const file = join(root, child.name);
          if (child.isDirectory() && depth > 0) {
            if ((await realpath(file).catch(() => null)) !== file) {
              partial = true;
              continue;
            }
            await walk(file, kind, depth - 1, namespace);
          } else if (child.isFile() && child.name.endsWith(".jsonl")) {
            if (kind === "claude" && depth !== 0) continue;
            const name = child.name.slice(0, -6);
            if (kind === "claude" ? !SESSION_ID_RE.test(name) : !/^rollout-[\w.-]+$/.test(name))
              continue;
            const id =
              kind === "claude"
                ? name
                : name.match(/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i)?.[1];
            if (!id) continue;
            await read(file, kind, `${namespace}:${id}`);
          }
        }
      } catch (error) {
        check();
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") partial = true;
      }
    };
    const roots = [...new Set((this.options.claudeRoots ?? claudeRoots)())];
    for (const configured of roots) {
      const root = await realpath(configured).catch(() => null);
      if (root)
        await walk(root, "claude", 1, createHash("sha256").update(root).digest("hex").slice(0, 16));
    }
    const codexHome = (
      this.options.codexHome ?? (() => process.env.CODEX_HOME || join(homedir(), ".codex"))
    )();
    for (const directory of ["sessions", "archived_sessions"]) {
      const codexRoot = await realpath(join(codexHome, directory)).catch(() => null);
      if (codexRoot) await walk(codexRoot, "codex", 3, "codex");
    }
    const totals = zero(),
      sessions = new Set<string>();
    const maps = {
      byDay: new Map<string, HistoryGroup>(),
      byKind: new Map<string, HistoryGroup>(),
      byModel: new Map<string, HistoryGroup>(),
      byHour: new Map<string, HistoryGroup>(),
      bySession: new Map<string, HistoryGroup>(),
    };
    for (const event of events.values()) {
      if (!Number.isSafeInteger(totals.total + event.tokens.total)) {
        partial = true;
        excluded++;
        continue;
      }
      const session = `${event.kind}:${event.session}`;
      sessions.add(session);
      const labels = {
        byDay: new Date(event.at).toISOString().slice(0, 10),
        byKind: event.kind,
        byModel: `${event.kind} · ${event.model}`,
        byHour: String(new Date(event.at).getUTCHours()).padStart(2, "0"),
        bySession: `${event.kind} · ${createHash("sha256").update(session).digest("hex").slice(0, 8)}`,
      };
      if (!maps.byModel.has(labels.byModel) && maps.byModel.size >= 256) {
        labels.byModel = `${event.kind} · その他（分類上限）`;
        partial = true;
      }
      for (const field of Object.keys(maps) as (keyof typeof maps)[]) {
        const map = maps[field],
          label = labels[field],
          group = map.get(label) ?? { label, ...zero(), calls: 0 };
        for (const key of Object.keys(totals) as (keyof HistoryTokens)[])
          group[key] += event.tokens[key];
        group.calls++;
        map.set(label, group);
      }
      for (const key of Object.keys(totals) as (keyof HistoryTokens)[])
        totals[key] += event.tokens[key];
    }
    const sorted = (field: keyof typeof maps, top = false) =>
      [...maps[field].values()].sort((a, b) =>
        top ? b.total - a.total || a.label.localeCompare(b.label) : a.label.localeCompare(b.label),
      );
    check();
    return {
      ...range,
      timezone: "UTC",
      asOf: now,
      partial,
      files,
      excluded,
      calls: events.size,
      sessions: sessions.size,
      totals,
      byDay: sorted("byDay"),
      byKind: sorted("byKind", true),
      byModel: sorted("byModel", true),
      byHour: sorted("byHour"),
      bySession: sorted("bySession", true).slice(0, 20),
      sources: [
        "Claude Code: assistant.message.usage（主会話のみ・応答IDで重複排除）",
        "Codex: event_msg.token_count累計差分（入力内のキャッシュを分離）",
      ],
    };
  }
}
