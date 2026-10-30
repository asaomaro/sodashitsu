import { DesktopAssistantPreferences } from "@sodashitsu/protocol";
import { characterBounds, type DisplayArea, type Rect } from "./geometry.js";

export interface NativeAdapter {
  displays(): readonly DisplayArea[];
  character(preferences: DesktopAssistantPreferences, bounds: Rect): void;
  hideCharacter(): void;
  tray(preferences: DesktopAssistantPreferences): void;
  closePanel(): void;
  openPanel(origin: string): void;
  startup(enabled: boolean): void;
}

/** No native or agent side effects on import. All transitions are serialized. */
export class AssistantController {
  private current: DesktopAssistantPreferences;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    initial: unknown,
    private readonly native: NativeAdapter,
    private readonly save: (preferences: DesktopAssistantPreferences) => Promise<void>,
  ) {
    this.current = DesktopAssistantPreferences.parse(initial);
  }
  get preferences(): DesktopAssistantPreferences {
    return structuredClone(this.current);
  }

  initialize(): void {
    this.render();
  }
  /** Keep the previous OS startup state until the serialized save/rollback completes. */
  async initializeManaged(serverOrigin: string): Promise<void> {
    await this.update({...this.preferences, enabled:true, serverOrigin, launchAtLogin:false});
  }
  update(input: unknown): Promise<DesktopAssistantPreferences> {
    const next = DesktopAssistantPreferences.parse(input);
    const operation = this.queue.then(async () => {
      const old = this.current;
      const startupChanged = old.launchAtLogin !== next.launchAtLogin;
      // Native startup can reject (for example an unpackaged development build).
      // Do not persist that unsupported request as a successful setting.
      if (startupChanged) this.native.startup(next.launchAtLogin);
      try {
        await this.save(next);
      } catch (error) {
        if (startupChanged) {
          try {
            this.native.startup(old.launchAtLogin);
          } catch (rollback) {
            throw new AggregateError([error, rollback], "設定の保存と自動起動の復元に失敗しました");
          }
        }
        throw error;
      }
      if (old.serverOrigin !== next.serverOrigin || !next.enabled) this.native.closePanel();
      this.current = next;
      this.render();
      return this.preferences;
    });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  refreshDisplays(): void {
    this.render();
  }
  openPanel(): void {
    if (this.current.enabled) this.native.openPanel(this.current.serverOrigin);
  }
  private render(): void {
    this.native.tray(this.preferences);
    if (!this.current.enabled || this.current.mode === "tray") this.native.hideCharacter();
    else
      this.native.character(
        this.preferences,
        characterBounds(this.current, this.native.displays()),
      );
  }
}
