import { expect, it } from "vitest";
import {
  DesktopFolderManifest,
  DesktopFolderPath,
  DesktopFolderRequest,
} from "./desktopFolders.js";
it.each([
  "../escape",
  "a/../x",
  "C:/x",
  "/root",
  "a\\b",
  "a//b",
  "x/CON.txt",
  "x/aux",
  "a/last.",
  "a/end ",
  ".soda-transfer-secret",
  "a/../",
  Array(34).fill("d").join("/"),
])("rejects nonportable or escaping folder path %s", (path) => {
  expect(DesktopFolderPath.safeParse(path).success).toBe(false);
});
it("requires exact declared parents, unique portable paths, finite size and manifest length", () => {
  for (const entries of [
    [{ path: "a/x", directory: false, bytes: 0 }],
    [
      { path: "a", directory: true },
      { path: "A/x", directory: false, bytes: 0 },
    ],
    [
      { path: "a", directory: true },
      { path: "A", directory: true },
    ],
    [
      { path: "x", directory: false, bytes: 104857600 },
      { path: "y", directory: false, bytes: 1 },
    ],
    Array.from({ length: 1001 }, (_, i) => ({ path: `a-${i}`, directory: true })),
    Array.from({ length: 300 }, (_, i) => ({ path: `${i}-` + "x".repeat(200), directory: true })),
  ])
    expect(DesktopFolderManifest.safeParse(entries).success).toBe(false);
  expect(
    DesktopFolderManifest.parse([
      { path: "資料", directory: true },
      { path: "資料/empty", directory: true },
      { path: "資料/表.xlsx", directory: false, bytes: 10 },
    ]),
  ).toHaveLength(3);
});
it("accepts an empty folder and requires fresh UUIDs on starts", () => {
  expect(DesktopFolderManifest.parse([])).toEqual([]);
  expect(
    DesktopFolderRequest.safeParse({
      action: "folder_upload_start",
      parent: "",
      name: "empty",
      entries: [],
    }).success,
  ).toBe(false);
});
