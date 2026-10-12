import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { safeText } from "./document.js";
import { TextInput } from "./TextInput.js";

type Node = DefaultTreeAdapterMap["node"];
export interface FormControl {
  type: "text" | "password" | "checkbox" | "radio" | "select" | "button" | "hidden";
  name: string;
  label: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  required: boolean;
  input: TextInput;
  options: { label: string; value: string }[];
  max: number;
  form: string | null;
  action?: string;
  direct?: boolean;
}
export interface FormDocument {
  lines: ({ text: string } | { control: FormControl })[];
  controls: FormControl[];
}
function attrs(node: Node): Record<string, string> {
  return "attrs" in node ? Object.fromEntries(node.attrs.map((a) => [a.name, a.value])) : {};
}
function children(n: Node): Node[] {
  return "childNodes" in n ? n.childNodes : [];
}
function text(n: Node, depth = 0): string {
  if (depth > 24) return "";
  if (n.nodeName === "#text") return safeText((n as DefaultTreeAdapterMap["textNode"]).value);
  if (["script", "style", "template", "iframe", "object"].includes(n.nodeName)) return "";
  return children(n)
    .map((c) => text(c, depth + 1))
    .join("");
}
/** HTMLをDOMとして実行せず、限られた静的フォームに読み替える。 */
export function simpleForm(source: string): FormDocument {
  const root = parseFragment(source.slice(0, 128_000));
  const result: FormDocument = { lines: [], controls: [] };
  const labels = new Map<string, string>();
  const scan = (n: Node, depth = 0) => {
    if (depth > 24) return;
    const a = attrs(n);
    if (n.nodeName === "label" && a.for) labels.set(a.for, text(n).trim());
    children(n).forEach((c) => scan(c, depth + 1));
  };
  scan(root);
  const unsupported = new Set<string>();
  let serial = 0;
  let truncated = false;
  const walk = (n: Node, form: string | null, disabled = false, label = "", depth = 0) => {
    if (depth > 24 || result.lines.length > 2000) {
      truncated = true;
      return;
    }
    const tag = n.nodeName,
      a = attrs(n);
    if (
      [
        "script",
        "style",
        "template",
        "iframe",
        "object",
        "svg",
        "math",
        "audio",
        "video",
        "img",
      ].includes(tag)
    )
      return;
    if (tag === "#text") {
      const value = text(n).replace(/\s+/g, " ").trim();
      if (value) result.lines.push({ text: value });
      return;
    }
    const off = disabled || a.disabled !== undefined;
    if (tag === "form") form = "form-" + serial++;
    if (tag === "label") label = text(n).trim();
    if (["input", "textarea", "select", "button"].includes(tag)) {
      if (result.controls.length >= 64) {
        result.lines.push({ text: "フォームの入力欄が上限64件を超えています。" });
        if (form) unsupported.add(form);
        return;
      }
      if (a.form !== undefined) {
        truncated = true;
        result.lines.push({
          text: "form属性による別フォームへの関連付けは未対応です。送信を無効にしました。",
        });
      }
      const inputType = (a.type ?? "text").toLowerCase();
      let type: FormControl["type"] =
        tag === "button"
          ? "button"
          : tag === "select"
            ? "select"
            : tag === "textarea"
              ? "text"
              : inputType === "submit" || inputType === "button"
                ? "button"
                : (inputType as FormControl["type"]);
      if (["email", "url", "number", "search", "tel"].includes(type)) type = "text";
      if (!["text", "password", "checkbox", "radio", "select", "button", "hidden"].includes(type)) {
        result.lines.push({ text: "未対応の入力欄: " + inputType });
        if (form) unsupported.add(form);
        return;
      }
      const options: { label: string; value: string }[] = [];
      let selected: string | undefined;
      if (tag === "select") {
        const visit = (c: Node, d = 0, off = false) => {
          if (d > 24) return;
          const ca = attrs(c);
          off = off || ca.disabled !== undefined;
          if (c.nodeName === "option" && !off) {
            const value = ca.value ?? text(c);
            options.push({ label: text(c).trim(), value });
            if (ca.selected !== undefined) selected = value;
          }
          children(c).forEach((x) => visit(x, d + 1, off));
        };
        children(n).forEach((c) => visit(c));
        if (a.multiple !== undefined) {
          if (form) unsupported.add(form);
          result.lines.push({ text: "select multiple は未対応です。" });
        }
      }
      const value =
        type === "select"
          ? (selected ?? options[0]?.value ?? "")
          : tag === "textarea"
            ? text(n)
            : (a.value ?? (type === "checkbox" || type === "radio" ? "on" : ""));
      const action = a["data-soda-action"];
      const max = Math.min(4096, Math.max(0, Number(a.maxlength) || 4096));
      const control: FormControl = {
        type,
        name: a.name ?? "",
        label: safeText(
          a["aria-label"] ??
            labels.get(a.id ?? "") ??
            (tag === "button" ? text(n).trim() : label || a.name || "入力"),
        ),
        value: safeText(value),
        input: new TextInput(safeText(value)),
        checked: a.checked !== undefined,
        disabled: off,
        required: a.required !== undefined,
        max,
        options,
        form,
        ...(action ? { action, direct: true } : {}),
      };
      if (type === "button") {
        if (action) control.value = a["data-soda-value"] ?? a.value ?? "";
        else {
          let parent = (n as DefaultTreeAdapterMap["element"]).parentNode;
          while (parent) {
            const pa = attrs(parent);
            if (parent.nodeName === "form") {
              if (pa["data-soda-action"]) control.action = pa["data-soda-action"];
              break;
            }
            parent = "parentNode" in parent ? parent.parentNode : null;
          }
        }
        if (
          ((tag === "button" && !["submit"].includes(a.type ?? "submit")) ||
            (tag === "input" && inputType !== "submit")) &&
          !action
        )
          control.disabled = true;
        if (!control.action) control.disabled = true;
      }
      result.controls.push(control);
      if (type !== "hidden") result.lines.push({ control });
      return;
    }
    children(n).forEach((c) => walk(c, form, off, label, depth + 1));
  };
  walk(root, null);
  for (const c of result.controls)
    if (c.type === "button" && !c.direct && c.form && unsupported.has(c.form)) c.disabled = true;
  if (truncated) {
    result.lines.unshift({ text: "フォームを完全に表示できません。送信を無効にしました。" });
    result.controls.forEach((c) => {
      if (c.type === "button") c.disabled = true;
    });
  }
  if (source.length > 128_000) {
    result.lines.unshift({
      text: "HTMLが表示上限を超えています。フォームの送信を無効にしました。",
    });
    result.controls.forEach((c) => {
      if (c.type === "button") c.disabled = true;
    });
  }
  return result;
}
/** HTMLのsuccessful controlsと同様、未選択・disabledを送らず重複名は最後を採用。 */
export function formData(doc: FormDocument, button: FormControl): Record<string, string> | null {
  if (button.direct) return button.value ? { value: button.value } : {};
  const data: Record<string, string> = Object.create(null);
  for (const c of doc.controls) {
    if (c.form !== button.form || c.disabled || c.type === "button") continue;
    const value = c.type === "text" || c.type === "password" ? c.input.value : c.value;
    if (
      c.required &&
      (c.type === "radio"
        ? !doc.controls.some(
            (x) =>
              x.type === "radio" &&
              x.form === c.form &&
              x.name === c.name &&
              x.checked &&
              !x.disabled,
          )
        : c.type === "checkbox"
          ? !c.checked
          : !value.trim())
    )
      return null;
    if (!c.name || ((c.type === "checkbox" || c.type === "radio") && !c.checked)) continue;
    data[c.name] = value;
  }
  if (button.name) data[button.name] = button.value;
  return data;
}
