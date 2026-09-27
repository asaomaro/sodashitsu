import type { WebSocketLike } from "@sodashitsu/client-core";

/** テスト用の WebSocket（送ったものを溜め、開く・閉じる・応答を注入する）。 */
export class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(
    readonly url: string,
    readonly cookie: string,
  ) {}
  send(data: string | Uint8Array): void {
    this.sent.push(typeof data === "string" ? JSON.parse(data) : data);
  }
  close(code = 1000): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  /** 最後の要求に応える。 */
  reply(result: unknown): void {
    const last = this.sent[this.sent.length - 1] as { id: string };
    this.onmessage?.({ data: JSON.stringify({ id: last.id, result }) });
  }
  /** 送った要求（JSON）のうち、その方式のもの。 */
  requests(method: string): { id: string; method: string; params: unknown }[] {
    return this.sent.filter(
      (m): m is { id: string; method: string; params: unknown } =>
        typeof m === "object" && m !== null && (m as { method?: unknown }).method === method,
    );
  }
  event(event: string, data: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ event, data }) });
  }
}
