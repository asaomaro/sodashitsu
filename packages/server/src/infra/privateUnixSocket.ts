import { chmod, mkdtemp, rename, rm } from "node:fs/promises";
import type { Server } from "node:net";
import { dirname, join } from "node:path";

export interface PrivateUnixSocketOptions {
  /** 一時ディレクトリの名前の頭（`path` と同じディレクトリに作る）。既定は `.s-`。 */
  tmpPrefix?: string;
}

/**
 * Unix ドメイン socket を **0600 になってから見える場所に置く**（20261003-sodactl-ask-socket の design「0600 になってから見える場所に置く」。
 * 手順は `machine/BridgeEndpoint.ts` の `listen` と同じ）: `path` と同じディレクトリに 0700 の一時ディレクトリを作り、その中で待ち受けて
 * 0600 にし、それから `path` へ rename する。待ち受けと chmod の間に、そのディレクトリを読める別の利用者（umask で group に開いている等）が
 * 繋げる窓を作らない。
 *
 * - rename は `path` に残っていた古いファイル（前回の不正終了の残骸・execve で入れ替わる前の版の socket）を置き換える（unlink は要らない）。
 * - 失敗したら待ち受けを閉じ、一時ディレクトリを消して投げる（`path` には触れていない）。
 * - 待ち受けたのは rename の前のパスなので、`server.close()` は `path` のファイルを消さない。**閉じる側が `path` を自分で消す**。
 * - 既に待ち受けている `server` を渡したら、何にも触れずに投げる（呼び出し側の待ち受けを閉じない）。
 * - Windows では使わない（名前付きパイプに権限・rename の話が当てはまらない。呼び出し側が判断する）。
 */
export async function listenPrivateUnixSocket(
  server: Server,
  path: string,
  options: PrivateUnixSocketOptions = {},
): Promise<void> {
  if (server.listening) throw new Error("the server is already listening");
  const tmpDir = await mkdtemp(join(dirname(path), options.tmpPrefix ?? ".s-")); // 0700
  const tmpPath = join(tmpDir, "s"); // 短い名前（socket のパスの長さの上限に近づけない）
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(tmpPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, path);
  } catch (err) {
    // 待ち受ける前に失敗していたら `close` は ERR_SERVER_NOT_RUNNING をコールバックへ渡すだけ（投げない）。
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
  await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
}
