import { writeFileSync } from 'node:fs';

writeFileSync(`/tmp/phase9-guardian-node-options-${process.ppid}`, 'loaded', { mode: 0o600 });
