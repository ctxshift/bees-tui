import stringWidth from 'string-width';
import {createContext, useContext} from 'react';

export const colors = {
  honey: '#E9B949', text: '#DFE5EF', muted: '#97A5BA', border: '#536174',
  green: '#83D6AC', blue: '#8FBDF3', purple: '#C1A0EF', red: '#F2919A',
  selected: '#293344', dark: '#171D28',
};
export type Palette = Omit<typeof colors, 'text'> & {text: string | undefined};
export const palettes: Record<'honey' | 'paper' | 'terminal', Palette> = {
  honey: colors,
  paper: {honey: '#885D00', text: '#172638', muted: '#49586A', border: '#8B97A5', green: '#176445', blue: '#225FA1', purple: '#71469C', red: '#B13145', selected: '#F5DF9B', dark: '#FAF8F1'},
  terminal: {honey: 'yellow', text: undefined, muted: 'gray', border: 'gray', green: 'green', blue: 'cyan', purple: 'magenta', red: 'red', selected: 'black', dark: 'black'},
};
export const ThemeContext = createContext<Palette>(colors);
export const usePalette = () => useContext(ThemeContext);
export const statusPalette = (palette: Palette) => ({open: palette.honey, in_progress: palette.blue, deferred: palette.purple, closed: palette.green});
export const statusLabels = {open: 'Open', in_progress: 'In progress', deferred: 'Deferred', closed: 'Closed'};
export const statusColors = {open: colors.honey, in_progress: colors.blue, deferred: colors.purple, closed: colors.green};
export const statusSymbols = {open: '○', in_progress: '◐', deferred: '◇', closed: '✓'};
export const asciiBorder = {topLeft: '+', top: '-', topRight: '+', left: '|', bottomLeft: '+', bottom: '-', bottomRight: '+', right: '|'};

// Strip terminal controls before measuring or displaying external/user text.
export function clean(value: string): string {
  return value.replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
}

export function fit(value: string, columns: number, ascii = false): string {
  const width = Math.max(0, columns);
  const safe = clean(value);
  if (stringWidth(safe) <= width) return safe.padEnd(safe.length + width - stringWidth(safe));
  const marker = ascii ? '~' : '…';
  if (width === 0) return '';
  let result = '';
  for (const {segment} of new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(safe)) {
    if (stringWidth(result + segment) > width - 1) break;
    result += segment;
  }
  return result + ' '.repeat(Math.max(0, width - 1 - stringWidth(result))) + marker;
}

export function viewport<T>(items: T[], index: number, count: number): T[] {
  const size = Math.max(1, count);
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), items.length - size));
  return items.slice(start, start + size);
}
