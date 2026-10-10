import { computed } from "vue";
import { isMobileViewport } from "../mobile/detect.js";
import { useSettingsStore } from "../store/settings.js";

/**
 * 画面の様式（20261008-ui-style）を見る**1 つの口**。部品の配置をモダンだけ変えるときの判定は、ここだけを読む（部品の中で `settings.uiStyle === "modern"` を散らさない）。
 *
 * - `isModern`: 設定の様式がモダンか（見た目のトークンは CSS が `data-ui-style` で受ける。この値は、DOM の出し分けが要る所だけが読む）。
 * - `modernLayout`: モダンの**配置**を使うか。モダンで、かつ 1 列のモバイルの画面でないとき（モバイルの骨組みは様式で変えない）。
 *   サイドバー・tab バー・メニューの出し分けは、これを読む。
 * - `tabBarAlways`: tab が 1 つのときも tab バーを出すか（20261008-ui-style の AC24）。利用者が選んだ値（設定「tab が 1 つのときも tab バーを出す」）があればそれ、
 *   無ければ様式に従う（モダンの配置: 出す・クラシック: 出さない）。
 */
export function useUiStyle() {
  const settings = useSettingsStore();
  const mobile = isMobileViewport();
  const isModern = computed(() => settings.uiStyle === "modern");
  const modernLayout = computed(() => isModern.value && !mobile.value);
  const tabBarAlways = computed(() => settings.tabBarAlways ?? modernLayout.value);
  return { isModern, modernLayout, tabBarAlways };
}
