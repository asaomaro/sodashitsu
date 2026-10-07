import linksSource from "../../public/ask-view/links.js?raw";
import sanitizeSource from "../../public/display-view/sanitize.js?raw";
import { describe, expect, it } from "vitest";

/** 静的な形式の枠の取り除き（`public/display-view/sanitize.js`。枠の中で動くものと同じファイル）。 */
const root: Record<string, unknown> = {};
const links: { exports: unknown } = { exports: {} };
new Function("module", linksSource)(links);
root.askViewLinks = links.exports;
new Function("self", sanitizeSource)(root);
const sanitize = root.__sodaDisplaySanitize as (frag: DocumentFragment) => DocumentFragment;

function run(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return sanitize(tpl.content);
}
function htmlOf(frag: DocumentFragment): string {
  const div = document.createElement("div");
  div.appendChild(frag.cloneNode(true));
  return div.innerHTML;
}

describe("sanitize.js", () => {
  it("枠を動かす・外へ繋ぐ要素を消す", () => {
    const f = run(
      `<p>a</p><script>1</script><meta http-equiv="refresh" content="0;url=/x"><link rel="stylesheet" href="/x"><base href="/x"><iframe src="/x"></iframe><object data="/x"></object><embed src="/x"><audio src="/x"></audio><video src="/x"></video><noscript>n</noscript>`,
    );
    expect(htmlOf(f)).toBe("<p>a</p>");
  });
  it("on で始まる属性・autofocus・srcdoc・action・target などを消す", () => {
    const f = run(`<button onclick="x()" autofocus formaction="/x" ping="/p" background="/b" target="_top">b</button><form action="/x" target="_blank"><input name="a" autofocus></form>`);
    const html = htmlOf(f);
    expect(html).not.toMatch(/onclick|autofocus|formaction|ping|background|target|action=/);
    expect(html).toContain("<form>");
  });
  it("リンク: # は残り、http(s) は新しいタブ、javascript: と data: は href が外れる", () => {
    const f = run(`<a id="a" href="#x">1</a><a id="b" href="https://example.com/">2</a><a id="c" href="javascript:alert(1)">3</a><a id="d" href="data:text/html,x">4</a><a id="e" href="/rel">5</a>`);
    const q = (id: string): Element => f.querySelector(`#${id}`) as Element;
    expect(q("a").getAttribute("href")).toBe("#x");
    expect(q("b").getAttribute("href")).toBe("https://example.com/");
    expect(q("b").getAttribute("target")).toBe("_blank");
    expect(q("b").getAttribute("rel")).toBe("noopener noreferrer");
    expect(q("c").hasAttribute("href")).toBe(false);
    expect(q("c").getAttribute("title")).toBe("javascript:alert(1)");
    expect(q("d").hasAttribute("href")).toBe(false);
    expect(q("e").hasAttribute("href")).toBe(false);
    expect(q("e").hasAttribute("target")).toBe(false);
  });
  it("img: data:image/png は残り、外の src は外れる。srcset は常に外れる", () => {
    const f = run(`<img id="a" src="data:image/png;base64,AAAA"><img id="b" src="https://example.com/x.png"><img id="c" src="/x.png" srcset="/a 1x"><img id="d" src="data:text/html,x">`);
    const q = (id: string): Element => f.querySelector(`#${id}`) as Element;
    expect(q("a").getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(q("b").hasAttribute("src")).toBe(false);
    expect(q("c").hasAttribute("src")).toBe(false);
    expect(q("c").hasAttribute("srcset")).toBe(false);
    expect(q("d").hasAttribute("src")).toBe(false);
  });
  it("input[type=file]・input[type=image] は消え、ふつうの欄は残る", () => {
    const f = run(`<form><input type="file" name="f"><input type="image" src="/x"><input type="text" name="t"></form>`);
    expect(f.querySelectorAll("input").length).toBe(1);
    expect(f.querySelector("input")?.getAttribute("name")).toBe("t");
  });
  it("SVG の a は中身を残して外れ、SMIL が消える", () => {
    const f = run(`<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com"><text id="t">x</text></a><rect><set attributeName="href" to="javascript:1"/><animate attributeName="x" to="1"/></rect></svg>`);
    expect(f.querySelector("a")).toBeNull();
    expect(f.querySelector("#t")).not.toBeNull();
    expect(f.querySelector("set")).toBeNull();
    expect(f.querySelector("animate")).toBeNull();
  });
  it("style 要素と style 属性は残す（外への読み込みは CSP が止める）", () => {
    const f = run(`<style>p{color:red}</style><p style="color:blue">x</p>`);
    expect(f.querySelector("style")).not.toBeNull();
    expect(f.querySelector("p")?.getAttribute("style")).toBe("color:blue");
  });
  it("data-soda-action と data-soda-value は残る", () => {
    const f = run(`<button data-soda-action="go" data-soda-value="1">go</button>`);
    expect(f.querySelector("button")?.getAttribute("data-soda-action")).toBe("go");
    expect(f.querySelector("button")?.getAttribute("data-soda-value")).toBe("1");
  });
});
