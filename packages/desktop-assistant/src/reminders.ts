import type { AssistantRemindersInfo } from "@sodashitsu/protocol";
import type { AssistantRpc } from "./assistantRpc.js";
export interface RemindersState extends AssistantRemindersInfo {
  revision: number;
  connected: boolean;
  message: string;
}
export class Reminders {
  private state: RemindersState;
  private generation = 0;
  private busy = false;
  private again=false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>();
  constructor(
    private deviceId: string,
    private rpc: Pick<AssistantRpc, "request">,
    private changed: (state: RemindersState, added: boolean) => void,
    revision = 0,
  ) {
    this.state = {
      revision,
      connected: false,
      jobs: [],
      runs: [],
      message: "操舵室へ接続すると予約できます。",
    };
  }
  snapshot() {
    return structuredClone(this.state);
  }
  connection(connected: boolean) {
    ++this.generation;
    this.state.connected = connected;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (connected) {
      this.timer = setInterval(() => void this.refresh(), 5000);
      this.timer.unref?.();
      void this.refresh();
    } else {
      this.state.jobs = [];
      this.state.runs = [];
      this.state.message = "操舵室へ接続すると予約できます。";
      this.publish(false);
    }
  }
  stop() {
    this.connection(false);
  }
  async refresh() {
    if (!this.state.connected) return;
    if(this.busy){this.again=true;return;}
    this.again=false;
    const generation = this.generation;
    this.busy = true;
    try {
      const data = await this.rpc.request("assistant.reminders", { deviceId: this.deviceId });
      if (generation !== this.generation) return;
      let added = false;
      for (const run of data.runs) {
        if (!this.seen.has(run.id)) added = true;
        this.seen.add(run.id);
      }
      while (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      this.state = {
        ...this.state,
        ...data,
        message: "予約はサーバが動作している間に実行します。リマインダーにモデルは使いません。",
      };
      this.publish(added);
    } catch {
      if (generation === this.generation) {
        this.state.message = "予約を取得できません。接続と操舵室の更新を確認してください。";
        this.publish(false);
      }
    } finally {
      this.busy = false;
      if(this.again&&this.state.connected)void this.refresh();
    }
  }
  async save(input: { label: string; text: string; at: string }) {
    await this.rpc.request("assistant.reminder_save", { deviceId: this.deviceId, ...input });
    ++this.generation;
    await this.refresh();
  }
  async remove(id: string) {
    await this.rpc.request("assistant.reminder_remove", { deviceId: this.deviceId, id });
    ++this.generation;
    await this.refresh();
  }
  async acknowledge(id: string) {
    await this.rpc.request("assistant.reminder_ack", { deviceId: this.deviceId, id });
    ++this.generation;
    await this.refresh();
  }
  private publish(added: boolean) {
    ++this.state.revision;
    this.changed(this.snapshot(), added);
  }
}
