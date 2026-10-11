import type { PluginTab, ExtensionInfo } from "@sodashitsu/protocol";
/** Current definitions update existing tabs too; persisted metadata supports disconnected startup. */
export function pluginMobileDisplay(
  plugin: PluginTab | undefined,
  definitions: ExtensionInfo[] | undefined,
): string | undefined {
  if (!plugin) return undefined;
  const definition = definitions?.find((e) => e.key === plugin.extensionKey)?.tabView;
  return definition?.display === plugin.display ? definition.mobileDisplay : plugin.mobileDisplay;
}
