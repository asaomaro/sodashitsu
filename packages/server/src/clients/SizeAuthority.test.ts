import { TERMINAL_PALETTES, type HostInfo, type ServerEvent } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { MemoryLogger } from "../log/Logger.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "../session/PersistScheduler.js";
import { SessionModel } from "../session/SessionModel.js";
import { SessionService } from "../session/SessionService.js";
import { DefaultClientRegistry } from "./ClientRegistry.js";
import { DefaultSizeAuthority } from "./SizeAuthority.js";
import { answerPaletteFor } from "./answerPalette.js";

/** 常に成功する、必要最小限の偽の PTY（SizeAuthority の権限ロジックだけを見る）。 */
class AlwaysUpHost implements TerminalHost {
  readonly pid = 1;
  readonly mirror = {} as TerminalHost["mirror"];
  readonly fanout = {} as TerminalHost["fanout"];
  resized: { cols: number; rows: number } | null = null;
  constructor(readonly paneId: string) {}
  write(): void {}
  writeModal(): Promise<void> {
    return Promise.resolve();
  }
  resize(cols: number, rows: number): void {
    this.resized = { cols, rows };
  }
  lastOutputAt(): number {
    return Date.now();
  }
  onExit(): Disposable {
    return { dispose: () => undefined };
  }
  dispose(): void {}
}
class AlwaysUpTerminalManager implements TerminalManager {
  readonly hosts = new Map<string, AlwaysUpHost>();
  create(paneId: string, _opts: CreatePaneOptions): TerminalHost {
    const host = new AlwaysUpHost(paneId);
    this.hosts.set(paneId, host);
    return host;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(paneId: string, cols: number, rows: number): void {
    this.hosts.get(paneId)?.resize(cols, rows);
  }
  dispose(paneId: string): void {
    this.hosts.delete(paneId);
  }
}
class NoopPersist implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}

const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test" };

function makeContext() {
  const terminals = new AlwaysUpTerminalManager();
  const session = new SessionService({
    model: new SessionModel(),
    terminals,
    bus: new EventBus(),
    persist: new NoopPersist(),
    serverVersion: "test",
    host: HOST_INFO,
    scrollbackLines: 1000,
    spawnGraceMs: 1,
    defaultCwd: "/home/u",
    logger: new MemoryLogger(),
  });
  const clients = new DefaultClientRegistry();
  const authority = new DefaultSizeAuthority(clients, session);
  return { terminals, session, clients, authority };
}

describe("DefaultSizeAuthority — taking ownership", () => {
  let ctx: Awaited<ReturnType<typeof makeContext>>;
  beforeEach(async () => {
    ctx = makeContext();
  });

  it("a desktop client claims ownership on interaction and its view size is applied", async () => {
    const { session, clients, authority, terminals } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("desktop");
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 100, rows: 30 }] });

    authority.noteInteraction(client, pane.id);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(client);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
    expect(terminals.hosts.get(pane.id)?.resized).toEqual({ cols: 100, rows: 30 });
  });

  it("a mobile client without fit does not claim ownership", async () => {
    const { session, clients, authority } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("mobile");
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });

    authority.noteInteraction(client, pane.id);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)?.cols).not.toBe(40);
  });

  it("an external client (sodactl) does not claim ownership on interaction, same as a mobile client without fit (20260923-external-control-api D4)", async () => {
    const { session, clients, authority } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("external");
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });

    authority.noteInteraction(client, pane.id);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)?.cols).not.toBe(40);
  });

  it("a mobile client with fit enabled can claim ownership", async () => {
    const { session, clients, authority } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("mobile");
    clients.setFit(client, true);
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });

    authority.noteInteraction(client, pane.id);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(client);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });
  });

  it("onViewChanged claims an unowned tab for the first client that reports a view", async () => {
    const { session, clients, authority } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("desktop");
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 90, rows: 28 }] });

    authority.onViewChanged(client);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(client);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 90, rows: 28 });
  });

  it("onViewChanged does not steal ownership from another client's tab", async () => {
    const { session, clients, authority } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const owner = clients.register("desktop");
    clients.setView(owner, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 80, rows: 24 }] });
    authority.onViewChanged(owner);

    const other = clients.register("desktop");
    clients.setView(other, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 200, rows: 60 }] });
    authority.onViewChanged(other);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(owner);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 80, rows: 24 }); // 他人のサイズでは動かない
  });
});

