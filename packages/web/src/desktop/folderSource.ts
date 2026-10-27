import {
  DesktopFolderManifest,
  DesktopFolderName,
  DesktopFolderPath,
  DESKTOP_FOLDER_MAX_BYTES,
  DESKTOP_FOLDER_MAX_ENTRIES,
  type DesktopFolderEntry,
} from "@sodashitsu/protocol";
export type FolderSource = {
  name: string;
  entries: DesktopFolderEntry[];
  files: Array<{ path: string; file: File }>;
};
type Directory = { kind: "directory"; name: string; values(): AsyncIterable<Directory | Leaf> };
type Leaf = { kind: "file"; name: string; getFile(): Promise<File> };
export type DroppedEntry = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  createReader?(): {
    readEntries(ok: (entries: DroppedEntry[]) => void, fail: (e: unknown) => void): void;
  };
  file?(ok: (file: File) => void, fail: (e: unknown) => void): void;
};
function collector(name: string) {
  const source: FolderSource = { name: DesktopFolderName.parse(name), entries: [], files: [] };
  let bytes = 0;
  const add = (path: string, file?: File) => {
    DesktopFolderPath.parse(path);
    if (source.entries.length >= DESKTOP_FOLDER_MAX_ENTRIES)
      throw Error("フォルダは1000項目までです");
    if (file) {
      bytes += file.size;
      if (bytes > DESKTOP_FOLDER_MAX_BYTES) throw Error("フォルダは合計100MiBまでです");
      source.entries.push({ path, directory: false, bytes: file.size });
      source.files.push({ path, file });
    } else source.entries.push({ path, directory: true });
  };
  return {
    source,
    add,
    finish: () => {
      DesktopFolderManifest.parse(source.entries);
      return source;
    },
  };
}
export async function chooseFolderSource(): Promise<FolderSource> {
  const pick = (
    window as unknown as { showDirectoryPicker?: (options: { mode: "read" }) => Promise<Directory> }
  ).showDirectoryPicker;
  if (!pick)
    throw Error("このブラウザではフォルダ選択を使えません。フォルダをこの窓へドロップしてください");
  const root = await pick.call(window, { mode: "read" }),
    c = collector(root.name);
  const walk = async (dir: Directory, prefix: string) => {
    for await (const entry of dir.values()) {
      const path = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.kind === "directory") {
        c.add(path);
        await walk(entry, path);
      } else c.add(path, await entry.getFile());
    }
  };
  await walk(root, "");
  return c.finish();
}
export async function droppedFolderSource(root: DroppedEntry): Promise<FolderSource> {
  const c = collector(root.name);
  const walk = async (dir: DroppedEntry, prefix: string) => {
    if (!dir.isDirectory || !dir.createReader) throw Error("フォルダを読み込めません");
    const reader = dir.createReader();
    for (;;) {
      const batch = await new Promise<DroppedEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (!batch.length) break;
      for (const entry of batch) {
        const path = prefix ? prefix + "/" + entry.name : entry.name;
        if (entry.isDirectory) {
          c.add(path);
          await walk(entry, path);
        } else if (entry.isFile && entry.file) {
          const file = await new Promise<File>((ok, fail) => entry.file!(ok, fail));
          c.add(path, file);
        } else throw Error("通常のファイル・フォルダだけ送信できます");
      }
    }
  };
  await walk(root, "");
  return c.finish();
}
