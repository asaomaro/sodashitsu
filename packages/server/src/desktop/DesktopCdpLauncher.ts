import { spawn } from "node:child_process";

export type LaunchTarget = { id: string; title: string };
export type LaunchJob = { result: Promise<LaunchTarget[]>; closed: Promise<void>; cancel(): void };
/** Only a server-configured argv can execute. Credentials travel over stdin, never argv/logs. */
export class DesktopCdpLauncher {
  private active = false;
  private factory: (() => readonly string[] | undefined) | undefined;
  private cancelActive: (() => void) | undefined;
  constructor(private command?: readonly string[]) {}
  configure(factory: (() => readonly string[] | undefined) | undefined): void {
    this.cancelActive?.(); this.factory = factory; this.command = undefined;
  }
  configuredCommand(): readonly string[] | undefined { return this.command; }
  static fromEnvironment(value = process.env["SODA_VSCODE_CDP_COMMAND"]): DesktopCdpLauncher {
    if (!value) return new DesktopCdpLauncher();
    let command: unknown;
    try { command = JSON.parse(value); } catch { throw new Error("SODA_VSCODE_CDP_COMMAND must be a JSON argv array"); }
    if (!Array.isArray(command) || !command.length || command.length > 32 ||
        command.some(arg => typeof arg !== "string" || !arg || arg.length > 8192 || arg.includes("\0")))
      throw new Error("SODA_VSCODE_CDP_COMMAND must be a JSON argv array");
    return new DesktopCdpLauncher(command);
  }
  get available(): boolean { return !!this.command || !!this.factory; }
  get busy(): boolean { return this.active; }
  start(request: { type: "discover" } | { type: "connect"; targetId: string; token: string }): LaunchJob {
    if (!this.available || this.active) throw new Error("Windows起動処理が未設定か使用中です");
    let command: readonly string[] | undefined;
    try { command = this.command ?? this.factory?.(); } catch { /* Fixed error below; never expose discovered paths. */ }
    if (!command) throw new Error("VSCodeとWindows版Node 24、および同梱helperを確認してください");
    this.active = true;
    let child: ReturnType<typeof spawn>;
    try { child = spawn(command[0]!, command.slice(1), { shell: false, windowsHide: true, stdio: "pipe" }); }
    catch { this.active = false; throw new Error("Windows起動処理を実行できませんでした"); }
    let closedResolve: () => void = () => {};
    const closed = new Promise<void>(resolve => { closedResolve = resolve; });
    let settled = false, stopping = false, output = "";
    let discovered: LaunchTarget[] | undefined;
    let rejectResult: (reason: Error) => void = () => {};
    let deadline: ReturnType<typeof setTimeout>;
    let forced: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (stopping) return;
      stopping = true;
      child.stdin?.end(); // Windows helper releases CDP overrides/held input before exiting.
      // Discovery has no CDP overrides. A connected helper may be releasing
      // many held keys through individually bounded CDP calls: never kill it
      // mid-cleanup. Keep its ownership slot until it exits.
      if (request.type === "discover") {
        forced = setTimeout(() => child.kill("SIGKILL"), 5000);
        forced.unref();
      }
    };
    const result = new Promise<LaunchTarget[]>((resolve, reject) => {
      rejectResult = reject;
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(new Error("Windows側の起動・接続に失敗しました。起動設定とVSCodeの状態を確認してください"));
        cancel();
      };
      deadline = setTimeout(fail, request.type === "discover" ? 30000 : 15000);
      deadline.unref();
      child.on("error", fail);
      child.stdin?.on("error", fail);
      child.stderr?.on("data", () => {}); // Never expose tokens, paths or helper internals to a browser/log.
      child.stdout?.on("data", data => {
        if (settled) return;
        output += data.toString();
        if (Buffer.byteLength(output) > 32768) return fail();
        const newline = output.indexOf("\n");
        if (newline < 0 || settled) return;
        try {
          const message = JSON.parse(output.slice(0, newline));
          if (request.type === "discover") {
            if (message.type !== "targets" || !Array.isArray(message.targets) || !message.targets.length || message.targets.length > 32)
              return fail();
            const targets = message.targets.map((target: LaunchTarget) => {
              if (!target || typeof target.id !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/.test(target.id) ||
                  typeof target.title !== "string" || target.title.length > 256) throw new Error("invalid target");
              return { id: target.id, title: target.title };
            });
            discovered = targets;
          } else {
            if (message.type !== "connecting") return fail();
            settled = true; clearTimeout(deadline); resolve([]);
          }
        } catch { fail(); }
      });
      child.on("close", (code) => {
        this.active = false;
        clearTimeout(deadline); clearTimeout(forced);
        if (!settled) {
          settled = true;
          if (code === 0 && discovered && !stopping) resolve(discovered);
          else reject(new Error("Windows起動処理が終了しました"));
        }
        closedResolve();
      });
      child.stdin?.write(JSON.stringify(request) + "\n");

    });
    const job = { result, closed, cancel: () => {
      if (!settled) { settled = true; clearTimeout(deadline); rejectResult(new Error("起動処理を取り消しました")); }
      cancel();
    } };
    this.cancelActive = job.cancel;
    child.once("close", () => { if (this.cancelActive === job.cancel) this.cancelActive = undefined; });
    return job;
  }
}
