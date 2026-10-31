import { ref } from "vue";
/** Navigation state only; charts and reports are imported by the dashboard on demand. */
export const analyticsSelected = ref(false);
