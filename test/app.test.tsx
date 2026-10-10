import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from 'ink-testing-library';
import {renderToString} from 'ink';
import stringWidth from 'string-width';
import {Activity, App} from '../src/app.js';
import type {AppProps} from '../src/app.js';

afterEach(() => {cleanup(); vi.useRealTimers(); vi.restoreAllMocks();});
const immediate = async () => {};
const pause = () => new Promise<void>(resolve => setImmediate(resolve));
async function boot(props: AppProps = {}) {
  const app = render(<App width={100} height={30} motion={false} save={immediate} {...props}/>);
  await vi.waitFor(() => expect(app.lastFrame()).toContain('DEMO / MEMORY ONLY'));
  await pause();
  return {...app, async key(value: string) {app.stdin.write(value); await pause();}};
}

describe('keyboard journeys', () => {
  it('completes a blocker, announces newly ready work, and undoes it', async () => {
    const app = await boot();
    await app.key('x');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('2 now ready: bees-43, bees-44'));
    expect(app.lastFrame()).toContain('2/10 complete');
    await app.key('u');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Previous change restored'));
    expect(app.lastFrame()).toContain('1/10 complete');
    expect(app.lastFrame()).toContain('bees-42  /  FEATURE');
  });
  it('routes typing to the editor instead of global commands', async () => {
    const app = await boot();
    await app.key('n');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('CAPTURE A NEW ISSUE'));
    await app.key('fix q x s n : keys');
    await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-51 created'));
    expect(app.lastFrame()).toContain('1/11 complete');
    expect(app.lastFrame()).toContain('fix q x s n : keys');
  });
  it('does not create an empty issue and Escape discards the draft', async () => {
    const app = await boot();
    await app.key('n');
    await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Please enter some text'));
    await app.key('\u001b');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE'));
    expect(app.lastFrame()).toContain('1/10 complete');
  });
  it('retains an edit after a failed save and retries without duplicate mutation', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Database is busy; draft kept.')).mockResolvedValue(undefined);
    const app = await boot({save});
    await app.key('n'); await app.key('Keep this draft'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Database is busy; draft kept.'));
    expect(app.lastFrame()).toContain('Keep this draft');
    expect(app.lastFrame()).toContain('1/10 complete');
    await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-51 created'));
    expect(app.lastFrame()).toContain('1/11 complete');
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('locks repeated mutation keys while a write is pending', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => {finish = resolve;}));
    const app = await boot({save});
    await app.key('x'); await app.key('x'); await app.key('u');
    expect(save).toHaveBeenCalledTimes(1);
    expect(app.lastFrame()).toContain('Saving in demo memory');
    finish();
    await vi.waitFor(() => expect(app.lastFrame()).toContain('2 now ready'));
  });
  it('searches commands, opens the board, and returns to work', async () => {
    const app = await boot();
    await app.key(':'); await app.key('board'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Open  4/6'));
    await app.key('1');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE'));
  });
  it('supports empty results, clearing search, and structured search', async () => {
    const app = await boot();
    await app.key('/'); await app.key('zzzznotfound'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('No matches'));
    await app.key('\u001b');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE  1/4'));
    await app.key('/'); await app.key('label:keyboard p:1'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE  1/1'));
  });
  it('follows a relationship and retraces its selection', async () => {
    const app = await boot();
    await app.key('3');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('RELATIONSHIP GRAPH'));
    await app.key('l');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-43  /  FEATURE'));
    await app.key('\u001b');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-42  /  FEATURE'));
  });
  it('changes detail sections and opens a full-width inspector', async () => {
    const app = await boot();
    await app.key(']');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('DESIGN'));
    await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).not.toContain('WORK QUEUE'));
    await app.key('\u001b');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE'));
  });
  it('saves a comment and exposes it in the Comments section', async () => {
    const app = await boot();
    await app.key('c'); await app.key('Ready for review'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Comment added to bees-42'));
    await app.key('[');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('you: Ready for review'));
  });
  it('moves a card into a real status while preserving board selection', async () => {
    const app = await boot({initialFilter: 'all'});
    await app.key('2'); await app.key('s'); await app.key('j'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-42 moved to In progress'));
    expect(app.lastFrame()).toContain('In progress  3/3');
    await app.key('1');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-42  /  FEATURE'));
  });
  it('provides readable help and inspection at the minimum supported size', async () => {
    const app = await boot({width: 48, height: 18});
    await app.key('?');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('j/k scroll'));
    for (let i = 0; i < 9; i++) await app.key('j');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Changes live only for this session'));
    expect(app.lastFrame()!.split('\n').length).toBeLessThanOrEqual(18);
    await app.key('\u001b');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE'));
    await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('OVERVIEW'));
    expect(app.lastFrame()!.split('\n').length).toBeLessThanOrEqual(18);
  });
  it('preserves an open draft when the terminal resizes', async () => {
    const app = await boot();
    await app.key('n'); await app.key('Resize keeps my text');
    app.rerender(<App width={48} height={18} motion={false} save={immediate}/>);
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Resize keeps my text'));
    await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-51 created'));
  });
});

describe('responsive terminal rendering', () => {
  it.each([[48, 18], [80, 24], [100, 30], [132, 32], [160, 40]])('fits a %i x %i terminal', (width, height) => {
    for (const view of ['work', 'board', 'links'] as const) {
      const output = renderToString(<App width={width} height={height} initialView={view} initialFilter="all" interactive={false} motion={false}/>, {columns: width});
      const lines = output.split('\n');
      expect(lines.length).toBeLessThanOrEqual(height);
      for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(width);
      expect(output).toContain('q: quit');
    }
  });
  it('renders a useful minimum-size notice', () => {
    const output = renderToString(<App width={40} height={12} interactive={false}/>, {columns: 40});
    expect(output).toContain('Resize to at least 48 x 18');
  });
  it('has a static ASCII mode', () => {
    const output = renderToString(<App width={100} height={30} ascii interactive={false} motion={false}/>, {columns: 100});
    expect(output).not.toMatch(/[🐝▸○◐◇✓✦✧…━─]/u);
  });
});

describe('motion lifecycle', () => {
  it('uses no timers when motion is disabled or the app is idle', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']});
    const timer = vi.spyOn(globalThis, 'setInterval');
    const app = render(<Activity pending={false} celebration={false} message="Idle" motion ascii/>);
    await pause();
    expect(timer).not.toHaveBeenCalled();
    app.rerender(<Activity pending celebration={false} message="Saving" motion={false} ascii/>);
    await pause();
    expect(timer).not.toHaveBeenCalled();
  });
  it('cleans up the saving spinner when unmounted', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']});
    const start = vi.spyOn(globalThis, 'setInterval');
    const stop = vi.spyOn(globalThis, 'clearInterval');
    const app = render(<Activity pending celebration={false} message="Saving" motion ascii/>);
    await pause();
    expect(start).toHaveBeenCalledTimes(1);
    const timer = start.mock.results[0]!.value;
    app.unmount(); await pause();
    expect(stop).toHaveBeenCalledWith(timer);
  });
  it('stops the success animation after its bounded duration', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']});
    const stop = vi.spyOn(globalThis, 'clearInterval');
    render(<Activity pending={false} celebration message="Saved" motion ascii/>);
    await pause();
    await vi.advanceTimersByTimeAsync(700);
    expect(stop).toHaveBeenCalled();
  });
});


