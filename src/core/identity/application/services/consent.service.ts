import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../../shared/clock/clock.service.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import { Ids } from '../../../../shared/ids/ids.service.ts';
import { IdentityError } from '../../domain/identity.errors.ts';

@Injectable()
export class ConsentService {
    private readonly _version: string;

    constructor(
        config: ConfigService,
        private readonly _clock: Clock,
        private readonly _ids: Ids,
    ) {
        this._version = config.getOrThrow<string>('LEGAL_CONSENT_VERSION');
    }

    currentVersion(): string {
        return this._version;
    }

    assertCurrent(version: string): void {
        if (version !== this._version) {
            throw new IdentityError(
                'IDENTITY_CONSENT_VERSION_OUTDATED',
                'Consent was given to an outdated version of the Policy and the Terms',
            );
        }
    }

    async accept(tx: Tx, accountId: string): Promise<void> {
        await tx.consent.createMany({
            data: [
                {
                    id: this._ids.next(),
                    accountId,
                    version: this._version,
                    acceptedAt: this._clock.now(),
                },
            ],
            skipDuplicates: true,
        });
    }
}
