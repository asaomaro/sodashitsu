import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import { vi } from "vitest";
import { KeyInputController } from "../keys/KeyInputController.js";
import { KeyRouter, DEFAULT_KEYMAP, type ConnectionPort, type KeyRouterClock } from "@sodashitsu/client-core";
import { MouseBridge } from "./MouseBridge.js";
import { RendererPool, type WebglAddonLike } from "./RendererPool.js";
import { TerminalRegistry } from "./TerminalRegistry.js";
import { TerminalHost } from "./terminalHost.js";

/** 単体テスト用: 実物の `TerminalRegistry`・`TerminalHost`（happy-dom の xterm）と、要求を記録する接続。 */
const realClock = (): KeyRouterClock => ({ now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
class FakeWebglAddon implements WebglAddonLike {
  activate(): void {}
  dispose(): void {}
  onContextLoss(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

export function makeHostKit(capacity = 100) {
  const requests: [MethodName, unknown][] = [];
  const conn: ConnectionPort = {
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      requests.push([method, params]);
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
  const keys = new KeyInputController(new KeyRouter(DEFAULT_KEYMAP, realClock()), conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  const registry = new TerminalRegistry({
    capacity,
    conn,
    renderers,
    keys,
    createMouseBridge: (term, paneId) => new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" }),
  });
  const host = new TerminalHost({ registry, conn, getScrollbackLines: () => 1000 });
  return { registry, host, conn, requests };
}

