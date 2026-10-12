import { expect, it } from "vitest";
import { ATTR } from "../render/color.js";
import { stringWidth } from "../render/width.js";
import { markdownRows } from "./document.js";
import { mermaidText } from "./mermaidText.js";
import { simpleForm, formData } from "./simpleForm.js";
it("renders Japanese Markdown emphasis, lists and tables within cell width", () => {
  const rows = markdownRows(
    "# 見出し\n\n**重要**な本文\n\n- 項目\n\n| 名前 | 値 |\n| --- | --- |\n| 日本語 | 3 |\n\n```js\nconsole.log(1)\n```",
    40,
  );
  const text = rows.map((r) => r.map((s) => s.text).join("")).join("\n");
  expect(text).toContain("見出し");
  expect(text).not.toContain("**");
  expect(rows.flat().find((s) => s.text.includes("重要"))?.attrs).toBe(ATTR.bold);
  expect(text).toContain("• 項目");
  expect(text).toContain("| 日本語");
  expect(text).toContain("│ console.log(1)");
  expect(rows.every((r) => stringWidth(r.map((s) => s.text).join("")) <= 40)).toBe(true);
});
it("draws Mermaid branches and sequences and preserves unsupported syntax", () => {
  const flow = mermaidText("flowchart LR\nA[開始] -->|成功| B[完了]\nA --> C[再試行]").join("\n");
  expect(flow).toContain("│ 開始 │ → (成功) │ 完了 │");
  expect(flow).toContain("│ 開始 │ → │ 再試行 │");
  const seq = mermaidText(
    "sequenceDiagram\nparticipant A as 利用者\nparticipant B as AI\nA->>B: 依頼\nB-->>A: 結果",
  ).join("\n");
  expect(seq).toContain("利用者");
  expect(seq).toContain("▶");
  expect(seq).toContain("◀");
  expect(seq).toContain("依頼");
  const unsupported = "flowchart LR\nsubgraph foo\nA-->B\nend";
  expect(mermaidText(unsupported).join("\n")).toContain(unsupported);
});
it("builds safe forms without running script and serializes successful fields", () => {
  const doc = simpleForm(
    '<script>throw Error("secret")</script><form data-soda-action="answer"><label>名前<input name="who" value="霊夢" required></label><input name="skip" value="bad" disabled><input type="checkbox" name="yes" checked><input type="checkbox" name="no"><select name="choice"><option value="x">青</option><option value="y" selected>赤</option></select><button name="submit" value="go">送信</button></form>',
  );
  expect(JSON.stringify(doc)).not.toContain("secret");
  const button = doc.controls.find((c) => c.type === "button")!;
  expect(formData(doc, button)).toEqual({ who: "霊夢", yes: "on", choice: "y", submit: "go" });
  doc.controls[0]!.input.value = "";
  expect(formData(doc, button)).toBeNull();
});
it("validates radio groups and disables a form whose controls cannot be represented", () => {
  const doc = simpleForm(
    '<form data-soda-action="answer"><input type="radio" name="r" value="a" required><input type="radio" name="r" value="b" checked><button>送信</button></form>',
  );
  expect(formData(doc, doc.controls[2]!)).toEqual({ r: "b" });
  const unsupported = simpleForm(
    '<form data-soda-action="answer"><input type="file" name="upload"><button>送信</button></form>',
  );
  expect(unsupported.controls[0]?.disabled).toBe(true);
});

it("preserves all quoted text within width instead of clipping the last cells", () => {
  const rows = markdownRows("> abcdefghij", 10);
  expect(rows.every((r) => stringWidth(r.map((s) => s.text).join("")) <= 10)).toBe(true);
  expect(
    rows
      .map((r) =>
        r
          .map((s) => s.text)
          .join("")
          .replace(/^│ /, ""),
      )
      .join(""),
  ).toBe("abcdefghij");
});
it("does not turn an undirected Mermaid connection into a directed arrow", () => {
  const source = "flowchart LR\nA --- B";
  const rows = mermaidText(source).join("\n");
  expect(rows).not.toContain("→");
  expect(rows).toContain("未対応");
  expect(rows).toContain(source);
});
it("disables incomplete forms on nesting, row truncation and external ownership", () => {
  for (const content of [
    '<form data-soda-action="a"><button>送信</button>' +
      "<div>".repeat(30) +
      '<input name="required" required>' +
      "</div>".repeat(30) +
      "</form>",
    '<form data-soda-action="a"><button>送信</button>' +
      "<p>説明</p>".repeat(2005) +
      '<input name="required" required></form>',
    '<form data-soda-action="a"><button>送信</button><input form="other" name="x"></form>',
  ])
    expect(simpleForm(content).controls.find((c) => c.type === "button")?.disabled).toBe(true);
});
it("reset and non-submit input buttons never submit a form implicitly", () => {
  const doc = simpleForm(
    '<form data-soda-action="a"><button type="reset">リセット</button><input type="button" value="button"><button>送信</button></form>',
  );
  expect(doc.controls.map((c) => c.disabled)).toEqual([true, true, false]);
});

it("keeps deeply nested quotations and all Japanese text within even and odd viewports",()=>{
  for(const width of [11,12]){
    const rows=markdownRows("> ".repeat(8)+"終わり",width);
    expect(rows.every(r=>stringWidth(r.map(s=>s.text).join(""))<=width)).toBe(true);
    expect(rows.map(r=>r.map(s=>s.text).join("").replace(/│ /g,"")).join("")).toBe("終わり");
  }
});
