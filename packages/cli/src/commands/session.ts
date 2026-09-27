import type { ServerEvent } from "@sodashitsu/protocol";
import { CliUsageError, type Command } from "../cliArgs.js";
import { login } from "../httpAuth.js";
import { printJson, printLine } from "../output.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/** `login` / `snapshot` / `watch`（design.md「認証」節・「`snapshot`」節・「`watch`」節）。 */

type LoginCmd = Extract<Command, { kind: "login" }>;
type SnapshotCmd = Extract<Command, { kind: "snapshot" }>;
type WatchCmd = Extract<Command, { kind: "watch" }>;

/**
 * `sodactl login` は `withSession` を使わず、常に `httpAuth.login` を呼んでキャッシュを更新する
 * （design「振る舞いの詳細・認証」：明示的な再ログインの手段として独立させる）。`--token` の必須は
 * `cliArgs.ts` で検査済みだが、型上は `string | undefined` のままなのでここでも防御的に確認する。
 */
export async function runLogin(cmd: LoginCmd, store: SessionStore): Promise<void> {
  if (!cmd.opts.token) {
    throw new CliUsageError("missing --token", "sodactl login --url <URL> --token <TOKEN>");
  }
  const cookie = await login(cmd.opts.url, cmd.opts.token);
  await store.set(cmd.opts.url, cookie);
  printJson({ ok: true });
}

export async function runSnapshot(cmd: SnapshotCmd, store: SessionStore): Promise<void> {
  const hello = await withSession(cmd.opts, store, async (client) => client.hello());
  printJson(hello.snapshot);
}

/** `hello()` の応答を待ってから、以後のイベントを流し続ける（Ctrl-C か切断まで。design「`watch`」節）。 */
function watchEvents(client: SodaClient, json: boolean): Promise<never> {
  client.onEvent((evt: ServerEvent) => {
    if (json) {
      printLine(JSON.stringify(evt));
    } else {
      printLine(`${new Date().toISOString()} ${evt.event} ${JSON.stringify(evt.data)}`);
    }
  });
  return new Promise<never>((_resolve, reject) => {
    client.onClose((_code, reason) => {
      reject(new RpcFailure("connection_closed", `server closed the connection: ${reason || "(no reason given)"}`));
    });
  });
}

export async function runWatch(cmd: WatchCmd, store: SessionStore): Promise<void> {
  await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    await watchEvents(client, cmd.json);
  });
}
