import {execFile} from 'node:child_process';

export class CommandError extends Error {
  constructor(message: string, readonly uncertain = false) {super(message); this.name = 'CommandError';}
}
export type RunOptions = {cwd: string; signal?: AbortSignal; timeout?: number; mutation?: boolean};
export type Runner = (executable: string, args: string[], options: RunOptions) => Promise<string>;

export const run: Runner = (executable, args, options) => new Promise((resolve, reject) => {
  if (options.signal?.aborted) {reject(new CommandError('Request cancelled.')); return;}
  execFile(executable, args, {cwd: options.cwd, signal: options.signal, timeout: options.timeout ?? 15000,
    maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', windowsHide: true, shell: false}, (error, stdout, stderr) => {
    if (!error) {resolve(stdout); return;}
    const uncertain = Boolean(options.mutation && (error.killed || error.code === 'ABORT_ERR' || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'));
    reject(new CommandError(uncertain ? 'Write outcome unknown. Refresh and inspect the issue before allowing further edits.' :
      `${args[0]} failed: ${stderr.trim() || error.message}`, uncertain));
  });
});

export async function resolveExecutable(configured: string | undefined, cwd: string, useMise = false): Promise<string> {
  let executable = configured || 'bees';
  if (useMise) executable = (await run('mise', ['which', executable], {cwd})).trim();
  try {await run(executable, ['version'], {cwd});}
  catch (error) {throw new Error(`Cannot run Bees at ${executable}. Set --bees to the executable path${useMise ? '' : ' or try --mise'}. ${String(error)}`);}
  return executable;
}
