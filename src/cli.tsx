#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {render, renderToString} from 'ink';
import {App} from './app.js';
import {LiveApp} from './live.js';
import {CliClient} from './client.js';
import {Session} from './session.js';
import {defaultConfigPath, findProject, loadPreferences} from './preferences.js';
import {resolveExecutable} from './process.js';

try {
  const {values} = parseArgs({options: {
    demo: {type: 'boolean'}, ascii: {type: 'boolean'}, 'no-motion': {type: 'boolean'}, preview: {type: 'boolean'}, help: {type: 'boolean'},
    project: {type: 'string'}, bees: {type: 'string'}, mise: {type: 'boolean'}, theme: {type: 'string'},
    config: {type: 'string'}, 'poll-ms': {type: 'string'}, 'screen-reader': {type: 'boolean'},
  }});
  if (values.help) {
    console.log(`bees-tui / an interactive Bees workbench

bees-tui --project <directory> [--bees <executable>]
bees-tui --demo

--project       Initialized project (defaults to current directory/ancestors)
--bees          Bees executable path (also BEES_BIN)
--mise          Resolve the executable through mise
--poll-ms       Refresh interval, default 2500, minimum 500
--theme         honey | paper | terminal
--ascii         ASCII interface symbols
--no-motion     Disable animation
--screen-reader Accessible rendering, no animation or alternate screen
--config        User preferences file
--demo          Fictional in-memory demo; never opens a real project
--preview       Static fictional preview

Keys: : commands, / search, e edit, 3 graph, r refresh, ? help, q quit.
Writes use the Bees CLI. External CLI updates are refreshed automatically.`);
  } else if (values.demo || values.preview) {
    if (values.preview || !process.stdin.isTTY || !process.stdout.isTTY) console.log(renderToString(<App width={132} height={32} interactive={false} motion={false} ascii={values.ascii}/>, {columns: 132}));
    else await render(<App ascii={values.ascii} motion={!values['no-motion'] && !process.env.NO_COLOR}/>, {alternateScreen: true, maxFps: 30}).waitUntilExit();
  } else {
    const project = await findProject(values.project || process.cwd());
    const executable = await resolveExecutable(values.bees || process.env.BEES_BIN, project, values.mise);
    const configPath = values.config || defaultConfigPath();
    const {preferences, warning} = loadPreferences(configPath);
    if (values.theme) {if (!['honey', 'paper', 'terminal'].includes(values.theme)) throw new Error('Theme must be honey, paper or terminal.'); preferences.theme = values.theme as typeof preferences.theme;}
    if (values.ascii || values['screen-reader']) preferences.ascii = true;
    if (values['no-motion'] || values['screen-reader'] || process.env.NO_COLOR) preferences.motion = false;
    preferences.recent = [project, ...preferences.recent.filter(path => path !== project)].slice(0, 20);
    const interval = Number(values['poll-ms'] || 2500);
    if (!Number.isFinite(interval) || interval < 500) throw new Error('--poll-ms must be at least 500.');
    const client = new CliClient(project, executable);
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      const issues = await client.list();
      console.log(`${project}\n${issues.map(issue => `${issue.id} [${issue.rawStatus || issue.status}] P${issue.priority} ${issue.title}`).join('\n')}`);
    } else {
      const session = new Session(client, interval);
      const instance = render(<LiveApp session={session} preferences={preferences} configPath={configPath} warning={warning}/>,
        {alternateScreen: !values['screen-reader'], isScreenReaderEnabled: values['screen-reader'], maxFps: 30});
      try {await instance.waitUntilExit();} finally {session.dispose();}
    }
  }
} catch (error) {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;}
