import { afterEach, expect, it } from "vitest";
import { chooseFolderSource, droppedFolderSource, type DroppedEntry } from "./folderSource.js";
afterEach(() => {
  Reflect.deleteProperty(window, "showDirectoryPicker");
});
it("collects a picked folder with Unicode names, nested files and empty dirs", async () => {
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: async () => ({
      kind: "directory",
      name: "資料",
      async *values() {
        yield { kind: "directory", name: "empty", async *values() {} };
        yield {
          kind: "directory",
          name: "nested",
          async *values() {
            yield {
              kind: "file",
              name: "本文.txt",
              getFile: async () => new File(["generated"], "本文.txt"),
            };
          },
        };
      },
    }),
  });
  const result = await chooseFolderSource();
  expect(result.name).toBe("資料");
  expect(result.entries).toEqual([
    { path: "empty", directory: true },
    { path: "nested", directory: true },
    { path: "nested/本文.txt", directory: false, bytes: 9 },
  ]);
  expect(result.files[0]!.path).toBe("nested/本文.txt");
});
it("reads all drag entry batches, including empty dirs", async () => {
  const leaf = (name: string): DroppedEntry => ({
    name,
    isDirectory: false,
    isFile: true,
    file: (ok) => ok(new File(["x"], name)),
  });
  const empty: DroppedEntry = {
    name: "empty",
    isDirectory: true,
    isFile: false,
    createReader: () => ({ readEntries: (ok) => ok([]) }),
  };
  const root: DroppedEntry = {
    name: "drop",
    isDirectory: true,
    isFile: false,
    createReader: () => {
      let batch = 0;
      return {
        readEntries: (ok) =>
          ok(batch++ === 0 ? [empty, leaf("one")] : batch === 2 ? [leaf("two")] : []),
      };
    },
  };
  const result = await droppedFolderSource(root);
  expect(result.entries).toEqual([
    { path: "empty", directory: true },
    { path: "one", directory: false, bytes: 1 },
    { path: "two", directory: false, bytes: 1 },
  ]);
});
it("rejects a source exceeding the aggregate byte bound before reading file data", async () => {
  const file = new File([], "huge");
  Object.defineProperty(file, "size", { value: 104857601 });
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: async () => ({
      kind: "directory",
      name: "source",
      async *values() {
        yield { kind: "file", name: "huge", getFile: async () => file };
      },
    }),
  });
  await expect(chooseFolderSource()).rejects.toThrow("100MiB");
});
it("offers D&D when the browser has no directory picker", async () => {
  await expect(chooseFolderSource()).rejects.toThrow("ドロップ");
});
