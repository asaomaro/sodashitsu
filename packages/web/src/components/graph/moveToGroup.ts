/**
 * 「＋ workspace」で作った workspace を、表示中のグループへ入れる（20261008-graph-first PR3）。グループが、作っている間に消えていたなど
 * `group.add_member` が失敗したときは、黙らず、トーストを 1 つ出す（workspace は「グループなし」に残る）。
 */
export async function moveToGroup(
  request: (method: "group.add_member", params: { groupId: string; workspaceId: string }) => Promise<unknown>,
  toast: (message: string) => void,
  groupId: string,
  workspaceId: string,
): Promise<void> {
  try {
    await request("group.add_member", { groupId, workspaceId });
  } catch {
    toast("グループへ入れられませんでした（グループが無くなっています）。workspace は「グループなし」に作りました。");
  }
}
