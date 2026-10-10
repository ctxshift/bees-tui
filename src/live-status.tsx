import {useEffect, useState} from 'react';
import {Text} from 'ink';
import {usePalette} from './theme.js';

export function LiveStatus({refreshedAt, stale, uncertain, motion, ascii}: {
  refreshedAt: number; stale: boolean; uncertain: boolean; motion: boolean; ascii: boolean;
}) {
  const c = usePalette();
  const [receiving, setReceiving] = useState(false);
  useEffect(() => {
    if (!motion || !refreshedAt || stale || uncertain) {setReceiving(false); return;}
    setReceiving(true);
    const timer = setTimeout(() => setReceiving(false), 650);
    return () => clearTimeout(timer);
  }, [refreshedAt, motion, stale, uncertain]);
  if (uncertain) return <Text color={c.red}>! CHECK WRITE RESULT</Text>;
  if (stale) return <Text color={c.red}>! STALE / r retry</Text>;
  const time = refreshedAt ? new Date(refreshedAt).toLocaleTimeString('en-GB', {hour12: false}) : '--:--:--';
  return <Text color={c.muted}><Text color={refreshedAt ? c.green : c.honey} dimColor={motion && !receiving}>{ascii ? '*' : '●'}</Text>{` ${refreshedAt ? 'Live' : 'Wait'} ${time}`}</Text>;
}
