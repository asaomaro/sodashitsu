import { DesktopFileResult, type DesktopFileRequest } from "@sodashitsu/protocol";
type Result = NonNullable<DesktopFileResult["result"]>;
type Task = {
  id: string;
  request: DesktopFileRequest["request"];
  control: boolean;
  resolve(v: Result): void;
  reject(e: Error): void;
  timer?: ReturnType<typeof setTimeout>;
};
/** One data request at a time, with a reserved slot for revocation/cancel. */
export class DesktopFileClient {
  private pending = new Map<string, Task>();
  private queue: Task[] = [];
  private dead = false;
  constructor(
    private send: (v: DesktopFileRequest) => boolean,
    private end: () => void,
  ) {}
  private fail() {
    try {
      this.end();
    } finally {
      this.stop();
    }
  }
  request(request: DesktopFileRequest["request"]): Promise<Result> {
    const control =
      request.action === "abort" ||
      request.action === "checkpoint_abort" ||
      request.action === "folder_abort" ||
      (request.action === "grant" && !request.enabled);
    if (this.dead || this.queue.length >= (control ? 18 : 16)) {
      if (control && !this.dead) this.fail();
      return Promise.reject(Error("ファイル転送の接続が終了したか処理上限です"));
    }
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: crypto.randomUUID(),
        request,
        control,
        resolve,
        reject,
      };
      if (task.control) this.queue.unshift(task);
      else this.queue.push(task);
      this.pump();
    });
  }
  private pump() {
    while (!this.dead && this.queue.length && this.pending.size < 2) {
      const index = this.pending.size ? this.queue.findIndex((t) => t.control) : 0;
      if (index < 0) return;
      const task = this.queue.splice(index, 1)[0]!;
      this.pending.set(task.id, task);
      task.timer = setTimeout(
        () => {
          this.pending.delete(task.id);
          task.reject(Error("ファイル転送の応答がありません。保存結果を確認してください"));
          if (task.control) this.fail();
          else this.pump();
        },
        ["folder_download_start", "folder_upload_start"].includes(task.request.action)
          ? 120000
          : 30000,
      );
      if (!this.send({ type: "desktop_file", id: task.id, request: task.request })) {
        this.pending.delete(task.id);
        clearTimeout(task.timer);
        task.reject(Error("ファイルの転送経路が利用できません"));
        if (task.control) {
          this.fail();
          return;
        }
      }
    }
  }
  receive(raw: unknown) {
    const m = DesktopFileResult.parse(raw),
      p = this.pending.get(m.id);
    if (!p) return;
    this.pending.delete(m.id);
    clearTimeout(p.timer);
    if (!m.ok) p.reject(Error(m.message ?? "ファイル転送に失敗しました"));
    else p.resolve(m.result ?? {});
    this.pump();
  }
  stop() {
    if (this.dead) return;
    this.dead = true;
    for (const p of [...this.pending.values(), ...this.queue]) {
      clearTimeout(p.timer);
      p.reject(Error("ファイル転送の接続が終了しました"));
    }
    this.pending.clear();
    this.queue = [];
  }
}
