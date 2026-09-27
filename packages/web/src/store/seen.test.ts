import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSeenStore } from "./seen.js";

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  localStorage.clear();
});

describe("useSeenStore", () => {
  it("記録が無ければ fallback を返す", () => {
    const store = useSeenStore(pinia);
    expect(store.getSeenSeq("a1", 3)).toBe(3);
  });

  it("markSeen の後は記録された値を返す", () => {
    const store = useSeenStore(pinia);
    store.markSeen("a1", 5);
    expect(store.getSeenSeq("a1", 0)).toBe(5);
  });

  it("localStorage へ永続化し、新しいストアでも読み直せる", () => {
    const store = useSeenStore(pinia);
    store.markSeen("a1", 7);
    const pinia2 = createPinia();
    const store2 = useSeenStore(pinia2);
    expect(store2.getSeenSeq("a1", 0)).toBe(7);
  });
});
