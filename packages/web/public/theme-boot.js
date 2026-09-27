/*
 * 最初の描画の前に、前回のテーマの控えを当てる（20260921-theme-settings の design D5）。`index.html` の <head> から、描画を止めて先に読む。
 * CSP（HttpServer.ts）は inline のスクリプトを許さないので、同じオリジンの外部のスクリプトにしてある。
 *
 * **名前の解決と配色の表は持たない**——控え（localStorage の `soda.themeBoot.v1`）は本体の `ThemeController.writeBoot` が、設定から
 * 固定・明るいとき・暗いときの 3 組を作って書く。ここは明暗の選び方（自動の切替が入なら OS の明暗、`matchMedia` が無ければ暗い）だけを
 * 本体（`theme/themes.ts` の `resolveTheme`）と同じ規則で複製し、`themeBoot.test.ts` で揃っていることを確かめる。
 * 控えが無い・壊れていれば何もしない（App.vue の `:root` の既定＝dracula）。本体の `ThemeController.start()` が起動後に必ず当て直す。
 */
(function () {
  try {
    var raw = localStorage.getItem("soda.themeBoot.v1");
    if (!raw) return;
    var cache = JSON.parse(raw);
    if (!cache || typeof cache !== "object") return;
    var dark =
      typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
    var chosen = cache.auto === true ? (dark ? cache.dark : cache.light) : cache.fixed;
    if (!chosen || typeof chosen !== "object" || !chosen.vars || typeof chosen.vars !== "object")
      return;
    var root = document.documentElement;
    for (var key in chosen.vars) {
      var value = chosen.vars[key];
      if (key.indexOf("--soda-") === 0 && typeof value === "string")
        root.style.setProperty(key, value);
    }
    if (chosen.colorScheme === "light" || chosen.colorScheme === "dark")
      root.style.colorScheme = chosen.colorScheme;
  } catch (e) {
    // 控えが壊れている・localStorage を読めない（プライベートモード等）——既定の色のまま起動する。
  }
})();
