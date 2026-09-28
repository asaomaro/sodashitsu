/**
 * ブラウザの端末が持つ scrollback の行数（20260921-herdr-settings-gaps の D5）。規則は client-core の `prefs/scrollback.ts`
 * （web と端末版が同じ規則で読む。統合の review で移した）。今までの import 先を保つため再び出す。
 */
export {
  MOBILE_SCROLLBACK_LINES,
  effectiveScrollback,
  loadScrollbackPref,
  scrollbackChoices,
  type ScrollbackPref,
} from "@sodashitsu/client-core";
