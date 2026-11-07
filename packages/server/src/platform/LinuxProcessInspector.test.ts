import { beforeEach, describe, expect, it, vi } from "vitest";
const fs = vi.hoisted(() => ({ readFile: vi.fn(), readdir: vi.fn(), readlink: vi.fn() }));
vi.mock("node:fs/promises", () => fs);
import { LinuxProcessInspector } from "./LinuxProcessInspector.js";
const stat = (pid: number, pgrp: number, tpgid = pgrp) => `${pid} (fixture ${pid}) S 1 ${pgrp} 1 0 ${tpgid} 0`;

beforeEach(() => {
  vi.resetAllMocks();
  fs.readFile.mockImplementation(async (path: string) => {
    const pid = Number(path.split("/")[2]);
    if (path.endsWith("/stat")) {
      if (pid === 10) return stat(pid, 10, 100);
      if (pid === 20) return stat(pid, 20, 200);
      return stat(pid, pid < 200 ? 100 : 200);
    }
    if (path.endsWith("/cmdline")) return `fixture-${pid}\0`;
    throw Error("Unexpected read");
  });
  fs.readlink.mockResolvedValue("/fixture");
});

describe("LinuxProcessInspector concurrent scans", () => {
  it("walks /proc once for concurrent panes while keeping their groups separate", async () => {
    let release!: (entries: string[]) => void;
    fs.readdir.mockReturnValue(new Promise<string[]>(resolve => { release = resolve; }));
    const inspector = new LinuxProcessInspector();
    const first = inspector.foregroundJob(10), second = inspector.foregroundJob(20);
    await vi.waitFor(() => expect(fs.readdir).toHaveBeenCalled());
    release(["100", "101", "200", "self"]);
    const [a, b] = await Promise.all([first, second]);
    expect(a?.processes.map(p => p.pid)).toEqual([100, 101]);
    expect(b?.processes.map(p => p.pid)).toEqual([200]);
    expect(fs.readdir).toHaveBeenCalledTimes(1);
    for (const pid of [100, 101, 200]) {
      expect(fs.readFile.mock.calls.filter(([path]) => path === `/proc/${pid}/stat`)).toHaveLength(1);
    }
  });

  it("reads process changes on the next poll instead of retaining a completed snapshot", async () => {
    fs.readdir.mockResolvedValueOnce(["200"]).mockResolvedValueOnce(["201"]);
    const inspector = new LinuxProcessInspector();
    expect((await inspector.foregroundJob(20))?.processes.map(p => p.pid)).toEqual([200]);
    expect((await inspector.foregroundJob(20))?.processes.map(p => p.pid)).toEqual([201]);
    expect(fs.readdir).toHaveBeenCalledTimes(2);
  });

  it("retries a failed directory scan on the next poll", async () => {
    fs.readdir.mockRejectedValueOnce(Error("Temporarily unavailable")).mockResolvedValueOnce(["200"]);
    const inspector = new LinuxProcessInspector();
    expect(await inspector.foregroundJob(20)).toBeNull();
    expect((await inspector.foregroundJob(20))?.processes[0]?.pid).toBe(200);
    expect(fs.readdir).toHaveBeenCalledTimes(2);
  });
});
