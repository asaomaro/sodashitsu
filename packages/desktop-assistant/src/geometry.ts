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
  aspect = 1,
): Rect {
  const display =
    displays.find((item) => item.id === preferences.position?.displayId) ?? displays[0];
  if (!display) throw new Error("表示できるディスプレイがありません");
  const area = display.workArea;
  const size = Math.max(1, Math.min(preferences.characterSize, area.width, area.height));
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const width = Math.max(1, Math.round(size * Math.min(1, ratio))),
    height = Math.max(1, Math.round(size / Math.max(1, ratio)));
  const position = display.id === preferences.position?.displayId ? preferences.position : null;
  return {
    x: Math.round(
      Math.max(
        area.x,
        Math.min(position?.x ?? area.x + area.width - width, area.x + area.width - width),
      ),
    ),
    y: Math.round(
      Math.max(
        area.y,
        Math.min(position?.y ?? area.y + area.height - height, area.y + area.height - height),
      ),
    ),
    width,
    height,
  };
}

/** Keep a bubble adjacent to its captain and within the selected work area, including negative DIP. */
export function bubbleBounds(
  preferences: DesktopAssistantPreferences,
  displays: readonly DisplayArea[],
  size: { width: number; height: number } = { width: 400, height: 640 },
  aspect = 1,
): Rect {
  return anchoredBounds(
    preferences,
    displays,
    Math.max(320, size.width),
    Math.max(420, size.height),
    aspect,
  );
}

/** Place notices beside the character, below chat where possible, within the work area. */
export function noticeBounds(
  preferences: DesktopAssistantPreferences,
  displays: readonly DisplayArea[],
  aspect = 1,
  conversation?: Rect,
): Rect {
  if (preferences.mode === "tray" && !conversation) return anchoredBounds(preferences, displays, 340, 220, aspect);
  const display=displays.find(d=>d.id===preferences.position?.displayId)??displays[0];
  if(!display)throw Error("表示できるディスプレイがありません");
  const area=display.workArea,character=characterBounds(preferences,displays,aspect),width=Math.min(340,area.width);
  const bottom=area.y+area.height,top=Math.max(character.y+4,conversation?conversation.y+conversation.height:area.y);
  const room=bottom-top;
  const height=Math.min(220,area.height,room>=160?room:220);
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(n,max));
  let x=clamp(character.x+2-width,area.x,area.x+area.width-width);
  const y=clamp(room>=160?top:character.y+(character.height-height)/2,area.y,bottom-height);
  if(conversation&&x<conversation.x+conversation.width&&x+width>conversation.x&&y<conversation.y+conversation.height&&y+height>conversation.y&&conversation.x-width>=area.x)x=conversation.x-width;
  return {x:Math.round(x),y:Math.round(y),width,height:Math.round(height)};
}

function anchoredBounds(
  preferences: DesktopAssistantPreferences,
  displays: readonly DisplayArea[],
  requestedWidth: number,
  requestedHeight: number,
  aspect: number,
): Rect {
  const display =
    displays.find((display) => display.id === preferences.position?.displayId) ?? displays[0];
  if (!display) throw Error("表示できるディスプレイがありません");
  const area = display.workArea,
    character = characterBounds(preferences, displays, aspect),
    width = Math.min(requestedWidth, area.width),
    height = Math.min(requestedHeight, area.height);
  const headInset = 0;
  // The tail tip (or compact notice edge) ends 8px above the window bottom; retain a 6px cap gap.
  const panelBottom = character.y + headInset + 8 - 6;
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
        : Math.max(area.y, Math.min(panelBottom - height, area.y + area.height - height)),
    ),
  };
}

export const BUBBLE_RESIZE_HANDLES = ["n", "w", "nw"] as const;
export type BubbleResizeHandle = (typeof BUBBLE_RESIZE_HANDLES)[number];

/** Resize from the top/left only, preserving the right and bottom anchors. */
export function resizeBubbleBounds(
  start: Rect,
  handle: BubbleResizeHandle,
  dx: number,
  dy: number,
  area: Rect,
): Rect {
  const minWidth = Math.min(320, area.width),
    minHeight = Math.min(420, area.height);
  let left = start.x,
    right = start.x + start.width,
    top = start.y,
    bottom = start.y + start.height;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
  if (handle.includes("w")) left = clamp(start.x + Math.round(dx), area.x, right - minWidth);
  if (handle.includes("n")) top = clamp(start.y + Math.round(dy), area.y, bottom - minHeight);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Resize transparent desktop cards programmatically: Electron transparent windows have no reliable native resize. */
export const WINDOW_RESIZE_HANDLES=["n","ne","e","se","s","sw","w","nw"] as const;
export type WindowResizeHandle=typeof WINDOW_RESIZE_HANDLES[number];
export function resizeWindowBounds(start:Rect,handle:WindowResizeHandle,dx:number,dy:number,area:Rect):Rect{
 const minW=Math.min(360,area.width),minH=Math.min(360,area.height);
 const width=Math.min(area.width,Math.max(minW,start.width)),height=Math.min(area.height,Math.max(minH,start.height));
 start={x:Math.max(area.x,Math.min(start.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(start.y,area.y+area.height-height)),width,height};
 let left=start.x,right=start.x+start.width,top=start.y,bottom=start.y+start.height;
 if(handle.includes("w"))left=Math.max(area.x,Math.min(right-minW,start.x+dx));
 if(handle.includes("e"))right=Math.min(area.x+area.width,Math.max(left+minW,start.x+start.width+dx));
 if(handle.includes("n"))top=Math.max(area.y,Math.min(bottom-minH,start.y+dy));
 if(handle.includes("s"))bottom=Math.min(area.y+area.height,Math.max(top+minH,start.y+start.height+dy));
 return {x:Math.round(left),y:Math.round(top),width:Math.round(right-left),height:Math.round(bottom-top)};
}
