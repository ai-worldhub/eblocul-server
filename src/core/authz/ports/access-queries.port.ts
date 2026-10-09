import type { Tx } from '../../../shared/db/tx.ts';
import type {
    AccessTarget,
    TargetReference,
} from '../domain/entities/access-target.ts';
import type { Grant } from '../domain/entities/grant.ts';
import type { GrantView } from '../domain/entities/grant-view.ts';
import type { Application } from '../domain/rules/access-roles.ts';

export type GrantKey = {
    grantId: string;
    accountId: string;
};

export type GrantHold = GrantKey & {
    isMembership: boolean;
    withTakeovers: boolean;
};

export abstract class AccessQueries {
    abstract grantOf(tx: Tx, key: GrantKey): Promise<Grant | null>;
    abstract holdGrant(tx: Tx, hold: GrantHold): Promise<void>;
    abstract targetOf(
        tx: Tx,
        reference: TargetReference,
    ): Promise<AccessTarget | null>;
    abstract grantsOf(
        tx: Tx,
        accountId: string,
        application: Application,
    ): Promise<GrantView[]>;
}
