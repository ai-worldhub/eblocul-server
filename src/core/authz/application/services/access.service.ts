import { Injectable } from '@nestjs/common';
import { DbService } from '../../../../shared/db/db.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { EventLogger } from '../../../../shared/logging/event-logger.ts';
import type { SessionContext } from '../../../identity/index.ts';
import { AuthzError, grantRequired } from '../../domain/authz.errors.ts';
import type { Access } from '../../domain/entities/access.ts';
import type { AccessScope } from '../../domain/entities/access-scope.ts';
import type {
    AccessTarget,
    TargetReference,
} from '../../domain/entities/access-target.ts';
import type { AccessAction } from '../../domain/rules/access-action.ts';
import {
    decide,
    isResidentRole,
    reliesOnTakeovers,
} from '../../domain/rules/access-decision.ts';
import { isUuid } from '../../domain/rules/identifiers.ts';
import { AccessQueries } from '../../ports/access-queries.port.ts';
import '../authz.log-events.ts';

export type AccessRequest = {
    grantId: string | null;
    action: AccessAction;
    target?: TargetReference;
};

const idOf = (reference: TargetReference): string =>
    reference.kind === 'node' ? reference.nodeId : reference.unitId;

@Injectable()
export class AccessService {
    constructor(
        private readonly _queries: AccessQueries,
        private readonly _db: DbService,
        private readonly _events: EventLogger,
    ) {}

    async open(
        session: SessionContext,
        request: AccessRequest,
    ): Promise<Access> {
        try {
            const grantId = request.grantId?.trim() ?? '';
            if (grantId === '') {
                throw grantRequired();
            }
            const grant = isUuid(grantId)
                ? await this._queries.grantOf(this._db, {
                      grantId,
                      accountId: session.accountId,
                  })
                : null;
            const decision = decide({
                grant,
                application: session.application,
                action: request.action,
                ...(grant === null || request.target === undefined
                    ? {}
                    : {
                          target: await this._target(this._db, request.target),
                      }),
            });
            return {
                accountId: session.accountId,
                application: session.application,
                grantId: decision.grant.id,
                role: decision.grant.role,
                unitId:
                    decision.grant.kind === 'membership'
                        ? decision.grant.unitId
                        : null,
                action: request.action,
                scope: decision.scope,
            };
        } catch (error) {
            throw this._refused(session.accountId, request.action, error);
        }
    }

    async confirm(
        tx: Tx,
        access: Access,
        target?: TargetReference,
    ): Promise<AccessScope> {
        try {
            const key = {
                grantId: access.grantId,
                accountId: access.accountId,
            };
            await this._queries.holdGrant(tx, {
                ...key,
                isMembership: isResidentRole(access.role),
                withTakeovers: reliesOnTakeovers(access.action, access.role),
            });
            const grant = await this._queries.grantOf(tx, key);
            const { scope } = decide({
                grant,
                application: access.application,
                action: access.action,
                ...(grant === null || target === undefined
                    ? {}
                    : { target: await this._target(tx, target) }),
            });
            return scope;
        } catch (error) {
            throw this._refused(access.accountId, access.action, error);
        }
    }

    private async _target(
        tx: Tx,
        reference: TargetReference,
    ): Promise<AccessTarget | null> {
        return isUuid(idOf(reference))
            ? this._queries.targetOf(tx, reference)
            : null;
    }

    private _refused(
        accountId: string,
        action: AccessAction,
        error: unknown,
    ): unknown {
        if (error instanceof AuthzError) {
            this._events.info('authz.access_refused', {
                accountId,
                action: action.name,
                code: error.code,
            });
        }
        return error;
    }
}
