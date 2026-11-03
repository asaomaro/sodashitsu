import {mount} from "@vue/test-utils";
import {createPinia} from "pinia";
import {afterEach,expect,it} from "vitest";
import {useSettingsStore} from "../store/settings.js";
import ThemeModeToggle from "./ThemeModeToggle.vue";
afterEach(()=>localStorage.clear());
it("cycles all three modes and persists the selected light/dark pair",async()=>{
 localStorage.clear();const pinia=createPinia(),settings=useSettingsStore(pinia);settings.setTheme("sodashitsu-assistant");
 const w=mount(ThemeModeToggle,{props:{variant:"sidebar"},global:{plugins:[pinia]}});
 expect(w.get('button').attributes('data-theme-mode')).toBe('light');
 for(const mode of ['dark','system','light']){await w.get('button').trigger('click');expect(w.get('button').attributes('data-theme-mode')).toBe(mode);expect(w.get('button').attributes('aria-label')).toContain('表示モード');}
 const restored=useSettingsStore(createPinia());expect(restored.theme).toBe('sodashitsu-assistant');expect(restored.themeAuto).toBe(false);expect(restored.themeDark).toBe('sodashitsu-assistant-dark');w.unmount();
});
