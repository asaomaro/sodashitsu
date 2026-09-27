import { describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import type { HandoffPane, TakenHandoff } from "./HandoffManifest.js";
import {
  adoptedSpecsOf,
  discardHandedOffPanes,
  discardRejectedPanes,
  finishTakenHandoff,
} from "./startup.js";

const pane = (paneId: string, fd: number, pid: number): HandoffPane => ({
  paneId,
  fd,
  pid,
  cols: 80,
  rows: 24,
  screen: `s-${paneId}`,
});

function taken(
  panes: HandoffPane[],
  rejected: HandoffPane[] = [],
): Extract<TakenHandoff, { kind: "taken" }> {
  return {
    kind: "taken",
    id: "abcd",
    port: 7780,
    panes,
    rejected,
    rejectReason: rejected.length > 0 ? "not a pty master" : undefined,
    scrollbackEditors: [],
  };
}

describe("起動時の引き継ぎの後始末（20260926-live-handoff）", () => {
  it("adoptedSpecsOf は pane の id → PTY の対応にする", () => {
    expect([...adoptedSpecsOf(taken([pane("p1", 20, 501)])).entries()]).toEqual([
      ["p1", { fd: 20, pid: 501, cols: 80, rows: 24, screen: "s-p1" }],
    ]);
  });

  it("使わなかった pane は fd を閉じて SIGHUP。確かめに通らなかった pane は数えるだけ（呼び出し側が先に手放している）", () => {
    const closed: number[] = [];
    const killed: [number, string][] = [];
    const logger = new MemoryLogger();
    const result = finishTakenHandoff(
      taken([pane("p1", 20, 501), pane("p2", 21, 502)], [pane("p3", 22, 503)]),
      new Set(["p1"]),
      {
        logger,
        closeFd: (fd) => closed.push(fd),
        kill: (pid, sig) => killed.push([pid, sig]),
        isPtyMaster: (fd) => fd === 22,
      },
    );
    expect(result).toEqual({ id: "abcd", adopted: 1, dropped: 2 });
    expect(closed).toEqual([21]);
    expect(killed).toEqual([[502, "SIGHUP"]]);
    expect(logger.lines.map((l) => l.level)).toEqual(["warn", "warn", "info"]);
  });

  it("discardRejectedPanes は PTY の master の fd だけを閉じ、シグナルは送らない（番号・pid が別のものに再利用されているかもしれない）", () => {
    const closed: number[] = [];
    const killed: number[] = [];
    discardRejectedPanes([pane("p3", 22, 503), pane("p4", 23, 504)], {
      logger: new MemoryLogger(),
      closeFd: (fd) => closed.push(fd),
      kill: (pid) => killed.push(pid),
      isPtyMaster: (fd) => fd === 22,
    });
    expect(closed).toEqual([22]);
    expect(killed).toEqual([]);
  });

  it("全部使えば何も閉じない", () => {
    const closed: number[] = [];
    const result = finishTakenHandoff(taken([pane("p1", 20, 501)]), new Set(["p1"]), {
      logger: new MemoryLogger(),
      closeFd: (fd) => closed.push(fd),
      kill: () => undefined,
    });
    expect(result).toEqual({ id: "abcd", adopted: 1, dropped: 0 });
    expect(closed).toEqual([]);
  });

  it("session.json を読めなかった（adoptedPaneIds が空）なら全部を手放す", () => {
    const closed: number[] = [];
    const result = finishTakenHandoff(
      taken([pane("p1", 20, 501), pane("p2", 21, 502)]),
      new Set(),
      {
        logger: new MemoryLogger(),
        closeFd: (fd) => closed.push(fd),
        kill: () => undefined,
      },
    );
    expect(result).toMatchObject({ adopted: 0, dropped: 2 });
    expect(closed.sort()).toEqual([20, 21]);
  });

  it("閉じる・送るが失敗しても続ける", () => {
    const tried: number[] = [];
    expect(() =>
      discardHandedOffPanes([pane("p1", 20, 501), pane("p2", 21, 502)], {
        logger: new MemoryLogger(),
        closeFd: (fd) => {
          tried.push(fd);
          throw new Error("EBADF");
        },
        kill: () => {
          throw new Error("ESRCH");
        },
      }),
    ).not.toThrow();
    expect(tried).toEqual([20, 21]);
  });
});
