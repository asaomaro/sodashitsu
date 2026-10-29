import type {DesktopFolderCheckpoints} from "./DesktopFolderCheckpoints.js";
import {DesktopFolders} from "./DesktopFolders.js";
import {canonicalFolder} from "./desktopFilePaths.js";
import { lstat, opendir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DesktopFileRequest, type DesktopFileResult, RpcError } from "@sodashitsu/protocol";
import type { DesktopFileCheckpoints } from "./DesktopFileCheckpoints.js";
import { FileTransfer } from "../work/FileTransfer.js";
import { directoryGuard, inside } from "../work/files.js";
/** Per-share explicit file grant, confined to the locally approved folder. */
export class DesktopFiles {
  private granted = false;
  private dead = false;
  private epoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private transfer = new FileTransfer();
  private folders:DesktopFolders|undefined;
  private readonly owner = crypto.randomUUID();
  private activeIds = new Set<string>();
  private cancelledIds = new Set<string>();
  private folderCancelledIds=new Set<string>();
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
    private checkpoints?: DesktopFileCheckpoints,
    private valid: () => boolean = () => true,
    folderSupport=false,
    private folderCheckpoints?:DesktopFolderCheckpoints,
  ) {if(folderSupport)this.folders=new DesktopFolders(root);}
  static async open(
    root: string,
    allowed: () => boolean,
    checkpoints?: DesktopFileCheckpoints,
    valid: () => boolean = () => true,
    folderSupport=false,
    folderCheckpoints?:DesktopFolderCheckpoints,
  ) {
    if (!isAbsolute(root))
      throw new RpcError("invalid_params", "共有フォルダは絶対パスを指定してください");
    const canonical = await canonicalFolder(root);
    return new DesktopFiles(
      canonical,
      await directoryGuard(canonical),
      allowed,
      checkpoints,
      valid,
      folderSupport,
      folderCheckpoints,
    );
  }
  run(raw: unknown): Promise<DesktopFileResult> {
    const m = DesktopFileRequest.parse(raw),
      version = this.epoch;
    const operationId = "id" in m.request ? m.request.id : ((m.request.action==="folder_resume_start"||m.request.action==="folder_resume_run")?m.request.request.id:undefined);
    if(m.request.action==="folder_abort"){
      if(this.folderCancelledIds.size>=4096){this.granted=false;this.epoch++;this.folderCheckpoints?.revoke(this.owner);this.folders?.cancelAll();}
      else this.folderCancelledIds.add(m.request.id);
      this.folderCheckpoints?.cancelStart(this.root,this.owner,m.request.id);
    }
    const folderResumeCancelled=m.request.action==="folder_resume_abort"&&this.folderCheckpoints?.cancel(this.root,this.owner,m.request.checkpoint)===true;
    const folderCancelled=m.request.action==="folder_abort"&&this.folders?.cancel(m.request.id)===true;
    const checkpointCancelled =
      m.request.action === "checkpoint_abort" &&
      this.checkpoints?.cancel(this.root, this.owner, m.request.checkpoint) === true;
    if (m.request.action === "abort" && this.activeIds.has(m.request.id))
      this.cancelledIds.add(m.request.id);
    // Revoke immediately, including while file/hash work is queued.
    if (m.request.action === "grant" && !m.request.enabled) {
      this.granted = false;
      this.epoch++;
      this.checkpoints?.revoke(this.owner);
      this.folderCheckpoints?.revoke(this.owner);
      this.folders?.cancelAll();
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
            const barriers=await Promise.allSettled([this.checkpoints?.settled(),this.folderCheckpoints?.settled()]);for(const result of barriers)if(result.status==="rejected")throw result.reason;
            await this.transfer.close();
            await this.folders?.clear();
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
        if(m.request.action==="folder_resume_abort"){if(!folderResumeCancelled)throw Error("別の接続で利用中か再開に未対応です");await this.folderCheckpoints!.confirmCancel(this.root,this.owner,m.request.checkpoint,this.valid);return reply({});}
        if(m.request.action==="folder_abort"){if(!folderCancelled)throw Error("フォルダ転送は利用できません");return reply({});}
        if (m.request.action === "checkpoint_abort") {
          if (!checkpointCancelled) throw Error("再開記録が失効したか別の接続で利用中です");
          await this.checkpoints!.confirmCancel(this.root,this.owner,m.request.checkpoint,this.valid);
          return reply({});
        }
        const fence = () => {
          if (
            this.dead ||
            version !== this.epoch ||
            !this.granted ||
            !this.allowed() ||
            (m.request.action !== "abort" &&
              operationId !== undefined &&
              (this.cancelledIds.has(operationId)||this.folderCancelledIds.has(operationId)))
          )
            throw Error("ファイル転送の許可が終了しました");
        };
        const guard = async () => {
          fence();
          await this.check();
          fence();
        };
        await guard();
        if(m.request.action.startsWith("folder_resume_")){if(!this.folderCheckpoints)throw Error("フォルダの切断後再開には両端の更新が必要です");const {DesktopFolderCheckpointRequest}=await import("@sodashitsu/protocol");return reply(await this.folderCheckpoints.run({owner:this.owner,root:this.root,guard,fence,connected:()=>!this.dead&&this.allowed(),valid:this.valid},DesktopFolderCheckpointRequest.parse(m.request)));}
        if(m.request.action.startsWith("folder_")){if(!this.folders)throw Error("両端を更新してフォルダ転送に対応した接続を使ってください");const {DesktopFolderRequest}=await import("@sodashitsu/protocol");return reply(await this.folders.run(DesktopFolderRequest.parse(m.request),guard,fence));}
        if (m.request.action.startsWith("checkpoint_")) {
          if (!this.checkpoints) throw Error("接続元と接続先を更新して再開対応で接続してください");
          const { DesktopCheckpointRequest } = await import("@sodashitsu/protocol");
          const request = DesktopCheckpointRequest.parse(m.request);
          return reply(
            await this.checkpoints.run(
              {
                owner: this.owner,
                root: this.root,
                guard,
                fence,
                connected: () => !this.dead && this.allowed(),
                valid: this.valid,
              },
              request,
            ),
          );
        }
        if (m.request.action === "list") {
          const part = m.request.path;
          if (isAbsolute(part) || /^[A-Za-z]:/.test(part) || part.split(/[\\/]/).includes(".."))
            throw Error("共有フォルダ内の相対パスを指定してください");
          const path = resolve(this.root, part),
            canonical = await canonicalFolder(path);
          if (!inside(this.root, path) || !inside(this.root, canonical))
            throw Error("リンクや共有フォルダの外へは移動できません");
          const check = await directoryGuard(canonical),
            entries: NonNullable<NonNullable<DesktopFileResult["result"]>["entries"]> = [];
          let truncated = false;
          const dir = await opendir(canonical);
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
            const st = await lstat(resolve(canonical, entry.name));
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
        const { WorkFileRequest } = await import("@sodashitsu/protocol");
        let request = WorkFileRequest.parse(m.request);
        if (request.action === "read_start" || request.action === "write_start") {
          if (
            isAbsolute(request.path) ||
            /^[A-Za-z]:/.test(request.path) ||
            request.path.split(/[\\/]/).includes("..")
          )
            throw Error("共有フォルダ内の相対パスを指定してください");
          const file = resolve(this.root, request.path),
            parent = await canonicalFolder(dirname(file));
          if (!inside(this.root, parent)) throw Error("共有フォルダの外へは移動できません");
          request = { ...request, path: relative(this.root, join(parent, basename(file))) };
        }
        const result = await this.transfer.run(this.owner, this.root, request, guard, false, fence);
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
    this.folders?.cancelAll();
    this.checkpoints?.detach(this.owner);
    this.folderCheckpoints?.detach(this.owner);
    this.granted = false;
    this.epoch++;
    await this.queue;
    await this.transfer.close();
    await this.folders?.close();
    for (const id of this.activeIds) this.forget(id);
    this.cancelledIds.clear();
  }
}
