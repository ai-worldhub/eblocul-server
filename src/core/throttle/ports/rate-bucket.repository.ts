import type { Tx } from '../../../shared/db/tx.ts';
import type { RateLimit } from '../domain/rules/rate-limit.ts';

export type TokenRequest = {
    id: string;
    key: string;
    limit: RateLimit;
    now: Date;
};

export type TokenOutcome = {
    isTaken: boolean;
    isNew: boolean;
    fullAt: Date | null;
};

export abstract class RateBucketRepository {
    abstract takeToken(tx: Tx, request: TokenRequest): Promise<TokenOutcome>;
}
