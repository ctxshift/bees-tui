import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
await mkdir('release', {recursive: true});
const outfile = `release/bees-tui${process.platform === 'win32' ? '.exe' : ''}`;
const result = await Bun.build({
  entrypoints: ['./src/cli.tsx'],
  compile: {outfile, autoloadDotenv: false, autoloadBunfig: false},
  minify: true,
  plugins: [{
    name: 'omit-optional-ink-devtools',
    setup(build) {
      // Ink's development-only dynamic import is otherwise eagerly included by
      // Bun 1.3.6. Standalone releases do not include React's optional debugger.
      build.onLoad({filter: /[/\\]ink[/\\]build[/\\]devtools\.js$/}, () => ({contents: 'export {};', loader: 'js'}));
    },
  }],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exitCode = 1;
} else console.log(`Built ${outfile} with Bun ${Bun.version}`);
