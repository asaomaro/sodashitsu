import type { Rect } from "../render/Screen.js";
/** Drawing and mouse handling share the same button positions. */
export function viewHeaderButtons(r: Rect) {
  const actions: { action: "menu" | "fold" | "close"; text: string }[] = [];
  if (r.w >= 11) actions.push({ action: "menu", text: "[⋮]" });
  if (r.w >= 7) actions.push({ action: "fold", text: "[-]" });
  if (r.w >= 3) actions.push({ action: "close", text: "[×]" });
  let x = r.x + r.w - Math.max(0, actions.length * 4 - 1);
  return actions.map((a) => {
    const b = { ...a, x, y: r.y, w: 3 };
    x += 4;
    return b;
  });
}
