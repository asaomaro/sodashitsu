import { execFile } from "node:child_process";
import { join } from "node:path";
// Fixed read-only Win32 query. No titles, pixels, input, credentials or OS settings are returned/changed.
export const fullscreenProbeScript = String.raw`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class SodaFullscreen {
 [StructLayout(LayoutKind.Sequential)]public struct R{public int L,T,Ri,B;}
 [StructLayout(LayoutKind.Sequential)]public struct M{public int Size;public R Monitor,Work;public uint Flags;}
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr GetShellWindow();
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr w,out R r);
 [DllImport("user32.dll")]static extern IntPtr MonitorFromWindow(IntPtr w,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool GetMonitorInfoW(IntPtr m,ref M info);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern int GetClassNameW(IntPtr w,StringBuilder b,int max);
 [DllImport("user32.dll")]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 public static string Check(){try{
  SetThreadDpiAwarenessContext(new IntPtr(-4));var w=GetForegroundWindow();if(w==IntPtr.Zero)return "unknown";
  var name=new StringBuilder(256);GetClassNameW(w,name,256);var cls=name.ToString();
  if(w==GetShellWindow()||cls=="Progman"||cls=="WorkerW"||cls=="Shell_TrayWnd"||cls=="Shell_SecondaryTrayWnd")return "normal";
  R r;var m=new M();m.Size=Marshal.SizeOf(typeof(M));if(!GetWindowRect(w,out r)||!GetMonitorInfoW(MonitorFromWindow(w,2),ref m))return "unknown";
  return r.L<=m.Monitor.L&&r.T<=m.Monitor.T&&r.Ri>=m.Monitor.Ri&&r.B>=m.Monitor.B?"full":"normal";
 }catch{return "unknown";}}
}
'@
[Console]::Out.Write([SodaFullscreen]::Check())`;
async function readWindowsFullscreen(signal: AbortSignal): Promise<boolean | null> {
  if (process.platform !== "win32") return false;
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA"])
    if (process.env[key]) env[key] = process.env[key];
  const executable = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return new Promise((resolve) => {
    execFile(
      executable,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", fullscreenProbeScript],
      { windowsHide: true, signal, timeout: 2000, maxBuffer: 2048, env },
      (error, stdout) => {
        const result = stdout.trim();
        resolve(error ? null : result === "full" ? true : result === "normal" ? false : null);
      },
    );
  });
}
/** Single-flight two-second cache; an unknown Windows result keeps notices in the inbox. */
export class FullscreenPolicy {
  private active: AbortController | null = null;
  private generation = 0;
  private pending: Promise<boolean> | null = null;
  private cached: { until: number; value: boolean } | null = null;
  constructor(
    private read = readWindowsFullscreen,
    private now = () => performance.now(),
  ) {}
  invalidate() {
    ++this.generation;
    this.cached = null;
  }
  stop() {
    this.invalidate();
    this.active?.abort();
  }
  quiet(): Promise<boolean> {
    if (this.cached && this.now() < this.cached.until) return Promise.resolve(this.cached.value);
    if (this.pending) return this.pending;
    const generation = this.generation;
    const controller = new AbortController();
    this.active = controller;
    this.pending = Promise.resolve()
      .then(() => this.read(controller.signal))
      .then(
        (value) => value !== false,
        () => true,
      )
      .then((value) => {
        if (generation !== this.generation) return true;
        this.cached = { until: this.now() + 2000, value };
        return value;
      })
      .finally(() => {
        this.pending = null;
        this.active = null;
      });
    return this.pending;
  }
}
