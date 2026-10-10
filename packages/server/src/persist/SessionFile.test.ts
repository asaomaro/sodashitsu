import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./atomicFile.js";
import { FsSessionFile, type SessionFileData } from "./SessionFile.js";

function sample(): SessionFileData {
  return {
    schema: 1,
    savedAt: "2026-09-18T10:00:00Z",
    groups: [],
    workspaces: [
      {
        id: "w1",
        label: "api",
        cwd: "/home/u/api",
        activeTabId: "t1",
        tabs: [
          {
            id: "t1",
            label: "agents",
            focusedPaneId: "p1",
            zoomedPaneId: null,
            layout: { type: "pane", paneId: "p1" },
            panes: [{ id: "p1", label: null, cwd: "/home/u/api", shell: "/bin/bash" }],
          },
        ],
      },
    ],
    focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
  };
}

describe("FsSessionFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-session-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports missing before the first save", async () => {
    const file = new FsSessionFile(dir);
    const result = await file.load();
    expect(result.kind).toBe("missing");
  });

  it("round-trips a saved session", async () => {
    const file = new FsSessionFile(dir);
    const data = sample();
    await file.save(data);
    const result = await file.load();
    expect(result).toEqual({ kind: "ok", data });
  });

  it("UUID の id（workspace・tab・pane・グループ）はそのまま往復し、保存に採番の続き（nextId）は書かない", async () => {
    const file = new FsSessionFile(dir);
    const [w, t, p, g] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const data: SessionFileData = {
      ...sample(),
      groups: [{ id: g, label: "g", collapsed: false }],
      workspaces: [
        {
          id: w,
          label: "api",
          cwd: "/home/u/api",
          groupId: g,
          activeTabId: t,
          tabs: [{ id: t, label: "1", focusedPaneId: p, zoomedPaneId: null, layout: { type: "pane", paneId: p }, panes: [{ id: p, label: null, cwd: "/home/u/api", shell: "/bin/bash" }] }],
        },
      ],
      focus: { workspaceId: w, tabId: t, paneId: p },
    };
    await file.save(data);
    const raw = JSON.parse(await readFile(join(dir, "session.json"), "utf8")) as Record<string, unknown>;
    expect(raw["nextId"]).toBeUndefined();
    expect(await file.load()).toEqual({ kind: "ok", data });
  });

  // 20260921-workspace-auto-label：名前が自動かの印は任意の項目。以前の版の保存（印が無い）も読める。
  it("workspace の autoLabel は有っても無くても読め、そのまま往復する", async () => {
    const file = new FsSessionFile(dir);
    const data = sample();
    const withFlag: SessionFileData = { ...data, workspaces: [{ ...data.workspaces[0]!, autoLabel: true }] };
    await file.save(withFlag);
    expect(await file.load()).toEqual({ kind: "ok", data: withFlag });
    await file.save(data); // 以前の版の形（印が無い）
    expect(await file.load()).toEqual({ kind: "ok", data });
  });

  // 20260923-workspace-grouping：手動グループと groupId が往復する。
  it("手動グループと workspace の groupId が往復する", async () => {
    const file = new FsSessionFile(dir);
    const data = sample();
    const withGroup: SessionFileData = {
      ...data,
      groups: [{ id: "g1", label: "backend", collapsed: true }],
      workspaces: [{ ...data.workspaces[0]!, groupId: "g1" }],
    };
    await file.save(withGroup);
    expect(await file.load()).toEqual({ kind: "ok", data: withGroup });
  });

  // 以前の版の保存には groups・workspace.groupId のいずれも無い——読めて、既定値で埋まる
  // （`autoLabel` と同じ「optional 追加」方式。20260923-workspace-grouping）。
  it("groups・groupId が無い以前の版のファイルも読め、既定値で埋まる", async () => {
    const file = new FsSessionFile(dir);
    const { writeFileAtomic } = await import("./atomicFile.js");
    const { join } = await import("node:path");
    const legacy = {
      schema: 1,
      savedAt: "2026-09-18T10:00:00Z",
      workspaces: [
        {
          id: "w1",
          label: "api",
          cwd: "/home/u/api",
          activeTabId: "t1",
          tabs: [{ id: "t1", label: "agents", focusedPaneId: "p1", zoomedPaneId: null, layout: { type: "pane", paneId: "p1" }, panes: [{ id: "p1", label: null, cwd: "/home/u/api", shell: "/bin/bash" }] }],
          // groupId が無い
        },
      ],
      // groups が無い
      focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    };
    await writeFileAtomic(join(dir, "session.json"), JSON.stringify(legacy));
    const result = await file.load();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.groups).toEqual([]);
    expect(result.data.workspaces[0]!.groupId).toBeUndefined();
  });

  // 20261004-group-worktree-items（T9）：layout・repoGroups・repoKey・isLinkedWorktree は optional（版は 1 のまま）。
  it("layout・repoGroups・workspace の repoKey／isLinkedWorktree が往復し、repoKey の null（管理外）と無い（未確定）が区別される", async () => {
    const file = new FsSessionFile(dir);
    const data = sample();
    const ws = data.workspaces[0]!;
    const withLayout: SessionFileData = {
      ...data,
      groups: [{ id: "g1", label: "backend", collapsed: false }],
      layout: { top: ["g:g1", "u"], groups: { g1: ["r:/r/.git"] }, ungrouped: ["w:w2"] },
      repoGroups: { "/r/.git": "g1", "/closed/.git": "g1" },
      workspaces: [
        { ...ws, groupId: "g1", repoKey: "/r/.git", isLinkedWorktree: true, worktreeKey: "/r/.git/worktrees/wt", representative: true },
        { ...ws, id: "w2", repoKey: null },
        { ...ws, id: "w3" },
      ],
    };
    await file.save(withLayout);
    const result = await file.load();
    expect(result).toEqual({ kind: "ok", data: withLayout });
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.workspaces.map((w) => w.repoKey)).toEqual(["/r/.git", null, undefined]);
    expect(result.data.workspaces.map((w) => w.worktreeKey)).toEqual(["/r/.git/worktrees/wt", undefined, undefined]);
    expect(result.data.workspaces.map((w) => w.representative)).toEqual([true, undefined, undefined]);
  });

  it("古い版が読める形: 新しい項目を落としても、残りは以前のスキーマで読める（版は 1 のまま・追加は optional だけ）", async () => {
    const { writeFileAtomic } = await import("./atomicFile.js");
    const { join } = await import("node:path");
    const file = new FsSessionFile(dir);
    const data = sample();
    await file.save({
      ...data,
      layout: { top: ["u"], groups: {}, ungrouped: ["w:w1"] },
      repoGroups: { "/r/.git": "g1" },
      workspaces: [{ ...data.workspaces[0]!, repoKey: "/r/.git", isLinkedWorktree: false, worktreeKey: "/r/.git" }],
    });
    // 以前の版（z.object の既定＝知らない項目を落とす）と同じ読み方で、新しい項目を落とした形が元の形と一致する。
    const raw = JSON.parse(await readFile(join(dir, "session.json"), "utf8")) as Record<string, unknown>;
    expect(raw["schema"]).toBe(1);
    const rest = { ...raw };
    delete rest["layout"];
    delete rest["repoGroups"];
    const ws = (rest["workspaces"] as Record<string, unknown>[]).map((w) => {
      const copy = { ...w };
      delete copy["repoKey"];
      delete copy["isLinkedWorktree"];
      delete copy["worktreeKey"];
      delete copy["representative"];
      return copy;
    });
    await writeFileAtomic(join(dir, "session.json"), JSON.stringify({ ...rest, workspaces: ws }));
    expect(await file.load()).toEqual({ kind: "ok", data });
  });

  // 追補 01（D28）: 形が合わない `layout`（`ungrouped` が無い追補の前の途中の形・壊れた形）は、保存全体を壊れた扱いにせず `layout` だけ捨てる。
  // 復元は `layout` が無い保存と同じ仮の状態（`groupId`・`repoKey` から導く）から始まり、`repoGroups` は読まない。
  it.each([
    ["ungrouped が無い途中の形", { top: ["w:w1", "g:g1"], groups: { g1: [] } }],
    ["top が配列でない", { top: "x", groups: {}, ungrouped: [] }],
    ["配列でも object でもない", 5],
  ])("layout が壊れた形・旧形（%s）なら layout だけ捨て、残りは読める", async (_name, layout) => {
    const { writeFileAtomic } = await import("./atomicFile.js");
    const { join } = await import("node:path");
    const file = new FsSessionFile(dir);
    const data = sample();
    await writeFileAtomic(join(dir, "session.json"), JSON.stringify({ ...data, layout, repoGroups: { "/r/.git": "g1" } }));
    const result = await file.load();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.layout).toBeUndefined();
    expect(result.data.workspaces).toEqual(data.workspaces);
  });

  // review-findings-01 の 5: `repoGroups` の形が合わなくても、`layout` と同じく捨てるだけ（保存全体は壊れた扱いにしない）。
  it.each([
    ["配列", ["a"]],
    ["値が文字列でない", { "/r/.git": 5 }],
    ["文字列", "x"],
  ])("repoGroups が壊れた形（%s）なら repoGroups だけ捨て、残りは読める", async (_name, repoGroups) => {
    const { writeFileAtomic } = await import("./atomicFile.js");
    const { join } = await import("node:path");
    const file = new FsSessionFile(dir);
    const data = sample();
    await writeFileAtomic(join(dir, "session.json"), JSON.stringify({ ...data, layout: { top: ["u"], groups: {}, ungrouped: ["w:w1"] }, repoGroups }));
    const result = await file.load();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.repoGroups).toBeUndefined();
    expect(result.data.layout).toEqual({ top: ["u"], groups: {}, ungrouped: ["w:w1"] });
    expect(result.data.workspaces).toEqual(data.workspaces);
  });

  it("pane の会話の参照の履歴（agentSessionHistory）が往復し、無い古い保存もそのまま読める（20261009-agent-session-attribution）", async () => {
    const file = new FsSessionFile(dir);
    const data = sample();
    const pane = data.workspaces[0]!.tabs[0]!.panes[0]!;
    pane.agentSession = { kind: "claude", sessionId: "s-new", reportedAt: 3 };
    pane.agentSessionHistory = [
      { kind: "claude", sessionId: "s-prev", reportedAt: 2 },
      { kind: "claude", sessionId: "s-old", reportedAt: 1 },
    ];
    await file.save(data);
    expect(await file.load()).toEqual({ kind: "ok", data });
    // 履歴の無い保存（これまでの版）
    delete pane.agentSessionHistory;
    await file.save(data);
    const again = await file.load();
    expect(again.kind).toBe("ok");
    if (again.kind === "ok") expect(again.data.workspaces[0]!.tabs[0]!.panes[0]!.agentSessionHistory).toBeUndefined();
  });

  it("reports corrupt for an unsupported schema version", async () => {
    const file = new FsSessionFile(dir);
    // 直接壊れたスキーマを書き込む（将来のバージョンからの読み込みなど）。
    const { writeFileAtomic } = await import("./atomicFile.js");
    const { join } = await import("node:path");
    await writeFileAtomic(join(dir, "session.json"), JSON.stringify({ schema: 99, workspaces: [] }));
    const result = await file.load();
    expect(result.kind).toBe("corrupt");
  });
});
