import { describe, expect, it, vi } from "vitest";
import { DefaultGitInfoPoller } from "./git/GitInfoPoller.js";
import { wireLayoutConfirmation } from "./layoutConfirmWiring.js";

// 20261004-group-worktree-items D18：一時停止中の 1 周の合図は捨て、再開後の 1 周で確定する。
describe("wireLayoutConfirmation", () => {
  it("stop 中に 1 周が終わっても確定せず、再開（start）後の 1 周で確定する", async () => {
    const poller = new DefaultGitInfoPoller({} as never, {} as never, 60_000);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const pollNow = vi.spyOn(poller, "pollNow").mockImplementationOnce(() => gate).mockResolvedValue(undefined);
    const confirmLayout = vi.fn();
    wireLayoutConfirmation(poller, { confirmLayout });

    poller.start(); // 1 周目が終わる前に
    poller.stop(); // 引き継ぎの一時停止
    release();
    await vi.waitFor(() => expect(pollNow).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20)); // 1 周目の合図が届くのを待つ
    expect(confirmLayout).not.toHaveBeenCalled();

    poller.start(); // 再開。また 1 周して合図を出す
    await vi.waitFor(() => expect(confirmLayout).toHaveBeenCalledTimes(1));
    poller.stop();
  });
});
