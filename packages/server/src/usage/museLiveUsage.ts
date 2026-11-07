import { observedSetting } from "./executionSettings.js";
import { join } from "node:path";
import { windowsAgentExecutable } from "../agent/windowsAgentLaunch.js";
import { spawn } from "node:child_process";
import type { AccountUsage, AgentUsage } from "@sodashitsu/protocol";
import { accountKeyOf } from "./reportedUsage.js";

const number = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e12;
const timestamp = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 8.64e15;
const label = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_. /:-]{1,128}$/.test(v);
/** Only project public metadata from the read-only view; never retain items or text. */
export function museViewUsage(
  page: any,
  fallback: Omit<AgentUsage, "paneId" | "kind"> | null,
  now: number,
): Omit<AgentUsage, "paneId" | "kind"> | null {
  if (!Array.isArray(page?.events)) return fallback;
  const out = {
    ...(fallback ?? {
      model: null,
      tokens: { basis: "context" as const },
      source: "muse-events" as const,
      updatedAt: now,
    }),
    ...(fallback?.executionSettings ? { executionSettings: { ...fallback.executionSettings } } : {}),
  };
  let found = false;
  for (const event of page.events) {
    const p = event?.params;
    if (!p || typeof p !== "object") continue;
    switch (event.method) {
      case "session/contextUsage":
        if (!number(p.usedTokens)) break;
        found = true;
        out.contextTokens = p.usedTokens;
        delete out.contextWindowTokens;
        delete out.contextUsedPct;
        delete out.contextRemainingTokens;
        if (number(p.windowTokens) && p.windowTokens > 0) {
          out.contextWindowTokens = p.windowTokens;
          out.contextUsedPct = (p.usedTokens / p.windowTokens) * 100;
          out.contextRemainingTokens = Math.max(0, p.windowTokens - p.usedTokens);
        }
        if (["normal", "warning", "blocked"].includes(p.pressure)) out.contextPressure = p.pressure;
        break;
      case "session/modelChanged":
        if (label(p.modelId)) {
          out.model = p.modelId;
          found = true;
        }
        break;
      case "session/reasoningEffortChanged": {
        const effort = observedSetting(p.reasoningEffort, "muse-events", "session");
        if (effort) { out.reasoningEffort = effort.value; out.executionSettings = { ...out.executionSettings, reasoningEffort: effort }; }
        else { delete out.reasoningEffort; if (out.executionSettings) delete out.executionSettings.reasoningEffort; }
        found = true;
        break;
      }
      case "session/approvalModeChanged": {
        // MSP effective mode, not a requested startup profile or a turn-scoped permission override.
        const mode = ["allowAll", "promptUnmatched", "onRequest", "denyUnmatched"].includes(p.mode) ? observedSetting(p.mode, "muse-events", "session") : undefined;
        if (mode) out.executionSettings = { ...out.executionSettings, approvalMode: mode };
        else if (out.executionSettings) delete out.executionSettings.approvalMode;
        found = true;
        break;
      }
      case "session/tokenUsage": {
        const c = p.cumulative;
        if (!c || !number(c.promptTokens) || !number(c.outputTokens) || !number(c.totalTokens))
          break;
        found = true;
        out.tokens = { basis: "cumulative", output: c.outputTokens, total: c.totalTokens };
        // MSP owns counted-once normalization. Never sum provider raw input/cached counters.
        const read = number(c.cacheReadTokens) ? c.cacheReadTokens : 0,
          write = number(c.cacheWriteTokens) ? c.cacheWriteTokens : 0;
        if (read + write <= c.promptTokens) out.tokens.input = c.promptTokens - read - write;
        if (number(c.cacheReadTokens)) out.tokens.cacheRead = c.cacheReadTokens;
        if (number(c.cacheWriteTokens)) out.tokens.cacheWrite = c.cacheWriteTokens;
        if (number(c.cost?.usd)) {
          out.costUsd = c.cost.usd;
          out.costBasis = "reported";
          out.costEstimated = true;
          out.costPartial = c.cost.partial === true;
        } else {
          delete out.costUsd;
          delete out.costBasis;
          delete out.costEstimated;
          delete out.costPartial;
        }
        if (label(p.modelId)) out.model = p.modelId;
        break;
      }
    }
  }
  if (!found) return fallback;
  // A poll time is not a provider observation time; keep durable usage's timestamp where available.
  return out;
}
export function museAllowanceAccount(value: any, root: string, now: number): AccountUsage | null {
  const a = value?.schemaVersion === 1 ? value.allowance : undefined;
  if (
    !a ||
    !label(a.tier) ||
    !timestamp(a.asOfMs) ||
    !number(a.window?.usedPercent) ||
    !timestamp(a.window?.resetsAtMs) ||
    !number(a.weekly?.usedPercent) ||
    !timestamp(a.weekly?.resetsAtMs)
  )
    return null;
  return {
    kind: "muse",
    accountKey: accountKeyOf("muse", root),
    label: "Muse Code",
    plan: a.tier,
    source: "muse-events",
    asOf: Math.min(a.asOfMs, now),
    windows: [
      {
        label:
          number(a.window.windowDurationMins) && a.window.windowDurationMins > 0
            ? `${a.window.windowDurationMins} 分`
            : "利用枠",
        usedPct: a.window.usedPercent,
        ...(number(a.window.windowDurationMins) && a.window.windowDurationMins > 0
          ? { windowMinutes: a.window.windowDurationMins }
          : {}),
        resetsAt: a.window.resetsAtMs,
        stale: a.window.resetsAtMs <= now,
      },
      {
        label: "週",
        usedPct: a.weekly.usedPercent,
        resetsAt: a.weekly.resetsAtMs,
        stale: a.weekly.resetsAtMs <= now,
      },
    ],
  };
}
/** No model call. Own the updater/native process group, bound stdout, and wait for closure. */
export async function readMuseAllowance(signal: AbortSignal): Promise<unknown> {
  const env = { ...process.env, MUSE_NO_AUTO_UPDATE: "1", MUSE_LOGIN: "0" };
  const target =
    process.platform === "win32"
      ? await windowsAgentExecutable("muse", env)
      : { file: "muse", prefix: [] };
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(null);
    const child = spawn(target.file, [...target.prefix, "usage", "--json"], {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    let text = "",
      bytes = 0,
      done = false,
      killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (sig: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {}
    };
    const stop = () => {
      if (done) return;
      done = true;
      if (process.platform === "win32" && child.pid) {
        const killer = spawn(
          join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
          ["/PID", String(child.pid), "/T", "/F"],
          { stdio: "ignore", windowsHide: true },
        );
        killer.on("error", () => kill("SIGKILL"));
      } else kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 200);
      killTimer.unref();
    };
    const timer = setTimeout(stop, 5000);
    timer.unref();
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 32768) {
        text = "";
        stop();
      } else if (!done) text += chunk;
    });
    child.on("error", () => stop());
    child.on("close", () => {
      kill("SIGKILL");
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal.removeEventListener("abort", stop);
      try {
        resolve(!signal.aborted && !done ? JSON.parse(text) : null);
      } catch {
        resolve(null);
      }
    });
  });
}
