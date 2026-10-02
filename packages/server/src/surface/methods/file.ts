import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  FileInfoParams,
  FileOpenParams,
  FileReadParams,
  FileResolveParams,
  FileUploadBeginParams,
  FileUploadCancelParams,
  FileUploadChunkParams,
  FileUploadCommitParams,
  RpcError,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 端末のファイルのリンクとドロップ（`@sodashitsu/protocol` の `file.ts`）。ブラウザ版はローカルのファイルに直接触れないので、リンクのクリックは
 * 「サーバのマシンのアプリで開く」（同じマシン）か「分けて受け取ってダウンロード」（別のマシン）、ドロップは「元のパスを確かめて貼る」か
 * 「分けて送って置いた先のパスを貼る」。どちらにするかはブラウザが `file.info` と設定から決める。`deps.files` が無ければ登録しない。
 */
export function registerFileMethods(surface: ControlSurface, deps: MethodDeps): void {
  const files = deps.files;
  if (!files) return;
  surface.register("file.info", {
    schema: FileInfoParams,
    handler: (ctx) => ({ sameMachine: ctx.sameMachine === true, canOpen: files.opener.available() }),
  });
  surface.register("file.resolve", {
    schema: FileResolveParams,
    handler: async (_ctx, params) => ({ files: await files.access.resolve(params.paneId, params.paths) }),
  });
  surface.register("file.open", {
    schema: FileOpenParams,
    handler: async (_ctx, params) => {
      if (!isAbsolute(params.path)) throw new RpcError("invalid_params", "path must be absolute");
      // リンクを辿った先を開く（実行になる種類かは、辿った先の名前で見る）。
      const real = await realpath(params.path).catch(() => null);
      const st = real === null ? null : await stat(real).catch(() => null);
      if (real === null || !st || (!st.isFile() && !st.isDirectory())) throw new RpcError("file_not_found", "no such file");
      await files.opener.open(real, { isFile: st.isFile(), mode: st.mode });
      return {};
    },
  });
  surface.register("file.read", {
    schema: FileReadParams,
    handler: (_ctx, params) => files.access.read(params.path, params.offset),
  });
  surface.register("file.upload.begin", {
    schema: FileUploadBeginParams,
    handler: (ctx, params) => files.uploads.begin(ctx.clientId, params),
  });
  surface.register("file.upload.chunk", {
    schema: FileUploadChunkParams,
    handler: async (ctx, params) => {
      await files.uploads.chunk(ctx.clientId, params);
      return {};
    },
  });
  surface.register("file.upload.commit", {
    schema: FileUploadCommitParams,
    handler: (ctx, params) => files.uploads.commit(ctx.clientId, params.uploadId),
  });
  surface.register("file.upload.cancel", {
    schema: FileUploadCancelParams,
    handler: (ctx, params) => {
      files.uploads.cancel(ctx.clientId, params.uploadId);
      return {};
    },
  });
}
