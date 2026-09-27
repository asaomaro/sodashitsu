import { stat } from "node:fs/promises";
import {
  RpcError,
  type CommandListResult,
  type CommandRunParams,
  type CommandRunResult,
  type PaneId,
} from "@wtm/protocol";
import type { EventBus } from "../bus/EventBus.js";
import type { ClientRegistry } from "../clients/ClientRegistry.js";
import type { Logger } from "../log/Logger.js";
import type { SessionService } from "../session/SessionService.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import { loadCommandsFile, toCommandInfo, type CommandDef } from "./commandConfig.js";
import { commandArgv, ptyArgs, spawnDetachedCommand } from "./commandLaunch.js";

/** 同時に裏で走らせる独自コマンドの上限（`shell` 種）。キーの押し間違い・繰り返しでプロセスを溜めない。 */
export const DEFAULT_MAX_DETACHED = 16;

export interface CommandServiceOptions {
  /** `<stateDir>/commands.json`。 */
  filePath: string;
  session: Pick<
    SessionService,
    "commandContext" | "commandEnv" | "openCommandPane" | "reservePaneId"
  >;
  terminals: Pick<TerminalManager, "create" | "dispose">;
  bus: Pick<EventBus, "publish">;
  clients: Pick<ClientRegistry, "get">;
  logger: Logger;
  platform?: NodeJS.Platform;
  /** `ComSpec` を読む環境（既定は `process.env`）。 */
  env?: NodeJS.ProcessEnv;
  load?: typeof loadCommandsFile;
  spawnDetached?: typeof spawnDetachedCommand;
  isDirectory?: (path: string) => Promise<boolean>;
  maxDetached?: number;
}

interface PopupRecord {
  clientId: string;
  commandId: string;
  cols: number;
  rows: number;
}

async function defaultIsDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 独自コマンド（20260927-custom-command-keys。herdr の `[[keys.command]]`）の係。**一覧・popup・裏の実行の数の唯一の持ち主**（architecture.md）。
 * コマンドの文字列は一覧（`commands.json`）からだけ取り、ブラウザから来た値はコマンドの文字列にも引数にも入れない——ブラウザ由来の
 * `paneId` は `SessionService.commandContext` でモデルに在ることを確かめ、環境変数の値はモデルから引き直した値だけを使う。
 */
export class CommandService {
  private commands: CommandDef[] = [];
  private problem: string | null = null;
  private readonly popups = new Map<PaneId, PopupRecord>();
  private detachedRunning = 0;
  private reloadGen = 0;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly load: typeof loadCommandsFile;
  private readonly spawnDetached: typeof spawnDetachedCommand;
  private readonly isDirectory: (path: string) => Promise<boolean>;
  private readonly maxDetached: number;

  constructor(private readonly opts: CommandServiceOptions) {
    this.platform = opts.platform ?? process.platform;
    this.env = opts.env ?? process.env;
    this.load = opts.load ?? loadCommandsFile;
    this.spawnDetached = opts.spawnDetached ?? spawnDetachedCommand;
    this.isDirectory = opts.isDirectory ?? defaultIsDirectory;
    this.maxDetached = opts.maxDetached ?? DEFAULT_MAX_DETACHED;
  }

  /** ブラウザへ渡す一覧（**コマンドの文字列を含まない**）。 */
  list(): CommandListResult {
    return { commands: this.commands.map(toCommandInfo), problem: this.problem };
  }

  /**
   * 設定ファイルを読み直して置き換え、全クライアントへ `command.updated` を配る。採らなかったときは直前の一覧も捨てる（requirements F3）。
   * 読み込みそのものが投げても（想定外）0 件にしてサーバは止めない。
   */
  async reload(): Promise<CommandListResult> {
    // 重なった読み直しは、最後に始めたものだけを採る（先に始めた遅い読み込みが新しい内容を上書きしない）。
    const gen = ++this.reloadGen;
    let loaded: Awaited<ReturnType<typeof loadCommandsFile>> | undefined;
    let failure: unknown;
    try {
      loaded = await this.load(this.opts.filePath, { platform: this.platform });
    } catch (err) {
      failure = err;
    }
    if (gen !== this.reloadGen) return this.list();
    if (loaded) {
      const r = loaded;
      this.commands = r.commands;
      this.problem = r.problem;
      if (r.warning !== undefined)
        this.opts.logger.warn("custom commands file is readable by others", {
          file: this.opts.filePath,
          warning: r.warning,
        });
    } else {
      this.commands = [];
      this.problem = "commands.json: 読めません";
      this.opts.logger.error("failed to load custom commands", {
        file: this.opts.filePath,
        error: String(failure),
      });
    }
    if (this.problem !== null)
      this.opts.logger.warn("custom commands rejected", {
        file: this.opts.filePath,
        problem: this.problem,
      });
    else
      this.opts.logger.info("custom commands loaded", {
        file: this.opts.filePath,
        count: this.commands.length,
      });
    const result = this.list();
    this.opts.bus.publish({ event: "command.updated", data: result });
    return result;
  }

