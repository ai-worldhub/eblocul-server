import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OXLINT_CONFIG } from './oxlint-config.ts';

const TARGET = fileURLToPath(new URL('../oxlint.json', import.meta.url));

writeFileSync(TARGET, `${JSON.stringify(OXLINT_CONFIG, null, 4)}\n`);
