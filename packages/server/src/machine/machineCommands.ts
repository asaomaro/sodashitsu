import { ConfigError } from "../configError.js";
import type { CommandIo } from "../sessionCommands.js";
import {
  CatalogError,
  emptyCatalog,
  loadCatalog,
  MAX_MACHINES,
  newMachineId,
  saveCatalog,
  type MachineCatalogData,
} from "./MachineCatalog.js";
import type { MachineCommand } from "./machineArgs.js";
import { MACHINE_USAGE } from "./machineArgs.js";
import { MachineLink, type LinkFailure, type MachineLinkDeps } from "./MachineLink.js";
import {
  labelProblem,
  remoteSessionProblem,
  targetProblem,
  type MachineProfile,
} from "./machineRules.js";

/**
 * `wtm machine add/list/rename/enable/disable/remove`（20260927-multi-host-machines の design「wtm machine」・herdr の `herdr machine`）。
 * 登録簿（状態ディレクトリの根の `machines.json`）だけを読み書きする。`add` だけが保存の前に ssh で中継に繋いで確かめる。名前の変更・無効化・
 * 削除はリモートに何もしない（リモートの `wtm serve` と pane は動いたまま）。動いている手元の `wtm serve` は 1〜2 秒で変化に気づく。
 * 終了コード: 0 成功／1 確かめの失敗・登録簿が読めない・書けない／2 引数の誤り・規則の違反・知らない id（`ConfigError`）。
 */
export interface MachineCommandDeps {
  link?: MachineLinkDeps;
  /** 確かめ（既定は `probeMachine`）。テストで差し替える。 */
  probe?: (profile: MachineProfile) => Promise<{ ok: true } | { ok: false; failure: LinkFailure }>;
}

/** 1 回だけ ssh で中継に繋ぎ、HELLO（版の確かめ）を受けたら閉じて成功。 */
export function probeMachine(
  profile: MachineProfile,
  deps: MachineLinkDeps = {},
): Promise<{ ok: true } | { ok: false; failure: LinkFailure }> {
  return new Promise((resolve) => {
    const link = new MachineLink(profile, deps);
    let settled = false;
    link.onOnline(() => {
      settled = true;
      link.close();
      resolve({ ok: true });
    });
    link.onClosed((failure) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, failure });
    });
    link.start();
  });
}

async function readForWrite(root: string): Promise<MachineCatalogData> {
  const loaded = await loadCatalog(root);
  if (loaded.kind === "missing") return emptyCatalog();
  if (loaded.kind === "invalid")
    throw new MachineCommandFailure(`cannot use the machine list: ${loaded.reason}`, 1);
  return loaded.data;
}

class MachineCommandFailure extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

function findById(data: MachineCatalogData, id: string): MachineProfile {
  const m = data.machines.find((x) => x.id === id);
  if (!m)
    throw new ConfigError(
      `no such machine id: ${id}`,
      "id は wtm machine list で確かめてください（名前ではなく id を指定します）。",
    );
  return m;
}

export async function runMachineCommand(
  cmd: MachineCommand,
  root: string,
  io: CommandIo,
  deps: MachineCommandDeps = {},
): Promise<number> {
  try {
    return await run(cmd, root, io, deps);
  } catch (err) {
    if (err instanceof MachineCommandFailure) {
      io.err(`wtm: ${err.message}`);
      return err.exitCode;
    }
    if (err instanceof CatalogError) {
      io.err(`wtm: cannot save the machine list: ${err.message}`);
      return 1;
    }
    // 書き込みの失敗（EACCES・ENOSPC 等）も「書けない」＝ 1（スタックトレースを出さない）。
    if (
      err instanceof Error &&
      typeof (err as NodeJS.ErrnoException).code === "string" &&
      !(err instanceof ConfigError)
    ) {
      io.err(`wtm: cannot save the machine list: ${err.message}`);
      return 1;
    }
    throw err; // ConfigError は main が終了コード 2（案内つき）にする
  }
}

