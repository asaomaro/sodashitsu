import { DesktopMethods, type DesktopInput, type DesktopResults } from "@sodashitsu/protocol";
import type { SodaClient } from "./wsClient.js";

export class DesktopAgentSession {
  readonly abort = new AbortController();
  private timer: ReturnType<typeof setTimeout>;
  private closed = false;
  private constructor(
    private client: SodaClient,
    private lease: string,
    readonly expiresAt: number,
  ) {
    this.timer = setTimeout(
      () => this.close(),
      Math.max(1, Math.min(120000, expiresAt - Date.now())),
    );
    this.timer.unref();
    client.onClose(() => this.close());
  }
  static async attach(client: SodaClient, ticket: string) {
    const p = DesktopMethods["desktop.agent.attach"].parse({ ticket });
    const grant = await client.request("desktop.agent.attach", p);
    return new DesktopAgentSession(client, grant.leaseId, grant.expiresAt);
  }
  private request<
    M extends "desktop.agent.observe" | "desktop.agent.act" | "desktop.agent.release",
  >(method: M, params: Parameters<SodaClient["request"]>[1]): Promise<DesktopResults[M]> {
    if (this.abort.signal.aborted) return Promise.reject(new Error("Desktop session ended"));
    return new Promise((resolve, reject) => {
      const stop = () => reject(new Error("Desktop session ended"));
      this.abort.signal.addEventListener("abort", stop, { once: true });
      this.client
        .request(method, params as never, {
          timeoutMs: method === "desktop.agent.act" ? 60000 : 10000,
        })
        .then((value) => resolve(value as DesktopResults[M]), reject)
        .finally(() => this.abort.signal.removeEventListener("abort", stop));
    });
  }
  observe(afterFrameSeq?: number) {
    return this.request(
      "desktop.agent.observe",
      DesktopMethods["desktop.agent.observe"].parse({
        leaseId: this.lease,
        ...(afterFrameSeq === undefined ? {} : { afterFrameSeq }),
      }),
    );
  }
  async act(observationId: string, inputs: DesktopInput[]) {
    const params = DesktopMethods["desktop.agent.act"].parse({
      leaseId: this.lease,
      observationId,
      inputs,
    });
    try {
      return await this.request("desktop.agent.act", params);
    } catch (error) {
      this.close();
      throw error;
    }
  }
  async release() {
    try {
      return await this.request("desktop.agent.release", { leaseId: this.lease });
    } finally {
      this.close();
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.client.close();
  }
}
