import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * cookie のローカルキャッシュ（design.md「`SessionStore`」節・decisions.md D5）。**保存するのは session
 * cookie だけ**（token は保存しない）。キーは `url` を正規化した origin 文字列（`${protocol}//${host}`）。
 */

export interface CachedSession {
  cookie: string;
  createdAt: string;
}

interface SessionFile {
  sessions: Record<string, CachedSession>;
}

export interface SessionStore {
  get(url: string): Promise<string | undefined>;
  set(url: string, cookie: string): Promise<void>;
  clear(url: string): Promise<void>;
}

export function defaultSessionFilePath(): string {
  return join(homedir(), ".sodactl", "session.json");
}

/** `url` を origin 文字列（`scheme://host`）へ正規化する。不正な URL ならそのまま返す（呼び出し側で弾かれる）。 */
function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function isSessionFile(v: unknown): v is SessionFile {
  if (typeof v !== "object" || v === null) return false;
  const sessions = (v as { sessions?: unknown }).sessions;
  if (typeof sessions !== "object" || sessions === null) return false;
  return Object.values(sessions as Record<string, unknown>).every(
    (s) => typeof s === "object" && s !== null && typeof (s as CachedSession).cookie === "string" && typeof (s as CachedSession).createdAt === "string",
  );
}

/**
 * 同じファイルへの「読む→変える→書く」を、このプロセスの中では 1 つずつ行う（ファイルのパスごとの鎖）。
 * 並べると、2 つの接続先を同時に保存したとき両方が同じ内容を読んでから書き、片方が消えていた（20260926-load-flaky-tests D2）。
 */
const updateChains = new Map<string, Promise<void>>();

function serializeUpdate(filePath: string, update: () => Promise<void>): Promise<void> {
  const key = resolve(filePath);
  const run = (updateChains.get(key) ?? Promise.resolve()).then(update);
  const tail = run.catch(() => undefined);
  updateChains.set(key, tail);
  void tail.then(() => {
    if (updateChains.get(key) === tail) updateChains.delete(key);
  });
  return run;
}

export class FsSessionStore implements SessionStore {
  constructor(private readonly filePath: string = defaultSessionFilePath()) {}

  private async load(): Promise<SessionFile> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      // 無い（初回）。壊れているのと同じ扱いで空から始める。
      return { sessions: {} };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      // ファイルが壊れている（JSON parse 失敗・形が違う）場合は空として扱う（design「`SessionStore`」節）。
      // 利用者が手で壊れた設定を直せるよう、次の `login`/自動ログインで上書きされる。
      return isSessionFile(parsed) ? parsed : { sessions: {} };
    } catch {
      return { sessions: {} };
    }
  }

  /**
   * 一時ファイルに書いてから置き換える。切り詰めてから書くと、その途中を読んだ別の操作（別の `sodactl` のプロセスも）が空とみなし、
   * 保存し直してほかの接続先の cookie を消していた（20260926-load-flaky-tests の D2。server の `writeFileAtomic` と同じ形）。
   */
  private async save(data: SessionFile): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmpDir = await mkdtemp(join(dir, ".tmp-"));
    const tmpPath = join(tmpDir, "session.json");
    try {
      await writeFile(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      if (platform() !== "win32") await chmod(tmpPath, 0o600);
      await rename(tmpPath, this.filePath);
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async get(url: string): Promise<string | undefined> {
    const data = await this.load();
    return data.sessions[originOf(url)]?.cookie;
  }

  set(url: string, cookie: string): Promise<void> {
    return serializeUpdate(this.filePath, async () => {
      const data = await this.load();
      data.sessions[originOf(url)] = { cookie, createdAt: new Date().toISOString() };
      await this.save(data);
    });
  }

  clear(url: string): Promise<void> {
    return serializeUpdate(this.filePath, async () => {
      const data = await this.load();
      if (!(originOf(url) in data.sessions)) return;
      delete data.sessions[originOf(url)];
      await this.save(data);
    });
  }
}
