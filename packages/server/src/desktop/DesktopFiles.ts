import { lstat, opendir, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { DesktopFileRequest, type DesktopFileResult, RpcError } from "@sodashitsu/protocol";
import { FileTransfer } from "../work/FileTransfer.js";
import { directoryGuard, inside } from "../work/files.js";
/** Per-share explicit file grant, confined to the locally approved folder. */
export class DesktopFiles {
  private granted = false;
  private dead = false;
  private epoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private transfer = new FileTransfer();
  private readonly owner = crypto.randomUUID();
  private activeIds = new Set<string>();
  private cancelledIds = new Set<string>();
  private expirations = new Map<string, ReturnType<typeof setTimeout>>();
  private forget(id: string) {
    clearTimeout(this.expirations.get(id));
    this.expirations.delete(id);
    this.activeIds.delete(id);
    this.cancelledIds.delete(id);
  }
  private touch(id: string) {
    clearTimeout(this.expirations.get(id));
    const timer = setTimeout(() => {
      this.cancelledIds.add(id);
      void this.transfer
        .run(this.owner, this.root, { action: "abort", id })
        .catch(() => {})
        .finally(() => this.forget(id));
    }, 60000);
    timer.unref();
    this.expirations.set(id, timer);
  }
  private constructor(
    private root: string,
    private check: () => Promise<void>,
    private allowed: () => boolean,
  ) {}
  static async open(root: string, allowed: () => boolean) {
    if (!isAbsolute(root))
      throw new RpcError("invalid_params", "共有フォルダは絶対パスを指定してください");
    const canonical = await realpath(root);
    if (canonical !== resolve(root) || (await lstat(root)).isSymbolicLink())
      throw new RpcError("invalid_params", "リンクを経由する共有フォルダは使えません");
    return new DesktopFiles(canonical, await directoryGuard(canonical), allowed);
  }
  run(raw: unknown): Promise<DesktopFileResult> {
    const m = DesktopFileRequest.parse(raw),
      version = this.epoch;
    const operationId = "id" in m.request ? m.request.id : undefined;
    if (m.request.action === "abort" && this.activeIds.has(m.request.id))
      this.cancelledIds.add(m.request.id);
    // Revoke immediately, including while file/hash work is queued.
    if (m.request.action === "grant" && !m.request.enabled) {
      this.granted = false;
      this.epoch++;
    }
    const result = this.queue.then(async (): Promise<DesktopFileResult> => {
      const reply = (result: NonNullable<DesktopFileResult["result"]>): DesktopFileResult => ({
        type: "desktop_file_result",
        id: m.id,
        ok: true,
        result,
      });
      try {
        if (this.dead || !this.allowed())
          throw Error("共有が終了したかファイル転送を許可されていません");
        if (m.request.action === "grant") {
          if (!m.request.enabled) {
            await this.transfer.close();
            for (const id of this.activeIds) this.forget(id);
            this.cancelledIds.clear();
            return reply({ enabled: false });
          }
          if (version !== this.epoch) throw Error("許可が更新されました");
          await this.check();
          if (this.dead || version !== this.epoch || !this.allowed())
            throw Error("許可が更新されました");
          this.granted = true;
          return reply({ enabled: true, root: this.root });
        }
        const fence = () => {
          if (
            this.dead ||
            version !== this.epoch ||
            !this.granted ||
            !this.allowed() ||
            (m.request.action !== "abort" &&
              operationId !== undefined &&
              this.cancelledIds.has(operationId))
          )
            throw Error("ファイル転送の許可が終了しました");
        };
        const guard = async () => {
          fence();
          await this.check();
          fence();
        };
        await guard();
        if (m.request.action === "list") {
          const part = m.request.path;
          if (isAbsolute(part) || /^[A-Za-z]:/.test(part) || part.split(/[\\/]/).includes(".."))
            throw Error("共有フォルダ内の相対パスを指定してください");
          const path = resolve(this.root, part),
            canonical = await realpath(path);
          if (!inside(this.root, path) || canonical !== path)
            throw Error("リンクや共有フォルダの外へは移動できません");
          const check = await directoryGuard(path),
            entries: NonNullable<NonNullable<DesktopFileResult["result"]>["entries"]> = [];
          let truncated = false;
          const dir = await opendir(path);
          for await (const entry of dir) {
            if (entries.length >= 500) {
              truncated = true;
              break;
            }
            if (
              entry.isSymbolicLink() ||
              (!entry.isFile() && !entry.isDirectory()) ||
              entry.name.startsWith(".soda-transfer-")
            )
              continue;
            const st = await lstat(resolve(path, entry.name));
            if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) continue;
            entries.push({ name: entry.name, directory: st.isDirectory(), bytes: st.size });
          }
          await check();
          await guard();
          return reply({
            entries: entries.sort(
              (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
            ),
            truncated,
          });
        }
        const result = await this.transfer.run(
          this.owner,
          this.root,
          m.request,
          guard,
          false,
          fence,
        );
        if (
          (m.request.action === "read_start" || m.request.action === "write_start") &&
          result.id
        ) {
          this.activeIds.add(result.id);
          this.touch(result.id);
        }
        if (
          operationId &&
          (m.request.action === "finish" || m.request.action === "abort" || result.done)
        ) {
          this.forget(operationId);
        }
        if (operationId && this.activeIds.has(operationId)) this.touch(operationId);
        return reply(result);
      } catch (error) {
        if (operationId) {
          await this.transfer
            .run(this.owner, this.root, { action: "abort", id: operationId })
            .catch(() => {});
          this.forget(operationId);
        }
        return {
          type: "desktop_file_result",
          id: m.id,
          ok: false,
          message: error instanceof Error ? error.message.slice(0, 500) : "転送に失敗しました",
        };
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async close() {
    this.dead = true;
    this.granted = false;
    this.epoch++;
    await this.queue;
    await this.transfer.close();
    for (const id of this.activeIds) this.forget(id);
    this.cancelledIds.clear();
  }
}
