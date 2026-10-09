import { MembershipError } from '../membership.errors.ts';

export type ResidentRole = 'owner' | 'family_member' | 'tenant';

export type UnitMembershipSnapshot = {
    id: string;
    accountId: string;
    unitId: string;
    role: ResidentRole;
    startedAt: Date;
    endedAt: Date | null;
};

export class UnitMembershipEntity {
    private constructor(private snapshot: UnitMembershipSnapshot) {}

    static start(input: {
        id: string;
        accountId: string;
        unitId: string;
        role: ResidentRole;
        now: Date;
    }): UnitMembershipEntity {
        return new UnitMembershipEntity({
            id: input.id,
            accountId: input.accountId,
            unitId: input.unitId,
            role: input.role,
            startedAt: input.now,
            endedAt: null,
        });
    }

    static restore(snapshot: UnitMembershipSnapshot): UnitMembershipEntity {
        return new UnitMembershipEntity(snapshot);
    }

    acceptRepeat(repeat: UnitMembershipEntity): void {
        if (this.snapshot.role !== repeat.snapshot.role) {
            throw new MembershipError(
                'MEMBERSHIP_UNIT_ROLE_CONFLICT',
                'The account already holds another role on this unit',
                { unitId: this.snapshot.unitId, role: this.snapshot.role },
            );
        }
    }

    end(now: Date): boolean {
        if (this.snapshot.endedAt !== null) {
            return false;
        }
        this.snapshot = { ...this.snapshot, endedAt: now };
        return true;
    }

    view(): UnitMembershipSnapshot {
        return { ...this.snapshot };
    }
}
