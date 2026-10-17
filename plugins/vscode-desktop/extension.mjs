import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
let key = "";
const shown = new Set();
const content = `<style>html,body{margin:0;height:100%;overflow:hidden}#desktop{width:100%;height:100%}</style><div id="desktop"></div><script>if(soda.components.indexOf('desktop-cdp')>=0)soda.mount('desktop-cdp',document.getElementById('desktop'));else document.getElementById('desktop').textContent='この版のSodashitsuはVSCode Desktopに対応していません';</script>`;
createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.type === "ext.hello")
    key =
      m.extension.scope === "user"
        ? "user:" + m.extension.id
        : "project:" +
          createHash("sha256").update(m.extension.root).digest("hex") +
          ":" +
          m.extension.id;
  if (m.type !== "ext.panes") return;
  const wanted = new Set();
  for (const p of m.panes) {
    const names = [
      ...(p.plugin?.extensionKey === key ? [p.plugin.display] : []),
      ...(p.views ?? []).filter((v) => v.extensionKey === key).map((v) => v.display),
    ];
    for (const name of names) {
      const id = p.id + "|" + name;
      wanted.add(id);
      if (shown.has(id)) continue;
      shown.add(id);
      process.stdout.write(
        JSON.stringify({
          method: "display.set",
          params: {
            paneId: p.id,
            name,
            kind: "panel",
            format: "script-html",
            title: "VSCode Desktop",
            content,
          },
        }) + "\n",
      );
    }
  }
  for (const id of shown) if (!wanted.has(id)) shown.delete(id);
});
