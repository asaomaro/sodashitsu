import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import type { TuiTarget } from "../types.js";

/**
 * 結合テスト用の実物のサーバ（乱数ポート・一時の状態ディレクトリ。server の `*.integration.test.ts` と同じ形）と、そこへ繋ぐ `TuiTarget`
 * （ローカルログイン：`local-auth.json` の秘密で `POST /api/local-login`。server の `findOrStart` がする手順と同じ）。
 */
export interface LocalServer {
  server: ComposedServer;
  stateDir: string;
  target: TuiTarget;
  close(): Promise<void>;
}

export async function startLocalServer(): Promise<LocalServer> {
  const dir = await mkdtemp(join(tmpdir(), "soda-tui-it-"));
  const stateDir = join(dir, "state");
  const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
  const baseUrl = `http://127.0.0.1:${server.options.port}`;
  const target: TuiTarget = {
    baseUrl,
    origin: baseUrl,
    stateDir,
    login: async () => {
      const auth = JSON.parse(await readFile(join(stateDir, "local-auth.json"), "utf8")) as {
        secret: string;
      };
      const res = await fetch(`${baseUrl}/api/local-login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: baseUrl,
          host: new URL(baseUrl).host,
        },
        body: JSON.stringify({ secret: auth.secret }),
      });
      const cookie = res.headers.get("set-cookie")?.split(";")[0];
      if (res.status !== 204 || !cookie) throw new Error(`local login failed: HTTP ${res.status}`);
      return cookie;
    },
  };
  return {
    server,
    stateDir,
    target,
    close: async () => {
      await server.close();
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}
