<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { TerminalRegistryKey } from "../injection.js";
import { TERMINAL_FONT_FAMILY } from "../term/terminalFonts.js";
import { installQueryFilter } from "../term/QueryFilter.js";
import { isEmbeddedAppEscape } from "../term/embeddedKeys.js";
import { createImageAddon } from "../term/imageAddon.js";

const props = defineProps<{
  paneId: string;
  interactive?: boolean;
  enabled?: boolean;
  canInput?: () => boolean;
}>();
const emit = defineEmits<{ escape: [] }>();
function onKeydown(ev: KeyboardEvent): void {
  if (!isEmbeddedAppEscape(ev)) return;
  ev.preventDefault();
  ev.stopPropagation();
  emit("escape");
}
const registry = inject(TerminalRegistryKey, null);
const viewport = ref<HTMLElement | null>(null);
const mount = ref<HTMLElement | null>(null);
const error = ref(false);
let term: Terminal | undefined;
let off: (() => void) | undefined;
onMounted(() => {
  if (!registry || !mount.value) {
    error.value = true;
    return;
  }
  term = new Terminal({
    ...registry.baseTerminalOptions(),
    allowProposedApi: true,
    disableStdin: true,
    screenReaderMode: !props.interactive,
    fontFamily: TERMINAL_FONT_FAMILY,
    theme: registry.currentTheme(),
    scrollback: 5000,
  });
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
  try {
    const image = createImageAddon();
    if (image) term.loadAddon(image);
  } catch {
    /* text remains available */
  }
  installQueryFilter(term);
  term.open(mount.value);
  // The author iframe cannot focus or type into this native DOM. Input still requires
  // a user-engaged frame, focused native textarea, and a live workspace check.
  term.attachCustomKeyEventHandler((ev) => !isEmbeddedAppEscape(ev));
  term.onData((data) => {
    if (
      !props.interactive ||
      !props.enabled ||
      !props.canInput?.() ||
      error.value ||
      document.activeElement !== term?.textarea
    )
      return;
    registry.sendMirrorInput(props.paneId, data);
  });
  term.options.disableStdin = !props.interactive || !props.enabled;
  term.textarea?.setAttribute(
    "aria-label",
    props.interactive ? "埋め込み端末への入力" : "埋め込み端末（閲覧専用）",
  );
  const write = (data: string | Uint8Array, reset = false) => {
    const el = viewport.value;
    const cursorBottom = () => {
      const screen = term?.element?.querySelector<HTMLElement>(".xterm-screen");
      return term && screen
        ? ((term.buffer.active.cursorY + 1) * screen.clientHeight) / term.rows
        : 0;
    };
    const follow =
      reset ||
      !el ||
      (term?.buffer.active.viewportY === term?.buffer.active.baseY &&
        el.scrollTop + el.clientHeight >= Math.min(el.scrollHeight, cursorBottom()) - 2);
    term?.write(data, () => {
      if (follow && viewport.value)
        viewport.value.scrollTop = Math.max(0, cursorBottom() - viewport.value.clientHeight);
    });
  };
  off = registry.attachMirror(
    props.paneId,
    {
      refreshFonts: () => {
        term?.clearTextureAtlas();
        if (term) term.refresh(0, term.rows - 1);
      },
      setTheme: (theme) => {
        if (term) term.options.theme = theme;
      },
      onOutput: (_id, chunk) => write(chunk),
      onSnapshot: (_id, cols, rows, text) => {
        error.value = false;
        term?.resize(Math.max(1, cols), Math.max(1, rows));
        write(`\x1bc${text}`, true);
      },
      onSizeChanged: (_id, cols, rows) => term?.resize(Math.max(1, cols), Math.max(1, rows)),
    },
    () => {
      error.value = true;
    },
  );
});
watch(
  () => [props.interactive, props.enabled],
  () => {
    if (term) {
      term.options.disableStdin = !props.interactive || !props.enabled;
      term.options.screenReaderMode = !props.interactive;
      term.textarea?.setAttribute(
        "aria-label",
        props.interactive ? "埋め込み端末への入力" : "埋め込み端末（閲覧専用）",
      );
    }
  },
);
onBeforeUnmount(() => {
  off?.();
  term?.dispose();
});
</script>
<template>
  <div
    ref="viewport"
    class="embedded-terminal"
    data-embedded-terminal
    :data-pane-id="paneId"
    :data-interactive="interactive ? '1' : '0'"
    @keydown="onKeydown"
  >
    <div ref="mount" class="embedded-terminal-content" v-show="!error"></div>
    <p v-if="error" role="status">端末を読み込めませんでした</p>
  </div>
</template>
<style scoped>
.embedded-terminal {
  width: 100%;
  height: 100%;
  background: var(--soda-bg);
  overflow: auto;
}
.embedded-terminal-content {
  min-width: 100%;
  width: max-content;
}
.embedded-terminal-content :deep(.xterm) {
  padding: 0;
}
</style>