  /** 独自コマンドを走らせる。`clientId` は要求した接続（popup の持ち主になる）。 */
  async run(clientId: string, params: CommandRunParams): Promise<CommandRunResult> {
    const found = this.commands.find((c) => c.id === params.commandId);
    if (!found)
      throw new RpcError(
        "command_not_found",
        `custom command not found: ${params.commandId} (reload the configuration)`,
      );
    const ctx = this.opts.session.commandContext(params.paneId); // pane が無ければ not_found（モデルから引き直す）
    const cwd = (await this.isDirectory(ctx.cwd)) ? ctx.cwd : ctx.defaultCwd;
    // 待つ間に読み直されていたら、今の一覧で引き直す（捨てた・書き換わった定義を走らせない）。
    const def = this.commands.find((c) => c.id === params.commandId);
    if (!def)
      throw new RpcError(
        "command_not_found",
        `custom command not found: ${params.commandId} (reload the configuration)`,
      );
    const extra: Record<string, string> = {
      WTM_ACTIVE_WORKSPACE_ID: ctx.workspaceId,
      WTM_ACTIVE_TAB_ID: ctx.tabId,
      WTM_ACTIVE_PANE_ID: ctx.paneId,
      WTM_ACTIVE_PANE_CWD: ctx.cwd,
      WTM_COMMAND_ID: def.id,
    };
    const argv = commandArgv(def.type, def.command, this.platform, this.env);
    // コマンドの文字列はログに出さない（秘密が混ざりうる）。
    this.opts.logger.info("custom command run", {
      commandId: def.id,
      type: def.type,
      clientId,
      paneId: ctx.paneId,
    });
    switch (def.type) {
      case "shell":
        return this.runDetached(argv, cwd, this.opts.session.commandEnv(undefined, extra));
      case "pane": {
        const { pane } = await this.opts.session.openCommandPane(ctx.paneId, cwd, {
          shell: argv[0]!,
          args: ptyArgs(argv, this.platform),
          env: extra,
        });
        return { type: "pane", pane };
      }
      case "popup":
        return this.openPopup(
          clientId,
          def.id,
          params,
          argv,
          cwd,
          this.opts.session.commandEnv(undefined, extra),
        );
    }
  }

  private runDetached(argv: string[], cwd: string, env: Record<string, string>): CommandRunResult {
    if (this.detachedRunning >= this.maxDetached) {
      throw new RpcError(
        "command_busy",
        `too many custom commands are running in the background (${this.maxDetached})`,
      );
    }
    this.detachedRunning++;
    let counted = true;
    const release = (): void => {
      if (!counted) return;
      counted = false;
      this.detachedRunning--;
    };
    try {
      this.spawnDetached(argv, { cwd, env, platform: this.platform }, release, (err) => {
        release();
        this.opts.logger.warn("custom command failed to start", { error: String(err) });
      });
    } catch (err) {
      release();
      this.opts.logger.warn("custom command failed to start", { error: String(err) });
      throw new RpcError("command_failed", "failed to start the custom command");
    }
    return { type: "shell" };
  }

  private openPopup(
    clientId: string,
    commandId: string,
    params: CommandRunParams,
    argv: string[],
    cwd: string,
    env: Record<string, string>,
  ): CommandRunResult {
    const kind = this.opts.clients.get(clientId)?.kind;
    if (kind !== "desktop" && kind !== "mobile")
      throw new RpcError("invalid_params", "a popup can only be opened from a browser");
    if (params.cols === undefined || params.rows === undefined)
      throw new RpcError("invalid_params", "a popup needs cols and rows");
    for (const p of this.popups.values()) {
      if (p.clientId === clientId)
        throw new RpcError("command_popup_open", "a popup is already open for this client");
    }
    const popupId = this.opts.session.reservePaneId();
    const { cols, rows } = params;
    let host;
    try {
      host = this.opts.terminals.create(popupId, {
        shell: argv[0]!,
        args: ptyArgs(argv, this.platform),
        cwd,
        cols,
        rows,
        env,
      });
    } catch (err) {
      this.opts.logger.warn("custom command popup failed to start", {
        commandId,
        error: String(err),
      });
      throw new RpcError("command_failed", "failed to start the custom command");
    }
    this.popups.set(popupId, { clientId, commandId, cols, rows });
    // 同じ同期区間で終わりを拾う（`onExit` はリプレイしない。research「実装時の注意」）。
    host.onExit((code) => this.popupExited(popupId, code));
    return { type: "popup", popupId, cols, rows };
  }

  private popupExited(popupId: PaneId, exitCode: number): void {
    if (!this.popups.delete(popupId)) return; // 閉じる要求・切断で先に消えていれば知らせ済み
    this.opts.bus.publish({ event: "command.popup_closed", data: { popupId, exitCode } });
  }

  /** popup の大きさ。**その接続が持ち主のときだけ**（`pane.subscribe` が使う。ほかの接続からは見えない）。 */
  popupSize(clientId: string, popupId: PaneId): { cols: number; rows: number } | undefined {
    const p = this.popups.get(popupId);
    return p && p.clientId === clientId ? { cols: p.cols, rows: p.rows } : undefined;
  }

  /** 持ち主の接続から popup を閉じる（コマンドを止める）。持ち主でなければ `not_found`。 */
  closePopup(clientId: string, popupId: PaneId): void {
    const p = this.popups.get(popupId);
    if (!p || p.clientId !== clientId)
      throw new RpcError("not_found", `popup not found: ${popupId}`);
    this.stopPopup(popupId);
  }

  /** 接続が切れたら、その接続の popup を止める（見る画面が無いまま入力待ちのプロセスを残さない）。 */
  onClientGone(clientId: string): void {
    for (const [id, p] of [...this.popups]) if (p.clientId === clientId) this.stopPopup(id);
  }

  /** 停止時：全 popup を止める。裏で走らせたものは止めない（切り離し。herdr と同じ）。 */
  dispose(): void {
    for (const id of [...this.popups.keys()]) this.stopPopup(id);
  }

  private stopPopup(popupId: PaneId): void {
    if (!this.popups.delete(popupId)) return;
    this.opts.terminals.dispose(popupId);
    this.opts.bus.publish({ event: "command.popup_closed", data: { popupId } });
  }
}
