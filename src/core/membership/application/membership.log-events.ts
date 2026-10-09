import type { ResidentRole } from '../domain/entities/unit-membership.entity.ts';
import type { AssignmentRole } from '../domain/rules/assignment-places.ts';
import type { ZoneReturnReason } from '../domain/rules/zone-return-reasons.ts';

type AssignmentFields = {
    assignmentId: string;
    accountId: string;
    nodeId: string;
};

declare module '../../../shared/logging/log-events.ts' {
    interface LogEvents {
        'membership.unit_bound': {
            membershipId: string;
            accountId: string;
            unitId: string;
            role: ResidentRole;
        };
        'membership.unit_unbound': {
            membershipId: string;
            accountId: string;
            unitId: string;
        };
        'membership.assigned': AssignmentFields & { role: AssignmentRole };
        'membership.assignment_ended': AssignmentFields & {
            role: AssignmentRole;
        };
        'membership.zone_taken': AssignmentFields;
        'membership.zone_returned': AssignmentFields & {
            reason: ZoneReturnReason;
        };
    }
}
