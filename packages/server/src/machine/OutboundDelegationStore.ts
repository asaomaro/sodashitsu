import { join } from "node:path";
import { DelegationStartParams } from "@sodashitsu/protocol";
import { lstatRegular, openVerified, readRange } from "../agent/safeFile.js";
import { writeFileAtomic } from "../persist/atomicFile.js";
type Saved = { url: string; machineId: string; token: string };
/** Credential-bearing provider settings are local/private, never included in machine.list or session snapshots. */
export class OutboundDelegationStore {
  readonly path: string;
  constructor(stateDir: string) {
    this.path = join(stateDir, "outbound-delegations.json");
  }
  async load(): Promise<Saved[]> {
    const status = await lstatRegular(this.path);
    if (status === "missing") return [];
    if (status !== "ok") throw Error("委譲設定を確認できません");
    const f = await openVerified(this.path);
    if (!f) throw Error("委譲設定を確認できません");
    try {
      if (f.st.size > 64 * 1024) throw Error("委譲設定が大きすぎます");
      const raw = JSON.parse((await readRange(f.fd, 0, f.st.size)).toString("utf8"));
      if (raw?.version !== 1 || !Array.isArray(raw.entries) || raw.entries.length > 16)
        throw Error("委譲設定が不正です");
      const rows = raw.entries.map((x: unknown) => DelegationStartParams.parse(x)),
        ids = new Set(rows.map((x: Saved) => x.machineId));
      if (ids.size !== rows.length) throw Error("委譲設定のIDが重複しています");
      return rows;
    } finally {
      await f.fd.close();
    }
  }
  async save(entries: Saved[]) {
    if (entries.length > 16) throw Error("委譲の上限です");
    await writeFileAtomic(this.path, JSON.stringify({ version: 1, entries }) + "\n");
  }
}
