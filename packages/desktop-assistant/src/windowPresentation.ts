import type { BrowserWindow } from "electron";
/** Present loaded documents with the same activation/repaint on first open and reuse. */
export function presentWindow(win:BrowserWindow):void {
 if(win.isDestroyed())return;
 if(win.isMinimized())win.restore();
 win.show();
 win.focus();
 win.webContents.invalidate();
}
