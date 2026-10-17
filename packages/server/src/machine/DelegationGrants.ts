import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { RpcError } from "@sodashitsu/protocol";
import { lstatRegular, openVerified, readRange } from "../agent/safeFile.js";
import { writeFileAtomic } from "../persist/atomicFile.js";
import {
  emptyCatalog,
  loadCatalog,
  MAX_MACHINES,
  newMachineId,
  saveCatalog,
} from "./MachineCatalog.js";
import {
  labelProblem,
  targetProblem,
  remoteSessionProblem,
  type MachineProfile,
} from "./machineRules.js";

/** Persist hashes only. A grant can register its own provider, never authenticate to the controller's /ws. */
export class DelegationGrants {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly root: string,
    private readonly stateDir: string,
  ) {}
  private async hashes(): Promise<Record<string, string>> {
    const path = join(this.stateDir, "delegation-grants.json");
    const status = await lstatRegular(path);
    if (status === "missing") return {};
    if (status !== "ok") throw new Error("委譲の認証情報を読めません");
    const file = await openVerified(path);
    if (!file) throw new Error("委譲の認証情報を読めません");
    try {
      if (file.st.size > 16 * 1024) throw new Error("委譲の認証情報が大きすぎます");
      const data = JSON.parse((await readRange(file.fd, 0, file.st.size)).toString("utf8"));
      if (
        !data ||
        data.version !== 1 ||
        !data.hashes ||
        typeof data.hashes !== "object" ||
        Array.isArray(data.hashes)
      )
        throw new Error("委譲の認証情報が不正です");
      const entries = Object.entries(data.hashes);
      if (entries.length > MAX_MACHINES) throw new Error("委譲の認証情報が多すぎます");
      if (
        entries.some(
          ([id, hash]) =>
            !/^[0-9a-f]{32}$/.test(id) || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash),
        )
      )
        throw new Error("委譲の認証情報が不正です");
      return Object.fromEntries(entries) as Record<string, string>;
    } finally {
      await file.fd.close();
    }
  }
  invite(label: string): Promise<{ machineId: string; token: string }> {
    const result = this.queue.then(async () => {
      const loaded = await loadCatalog(this.root);
      if (loaded.kind === "invalid") throw new RpcError("invalid_params", "マシン登録簿が不正です");
      const data = loaded.kind === "ok" ? loaded.data : emptyCatalog();
      const problem = labelProblem(label, data.machines);
      if (problem || data.machines.length >= MAX_MACHINES)
        throw new RpcError("invalid_params", problem ?? "マシン数の上限です");
      const machineId = newMachineId(),
        token = randomBytes(32).toString("base64url");
      const hashes = await this.hashes(),
        ids = new Set(data.machines.map((m) => m.id));
      for (const id of Object.keys(hashes)) if (!ids.has(id)) delete hashes[id];
      hashes[machineId] = createHash("sha256").update(token).digest("hex");
      await writeFileAtomic(
        join(this.stateDir, "delegation-grants.json"),
        JSON.stringify({ version: 1, hashes }) + "\n",
      );
      data.machines.push({
        id: machineId,
        label,
        target: "reverse",
        transport: "reverse",
        enabled: true,
      });
      await saveCatalog(this.root, data);
      return { machineId, token };
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  add(input: {
    label: string;
    target: string;
    session?: string | undefined;
  }): Promise<{ id: string }> {
    const result = this.queue.then(async () => {
      const loaded = await loadCatalog(this.root);
      if (loaded.kind === "invalid") throw new RpcError("invalid_params", "マシン登録簿が不正です");
      const data = loaded.kind === "ok" ? loaded.data : emptyCatalog();
      const problem =
        targetProblem(input.target) ??
        remoteSessionProblem(input.session) ??
        labelProblem(input.label, data.machines);
      if (problem || data.machines.length >= MAX_MACHINES)
        throw new RpcError("invalid_params", problem ?? "マシン数の上限です");
      const id = newMachineId();
      data.machines.push({
        id,
        label: input.label,
        target: input.target,
        enabled: true,
        ...(input.session && input.session !== "default" ? { session: input.session } : {}),
      });
      await saveCatalog(this.root, data);
      return { id };
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  async connections() {
    const loaded = await loadCatalog(this.root);
    if (loaded.kind === "invalid") throw new RpcError("invalid_params", "マシン登録簿が不正です");
    return loaded.kind === "ok" ? loaded.data.machines : [];
  }
  manage(id: string, action: "enable" | "disable" | "remove") {
    const result = this.queue.then(async () => {
      const loaded = await loadCatalog(this.root);
      if (loaded.kind !== "ok") throw new RpcError("not_found", "登録が見つかりません");
      const item = loaded.data.machines.find((m) => m.id === id);
      if (!item) throw new RpcError("not_found", "登録が見つかりません");
      if (action === "remove")
        loaded.data.machines = loaded.data.machines.filter((m) => m !== item);
      else item.enabled = action === "enable";
      await saveCatalog(this.root, loaded.data);
      return {};
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  async authorize(id: string, token: string): Promise<MachineProfile | undefined> {
    if (!/^[0-9a-f]{32}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const loaded = await loadCatalog(this.root);
    if (loaded.kind !== "ok") return;
    const profile = loaded.data.machines.find(
      (m) => m.id === id && m.enabled && m.transport === "reverse",
    );
    if (!profile) return;
    const expected = (await this.hashes())[id];
    if (!expected) return;
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      createHash("sha256").update(token).digest(),
    )
      ? profile
      : undefined;
  }
}
