import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import {
  delegationUrl,
  DelegationStartParams,
  type DelegationInvitation,
} from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { printJson, printLine } from "../output.js";

/** Invitation credentials are files, never CLI arguments or log output. Existing files are not overwritten. */
export async function readInvitation(path: string) {
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const st = await file.stat();
    if (!st.isFile() || st.size > 8192)
      throw new Error("招待には8KiB以内の通常ファイルを指定してください");
    const bytes = Buffer.alloc(8193),
      { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new Error("招待ファイルが大きすぎます");
    const raw = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
    if (raw?.version !== 1) throw new Error("招待ファイルの版が異なります");
    const data = DelegationStartParams.parse({
      url: raw.url,
      machineId: raw.machineId,
      token: raw.token,
    });
    data.url = delegationUrl(data.url);
    return data;
  } catch {
    throw new Error("招待ファイルを読めません（形式・サイズ・接続先のHTTPSを確認してください）");
  } finally {
    await file.close();
  }
}
export async function runMachineDelegation(
  cmd: Extract<Command, { kind: "machine-delegation" }>,
  store: SessionStore,
) {
  if (cmd.opts.machine && cmd.opts.machine !== "local")
    throw new Error("委譲の設定は対象PCのローカルSodashitsuに対して実行してください");
  if (cmd.sub === "invite") {
    const url = delegationUrl(cmd.values["--public-url"]!);
    const path = cmd.values["--out"]!;
    const file = await open(path, "wx", 0o600);
    let written = false;
    try {
      const result = await withSession(cmd.opts, store, async (c) => {
        await c.hello();
        return c.request("machine.invite", { label: cmd.values["--label"]! });
      });
      const invitation: DelegationInvitation = { version: 1, url, ...result };
      await file.writeFile(JSON.stringify(invitation, null, 2) + "\n");
      await file.sync();
      written = true;
      printLine(`招待ファイルを保存しました: ${path} (machine ${result.machineId})`);
    } finally {
      await file.close();
      if (!written) await unlink(path).catch(() => undefined);
    }
    return;
  }
  const invitation =
    cmd.sub === "delegate" ? await readInvitation(cmd.values["--invitation"]!) : undefined;
  const result = await withSession(cmd.opts, store, async (c) => {
    await c.hello();
    if (cmd.sub === "request")
      return c.request("machine.request_delegation", {
        url: delegationUrl(cmd.values["--connect"]!),
        label: cmd.values["--label"]!,
      });
    if (cmd.sub === "requests") return c.request("machine.pairing_requests", {});
    if (cmd.sub === "confirm")
      return c.request("machine.confirm_delegation", {
        id: cmd.values.id!,
        code: cmd.values["--code"]!,
      });
    if (cmd.sub === "reject-request")
      return c.request("machine.reject_pairing", { id: cmd.values.id! });
    if (invitation) return c.request("machine.delegate", invitation);
    if (cmd.sub === "stop-delegation")
      return c.request("machine.stop_delegation", { id: cmd.values.id! });
    return c.request("machine.delegations", {});
  });
  printJson(result);
}
