import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import stringWidth from 'string-width';
import {fit, usePalette} from './theme.js';

const graphemes = (value: string) => [...new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(value)].map(item => item.segment);
export function editText(value: string, cursor: number, action: 'left' | 'right' | 'backspace' | 'delete' | 'insert', input = '') {
  const segments = graphemes(value); const position = Math.max(0, Math.min(cursor, segments.length));
  if (action === 'left') return {value, cursor: Math.max(0, position - 1)};
  if (action === 'right') return {value, cursor: Math.min(segments.length, position + 1)};
  if (action === 'backspace') {if (position) segments.splice(position - 1, 1); return {value: segments.join(''), cursor: Math.max(0, position - 1)};}
  if (action === 'delete') {segments.splice(position, 1); return {value: segments.join(''), cursor: position};}
  const inserted = graphemes(input); segments.splice(position, 0, ...inserted);
  return {value: segments.join(''), cursor: position + inserted.length};
}

/** Owns text keys only; the modal owns submit, cancel and other control chords. */
export function Editor({value, onChange, width, height = 1, multiline = false, active = true}: {
  value: string; onChange: (value: string) => void; width: number; height?: number; multiline?: boolean; active?: boolean;
}) {
  const c = usePalette();
  const [cursor, setCursor] = useState(() => graphemes(value).length);
  useInput((input, key) => {
    if (key.escape || key.ctrl || key.meta || key.tab || (key.return && !multiline)) return;
    let result = {value, cursor};
    if (key.leftArrow) result = editText(value, cursor, 'left');
    else if (key.rightArrow) result = editText(value, cursor, 'right');
    else if (key.backspace) result = editText(value, cursor, 'backspace');
    else if (key.delete) result = editText(value, cursor, 'delete');
    else if (key.upArrow || key.downArrow) {
      const segments = graphemes(value);
      const before = segments.slice(0, cursor).join(''); const line = before.split('\n').length - 1;
      const lines = value.split('\n'); const column = graphemes(before.split('\n').at(-1) ?? '').length;
      const target = Math.max(0, Math.min(lines.length - 1, line + (key.upArrow ? -1 : 1)));
      result.cursor = lines.slice(0, target).reduce((sum, text) => sum + graphemes(text).length + 1, 0) + Math.min(column, graphemes(lines[target]!).length);
    } else if (key.return) result = editText(value, cursor, 'insert', '\n');
    else if (input) result = editText(value, cursor, 'insert', input.replace(/\r\n?/g, '\n').replace(multiline ? /[\x00-\x09\x0B-\x1F\x7F-\x9F]/g : /[\x00-\x1F\x7F-\x9F]/g, ''));
    setCursor(result.cursor); if (result.value !== value) onChange(result.value);
  }, {isActive: active});
  const segments = graphemes(value); const before = segments.slice(0, cursor).join('');
  const lines = value.split('\n'); const lineIndex = before.split('\n').length - 1;
  const column = graphemes(before.split('\n').at(-1) ?? '').length;
  const start = Math.max(0, lineIndex - height + 1);
  return <Box flexDirection="column" width={width} height={height}>
    {lines.slice(start, start + height).map((line, row) => {
      if (row + start !== lineIndex) return <Text color={c.text} key={row}>{fit(line, width)}</Text>;
      const parts = graphemes(line); let offset = 0;
      while (stringWidth(parts.slice(offset, column).join('')) >= Math.max(1, width - 2)) offset++;
      const prefix = parts.slice(offset, column).join(''); const cell = parts[column] || ' ';
      return <Text color={c.text} key={row}>{prefix}<Text backgroundColor={c.honey} color={c.dark}>{cell}</Text>{fit(parts.slice(column + 1).join(''), Math.max(0, width - stringWidth(prefix + cell)))}</Text>;
    })}
  </Box>;
}
