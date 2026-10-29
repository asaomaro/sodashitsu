import { z } from "zod";
import { lstat, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { DesktopFolderManifest, DesktopFolderPath } from "@sodashitsu/protocol";
import { FileTransferSnapshot, FileTransferSourceSnapshot } from "../work/FileTransfer.js";
import { folderIdentity, directoryGuard, inside } from "../work/files.js";
import { openVerified, readRange } from "../agent/safeFile.js";

const SHA = z.string().regex(/^[a-f0-9]{64}$/);
const Count = z.number().int().min(0).max(104857600);
const Rel = z.union([z.literal(""), DesktopFolderPath]);
export const FolderDirectorySnapshot = z
  .object({
    path: Rel,
    identity: SHA,
    mtimeNs: z.string().regex(/^\d+$/).max(32).optional(),
    ctimeNs: z.string().regex(/^\d+$/).max(32).optional(),
  })
  .strict();
export type FolderDirectorySnapshot = z.infer<typeof FolderDirectorySnapshot>;
const FileState = z
  .object({
    path: DesktopFolderPath,
    bytes: Count,
    offset: Count,
    done: z.boolean(),
    temporary: FileTransferSnapshot.optional(),
    sha256: SHA.optional(),
    committing: z.boolean().optional(),
    source: FileTransferSourceSnapshot.optional(),
  })
  .strict()
  .refine(
    (f) =>
      f.offset <= f.bytes &&
      (f.offset === 0 || !!f.temporary) &&
      (!f.source || (f.source.path === f.path && f.source.bytes === f.bytes)) &&
      (!f.done || (f.offset === f.bytes && !!f.temporary && !!f.sha256 && !!f.source)) &&
      (!f.committing || (!!f.temporary && !!f.sha256 && f.offset === f.bytes)) &&
      (!f.temporary ||
        (f.temporary.path === f.path &&
          f.temporary.bytes === f.bytes &&
          f.temporary.offset === f.offset)),
  );
export const DesktopFolderSnapshot = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    upload: z.boolean(),
    approvedIdentity: SHA,
    destination: Rel.optional(),
    directories: z.array(FolderDirectorySnapshot).max(1001),
    files: z.array(FileState).max(1000),
    bytes: Count,
    offset: Count,
    complete: z.boolean(),
    download: z
      .object({
        source: DesktopFolderPath,
        directories: z.array(FolderDirectorySnapshot).max(1001),
        files: z.array(FileTransferSourceSnapshot).max(1000),
        scratch: z.string().regex(/^\.folder-[A-Za-z0-9_-]{6}$/),
        scratchIdentity: SHA,
        archive: FileTransferSourceSnapshot,
        sha256: SHA,
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    let valid = s.offset <= s.bytes;
    if (s.upload) {
      valid &&=
        !!s.destination && !s.download && s.directories.length > 0 && s.directories[0]?.path === "";
      valid &&= s.files.reduce((n, f) => n + f.bytes, 0) === s.bytes;
      valid &&= s.files.reduce((n, f) => n + f.offset, 0) === s.offset;
      valid &&= !s.complete || s.files.every((f) => f.done);
      valid &&= DesktopFolderManifest.safeParse([
        ...s.directories
          .filter((d) => d.path !== "")
          .map((d) => ({ path: d.path, directory: true as const })),
        ...s.files.map((f) => ({ path: f.path, directory: false as const, bytes: f.bytes })),
      ]).success;
    } else {
      valid &&=
        !!s.download && s.destination === undefined && !s.directories.length && !s.files.length;
      valid &&= s.download?.archive.path === "folder.zip" && s.download.archive.bytes === s.bytes;
      valid &&= s.offset === s.bytes || s.offset % 65536 === 0;
      if (s.download)
        valid &&= DesktopFolderManifest.safeParse([
          ...s.download.directories
            .filter((d) => d.path !== "")
            .map((d) => ({ path: d.path, directory: true as const })),
          ...s.download.files.map((f) => ({
            path: f.path,
            directory: false as const,
            bytes: f.bytes,
          })),
        ]).success;
    }
    if (!valid) ctx.addIssue({ code: "custom", message: "保存されたフォルダ転送が不正です" });
  });
export type DesktopFolderSnapshot = z.infer<typeof DesktopFolderSnapshot>;

export async function folderPath(root: string, part: string): Promise<string> {
  Rel.parse(part);
  const path = resolve(root, part);
  if (!inside(root, path) || (await realpath(root)) !== root || (await realpath(path)) !== path)
    throw Error("フォルダの場所が変更されました");
  return path;
}
export async function directorySnapshot(
  root: string,
  path: string,
  content = false,
): Promise<FolderDirectorySnapshot> {
  await directoryGuard(path);
  const st = await lstat(path, { bigint: true });
  return FolderDirectorySnapshot.parse({
    path: relative(root, path).split("\\").join("/"),
    identity: await folderIdentity(path),
    ...(content ? { mtimeNs: st.mtimeNs.toString(), ctimeNs: st.ctimeNs.toString() } : {}),
  });
}
export async function verifyDirectory(root: string, saved: FolderDirectorySnapshot) {
  const path = await folderPath(root, saved.path),
    current = await directorySnapshot(root, path, saved.mtimeNs !== undefined);
  if (JSON.stringify(current) !== JSON.stringify(saved))
    throw Error("フォルダの実体または内容が変更されました");
  return path;
}
const fileIdentity = (st: { dev: bigint; ino: bigint; birthtimeNs: bigint }) =>
  `${st.dev}:${st.ino}:${st.birthtimeNs}`;
/** Exact source identity using a held, non-following, non-blocking regular FD. */
export async function openFolderSource(root: string, part: string) {
  DesktopFolderPath.parse(part);
  const path = resolve(root, part),
    parent = await folderPath(root, relative(root, dirname(path)).split("\\").join("/"));
  const check = await directoryGuard(parent),
    opened = await openVerified(path);
  if (!opened) throw Error("通常のファイルだけを復元できます");
  try {
    const fd = opened.fd,
      st = await fd.stat({ bigint: true }),
      named = await lstat(path, { bigint: true });
    if (
      named.isSymbolicLink() ||
      !named.isFile() ||
      named.nlink !== 1n ||
      !st.isFile() ||
      st.nlink !== 1n ||
      fileIdentity(st) !== fileIdentity(named)
    )
      throw Error("ファイルの実体が変更されました");
    const source = FileTransferSourceSnapshot.parse({
      version: 1,
      path: part,
      rootIdentity: await folderIdentity(root),
      parentIdentity: await folderIdentity(parent),
      fileIdentity: fileIdentity(st),
      bytes: Number(st.size),
      mtimeNs: st.mtimeNs.toString(),
      ctimeNs: st.ctimeNs.toString(),
    });
    const verify = async () => {
      await check();
      const current = await fd.stat({ bigint: true }),
        named = await lstat(path, { bigint: true });
      if (
        named.isSymbolicLink() ||
        !named.isFile() ||
        named.nlink !== 1n ||
        current.nlink !== 1n ||
        fileIdentity(named) !== source.fileIdentity ||
        fileIdentity(current) !== source.fileIdentity ||
        current.size !== st.size ||
        current.mtimeNs !== st.mtimeNs ||
        current.ctimeNs !== st.ctimeNs ||
        (await folderIdentity(root)) !== source.rootIdentity
      )
        throw Error("ファイルの実体または内容が変更されました");
    };
    await verify();
    return { fd, source, verify };
  } catch (error) {
    await opened.fd.close();
    throw error;
  }
}
export async function fileSnapshot(
  root: string,
  path: string,
): Promise<FileTransferSourceSnapshot> {
  const file = await openFolderSource(root, path);
  try {
    return file.source;
  } finally {
    await file.fd.close();
  }
}
export async function verifyFolderSource(
  root: string,
  saved: FileTransferSourceSnapshot,
  sha256?: string,
  guard: () => Promise<void> = async () => {},
  fence: () => void = () => {},
) {
  const file = await openFolderSource(root, saved.path);
  try {
    if (JSON.stringify(file.source) !== JSON.stringify(saved))
      throw Error("保存された取得元が変更されました");
    if (sha256) {
      const hash = createHash("sha256");
      for (let at = 0; at < saved.bytes; at += 65536) {
        await guard();
        const data = await readRange(file.fd, at, Math.min(65536, saved.bytes - at));
        if (data.length !== Math.min(65536, saved.bytes - at))
          throw Error("保存されたファイルが短くなりました");
        hash.update(data);
      }
      if (hash.digest("hex") !== sha256) throw Error("保存されたファイルのSHA-256が一致しません");
    }
    await file.verify();
    await guard();
    fence();
    return file;
  } catch (error) {
    await file.fd.close();
    throw error;
  }
}
