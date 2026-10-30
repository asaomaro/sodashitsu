import type { DesktopAssistantPreferences } from "@sodashitsu/protocol";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DisplayArea {
  id: string;
  workArea: Rect;
}

/** Work areas are in Electron DIP, including negative coordinates on secondary monitors. */
export function characterBounds(
  preferences: DesktopAssistantPreferences,
  displays: readonly DisplayArea[],
): Rect {
  const display =
    displays.find((item) => item.id === preferences.position?.displayId) ?? displays[0];
  if (!display) throw new Error("表示できるディスプレイがありません");
  const area = display.workArea;
  const size = Math.max(1, Math.min(preferences.characterSize, area.width, area.height));
  const position = display.id === preferences.position?.displayId ? preferences.position : null;
  return {
    x: Math.round(
      Math.max(
        area.x,
        Math.min(position?.x ?? area.x + area.width - size - 16, area.x + area.width - size),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y,
        Math.min(position?.y ?? area.y + area.height - size - 16, area.y + area.height - size),
      ),
    ),
    width: size,
    height: size,
  };
}

/** Keep a bubble adjacent to its captain and within the selected work area, including negative DIP. */
export function bubbleBounds(
  preferences: DesktopAssistantPreferences,
  displays: readonly DisplayArea[],
): Rect {
  const display =
    displays.find((display) => display.id === preferences.position?.displayId) ?? displays[0];
  if (!display) throw Error("表示できるディスプレイがありません");
  const area = display.workArea,
    character = characterBounds(preferences, displays),
    width = Math.min(400, area.width),
    height = Math.min(640, area.height);
  return {
    width,
    height,
    x: Math.round(
      Math.max(
        area.x,
        Math.min(character.x + character.width - width, area.x + area.width - width),
      ),
    ),
    y: Math.round(
      preferences.mode === "tray"
        ? area.y + area.height - height
        : Math.max(area.y, Math.min(character.y - height - 12, area.y + area.height - height)),
    ),
  };
}
