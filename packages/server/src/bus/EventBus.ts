import type { ServerEvent } from "@sodashitsu/protocol";
import type { Disposable } from "../util/Disposable.js";
export type { Disposable };

/**
 * 型付きの同期イベントバス（architecture.md「EventBus」）。
 * `publish` は購読者を**発行した順に同期で**呼ぶ（design「スナップショットと差分の継ぎ目」の順序保証の前提）。
 */
export class EventBus {
  private readonly listeners = new Set<(e: ServerEvent) => void>();

  subscribe(fn: (e: ServerEvent) => void): Disposable {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  publish(event: ServerEvent): void {
    // 購読中に追加/削除されても安全なようにスナップショットを取ってから呼ぶ。
    for (const fn of [...this.listeners]) {
      fn(event);
    }
  }
}
