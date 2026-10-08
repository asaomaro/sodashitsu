import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import DisplayDropZones from "./DisplayDropZones.vue";

const mountIt = (props: { zone: "top" | "bottom" | "left" | "right" | "float" | null; current: "top" | "bottom" | "left" | "right" | "float" | null; float: boolean }) => mount(DisplayDropZones, { props });
const zone = (w: ReturnType<typeof mountIt>, z: string) => w.get(`[data-display-drop-zone="${z}"]`);

describe("DisplayDropZones", () => {
  it("5 つの場所と文言。pointer-events: none の入れ物は aria-hidden", () => {
    const w = mountIt({ zone: null, current: null, float: false });
    expect(w.findAll("[data-display-drop-zone]").map((e) => e.attributes("data-display-drop-zone"))).toEqual(["top", "left", "float", "right", "bottom"]);
    expect(zone(w, "top").text()).toBe("上に置く");
    expect(zone(w, "bottom").text()).toBe("下に置く");
    expect(zone(w, "left").text()).toBe("左に置く");
    expect(zone(w, "right").text()).toBe("右に置く");
    expect(w.get("[data-display-drop-zones]").attributes("aria-hidden")).toBe("true");
  });
  it("PR-B では中央は「ここには置けません」。float が真なら「浮いた窓にする」", () => {
    expect(zone(mountIt({ zone: null, current: null, float: false }), "float").text()).toBe("ここには置けません");
    expect(zone(mountIt({ zone: null, current: null, float: true }), "float").text()).toBe("浮いた窓にする");
  });
  it("ポインタのある場所だけ強調（data-active）。いまの置き場所は「ここにあります」", () => {
    const w = mountIt({ zone: "left", current: "right", float: false });
    expect(w.findAll('[data-active="1"]').map((e) => e.attributes("data-display-drop-zone"))).toEqual(["left"]);
    expect(zone(w, "right").text()).toBe("右に置く（ここにあります）");
    expect(zone(w, "left").text()).toBe("左に置く");
  });
});
