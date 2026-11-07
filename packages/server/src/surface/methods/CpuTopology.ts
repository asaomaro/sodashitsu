import { desktopWindowsPowerShell } from "@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const LIMIT = 4096;
export function cpuList(raw: string): number[] | null {
  if (!raw.trim() || raw.length > 65536) return null;
  const result = new Set<number>();
  for (const part of raw.trim().split(",")) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) return null;
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(end) || start > end || end > 65535 || end - start >= LIMIT) return null;
    for (let n = start; n <= end; n++) {
      if (result.has(n) || result.size >= LIMIT) return null;
      result.add(n);
    }
  }
  return [...result].sort((a, b) => a - b);
}
/** Counts only explicit, mutually consistent online topology; never assumes two threads/core. */
export async function linuxPhysicalCores(
  logical: number,
  read: (path: string) => Promise<string> = path => readFile(path, "utf8"),
  root = "/sys/devices/system/cpu",
): Promise<number | null> {
  try {
    const online = cpuList(await read(join(root, "online")));
    if (!online || online.length !== logical) return null;
    const ids = new Set(online), groups = new Map<string, string>(), members = new Map<number, string>();
    // Bounded sequential batches avoid opening thousands of files concurrently.
    for (let offset = 0; offset < online.length; offset += 16) {
      const rows = await Promise.all(online.slice(offset, offset + 16).map(async cpu => {
        const dir = join(root, `cpu${cpu}`, "topology");
        const [pkg, core, siblings] = await Promise.all(["physical_package_id", "core_id", "core_cpus_list"].map(name => read(join(dir, name))));
        if (!/^\d+$/.test(pkg!.trim()) || !/^\d+$/.test(core!.trim()) || !Number.isSafeInteger(Number(pkg)) || !Number.isSafeInteger(Number(core))) throw Error("unknown topology");
        const list = cpuList(siblings!);
        if (!list || !list.includes(cpu)) throw Error("unknown siblings");
        return { cpu, id: `${pkg!.trim()}:${core!.trim()}`, group: list.filter(n => ids.has(n)).join(",") };
      }));
      for (const row of rows) {
        const previous = groups.get(row.id);
        if (previous !== undefined && previous !== row.group) return null;
        groups.set(row.id, row.group); members.set(row.cpu, row.group);
      }
    }
    const groupsByMask = new Map<string, string>();
    for (const [id, group] of groups) {
      if (groupsByMask.has(group) && groupsByMask.get(group) !== id) return null;
      groupsByMask.set(group, id);
      for (const cpu of group.split(",").map(Number)) if (members.get(cpu) !== group) return null;
    }
    const after = cpuList(await read(join(root, "online")));
    if (!after || after.join(",") !== online.join(",")) return null;
    return groups.size > 0 && groups.size <= logical ? groups.size : null;
  } catch { return null; }
}
export function windowsPhysicalCores(raw: string, logical: number): number | null {
  try {
    const value: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const rows = Array.isArray(value) ? value : [value];
    if (!rows.length || rows.length > 256) return null;
    let cores = 0, threads = 0;
    for (const row of rows) {
      const c = row?.NumberOfCores, l = row?.NumberOfLogicalProcessors;
      if (!Number.isSafeInteger(c) || !Number.isSafeInteger(l) || c <= 0 || l < c) return null;
      cores += c; threads += l;
    }
    return cores <= LIMIT && threads === logical ? cores : null;
  } catch { return null; }
}
export async function detectPhysicalCores(logical: number, platform: NodeJS.Platform = process.platform, run = execFile): Promise<number | null> {
  if (platform === "linux") return linuxPhysicalCores(logical);
  if (platform !== "win32") return null;
  let file: string;
  try { file = desktopWindowsPowerShell(); } catch { return null; }
  const script = "$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_Processor | Select-Object NumberOfCores,NumberOfLogicalProcessors) | ConvertTo-Json -Compress";
  return new Promise(resolve => {
    run(file, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 3000, maxBuffer: 65536, encoding: "utf8" },
      (error, stdout) => resolve(error ? null : windowsPhysicalCores(stdout, logical)));
  });
}
/** Async refresh never blocks metric sampling; failures are cached too. */
export class CpuTopologyCache {
  private value: number | null = null;
  private generation = 0;
  private logical = -1;
  private expires = 0;
  private pending: Promise<void> | undefined;
  constructor(private readonly detect = detectPhysicalCores, private readonly now = Date.now) {}
  get(logical: number): number | null {
    if (logical !== this.logical) { this.generation++; this.logical = logical; this.value = null; this.expires = 0; }
    if (!this.pending && this.now() >= this.expires) {
      const expected = logical, generation = this.generation;
      this.pending = this.detect(logical).then(value => {
        if (this.logical !== expected || this.generation !== generation) return;
        this.value = Number.isSafeInteger(value) && value! > 0 && value! <= expected ? value : null;
        this.expires = this.now() + (this.value === null ? 30000 : 300000);
      }, () => { if (this.logical === expected && this.generation === generation) { this.value = null; this.expires = this.now() + 30000; } }).finally(() => { this.pending = undefined; });
    }
    return this.value;
  }
}
