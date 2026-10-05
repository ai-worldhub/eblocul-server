import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OXLINT_CONFIG } from '../../../scripts/oxlint-config.ts';

const CONFIG_FILE = fileURLToPath(
    new URL('../../../oxlint.json', import.meta.url),
);

describe('oxlint.json', () => {
    it('is what scripts/oxlint-config.ts generates: run npm run lint:config', () => {
        const written: unknown = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));

        expect(written).toEqual(OXLINT_CONFIG);
    });
});
