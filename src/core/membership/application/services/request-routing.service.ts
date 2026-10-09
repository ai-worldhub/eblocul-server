import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import { MembershipError } from '../../domain/membership.errors.ts';
import {
    recipientsAmong,
    type RequestRecipients,
} from '../../domain/rules/request-recipients.ts';
import { RecipientQueries } from '../../ports/recipient-queries.port.ts';

@Injectable()
export class RequestRoutingService {
    constructor(private readonly _queries: RecipientQueries) {}

    async recipientsOf(tx: Tx, nodeId: string): Promise<RequestRecipients> {
        const responsible = await this._queries.responsibleFor(tx, nodeId);
        if (responsible === null) {
            throw new MembershipError(
                'MEMBERSHIP_NODE_NOT_FOUND',
                'Node is not found',
                { nodeId },
            );
        }
        return recipientsAmong(responsible);
    }
}
