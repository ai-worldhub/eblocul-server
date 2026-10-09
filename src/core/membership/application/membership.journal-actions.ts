import { defineJournalAction } from '../../journal/index.ts';

export const ROLE_ASSIGNED = defineJournalAction({
    name: 'membership.role_assigned',
    details: {
        assignmentId: 'id',
        role: ['chief_administrator', 'administrator', 'chairman'],
    },
});

export const ROLE_ENDED = defineJournalAction({
    name: 'membership.role_ended',
    details: {
        assignmentId: 'id',
        role: ['chief_administrator', 'administrator', 'chairman'],
    },
});

export const ZONE_TAKEN = defineJournalAction({
    name: 'membership.zone_taken',
    details: { assignmentId: 'id' },
});

export const ZONE_RETURNED = defineJournalAction({
    name: 'membership.zone_returned',
    details: {
        assignmentId: 'id',
        reason: [
            'returned_by_chief',
            'zone_administrator_assigned',
            'chief_role_ended',
        ],
    },
});
