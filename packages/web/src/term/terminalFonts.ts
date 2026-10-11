/** Nerd Font icons are private-use characters; the CSS face only covers those ranges. */
export const TERMINAL_FONT_FAMILY = '"Sodashitsu Nerd Symbols", monospace';

/** Load before creating xterm/WebGL's glyph atlas so it does not cache missing glyphs. */
export async function loadTerminalFonts(onLoaded: () => void): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loaded = document.fonts
      .load('15px "Sodashitsu Nerd Symbols"', "\ue5ff\uf07b\udb80\udc7b")
      .then(() => onLoaded())
      .catch(() => undefined);
    await Promise.race([
      loaded,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 1500);
      }),
    ]);
  } catch {
    // A failed asset fetch must not prevent the terminal from starting.
  } finally {
    clearTimeout(timer);
  }
}
