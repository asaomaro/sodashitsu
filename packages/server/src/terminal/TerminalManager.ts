import type { PaneId, TerminalPalette } from "@sodashitsu/protocol";
import type { PtyBackend, PtyProcess } from "../pty/PtyBackend.js";
import type { ProcessInspector } from "../platform/ProcessInspector.js";
import { withShellCwdTracking } from "../pty/shellCwdTracking.js";
import { DefaultTerminalHost, type TerminalHost } from "./TerminalHost.js";

export interface CreatePaneOptions {
  cwd: string;
  shell?: string;
  /** `shell` を渡したときの引数（20260926-edit-scrollback）。省略は引数なし。 */
  args?: string[] | string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  /**
   * 対話の pane のシェル（新規・分割・復元）なら true（20260928-windows-pane-cwd の D-1）。Windows で設定が入なら、プロンプトのたびに場所を知らせる
   * 設定を差し込む（`pty/shellCwdTracking.ts`）。独自コマンドの pane・`edit_scrollback` のエディタは渡さない（引数の意味が変わるため。decisions D2）。
   */
  trackCwd?: boolean;
}

/** シェルの場所の知らせの差し込み（20260928-windows-pane-cwd）。`enabled` は pane を開くたびに読む（共有の設定の今の値）。 */
export interface ShellCwdTrackingSource {
  platform: NodeJS.Platform;
  enabled(): boolean;
}

/** 更新時の引き継ぎ（20260926-live-handoff）で渡された PTY。 */
export interface AdoptPaneOptions {
  fd: number;
  pid: number;
  cols: number;
  rows: number;
}

/** pane の id → `TerminalHost` の対応（architecture.md「TerminalManager」）。 */
export interface TerminalManager {
  get(paneId: PaneId): TerminalHost | undefined;
  create(paneId: PaneId, opts: CreatePaneOptions): TerminalHost;
  /** 引き継いだ PTY の master から端末を作る（`PtyBackend.adopt` の無い実装・Windows では投げる）。 */
  adopt?(paneId: PaneId, opts: AdoptPaneOptions): TerminalHost;
  resize(paneId: PaneId, cols: number, rows: number): void;
  dispose(paneId: PaneId): void;
}

export class DefaultTerminalManager implements TerminalManager {
  private readonly hosts = new Map<PaneId, TerminalHost>();

  constructor(
    private readonly ptyBackend: PtyBackend,
    private readonly processInspector: ProcessInspector,
    private readonly scrollbackLines: number,
    /**
     * pane ごとに、色の問い合わせに答える配色を引く（20260921-theme-settings の design D6。`composeServer.ts` が `createPaletteSource` を渡す）。
     * 省けば今までどおり dracula。
     */
    private readonly paletteFor?: (paneId: PaneId) => TerminalPalette,
    /**
     * pane ごとに、明暗の問い合わせに答える appearance を引く（20260924-dark-mode-report。
     * `composeServer.ts` が `createPaletteSource` を渡す）。省けば今までどおり dark（dracula）。
     */
    private readonly appearanceFor?: (paneId: PaneId) => "light" | "dark",
    /** 省けば差し込まない（今までどおり）。`composeServer.ts` がプラットフォームと共有の設定の読み取りを渡す。 */
    private readonly shellCwdTracking?: ShellCwdTrackingSource,
  ) {}

  get(paneId: PaneId): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }

  /**
   * 同期のまま作る（D37）。起動そのものが失敗したか（存在しない実行ファイル等）は、node-pty では
   * 同期的には分からない——PTY の出力とその後の `onExit` を見て、呼び出し側（SessionService。T17）が
   * 短い猶予で判定する。
   */
  create(paneId: PaneId, opts: CreatePaneOptions): TerminalHost {
    const defaultShell = opts.shell ? undefined : this.processInspector.defaultShell();
    let launch = {
      shell: opts.shell ?? defaultShell!.shell,
      args: opts.shell ? (opts.args ?? []) : defaultShell!.args,
      env: opts.env ?? (process.env as Record<string, string>),
    };
    const tracking = this.shellCwdTracking;
    if (opts.trackCwd && tracking) {
      launch = withShellCwdTracking(launch, { platform: tracking.platform, enabled: tracking.enabled() });
    }
    const proc = this.ptyBackend.spawn({
      ...launch,
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
    });
    return this.register(paneId, proc, opts.cols, opts.rows);
  }

  adopt(paneId: PaneId, opts: AdoptPaneOptions): TerminalHost {
    if (this.ptyBackend.adopt === undefined) throw new Error("this PTY backend cannot adopt a handed-off PTY");
    const proc = this.ptyBackend.adopt({ fd: opts.fd, pid: opts.pid });
    return this.register(paneId, proc, opts.cols, opts.rows);
  }

  /** `create`・`adopt` の共通：端末を作って登録し、終了で自分を捨てる配線をする。 */
  private register(paneId: PaneId, proc: PtyProcess, cols: number, rows: number): TerminalHost {
    const paletteFor = this.paletteFor;
    const appearanceFor = this.appearanceFor;
    const host = new DefaultTerminalHost(
      paneId,
      proc,
      cols,
      rows,
      this.scrollbackLines,
      paletteFor ? () => paletteFor(paneId) : undefined,
      appearanceFor ? () => appearanceFor(paneId) : undefined,
    );
    this.hosts.set(paneId, host);
    // シェルが自分で終了したとき、`SessionService` が明示的に `dispose(paneId)` を呼ぶ前に
    // このリスナー（`create` 時点で真っ先に登録される）が `hosts` から消してしまうと、
    // 後から来る `dispose(paneId)` は「既に無い」として何もせず、`Mirror`/リスナーが解放されない
    // （レビュー指摘。リーク）。ここで直接 `dispose()` してから消すことで、呼び出し順によらず必ず解放する
    // （`TerminalHost.dispose()` は多重呼び出しに対して安全）。
    host.onExit(() => {
      this.hosts.delete(paneId);
      host.dispose();
    });
    return host;
  }

  resize(paneId: PaneId, cols: number, rows: number): void {
    this.hosts.get(paneId)?.resize(cols, rows);
  }

  dispose(paneId: PaneId): void {
    const host = this.hosts.get(paneId);
    if (!host) return;
    this.hosts.delete(paneId);
    host.dispose();
  }
}
