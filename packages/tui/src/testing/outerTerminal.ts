import xtermHeadless from "@xterm/headless";
import xtermUnicode11 from "@xterm/addon-unicode11";

const { Terminal } = xtermHeadless;
const { Unicode11Addon } = xtermUnicode11;

/** テスト用の「外側の端末」（端末版の出力を流し込み、見えている文字を読む）。 */
export class OuterTerminal {
  readonly term: InstanceType<typeof Terminal>;

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, allowProposedApi: true });
    this.term.loadAddon(new Unicode11Addon());
    this.term.unicode.activeVersion = "11";
  }

  write(data: string): Promise<void> {
    return new Promise((resolve) => this.term.write(data, resolve));
  }

  line(y: number): string {
    return (this.term.buffer.active.getLine(y)?.translateToString(true) ?? "").trimEnd();
  }

  text(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.term.rows; y++) lines.push(this.line(y));
    return lines.join("\n");
  }

  get cursor(): { x: number; y: number } {
    return { x: this.term.buffer.active.cursorX, y: this.term.buffer.active.cursorY };
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  dispose(): void {
    this.term.dispose();
  }
}