describe("DefaultSizeAuthority — transfer on disconnect", () => {
  it("transfers ownership to the client that last interacted while viewing the same tab", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");

    const owner = clients.register("desktop");
    clients.setView(owner, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 80, rows: 24 }] });
    authority.noteInteraction(owner, pane.id);

    const watcher = clients.register("desktop");
    clients.setView(watcher, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 111, rows: 33 }] });
    clients.touch(watcher); // 見ているが、まだ操作の権限を取ってはいない

    clients.unregister(owner);
    authority.onClientGone(owner);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(watcher);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 111, rows: 33 });
  });

  it("clears ownership (without changing the pane size) when nobody else is viewing the tab", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const owner = clients.register("desktop");
    clients.setView(owner, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 80, rows: 24 }] });
    authority.noteInteraction(owner, pane.id);
    const sizeBefore = { cols: session.getPane(pane.id)!.cols, rows: session.getPane(pane.id)!.rows };

    clients.unregister(owner);
    authority.onClientGone(owner);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)).toMatchObject(sizeBefore);
  });

  it("picks the most recently interacted viewer when several are watching the same tab", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const owner = clients.register("desktop");
    clients.setView(owner, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 80, rows: 24 }] });
    authority.noteInteraction(owner, pane.id);

    const older = clients.register("desktop");
    clients.setView(older, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 70, rows: 20 }] });
    clients.touch(older);

    await new Promise((r) => setTimeout(r, 5));

    const newer = clients.register("desktop");
    clients.setView(newer, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 130, rows: 40 }] });
    clients.touch(newer);

    clients.unregister(owner);
    authority.onClientGone(owner);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(newer);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 130, rows: 40 });
  });
});

/**
 * D106（統合 review ラウンド1 の must）：`onViewChanged` だけが資格（デスクトップか、fit を有効にしたモバイル）を確かめず、
 * 誰も権限を持たない tab を fit していないモバイルにも渡していた。デスクトップを閉じた後にスマートフォンで開くだけで、PTY が
 * スマートフォンの大きさに縮んだ（D13・design「モバイル」の「既定ではサイズ権限を取らず」に反する）。
 */