async function run(
  cmd: MachineCommand,
  root: string,
  io: CommandIo,
  deps: MachineCommandDeps,
): Promise<number> {
  switch (cmd.sub) {
    case "list": {
      const data = await readForWrite(root);
      if (cmd.json) {
        io.out(
          JSON.stringify(
            data.machines.map((m) => ({
              id: m.id,
              label: m.label,
              target: m.target,
              session: m.session ?? "default",
              enabled: m.enabled,
            })),
          ),
        );
        return 0;
      }
      if (data.machines.length === 0) {
        io.out("no saved machines");
        return 0;
      }
      for (const m of data.machines)
        io.out(
          [
            m.id,
            m.label,
            m.target,
            m.session ?? "default",
            m.enabled ? "enabled" : "disabled",
          ].join("\t"),
        );
      return 0;
    }
    case "add": {
      const tp = targetProblem(cmd.target);
      if (tp !== undefined)
        throw new ConfigError(
          `invalid ssh target: ${JSON.stringify(cmd.target)} (${tp})`,
          MACHINE_USAGE,
        );
      const sp = remoteSessionProblem(cmd.session);
      if (sp !== undefined)
        throw new ConfigError(
          `invalid --remote-session: ${JSON.stringify(cmd.session)} (${sp})`,
          MACHINE_USAGE,
        );
      const session = cmd.session === "default" ? undefined : cmd.session;
      // 名前そのものの規則（空・空白・制御文字・予約名）は登録簿を読む前に見る（引数の誤りは登録簿が壊れていても 2）。
      const own = labelProblem(cmd.label, []);
      if (own !== undefined)
        throw new ConfigError(
          `invalid --label: ${JSON.stringify(cmd.label)} (${own})`,
          MACHINE_USAGE,
        );
      const checkRules = (data: MachineCatalogData): void => {
        const lp = labelProblem(cmd.label, data.machines);
        if (lp !== undefined)
          throw new ConfigError(
            `invalid --label: ${JSON.stringify(cmd.label)} (${lp})`,
            MACHINE_USAGE,
          );
        if (data.machines.length >= MAX_MACHINES)
          throw new ConfigError(
            `at most ${MAX_MACHINES} machines can be saved`,
            "使わないマシンを wtm machine remove で消してください。",
          );
      };
      checkRules(await readForWrite(root));
      const profile: MachineProfile = {
        id: newMachineId(),
        label: cmd.label,
        target: cmd.target,
        ...(session !== undefined ? { session } : {}),
        enabled: true,
      };
      io.out(
        `checking ${shellQuote(cmd.target)} (ssh … wtm bridge${session !== undefined ? ` --session ${session}` : ""}) …`,
      );
      const probed = await (deps.probe ?? ((p: MachineProfile) => probeMachine(p, deps.link)))(
        profile,
      );
      if (!probed.ok) {
        io.err(`wtm: cannot reach wtm on ${cmd.target}: ${probed.failure.message}`);
        io.err("wtm: the machine was not saved.");
        io.err(`hint: check plain SSH first: ssh ${shellQuote(cmd.target)}`);
        io.err(
          `hint: start the server on that machine: wtm serve${session !== undefined ? ` --session ${session}` : ""}`,
        );
        return 1;
      }
      // 確かめの間にほかの変更があっても上書きしない（読み直して規則を見直す）。
      const fresh = await readForWrite(root);
      checkRules(fresh);
      await saveCatalog(root, { version: 1, machines: [...fresh.machines, profile] });
      io.out(`saved machine ${profile.id} (${profile.label})`);
      io.out("a running wtm serve connects to it within a few seconds");
      return 0;
    }
    case "rename": {
      const data = await readForWrite(root);
      const m = findById(data, cmd.id);
      const lp = labelProblem(cmd.label, data.machines, m.id);
      if (lp !== undefined)
        throw new ConfigError(
          `invalid --label: ${JSON.stringify(cmd.label)} (${lp})`,
          MACHINE_USAGE,
        );
      await saveCatalog(root, {
        version: 1,
        machines: data.machines.map((x) => (x.id === m.id ? { ...x, label: cmd.label } : x)),
      });
      io.out(`renamed machine ${m.id} to ${cmd.label}`);
      return 0;
    }
    case "enable":
    case "disable": {
      const data = await readForWrite(root);
      const m = findById(data, cmd.id);
      const enabled = cmd.sub === "enable";
      await saveCatalog(root, {
        version: 1,
        machines: data.machines.map((x) => (x.id === m.id ? { ...x, enabled } : x)),
      });
      io.out(`${enabled ? "enabled" : "disabled"} machine ${m.id} (${m.label})`);
      return 0;
    }
    case "remove": {
      const data = await readForWrite(root);
      const m = findById(data, cmd.id);
      await saveCatalog(root, { version: 1, machines: data.machines.filter((x) => x.id !== m.id) });
      io.out(`removed machine ${m.id} (${m.label}); its remote wtm serve keeps running`);
      return 0;
    }
  }
}

/** 案内に出すコマンドの引数を、そのまま貼って打てる形にする（`[`・`]`・`~`・`=` 等を含むなら単一引用符で包む）。 */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9@%+:,./_-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
