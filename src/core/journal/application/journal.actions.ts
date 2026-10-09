import { defineAction } from '../../authz/index.ts';

export const JOURNAL_READ_ENTRIES = defineAction({
    name: 'journal.read_entries',
    kind: 'read',
    grants: {
        administrator: ['perimeter'],
        chairman: ['perimeter'],
        chief_administrator: ['quarter'],
    },
});