describe("DefaultSizeAuthority — モバイルは既定でサイズを決めない（D13・D106）", () => {
  it("fit していないモバイルは、誰も権限を持たない tab に client.view を送っても権限を取らず、PTY の大きさも変えない", async () => {
    const { session, clients, authority, terminals } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const sizeBefore = { cols: session.getPane(pane.id)!.cols, rows: session.getPane(pane.id)!.rows };
    const mobile = clients.register("mobile");
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });

    authority.onViewChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)).toMatchObject(sizeBefore);
    expect(terminals.hosts.get(pane.id)?.resized).toBeNull(); // PTY へ resize を一度も送っていない
  });

  it("fit していないモバイルの入力でも操作の時刻は進み（権限は取らない）、色の問い合わせには後から入力したモバイルの配色で答える（20260921-theme-settings の decisions D7）", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(1_000);
      const { session, clients, authority } = makeContext();
      const { tab, pane } = await session.createWorkspace("/home/u", "api");
      const first = clients.register("mobile");
      vi.setSystemTime(2_000);
      const second = clients.register("mobile"); // 後から接続した
      for (const [c, theme] of [
        [first, "nord"],
        [second, "one-light"],
      ] as const) {
        clients.setView(c, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
        clients.setTheme(c, theme);
      }
      vi.setSystemTime(3_000);
      authority.noteInteraction(first, pane.id); // 先に接続したほうが後から入力した

      expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
      expect(clients.get(first)?.lastInteractionAt).toBe(3_000);
      const deps = { getPane: (id: string) => session.getPane(id), getTab: (id: string) => session.getTab(id), clients };
      expect(answerPaletteFor(pane.id, deps)).toBe(TERMINAL_PALETTES.nord);
    } finally {
      vi.useRealTimers();
    }
  });

  it("デスクトップを閉じた後にモバイル（fit なし）だけが見ている tab：権限は無いまま、大きさはデスクトップのときのまま", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 100, rows: 30 }] });
    authority.onViewChanged(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });

    clients.unregister(desktop);
    authority.onClientGone(desktop);
    const mobile = clients.register("mobile");
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(mobile);
    authority.noteInteraction(mobile, pane.id); // 入力しても（fit なしなので）取らない

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
  });

  it("fit なしのモバイルが先に client.view を送っていても、後から来たデスクトップが権限を取り、その大きさになる", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const mobile = clients.register("mobile");
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(mobile);

    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 120, rows: 35 }] });
    authority.onViewChanged(desktop);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 35 });
  });

  it("fit を有効にしたモバイルは、誰も権限を持たない tab の権限を client.view で取る", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const mobile = clients.register("mobile");
    clients.setFit(mobile, true);
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });

    authority.onViewChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(mobile);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });
  });

  it("見ている途中で fit を有効にすると（onFitChanged）、その時点で権限を取り、申告済みの大きさを当てる", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const mobile = clients.register("mobile");
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(mobile);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();

    clients.setFit(mobile, true);
    authority.onFitChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(mobile);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });
  });

  it("fit を有効にすると、デスクトップが権限を持つ tab でも権限を取る（design「client.fit でサイズ権限を取る」）", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 100, rows: 30 }] });
    authority.noteInteraction(desktop, pane.id);
    const mobile = clients.register("mobile");
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(mobile);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop); // fit 前は奪わない

    clients.setFit(mobile, true);
    authority.onFitChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(mobile);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });
  });

  it("fit を無効にすると権限を手放し、同じ tab を見ているデスクトップへ移す", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 100, rows: 30 }] });
    const mobile = clients.register("mobile");
    clients.setFit(mobile, true);
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onFitChanged(mobile);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(mobile);

    clients.setFit(mobile, false);
    authority.onFitChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
  });

  it("fit を無効にして誰も資格のあるクライアントが見ていなければ、権限を無しにしてサイズを保ち、以後の client.view でも変えない", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const mobile = clients.register("mobile");
    clients.setFit(mobile, true);
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(mobile);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(mobile);

    clients.setFit(mobile, false);
    authority.onFitChanged(mobile);
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 30, rows: 15 }] });
    authority.onViewChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });
  });

  it("権限を持ったまま資格を失ったモバイルの client.view は、大きさを当てずに権限を手放す（onFitChanged を経ない経路の保険）", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const mobile = clients.register("mobile");
    clients.setFit(mobile, true);
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(mobile);

    clients.setFit(mobile, false); // onFitChanged を呼ばない
    clients.setView(mobile, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 30, rows: 15 }] });
    authority.onViewChanged(mobile);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)).toMatchObject({ cols: 40, rows: 20 });
  });

  it("デスクトップは fit を送らなくても、誰も権限を持たない tab の権限を client.view で取る（従来どおり）", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 90, rows: 28 }] });

    authority.onViewChanged(desktop);
    authority.onFitChanged(desktop); // デスクトップの fit:false は何も変えない

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 90, rows: 28 });
  });
});

/**
 * D106 の独立点検：「この端末に合わせる」は幅で決まる 1 列の画面（`isMobileViewport`）に出るので、`client.hello` の種別が
 * デスクトップの窓からも `client.fit` が届く。有効にしたら種別を問わず権限を取る。また `client.hello` はいつでも種別を
 * 変えられるので、資格を失う種別に変わったら権限を手放す。
 */
describe("DefaultSizeAuthority — fit と種別の変化（D106 の独立点検）", () => {
  it("デスクトップも fit を有効にすると、他のデスクトップが持つ tab の権限を取る（幅を狭めた窓の「この端末に合わせる」）", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const wide = clients.register("desktop");
    clients.setView(wide, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 160, rows: 45 }] });
    authority.noteInteraction(wide, pane.id);
    const narrow = clients.register("desktop");
    clients.setView(narrow, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    authority.onViewChanged(narrow);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(wide);

    clients.setFit(narrow, true);
    authority.onFitChanged(narrow);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(narrow);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 60, rows: 30 });
  });

  it("デスクトップは fit を無効にしても資格が残り、持っている権限を手放さない", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const other = clients.register("desktop");
    clients.setView(other, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 160, rows: 45 }] });
    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    clients.setFit(desktop, true);
    authority.onFitChanged(desktop);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop);

    clients.setFit(desktop, false);
    authority.onFitChanged(desktop);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 60, rows: 30 });
  });

  it("デスクトップとして権限を取った後に fit なしのモバイルとして hello し直すと（onKindChanged）、同じ tab を見ているデスクトップへ移す", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("desktop");
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    authority.noteInteraction(client, pane.id);
    const desktop = clients.register("desktop");
    clients.setView(desktop, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 150, rows: 42 }] });
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(client);

    clients.setKind(client, "mobile");
    authority.onKindChanged(client);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 150, rows: 42 });
  });

  it("資格を失う種別に変わって、同じ tab を見ている資格のあるクライアントが居なければ、権限を無しにしてサイズを保つ", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("desktop");
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    authority.onViewChanged(client);

    clients.setKind(client, "mobile");
    authority.onKindChanged(client);
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 40, rows: 20 }] });
    authority.onViewChanged(client);

    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(session.getPane(pane.id)).toMatchObject({ cols: 60, rows: 30 });
  });

  it("fit を有効にしたままモバイルへ変わっても資格が残るので手放さない（資格のある種別に変わっても何もしない）", async () => {
    const { session, clients, authority } = makeContext();
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const client = clients.register("desktop");
    clients.setFit(client, true);
    clients.setView(client, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 60, rows: 30 }] });
    authority.onViewChanged(client);

    clients.setKind(client, "mobile");
    authority.onKindChanged(client);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(client);

    const mobile = clients.register("mobile");
    authority.onKindChanged(mobile); // 何も持っていない・資格の無いクライアントでも何も起きない
    clients.setKind(mobile, "desktop");
    authority.onKindChanged(mobile);
    expect(session.getTab(tab.id)?.sizeOwnerClientId).toBe(client);
  });
});

