export const DOUBLE_ESCAPE_MS = 500;

/** A second bare physical press exits; repeat, other input and focus changes do not. */
export class DesktopEscape {
  private at: number | undefined;
  private released = false;
  reset() { this.at = undefined; this.released = false; }
  key(code: string, down: boolean, repeat: boolean, modified: boolean, now: number): boolean {
    if (code !== "Escape" || modified) { if (down) this.reset(); return false; }
    if (!down) { if (this.at !== undefined) this.released = true; return false; }
    if (repeat) return false;
    const leave = this.at !== undefined && this.released && now >= this.at && now - this.at <= DOUBLE_ESCAPE_MS;
    if (leave) { this.reset(); return true; }
    this.at = now; this.released = false; return false;
  }
}

// DOM buttons bits are left=1, right=2, middle=4, back=8, forward=16.
// Chorded buttons produce pointermove rather than another pointerdown/up.
export class DesktopButtons {
  private mask = 0;
  reset() { this.mask = 0; }
  update(buttons: number): {button: number; event: "down" | "up"}[] {
    const next = buttons & 31;
    const events: {button: number; event: "down" | "up"}[] = [];
    for (const [button, bit] of ([[0,1],[1,4],[2,2],[3,8],[4,16]] as const)) {
      if ((this.mask & bit) !== (next & bit)) events.push({button, event: next & bit ? "down" : "up"});
    }
    this.mask = next; return events;
  }
}

/** Recover modifier downs consumed by the local IME or held before viewer focus. */
export class DesktopModifiers {
  private held = new Set<string>();
  reset() { this.held.clear(); }
  update(event: Pick<KeyboardEvent,"code"|"ctrlKey"|"shiftKey"|"altKey"|"metaKey">, down: boolean): {kind:"key";code:string;down:boolean}[] {
    const changes: {kind:"key";code:string;down:boolean}[] = [];
    for (const [prefix, active] of [["Control",event.ctrlKey],["Shift",event.shiftKey],["Alt",event.altKey],["Meta",event.metaKey]] as const) {
      if (event.code === prefix+"Left" || event.code === prefix+"Right") {
        if (down) this.held.add(event.code);
        else {
          this.held.delete(event.code);
          if (!active) for (const code of [...this.held].filter(code=>code.startsWith(prefix))) {
            this.held.delete(code);changes.push({kind:"key",code,down:false});
          }
        }
        continue;
      }
      const keys = [...this.held].filter(code=>code.startsWith(prefix));
      if (active && !keys.length) {
        const code=prefix+"Left";this.held.add(code);changes.push({kind:"key",code,down:true});
      } else if (!active) for (const code of keys) {
        this.held.delete(code);changes.push({kind:"key",code,down:false});
      }
    }
    return changes;
  }
}
