import { z } from "zod";
import type { AssistantNotice } from "@sodashitsu/protocol";
import { AssistantRpc, type AssistantRpcOptions } from "./assistantRpc.js";
import { NoticeConnection, type NoticeConnectionOptions } from "./noticeConnection.js";
const Machines = z.object({
  machines: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f0-9]{32}$/),
        label: z.string().max(200),
        state: z.enum(["online", "connecting", "reconnecting", "attention"]),
      }),
    )
    .max(256),
});
interface Options {
  cookie(origin: string): Promise<string | null>;
  changed(notices: readonly AssistantNotice[], added: boolean): void;
  notice?: (origin: string, options: NoticeConnectionOptions) => NoticeConnection;
  rpc?: (origin: string, options: AssistantRpcOptions) => AssistantRpc;
}
/** Fixed hub proxy routes only. No SSH command, address or credential ever reaches the renderer. */
export class RemoteNotices {
  private entries = new Map<
    string,
    {
      label: string;
      notice: NoticeConnection;
      rpc: AssistantRpc;
      notices: readonly AssistantNotice[];
    }
  >();
  private connected = false;
  private enabled = true;
  private generation = 0;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private origin: string,
    private hub: Pick<AssistantRpc, "request">,
    private options: Options,
  ) {}
  configure(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.connection(this.connected);
  }
  connection(connected: boolean) {
    this.connected = connected;
    ++this.generation;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!connected || !this.enabled) {
      for (const entry of this.entries.values()) {
        entry.notice.stop();
        entry.rpc.stop();
        entry.notices = [];
      }
      this.publish(false);
      return;
    }
    this.timer = setInterval(() => void this.refresh(), 10000);
    this.timer.unref?.();
    void this.refresh();
  }
  stop() {
    this.connection(false);
    this.entries.clear();
  }
  rpcFor(id: string) {
    return this.connected && this.enabled ? (this.entries.get(id)?.rpc ?? null) : null;
  }
  async refresh() {
    if (!this.connected || !this.enabled || this.busy) return;
    this.busy = true;
    const generation = this.generation;
    try {
      const data = Machines.parse(await this.hub.request("machine.list", {}));
      if (generation !== this.generation) return;
      const online = data.machines.filter((machine) => machine.state === "online").slice(0, 8),
        ids = new Set(online.map((machine) => machine.id));
      for (const [id, entry] of this.entries)
        if (!ids.has(id)) {
          entry.notice.stop();
          entry.rpc.stop();
          this.entries.delete(id);
        }
      for (const machine of online) {
        const old = this.entries.get(machine.id);
        if (old) {
          old.label = machine.label;
          old.notice.start();
          old.rpc.start();
          continue;
        }
        const cookie = this.options.cookie;
        const rpc = (this.options.rpc ?? ((origin, options) => new AssistantRpc(origin, options)))(
          this.origin,
          { machineId: machine.id, cookie, status: () => {}, changed: () => {} },
        );
        const notice = (
          this.options.notice ?? ((origin, options) => new NoticeConnection(origin, options))
        )(this.origin, {
          machineId: machine.id,
          cookie,
          status: (status) => {
            const entry = this.entries.get(machine.id);
            if (status !== "connected" && entry) {
              entry.notices = [];
              this.publish(false);
            }
          },
          changed: (notices, added) => {
            const entry = this.entries.get(machine.id);
            if (!entry || entry.notice !== notice || !this.connected || !this.enabled) return;
            entry.notices = notices;
            this.publish(added);
          },
        });
        this.entries.set(machine.id, { label: machine.label, notice, rpc, notices: [] });
        rpc.start();
        notice.start();
      }
      this.publish(false);
    } catch {
      if (generation === this.generation) {
        for (const entry of this.entries.values()) {
          entry.notice.stop();
          entry.rpc.stop();
          entry.notices = [];
        }
        this.publish(false);
      }
    } finally {
      this.busy = false;
    }
  }
  private publish(added: boolean) {
    this.options.changed(
      [...this.entries.values()]
        .flatMap((entry) =>
          entry.notices.map((notice) => ({
            ...notice,
            title: `${entry.label} / ${notice.title}`.slice(0, 160),
            message: `${entry.label}からのお知らせです。${notice.message}`.slice(0, 1000),
          })),
        )
        .sort((a, b) => b.at - a.at)
        .slice(0, 32),
      added,
    );
  }
}
