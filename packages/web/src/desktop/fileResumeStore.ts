import { DesktopFolderName, DesktopFolderManifest } from "@sodashitsu/protocol";
const LIMIT = 104857600,
  TTL = 900000;
export type ResumeFile = {
  key: string;
  machine: string;
  root: string;
  name: string;
  path: string;
  direction: "upload" | "download";
  size: number;
  offset: number;
  checkpoint: string;
  hash: string;
  expires: number;
  folder?: { name: string; entries: DesktopFolderManifest };
};
type Chunk = { key: string; offset: number; data: Uint8Array };
const valid = (r: ResumeFile) =>
  r &&
  typeof r.key === "string" &&
  typeof r.machine === "string" &&
  typeof r.root === "string" &&
  typeof r.name === "string" &&
  typeof r.path === "string" &&
  ["upload", "download"].includes(r.direction) &&
  Number.isInteger(r.size) &&
  r.size >= 0 &&
  r.size <= LIMIT &&
  Number.isInteger(r.offset) &&
  r.offset >= 0 &&
  r.offset <= r.size &&
  /^[a-f0-9]{64}$/.test(r.checkpoint) &&
  /^[a-f0-9]{64}$/.test(r.hash) &&
  Number.isFinite(r.expires) &&
  (!r.folder ||
    (DesktopFolderName.safeParse(r.folder.name).success &&
      DesktopFolderManifest.safeParse(r.folder.entries).success &&
      (r.direction !== "upload" ||
        r.folder.entries.reduce((n, e) => n + (e.directory ? 0 : e.bytes), 0) === r.size)));
const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? Error("再開用データを保存できません"));
  });
/** Explicit opt-in only. Metadata/chunk progress is committed atomically. */
export class DesktopFileResumeStore {
  private db?: Promise<IDBDatabase>;
  private closed = false;
  private leases = new Map<string, () => void>();
  private own(key: string) {
    if (this.closed || !this.leases.has(key))
      throw Error("この転送は別の窓で利用中か、窓が閉じられました");
  }
  private async claim(key: string): Promise<boolean> {
    if (this.closed) return false;
    if (this.leases.has(key)) return true;
    if (!navigator.locks) throw Error("このブラウザは安全な転送再開の保存に対応していません");
    return new Promise<boolean>((resolve, reject) => {
      void navigator.locks
        .request(
          "soda-desktop-file-resume:" + key,
          { mode: "exclusive", ifAvailable: true },
          async (lock) => {
            if (!lock || this.closed) {
              resolve(false);
              return;
            }
            await new Promise<void>((release) => {
              this.leases.set(key, release);
              resolve(true);
            });
          },
        )
        .catch(reject);
    });
  }
  private release(key: string) {
    this.leases.get(key)?.();
    this.leases.delete(key);
  }
  releaseAll() {
    this.closed = true;
    for (const key of this.leases.keys()) this.release(key);
    void this.db?.then((db) => db.close()).catch(() => {});
  }

