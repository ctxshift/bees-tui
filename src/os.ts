import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export async function copyText(text: string): Promise<void> {
  const commands: [string, string[]][] = process.platform === 'win32' ? [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$input | Set-Clipboard']]] :
    process.platform === 'darwin' ? [['pbcopy', []]] : process.env.WAYLAND_DISPLAY ? [['wl-copy', []], ['xclip', ['-selection', 'clipboard']]] : [['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  for (const [executable, args] of commands) {
    try {await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe']});
      const timeout = setTimeout(() => {child.kill(); reject(new Error('Clipboard timed out.'));}, 3000);
      child.once('error', error => {clearTimeout(timeout); reject(error);});
      child.once('exit', code => {clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Clipboard unavailable.'));});
      child.stdin.on('error', () => {}); child.stdin.end(text);
    }); return;} catch {}
  }
  throw new Error(`Clipboard unavailable. Issue ID: ${text}`);
}

export async function externalEdit(value: string, executable: string, args: string[], suspend: (action: () => Promise<void>) => Promise<void>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bees-tui-edit-'));
  const file = join(directory, 'draft.md');
  await writeFile(file, value, {mode: 0o600});
  try {
    await suspend(() => new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [...args, file], {stdio: 'inherit', shell: false, windowsHide: false});
      child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Editor exited with ${code}.`)));
    }));
    const result = await readFile(file, 'utf8');
    await rm(directory, {recursive: true}); // exclusively owned mkdtemp directory
    return result;
  } catch (error) {throw new Error(`${String(error)} Draft retained at ${file}`);}
}
