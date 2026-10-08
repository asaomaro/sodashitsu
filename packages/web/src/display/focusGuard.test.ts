import { describe, expect, it } from "vitest";
import { FocusGuard } from "./focusGuard.js";

describe("FocusGuard（フォーカスの番の状態機械）", () => {
  it("操作中でないのに枠がフォーカスを持つに『変わった』ときだけ steal。取られたままは数え直さない", () => {
    const g = new FocusGuard();
    expect(g.observe(false)).toBeNull();
    expect(g.observe(true)).toBe("steal");
    expect(g.observe(true)).toBeNull(); // 取られたまま（見回りのたび）
    expect(g.observe(true)).toBeNull();
    expect(g.observe(false)).toBeNull();
    expect(g.observe(true)).toBe("steal"); // 一度離れて、また取った＝新しい 1 回
  });

  it("操作中の枠のフォーカスは取ったことにしない。操作中の focus() も数えない", () => {
    const g = new FocusGuard();
    g.engage();
    expect(g.observe(true)).toBeNull();
    expect(g.observe(true)).toBeNull();
    expect(g.engaged).toBe(true);
  });

  it("枠がフォーカスを離れたら操作中は終わる。そのあとで取り返したら steal（操作を終えるために端末を押して、枠が自分の blur で取り返す）", () => {
    const g = new FocusGuard();
    g.engage();
    g.observe(true);
    expect(g.observe(false)).toBeNull();
    expect(g.engaged).toBe(false);
    expect(g.observe(true)).toBe("steal");
  });

  it("leave: 操作中を終え、フォーカスは枠に無いものとして扱う（そのあと枠が取れば steal）", () => {
    const g = new FocusGuard();
    g.engage();
    g.observe(true);
    g.leave();
    expect(g.engaged).toBe(false);
    expect(g.focused).toBe(false);
    expect(g.observe(true)).toBe("steal");
  });

  it("engage の前に取っていたものは、engage しても steal を遡って取り消さない（先に steal を返している）が、engage 後の observe(true) は数えない", () => {
    const g = new FocusGuard();
    expect(g.observe(true)).toBe("steal");
    g.engage();
    expect(g.observe(true)).toBeNull();
  });

  it("acceptKey: 操作中の escape だけ。prefix・操作中でない escape・ほかのキーは受けない", () => {
    const g = new FocusGuard();
    expect(g.acceptKey("escape")).toBe(false);
    expect(g.acceptKey("prefix")).toBe(false);
    g.engage();
    expect(g.acceptKey("escape")).toBe(true);
    expect(g.acceptKey("prefix")).toBe(false);
    expect(g.acceptKey("x")).toBe(false);
    g.leave();
    expect(g.acceptKey("escape")).toBe(false);
  });

  it("知らせを送れなかった分だけ、この画面の中で数え、3 回で『枠を外す』", () => {
    const g = new FocusGuard();
    expect(g.noteUnreported()).toBe(false);
    expect(g.noteUnreported()).toBe(false);
    expect(g.noteUnreported()).toBe(true);
  });
});