// 20260926-pane-direct-connect（herdr の terminal attach）。
describe("DefaultSizeAuthority — pane への直結（所有者と大きさの鍵）", () => {
  function makeAttachContext() {
    const base = makeContext();
    const published: ServerEvent[] = [];
    const authority = new DefaultSizeAuthority(base.clients, base.session, { publish: (e) => published.push(e) });
    return { ...base, authority, published };
  }
  const attachEvents = (published: ServerEvent[]) =>
    published.filter((e) => e.event === "pane.attach_changed").map((e) => e.data);

  async function withDesktopOwner(ctx: ReturnType<typeof makeAttachContext>) {
    const { session, clients, authority } = ctx;
    const { tab, pane } = await session.createWorkspace("/home/u", "api");
    const { pane: other } = await session.splitPane(pane.id, "right", undefined);
    const desktop = clients.register("desktop");
    clients.setView(desktop, {
      workspaceId: tab.workspaceId,
      tabId: tab.id,
      visible: [
        { paneId: pane.id, cols: 100, rows: 30 },
        { paneId: other.id, cols: 50, rows: 30 },
      ],
    });
    authority.onViewChanged(desktop);
    expect(session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
    return { tab, pane, other, desktop };
  }

  it("attach は pane の大きさを直結の大きさにし、所有者を記録して pane.attach_changed を 1 回出す（AC3）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");

    ctx.authority.attach(cli, pane.id, 120, 40, false);

    expect(ctx.authority.attachOwner(pane.id)).toBe(cli);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 });
    expect(ctx.terminals.hosts.get(pane.id)?.resized).toEqual({ cols: 120, rows: 40 });
    expect(attachEvents(ctx.published)).toEqual([{ paneId: pane.id, clientId: cli }]);

    // 同じ所有者の当て直しは大きさだけ変え、イベントは出さない。
    ctx.authority.attach(cli, pane.id, 90, 20, false);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 90, rows: 20 });
    expect(attachEvents(ctx.published)).toHaveLength(1);
  });

  it("resizeAttached は所有者だけが大きさを変えられる。所有者でなければ not_attached で何も変えない（AC3）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    const stranger = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);

    ctx.authority.resizeAttached(cli, pane.id, 110, 35);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 110, rows: 35 });

    expect(() => ctx.authority.resizeAttached(stranger, pane.id, 10, 10)).toThrow(expect.objectContaining({ code: "not_attached" }));
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 110, rows: 35 });
  });

  it("直結中はブラウザの client.view・操作・fit が直結中の pane の大きさを変えない。同じ tab のほかの pane は変わる（AC4）", async () => {
    const ctx = makeAttachContext();
    const { tab, pane, other, desktop } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);

    ctx.clients.setView(desktop, {
      workspaceId: tab.workspaceId,
      tabId: tab.id,
      visible: [
        { paneId: pane.id, cols: 70, rows: 20 },
        { paneId: other.id, cols: 60, rows: 20 },
      ],
    });
    ctx.authority.onViewChanged(desktop);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 });
    expect(ctx.session.getPane(other.id)).toMatchObject({ cols: 60, rows: 20 });

    // 別のデスクトップが操作して権限を取る（claim → applyOwnerSize まで届く）。
    const second = ctx.clients.register("desktop");
    ctx.clients.setView(second, {
      workspaceId: tab.workspaceId,
      tabId: tab.id,
      visible: [
        { paneId: pane.id, cols: 33, rows: 11 },
        { paneId: other.id, cols: 44, rows: 11 },
      ],
    });
    ctx.authority.noteInteraction(second, pane.id);
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(second);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 });
    expect(ctx.session.getPane(other.id)).toMatchObject({ cols: 44, rows: 11 });

    // 権限者でないモバイルが「この端末に合わせる」で権限を取る（onFitChanged → claim → applyOwnerSize）。
    const phone = ctx.clients.register("mobile");
    ctx.clients.setView(phone, {
      workspaceId: tab.workspaceId,
      tabId: tab.id,
      visible: [
        { paneId: pane.id, cols: 20, rows: 30 },
        { paneId: other.id, cols: 21, rows: 30 },
      ],
    });
    ctx.clients.setFit(phone, true);
    ctx.authority.onFitChanged(phone);
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(phone);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 });
    expect(ctx.session.getPane(other.id)).toMatchObject({ cols: 21, rows: 30 });
  });

  it("別の所有者がいれば takeover 無しの attach は pane_attached で拒まれ、所有者も大きさも変わらない（AC8）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const first = ctx.clients.register("external");
    const second = ctx.clients.register("external");
    ctx.authority.attach(first, pane.id, 120, 40, false);

    expect(() => ctx.authority.attach(second, pane.id, 80, 24, false)).toThrow(
      expect.objectContaining({ code: "pane_attached", message: expect.stringContaining("--takeover") }),
    );
    expect(ctx.authority.attachOwner(pane.id)).toBe(first);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 });
    expect(attachEvents(ctx.published)).toEqual([{ paneId: pane.id, clientId: first }]);
  });

  it("takeover の attach は所有者を入れ替え、新しい所有者の大きさにし、新しい所有者で pane.attach_changed を出す。前の所有者は大きさを変えられない（AC9）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const first = ctx.clients.register("external");
    const second = ctx.clients.register("external");
    ctx.authority.attach(first, pane.id, 120, 40, false);

    ctx.authority.attach(second, pane.id, 80, 24, true);

    expect(ctx.authority.attachOwner(pane.id)).toBe(second);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 80, rows: 24 });
    expect(attachEvents(ctx.published)).toEqual([
      { paneId: pane.id, clientId: first },
      { paneId: pane.id, clientId: second },
    ]);
    expect(() => ctx.authority.resizeAttached(first, pane.id, 10, 10)).toThrow(expect.objectContaining({ code: "not_attached" }));
    // 前の所有者の detach は何もしない（新しい所有者の直結は続く）。
    ctx.authority.detach(first, pane.id);
    expect(ctx.authority.attachOwner(pane.id)).toBe(second);
  });

  it("detach すると所有者を消し、tab の権限者の表示の大きさへ戻し、clientId: null の pane.attach_changed を出す（AC10）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);

    ctx.authority.detach(cli, pane.id);

    expect(ctx.authority.attachOwner(pane.id)).toBeNull();
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
    expect(attachEvents(ctx.published)).toEqual([
      { paneId: pane.id, clientId: cli },
      { paneId: pane.id, clientId: null },
    ]);
  });

  it("所有者の接続が切れると（onClientGone）直結を解放して tab の権限者の大きさへ戻す（AC10）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);

    ctx.authority.onClientGone(cli);

    expect(ctx.authority.attachOwner(pane.id)).toBeNull();
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
    expect(attachEvents(ctx.published).at(-1)).toEqual({ paneId: pane.id, clientId: null });
  });

  it("tab の権限者がいなければ、直結が終わると直結の前の大きさへ戻る（X5）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await ctx.session.createWorkspace("/home/u", "api");
    const before = { cols: ctx.session.getPane(pane.id)!.cols, rows: ctx.session.getPane(pane.id)!.rows };
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 131, 43, false); // 既定の大きさ（120×40）と違う値にする
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 131, rows: 43 });

    ctx.authority.detach(cli, pane.id);

    expect(ctx.authority.attachOwner(pane.id)).toBeNull();
    expect(ctx.session.getPane(pane.id)).toMatchObject(before);
  });

  it("権限者が別の tab を見ているときも、直結の前の大きさへ戻る（X5）", async () => {
    const ctx = makeAttachContext();
    const { tab, pane } = await withDesktopOwner(ctx);
    const { tab: tab2, pane: pane2 } = await ctx.session.createWorkspace("/home/u", "other");
    const desktop = ctx.session.getTab(tab.id)!.sizeOwnerClientId!;
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);
    // 権限者の view が別の tab へ動く（pane の tab の権限は残る）。
    ctx.clients.setView(desktop, { workspaceId: tab2.workspaceId, tabId: tab2.id, visible: [{ paneId: pane2.id, cols: 90, rows: 25 }] });

    ctx.authority.detach(cli, pane.id);

    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
  });

  it("引き取られても、直結の前の大きさは最初のものを持ち越す。最後の所有者が抜けると、その大きさへ戻る（X5）", async () => {
    const ctx = makeAttachContext();
    const { tab, pane, desktop } = await withDesktopOwner(ctx);
    ctx.session.getTab(tab.id); // 権限者は desktop
    const first = ctx.clients.register("external");
    const second = ctx.clients.register("external");
    // 権限者が見ていない状態にする（別の tab の view）。
    const { tab: tab2, pane: pane2 } = await ctx.session.createWorkspace("/home/u", "other");
    ctx.clients.setView(desktop, { workspaceId: tab2.workspaceId, tabId: tab2.id, visible: [{ paneId: pane2.id, cols: 90, rows: 25 }] });
    ctx.authority.attach(first, pane.id, 120, 40, false);
    ctx.authority.attach(second, pane.id, 80, 24, true);

    ctx.authority.detach(first, pane.id); // 前の所有者の detach は何もしない
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 80, rows: 24 });
    ctx.authority.detach(second, pane.id);

    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
  });

  it("権限者がその tab を見ていて pane が見えているなら、今までどおり権限者の大きさへ戻る（X5）", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 60, 20, false);
    ctx.authority.detach(cli, pane.id);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
  });

  it("権限者の接続と直結の所有者が同時にいなくなっても、移譲先（別のデスクトップ）の大きさへ戻る（移譲の後に解放する）", async () => {
    const ctx = makeAttachContext();
    const { tab, pane, desktop } = await withDesktopOwner(ctx);
    const next = ctx.clients.register("desktop");
    ctx.clients.setView(next, { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: pane.id, cols: 77, rows: 22 }] });
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);

    ctx.authority.onClientGone(desktop);
    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBe(next);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 }); // まだ直結中

    ctx.authority.onClientGone(cli);
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 77, rows: 22 });
  });

  it("tab の権限者自身が直結の所有者でもあり移譲先がいなければ、権限者を移譲してから解放する（権限者がいなければ直結の前の大きさへ戻る）", async () => {
    const ctx = makeAttachContext();
    const { tab, pane, desktop } = await withDesktopOwner(ctx);
    ctx.authority.attach(desktop, pane.id, 120, 40, false);

    ctx.authority.onClientGone(desktop);

    expect(ctx.session.getTab(tab.id)?.sizeOwnerClientId).toBeNull();
    expect(ctx.authority.attachOwner(pane.id)).toBeNull();
    // 権限者がいないので、直結の前の大きさ（desktop の view の 100×30）へ戻る（X5）。
    expect(ctx.session.getPane(pane.id)).toMatchObject({ cols: 100, rows: 30 });
  });

  it("直結していないクライアントの onClientGone は直結に触れない", async () => {
    const ctx = makeAttachContext();
    const { pane } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    const other = ctx.clients.register("external");
    ctx.authority.attach(cli, pane.id, 120, 40, false);

    ctx.authority.onClientGone(other);

    expect(ctx.authority.attachOwner(pane.id)).toBe(cli);
    expect(attachEvents(ctx.published)).toHaveLength(1);
  });

  it("pane が閉じた後の解放は大きさを戻さずに所有者だけを消す", async () => {
    const ctx = makeAttachContext();
    const { pane, other } = await withDesktopOwner(ctx);
    const cli = ctx.clients.register("external");
    ctx.authority.attach(cli, other.id, 120, 40, false);
    await ctx.session.closePane(other.id);

    const sizeEventsBefore = ctx.published.filter((e) => e.event === "pane.size_changed").length;

    expect(() => ctx.authority.onClientGone(cli)).not.toThrow();
    expect(ctx.authority.attachOwner(other.id)).toBeNull();
    expect(attachEvents(ctx.published).at(-1)).toEqual({ paneId: other.id, clientId: null });
    expect(ctx.published.filter((e) => e.event === "pane.size_changed")).toHaveLength(sizeEventsBefore);
    expect(ctx.session.getPane(pane.id)).toBeDefined();
  });
});
