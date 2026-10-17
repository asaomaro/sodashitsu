import { watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";
import { lstatRegular, openVerified, readRange } from "../agent/safeFile.js";
import type { Logger } from "../log/Logger.js";
/** Local administrator-owned HTTPS allowlist. Never trust X-Forwarded-* to decide allowed Origins. */
export class ExtraOrigins {
  private readonly path: string;
  private readonly base: string[];
  private closed = false;
  private exposed=false;
  get wasPubliclyExposed(){return this.exposed;}
  private queue: Promise<void> = Promise.resolve();
  private watching = false;
  constructor(
    stateDir: string,
    private readonly target: string[],
    private readonly logger: Logger,
  ) {
    this.path = join(stateDir, "allowed-origins.json");
    this.base = [...target];
  }
  load(): Promise<void> {
    const run = this.queue.then(async () => {
      let added: string[] = [];
      try {
        const status = await lstatRegular(this.path);
        if (status !== "missing") {
          if (status !== "ok") throw Error("not regular");
          const file = await openVerified(this.path);
          if (!file) throw Error("changed");
          try {
            if (file.st.size > 8192) throw Error("too big");
            const data = JSON.parse((await readRange(file.fd, 0, file.st.size)).toString("utf8"));
            if (data?.version !== 1 || !Array.isArray(data.origins) || data.origins.length > 32)
              throw Error("format");
            added = data.origins.map((v: unknown) => {
              if (typeof v !== "string" || v.length > 2048) throw Error("format");
              const url = new URL(v);
              if (
                url.protocol !== "https:" ||
                url.username ||
                url.password ||
                url.search ||
                url.hash ||
                url.pathname !== "/" ||
                url.hostname.includes("*")
              )
                throw Error("origin");
              return url.origin;
            });
          } finally {
            await file.fd.close();
          }
        }
      } catch {
        this.logger.warn("invalid allowed-origins.json; additional Origins are disabled");
        added = [];
      }
      if(added.length || this.base.length)this.exposed=true;
      if (!this.closed)
        this.target.splice(0, this.target.length, ...new Set([...this.base, ...added]));
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  private readonly changed = () => {
    void this.load();
  };
  watch() {
    if (this.watching || this.closed) return;
    this.watching = true;
    watchFile(this.path, { interval: 1000, persistent: false }, this.changed);
  }
  close() {
    this.closed = true;
    if (this.watching) unwatchFile(this.path, this.changed);
  }
}
