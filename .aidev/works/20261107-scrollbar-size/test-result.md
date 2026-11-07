# Shared scrollbar geometry

Base b1d5145e. Product changes only assistantTheme.css and terminalAppearance.css. Share the existing Sodashitsu `thin` native width and8px WebKit/xterm fallback geometry across themes; retain all theme colors and xterm14px track/hit/scroll calculations. Intentionally hidden scrollbars still use none. No desktop/TUI production source change.

Actual Chromium baseline disables Playwright's default --hide-scrollbars for measurement. Sodashitsu light/dark use10px native vertical/horizontal gutters in this engine; Dracula/OneLight/Nord use15px. Xterm already uses8px slider /14px track in every theme. After fix all five themes × classic/modern use the canonical10px native gutters,8/14 xterm, and identical per-theme scrollbar-color/xterm-color to baseline. Native picker computed width remains auto in every theme, unchanged. Pixel value is an observed browser/platform rendering of thin, not a universal OS constant. Generated standard/settings/menu areas and xterm are used, no actual user terminals.

Desktop assistant source already applies thin/8px to every palette. Actual generated desktop-style DOM for5palettes is10px vertically/horizontally, so no unnecessary desktop change is made. Color differences are retained.

Existing uiStyle7 tests pass. Actual browser/screenshots inspected. Restore two original product CSS files: browser fails15!=10 (`negative.txt`, before screenshots). Byte-exact SHA/cmp restore2files: all ten style/theme geometry cases pass again, with color equality and hidden:none preserved (`restored.txt`, browser.json, restoration.json). CSS is loaded directly through Vite; no stale generated styles are involved. No full repository checks, model/agent/OS operations or user settings changes.
