import { randomUUID } from "node:crypto";
import { DesktopClipboardResult, DesktopRichClipboardResult } from "@sodashitsu/protocol";

/** One explicitly granted clipboard owner, independent of desktop input control.
 * Helper generations and request IDs are source-global, never viewer-local.
 */
export class DesktopSharedClipboard<Member> {
  private epoch = 0;
  private textSeq = 0;
  private owner: { member: Member; local: number; source: number } | undefined;
  private texts = new Map<number, { member: Member; local: number; epoch: number }>();
  private rich:
    | { member: Member; local: string; source: string; epoch: number; read: boolean; size?: number }
    | undefined;
  constructor(
    private hooks: {
      allowed(): boolean;
      write(value: unknown): void;
      send(member: Member, value: unknown): void;
    },
  ) {}

  grant(member: Member, enabled: boolean, generation: number): boolean {
    if (!Number.isSafeInteger(generation) || generation < 0) return false;
    if (this.owner && this.owner.member !== member) return false;
    if (enabled && !this.hooks.allowed()) return false;
    if (!enabled && !this.owner) return false;
    // Retire all old response routes before telling the worker its new generation.
    this.texts.clear();
    this.rich = undefined;
    this.owner = undefined;
    if (!Number.isSafeInteger(this.epoch + 1)) return false;
    const source = ++this.epoch;
    if (enabled) this.owner = { member, local: generation, source };
    this.hooks.write({ type: "clipboard_control", enabled, generation: source });
    return enabled;
  }

  command(member: Member, value: any): boolean {
    if (value.type !== "clipboard" && value.type !== "clipboard_rich") return false;
    const owner = this.owner;
    if (
      !owner ||
      owner.member !== member ||
      value.generation !== owner.local ||
      !this.hooks.allowed()
    )
      return true; // Never route an ungranted/stale request into another viewer's lease.
    if (value.type === "clipboard") {
      if (!Number.isSafeInteger(this.textSeq + 1)) return true;
      const id = ++this.textSeq;
      if (this.texts.size >= 32) this.texts.delete(this.texts.keys().next().value!);
      this.texts.set(id, { member, local: value.id, epoch: owner.source });
      this.hooks.write({ ...value, id, generation: owner.source });
    } else {
      if (value.operation === "read" || value.operation === "begin") {
        if (this.rich) return true;
        this.rich = {
          member,
          local: value.id,
          source: randomUUID(),
          epoch: owner.source,
          read: value.operation === "read",
        };
      }
      const route = this.rich;
      if (
        !route ||
        route.member !== member ||
        route.local !== value.id ||
        route.epoch !== owner.source
      )
        return true;
      this.hooks.write({ ...value, id: route.source, generation: owner.source });
      if (value.operation === "cancel") this.rich = undefined; // The viewer wrapper already acknowledges cancellation.
    }
    return true;
  }

  receive(value: any): boolean {
    if (value.type === "clipboard_result") {
      const result = DesktopClipboardResult.parse(value),
        route = this.texts.get(result.id);
      this.texts.delete(result.id);
      if (route && this.owner?.member === route.member && this.owner.source === route.epoch)
        this.hooks.send(route.member, { ...result, id: route.local });
      return true;
    }
    if (value.type === "clipboard_rich_result") {
      const result = DesktopRichClipboardResult.parse(value),
        route = this.rich;
      if (
        route &&
        result.id === route.source &&
        this.owner?.member === route.member &&
        this.owner.source === route.epoch
      ) {
        if (result.stage === "begin" && result.size !== undefined) route.size = result.size;
        if (
          !result.ok ||
          result.stage === "done" ||
          result.stage === "cancelled" ||
          (route.read && result.stage === "chunk" && result.offset === route.size)
        )
          this.rich = undefined;
        this.hooks.send(route.member, { ...result, id: route.local });
      }
      return true;
    }
    return false;
  }

  detach(member: Member): void {
    if (this.owner?.member === member) this.grant(member, false, this.owner.local);
  }
}
