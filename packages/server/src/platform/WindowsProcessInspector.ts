import { execFile } from "node:child_process";
import type { IProcessTreeNode } from "@vscode/windows-process-tree";
import type { DefaultShell, ForegroundJob, ForegroundProcess, ProcessInspector } from "./ProcessInspector.js";
import { isBusyFromForeground } from "./ProcessInspector.js";

export type WindowsProcessTreeNode = IProcessTreeNode;

/** `@vscode/windows-process-tree` への依存を切り出した口（Linux 上でも偽物で単体テストできるようにする）。 */
export interface WindowsProcessTreeProvider {
  getProcessTree(rootPid: number): Promise<WindowsProcessTreeNode | undefined>;
}

/**
 * 実物の `@vscode/windows-process-tree`（native module）を使う実装。
 * Windows 以外・native binding が無い環境では import 自体を試みない（optionalDependencies。research F8.11・design F4.9）。
 */
export class NativeWindowsProcessTreeProvider implements WindowsProcessTreeProvider {
  async getProcessTree(rootPid: number): Promise<WindowsProcessTreeNode | undefined> {
    if (process.platform !== "win32") {
      throw new Error("NativeWindowsProcessTreeProvider is only available on win32");
    }
    // 動的 import：Linux/macOS のビルドでこのモジュールの読み込みに失敗しても、他プラットフォームの起動を妨げない。
    let mod:typeof import("@vscode/windows-process-tree");
    try{mod=await import("@vscode/windows-process-tree");}catch{return cimProcessTree(rootPid);}
    return new Promise((resolve) => {
      mod.getProcessTree(rootPid, resolve, mod.ProcessDataFlag.CommandLine);
    });
  }
}

/**
 * Windows の前面プロセス検出（research.md F4.9・design.md「前面プロセスの特定」）。
 * シェルの子孫プロセスを走査し、**最も深い子孫**を前面とみなす（Unix の前面プロセスグループと完全には同等でない）。
 */
export class WindowsProcessInspector implements ProcessInspector {
  constructor(private readonly tree: WindowsProcessTreeProvider = new NativeWindowsProcessTreeProvider()) {}

  async foreground(shellPid: number): Promise<ForegroundProcess | null> {
    const root = await this.tree.getProcessTree(shellPid);
    if (!root) return null;
    const deepest = deepestNode(root);
    return { pid: deepest.pid, exe: deepest.name, argv: parseWindowsCommandLine(deepest.commandLine, deepest.name), cwd: null };
  }

  /** シェルから最も深い子孫までの経路上の**全プロセス**を返す（D45）。`foreground()` は末端だけを返すのに対し、
   *  `ProcessMatcher`（02-agent-detection）は npm/node のラッパーを見分けるため経路全体が要る。 */
  async foregroundJob(shellPid: number): Promise<ForegroundJob | null> {
    const root = await this.tree.getProcessTree(shellPid);
    if (!root) return null;
    const path = deepestPathNodes(root);
    const processes = path.map((n) => ({ pid: n.pid, exe: n.name, argv: parseWindowsCommandLine(n.commandLine, n.name), cwd: null }));
    return { processGroupId: shellPid, processes };
  }

  isBusy(shellPid: number, fg: ForegroundProcess | null): boolean {
    return isBusyFromForeground(shellPid, fg);
  }

  defaultShell(): DefaultShell {
    return { shell: "powershell.exe", args: [] };
  }
}

/** 単一の子を辿って最も深いノードを返す（複数の子があれば、その中でも最も深い経路を選ぶ）。 */
function deepestNode(node: WindowsProcessTreeNode): WindowsProcessTreeNode {
  if (node.children.length === 0) return node;
  let best = node;
  let bestDepth = 0;
  for (const child of node.children) {
    const candidate = deepestNode(child);
    const depth = pathDepth(candidate, child);
    // tie-break は最初に見つかった経路を優先する（コメントどおりに `>` にする。レビュー指摘：
    // `>=` だと同着のとき最後に見つかった経路で上書きしてしまっていた）。
    if (depth > bestDepth) {
      best = candidate;
      bestDepth = depth;
    }
  }
  return best;
}

// 簡易的な深さの見積もり（子孫を辿った回数）。tie-break は最初に見つかった経路を優先する。
function pathDepth(leaf: WindowsProcessTreeNode, from: WindowsProcessTreeNode): number {
  if (leaf.pid === from.pid) return 1;
  for (const child of from.children) {
    const d = pathDepth(leaf, child);
    if (d > 0) return d + 1;
  }
  return 0;
}

/** `node` から最も深い子孫までの経路を、`node` を含めて順に返す（D45。`foregroundJob` が使う）。
 *  tie-break は `deepestNode` と同じく最初に見つかった経路を優先する（`>`。同着で上書きしない）。 */
function deepestPathNodes(node: WindowsProcessTreeNode): WindowsProcessTreeNode[] {
  if (node.children.length === 0) return [node];
  let best: WindowsProcessTreeNode[] = [];
  for (const child of node.children) {
    const candidate = deepestPathNodes(child);
    if (candidate.length > best.length) best = candidate;
  }
  return [node, ...best];
}

/**
 * Windows のコマンドラインは 1 本の文字列で渡ってくる。ダブルクォートを尊重した素朴な分割で argv にする。
 * commandLine が無ければ実行ファイル名だけを argv[0] とする。
 */
export function parseWindowsCommandLine(commandLine: string | undefined, fallbackExe: string): string[] {
  if (!commandLine) return [fallbackExe];
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of commandLine) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === " " && !inQuotes) {
      if (current.length > 0) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) out.push(current);
  return out.length > 0 ? out : [fallbackExe];
}

/** ネイティブbindingが入らない環境でも、Windows標準CIMでプロセスツリーを読める。 */
async function cimProcessTree(rootPid:number):Promise<WindowsProcessTreeNode|undefined>{
 if(!Number.isSafeInteger(rootPid)||rootPid<1)return undefined;
 const script=`Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
 return new Promise(resolve=>execFile("powershell.exe",["-NoLogo","-NoProfile","-EncodedCommand",Buffer.from(script,"utf16le").toString("base64")],{timeout:1800,maxBuffer:8*1024*1024,windowsHide:true},(error,stdout)=>{
  if(error)return resolve(undefined);
  try{const rows=JSON.parse(stdout) as {ProcessId:number;ParentProcessId:number;Name:string;CommandLine?:string}[];
   const nodes=new Map<number,WindowsProcessTreeNode>(rows.map(p=>[p.ProcessId,{pid:p.ProcessId,name:p.Name,commandLine:p.CommandLine??"",children:[]}]));
   for(const p of rows)if(p.ProcessId!==p.ParentProcessId){const parent=nodes.get(p.ParentProcessId),child=nodes.get(p.ProcessId);if(parent&&child)parent.children.push(child);}
   resolve(nodes.get(rootPid));
  }catch{resolve(undefined);}
 }));
}
