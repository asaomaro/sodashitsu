import type {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import type {DesktopEndpointIdentity} from "@sodashitsu/client-core/desktop/DesktopE2e";
import type {DesktopSigninCallScope} from "./DesktopSigninDispatch.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

type Store = Pick<DesktopEndpointStore,"status"|"endpoint"|"close"|"settled">;
export interface DesktopSigninIdentityPermit {
  readonly identity: DesktopEndpointIdentity;
  readonly allowInput: boolean;
  active(): boolean;
}
const failure = () => new Error("Signin endpoint identity is unavailable");

/** Takes ownership of a dedicated store. The installed host must enforce SYSTEM
 * and its fixed protected state directory BEFORE constructing the store. DPAPI
 * CurrentUser then refers to SYSTEM, never the enrolled human's existing keys.
 * This gate neither proves OS identity nor creates/trusts/repairs any key. Do not
 * use it with a general user server store or a remotely supplied state path.
 */
export class DesktopSigninIdentity {
  readonly #policy;
  readonly #pending = new Set<() => void>();
  readonly #reads = new Set<Promise<void>>();
  readonly #abort: () => void;
  #closed = false;
  constructor(private readonly options: {
    enrollment: DesktopSigninEnrollment;
    store: Store;
    active(): boolean;
    signal: AbortSignal;
    now?: () => number;
  }) {
    this.#policy = options.enrollment.publicStatus();
    this.#abort = () => this.close();
    options.signal.addEventListener("abort", this.#abort, {once:true});
    this.live();
  }
  private live(): boolean {
    let valid = false;
    try {valid = !this.#closed && !this.options.signal.aborted && this.options.active() && !this.#closed && !this.options.signal.aborted;} catch {}
    if (!valid) this.close();
    return valid;
  }
  private trusted(state: Awaited<ReturnType<Store["status"]>>, fingerprint: string): boolean {
    return state.initialized && state.required && state.fingerprint === this.#policy.provider && state.peers.some(peer => peer.role === "viewer" && peer.fingerprint === fingerprint);
  }
  /** Both the enrollment allowlist AND the live local store must approve the
   * viewer. Root's request alone is not sealed-peer authentication. */
  endpoint(fingerprint: string, scope: DesktopSigninCallScope): Promise<DesktopSigninIdentityPermit> {
    return new Promise((resolve,reject) => {
      let done = false, timer: ReturnType<typeof setTimeout> | undefined;
      const now = this.options.now ?? (() => performance.now()), deadline = now()+5000;
      const allowInput = scope.allowInput;
      const matches = () => scope.revision===this.#policy.revision && scope.provider===this.#policy.provider && scope.allowInput===allowInput && (!allowInput || this.#policy.allowInput);
      const scoped = () => {
        try {return this.live() && matches() && !scope.signal.aborted && scope.active() && this.live() && matches() && !scope.signal.aborted;}
        catch {return false;}
      };
      const current = () => !done && scoped() && now()<deadline;
      const finish = (permit?: DesktopSigninIdentityPermit) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        scope.signal.removeEventListener("abort", abort);
        this.#pending.delete(abort);
        if (permit) resolve(permit); else reject(failure());
      };
      const abort = () => finish();
      if (!/^[a-f0-9]{64}$/.test(fingerprint) || !this.#policy.peers.some(peer => peer.fingerprint===fingerprint) || scope.revision!==this.#policy.revision || scope.provider!==this.#policy.provider || scope.allowInput && !this.#policy.allowInput || !current() || this.#reads.size>=8) {finish();return;}
      this.#pending.add(abort);
      scope.signal.addEventListener("abort", abort, {once:true});
      timer = setTimeout(abort,5000); timer.unref();
      if (!current()) {finish();return;}
      const read = (async () => {
        const state = await this.options.store.status();
        if (!current() || !this.trusted(state,fingerprint)) throw failure();
        const local = await this.options.store.endpoint(fingerprint,"viewer");
        if (!current() || !local.active() || !current()) throw failure();
        const actual = await local.identity.fingerprint();
        if (!current() || actual!==this.#policy.provider) throw failure();
        const latest = await this.options.store.status();
        if (!current() || !this.trusted(latest,fingerprint) || !local.active() || !current()) throw failure();
        let revoked = false;
        const active = () => {
          let valid = false;
          try {valid = !revoked && scoped() && local.active() && scoped();} catch {}
          if (!valid) revoked = true;
          return valid;
        };
        finish(Object.freeze({identity:local.identity,allowInput:this.#policy.allowInput && allowInput,active}));
      })().catch(abort);
      this.#reads.add(read);
      void read.finally(() => this.#reads.delete(read));
    });
  }
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.options.signal.removeEventListener("abort",this.#abort);
    for (const abort of [...this.#pending]) abort();
    try {this.options.store.close();} catch {}
  }
  async settled(): Promise<void> {
    if (!this.#closed) throw failure();
    try {await Promise.all([...this.#reads]);await this.options.store.settled();} catch {throw failure();}
  }
}