  private open() {
    return (this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(Error("このブラウザでは再開用データを保存できません"));
        return;
      }
      const r = indexedDB.open("soda-desktop-file-resume-v1", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("jobs", { keyPath: "key" });
        d.createObjectStore("payloads");
        d.createObjectStore("chunks", { keyPath: ["key", "offset"] });
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error ?? Error("再開用データを保存できません"));
      r.onblocked = () => reject(Error("再開用データの保存が別の窓で止められています"));
    }));
  }
  private async transaction<T>(
    fn: (t: IDBTransaction) => Promise<T>,
    mode: IDBTransactionMode = "readwrite",
  ): Promise<T> {
    const db = await this.open(),
      t = db.transaction(["jobs", "payloads", "chunks"], mode);
    const complete = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = t.onabort = () =>
        reject(
          t.error ?? Error("再開用データを保存できません。容量とブラウザ設定を確認してください"),
        );
    });
    try {
      const value = await fn(t);
      await complete;
      return value;
    } catch (e) {
      try {
        t.abort();
      } catch {}
      await complete.catch(() => {});
      throw e;
    }
  }
  private remove(t: IDBTransaction, key: string) {
    t.objectStore("jobs").delete(key);
    t.objectStore("payloads").delete(key);
    t.objectStore("chunks").delete(IDBKeyRange.bound([key, 0], [key, LIMIT]));
  }
  async create(record: ResumeFile, file?: File): Promise<void> {
    // Parse a plain manifest: Vue reactive proxies cannot be stored by IndexedDB.
    if (record.folder)
      record = {
        ...record,
        folder: {
          name: record.folder.name,
          entries: DesktopFolderManifest.parse(record.folder.entries),
        },
      };
    if (
      !valid(record) ||
      record.offset !== 0 ||
      (record.direction === "upload" && (!file || file.size !== record.size))
    )
      throw Error("再開用データが不正です");
    if (!(await this.claim(record.key))) throw Error("この転送は別の窓で利用中です");
    try {
      await this.transaction(async (t) => {
        const store = t.objectStore("jobs"),
          all = await request<ResumeFile[]>(store.getAll());
        this.own(record.key);
        let count = 0,
          size = record.size;
        for (const r of all) {
          if (!valid(r) || r.expires <= Date.now()) {
            if (typeof r?.key === "string") this.remove(t, r.key);
            continue;
          }
          if (r.key === record.key) throw Error("再開記録が重複しています");
          count++;
          size += r.size;
        }
        if (count >= 8 || size > LIMIT)
          throw Error("再開用の保存は合計100MiB・8件までです。不要な転送を取り消してください");
        store.add(record);
        if (file) t.objectStore("payloads").put(file, record.key);
      });
    } catch (e) {
      this.release(record.key);
      throw e;
    }
  }
  async progress(key: string, offset: number, chunk?: Uint8Array): Promise<void> {
    this.own(key);
    await this.transaction(async (t) => {
      const store = t.objectStore("jobs"),
        r = await request<ResumeFile | undefined>(store.get(key));
      this.own(key);
      if (!r || !valid(r) || r.expires <= Date.now()) throw Error("再開記録が終了しました");
      if (
        !Number.isInteger(offset) ||
        offset < r.offset ||
        offset > r.size ||
        (chunk &&
          (r.direction !== "download" ||
            chunk.length > 65536 ||
            offset !== r.offset + chunk.length))
      )
        throw Error("再開位置が不正です");
      if (chunk)
        t.objectStore("chunks").add({ key, offset: r.offset, data: chunk } satisfies Chunk);
      store.put({ ...r, offset, expires: Date.now() + TTL });
    });
  }
  async removeJob(key: string): Promise<void> {
    this.own(key);
    await this.transaction(async (t) => {
      this.own(key);
      this.remove(t, key);
    });
    this.release(key);
  }
  async list(machine: string, root: string): Promise<ResumeFile[]> {
    const records = await this.transaction(async (t) => {
      const all = await request<ResumeFile[]>(t.objectStore("jobs").getAll()),
        out: ResumeFile[] = [];
      for (const r of all) {
        if (!valid(r) || r.expires <= Date.now()) {
          if (typeof r?.key === "string") this.remove(t, r.key);
          continue;
        }
        if (r.machine === machine && r.root === root) out.push(r);
      }
      return out;
    });
    const out: ResumeFile[] = [];
    for (const record of records) if (await this.claim(record.key)) out.push(record);
    return out;
  }
  async payload(
    record: Pick<ResumeFile, "key" | "checkpoint" | "offset">,
  ): Promise<{ file?: File; chunks: Uint8Array[] }> {
    this.own(record.key);
    return this.transaction(async (t) => {
      const stored = await request<ResumeFile | undefined>(t.objectStore("jobs").get(record.key));
      this.own(record.key);
      if (
        !stored ||
        !valid(stored) ||
        stored.checkpoint !== record.checkpoint ||
        stored.offset !== record.offset ||
        stored.expires <= Date.now()
      )
        throw Error("再開記録が終了しました");
      if (stored.direction === "upload") {
        const file = await request<Blob | undefined>(t.objectStore("payloads").get(record.key));
        if (!(file instanceof Blob) || file.size !== stored.size)
          throw Error("転送元ファイルの保存データがありません");
        return { file: new File([file], stored.name), chunks: [] };
      }
      const rows = await request<Chunk[]>(
          t.objectStore("chunks").getAll(IDBKeyRange.bound([record.key, 0], [record.key, LIMIT])),
        ),
        chunks: Uint8Array[] = [];
      let at = 0;
      for (const row of rows) {
        if (
          row.offset !== at ||
          !(row.data instanceof Uint8Array) ||
          row.data.length > 65536 ||
          !row.data.length
        )
          throw Error("保存済みの転送データが不正です");
        chunks.push(row.data);
        at += row.data.length;
      }
      if (at !== record.offset) throw Error("保存済みの転送位置が一致しません");
      return { chunks };
    }, "readonly");
  }
}
