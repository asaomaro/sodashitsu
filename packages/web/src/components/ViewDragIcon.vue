<template>
  <svg
    class="view-drag-icon"
    data-view-drag-icon
    viewBox="0 0 14 18"
    width="10"
    height="12"
    aria-hidden="true"
    focusable="false"
  >
    <circle
      v-for="(p, i) in [
        [4, 4],
        [10, 4],
        [4, 9],
        [10, 9],
        [4, 14],
        [10, 14],
      ]"
      :key="i"
      :cx="p[0]"
      :cy="p[1]"
      r="2"
      fill="currentColor"
    />
  </svg>
</template>
<style scoped>
.view-drag-icon {
  flex: none;
  display: block;
  width: 0.75em;
  height: 1em;
}
</style>
