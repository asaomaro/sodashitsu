import type { HostInfo, ServerEvent } from "@wtm/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "./PersistScheduler.js";
import { NotFoundError, SessionModel } from "./SessionModel.js";
import { SessionService } from "./SessionService.js";

/** 独自トークンの反映（20260927-sidebar-row-tokens の AC1・AC2・AC7。`setWorkspaceTokens`・`setPaneTokens`）。偽物は `SessionService.agentName.test.ts` と同じ。 */

class FakeHost implements TerminalHost {
  readonly pid = 4242;
  constructor(readonly paneId: string) {}
  readonly mirror = {} as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  write(): void {}
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(): void {}
  lastOutputAt(): number {
    return 0;
  }
  onExit(): Disposable {
    return { dispose: () => undefined };
  }
  dispose(): void {}
}

class FakeTerminals implements TerminalManager {
  private readonly hosts = new Map<string, FakeHost>();
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    const host = new FakeHost(paneId);
    this.hosts.set(paneId, host);
    return host;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(): void {}
  dispose(paneId: string): void {
    this.hosts.delete(paneId);
  }
}

class CountingPersist implements PersistScheduler {
  touchCount = 0;
  touch(): void {
    this.touchCount++;
  }
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test-host" };

describe("SessionService — 独自トークン", () => {
  let service: SessionService;
  let persist: CountingPersist;
  let events: ServerEvent[];
  let w1: string;
  let p1: string;

  beforeEach(async () => {
    const bus = new EventBus();
    persist = new CountingPersist();
    service = new SessionService({
      model: new SessionModel(),
      terminals: new FakeTerminals(),
      bus,
      persist,
      serverVersion: "0.1.0-test",
      host: HOST_INFO,
      scrollbackLines: 1000,
      spawnGraceMs: 0,
      defaultCwd: "/home/u",
      logger: new MemoryLogger(),
    });
    const created = await service.createWorkspace("/home/u", "api");
    w1 = created.workspace.id;
    p1 = created.pane.id;
    events = [];
    bus.subscribe((e) => events.push(e));
  });

  it("workspace の tokens を差し替えて workspace.updated で配り、snapshot にも載る。保存はしない", () => {
    const touched = persist.touchCount;
    service.setWorkspaceTokens(w1, { summary: "ok" });
    expect(service.getWorkspace(w1)?.tokens).toEqual({ summary: "ok" });
    expect(events).toEqual([{ event: "workspace.updated", data: { workspace: service.getWorkspace(w1) } }]);
    expect(service.snapshot().workspaces.find((w) => w.id === w1)?.tokens).toEqual({ summary: "ok" });
    expect(persist.touchCount).toBe(touched);
  });

  it("null で tokens の項目ごと消える", () => {
    service.setWorkspaceTokens(w1, { a: "1" });
    service.setWorkspaceTokens(w1, null);
    expect("tokens" in service.getWorkspace(w1)!).toBe(false);
  });

  it("pane の tokens を差し替えて pane.updated で配る。保存はしない", () => {
    const touched = persist.touchCount;
    service.setPaneTokens(p1, { model: "opus" });
    expect(service.getPane(p1)?.tokens).toEqual({ model: "opus" });
    expect(events).toEqual([{ event: "pane.updated", data: { pane: service.getPane(p1) } }]);
    service.setPaneTokens(p1, null);
    expect("tokens" in service.getPane(p1)!).toBe(false);
    expect(persist.touchCount).toBe(touched);
  });

  it("ほかの変更（名前の変更）の後も tokens は残る", () => {
    service.setWorkspaceTokens(w1, { a: "1" });
    service.setPaneTokens(p1, { b: "2" });
    service.renamePane(p1, "x");
    expect(service.getPane(p1)?.tokens).toEqual({ b: "2" });
    expect(service.getPane(p1)?.label).toBe("x");
  });

  it("hasWorkspace・hasPane。無い対象への差し替えは NotFoundError", () => {
    expect(service.hasWorkspace(w1)).toBe(true);
    expect(service.hasWorkspace("w999")).toBe(false);
    expect(service.hasPane(p1)).toBe(true);
    expect(service.hasPane("p999")).toBe(false);
    expect(() => service.setWorkspaceTokens("w999", { a: "1" })).toThrow(NotFoundError);
    expect(() => service.setPaneTokens("p999", { a: "1" })).toThrow(NotFoundError);
  });
});
