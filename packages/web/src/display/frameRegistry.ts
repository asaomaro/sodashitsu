/** 載っている枠の登録簿（面の id → 枠）。キーの操作（`focus_display`）が、部品の木をたどらずに枠へ届くため。 */
export interface RegisteredFrame {
  /** 枠の中へフォーカスを移す。 */
  focusInside(): void;
}

const frames = new Map<string, RegisteredFrame>();

export function registerFrame(id: string, frame: RegisteredFrame): void {
  frames.set(id, frame);
}
export function unregisterFrame(id: string, frame: RegisteredFrame): void {
  if (frames.get(id) === frame) frames.delete(id);
}
/** 枠の中へフォーカスを移す。その面の枠が載っていなければ `false`。 */
export function focusFrame(id: string): boolean {
  const f = frames.get(id);
  if (!f) return false;
  f.focusInside();
  return true;
}
