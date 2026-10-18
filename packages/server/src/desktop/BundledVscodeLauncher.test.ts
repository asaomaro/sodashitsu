import { afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: run }));
vi.mock("node:fs", () => ({ existsSync: () => true }));
import { bundledVscodeCommand } from "./BundledVscodeLauncher.js";
afterEach(() => {
  vi.unstubAllEnvs();
  run.mockReset();
});
it("discovers Windows paths without launching apps, then constructs a fixed argv for WSL", () => {
  vi.stubEnv("WSL_DISTRO_NAME", "Ubuntu");
  run.mockImplementation((exe: string, args: string[]) => {
    if (exe === "powershell.exe")
      return {
        status: 0,
        stdout: JSON.stringify({
          code: "C:\\Apps\\Code.exe",
          node: "C:\\Program Files\\nodejs\\node.exe",
          profile: "C:\\Users\\u\\Soda profile",
        }),
      };
    return {
      status: 0,
      stdout:
        args[0] === "-w"
          ? "C:\\Soda\\cdp-launcher.mjs\n"
          : "/mnt/c/Program Files/nodejs/node.exe\n",
    };
  });
  const command = bundledVscodeCommand("http://127.0.0.1:7780", {
    allowInput: true,
    allowFit: true,
  });
  expect(command).toEqual([
    "/mnt/c/Program Files/nodejs/node.exe",
    "C:\\Soda\\cdp-launcher.mjs",
    "--code",
    "C:\\Apps\\Code.exe",
    "--user-data-dir",
    "C:\\Users\\u\\Soda profile",
    "--soda",
    "http://127.0.0.1:7780",
    "--allow-input",
    "--allow-fit",
  ]);
  expect(run.mock.calls.every(([exe]) => exe === "powershell.exe" || exe === "wslpath")).toBe(true);
  expect(run.mock.calls[0]![1]).not.toContain("http://127.0.0.1:7780");
});
it("does not offer an executable for unsupported hosts or invalid path discovery", () => {
  vi.stubEnv("WSL_DISTRO_NAME", "");
  if (process.platform !== "win32")
    expect(
      bundledVscodeCommand("http://localhost:7780", { allowInput: false, allowFit: false }),
    ).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  vi.stubEnv("WSL_DISTRO_NAME", "Ubuntu");
  run.mockReturnValue({ status: 0, stdout: '{"node":"bad","code":null}' });
  expect(
    bundledVscodeCommand("http://localhost:7780", { allowInput: false, allowFit: false }),
  ).toBeUndefined();
});
