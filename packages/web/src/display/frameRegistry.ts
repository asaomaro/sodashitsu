/** 載っている枠の登録簿（面の id → 枠）。キーの操作（`focus_display`）が、部品の木をたどらずに枠へ届くため。 */
export interface RegisteredFrame {
  /** 枠の中へフォーカスを移す。 */
  focusInside(): void;
  /** ［操作する］ボタンの `click`（スクリプトが動く面だけ。`engageEntry` の決まりで、始める時機を遅らせる）。 */
  engageFromButton?(ev: Pick<MouseEvent, "detail">): void;
  /** ［操作を終える］ボタン（操作中のスクリプトが動く面を、マウス・タッチで抜ける。中身が `Esc` を無効にしても効く）。 */
  endEngage?(): void;
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

/** ［操作する］ボタンの `click` を、その面の枠へ渡す。その面の枠が載っていなければ `false`。 */
export function engageFrame(id: string, ev: Pick<MouseEvent, "detail">): boolean {
  const f = frames.get(id);
  if (!f?.engageFromButton) return false;
  f.engageFromButton(ev);
  return true;
}

/** ［操作を終える］ボタンの `click` を、その面の枠へ渡す。その面の枠が載っていなければ `false`。 */
export function endEngageFrame(id: string): boolean {
  const f = frames.get(id);
  if (!f?.endEngage) return false;
  f.endEngage();
  return true;
}

/** いま画面に載っている、スクリプトが動く面の枠（面の id → pane・形式）。静的な枠への `foreign-focus` と、フォーカスの脱落の検知は、これが 1 つ以上あるときだけ働く。 */
const scriptFrames = new Map<string, { paneId: string; format: string; name: string; stop?: () => void }>();
export function registerScriptFrame(id: string, info: { paneId: string; format: string; name?: string; stop?: () => void }): void {
  scriptFrames.set(id, { ...info, name: info.name ?? id });
}
export function unregisterScriptFrame(id: string): void {
  scriptFrames.delete(id);
}
/** この画面に載っているスクリプトの枠を全部止める（遮断器）。止める関数は、各枠が登録する。 */
export function stopAllScriptFrames(): void {
  for (const f of [...scriptFrames.values()]) f.stop?.();
}
export function scriptFrameCount(): number {
  return scriptFrames.size;
}
export function scriptFramesSnapshot(): { id: string; paneId: string; format: string; name: string }[] {
  return [...scriptFrames].map(([id, v]) => ({ id, ...v }));
}
