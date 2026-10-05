import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { Environment } from '../configs/env.validation.ts';
import { EventLogger } from '../logging/event-logger.ts';
import type { LabSeed, LabSeedType } from './lab-seed.ts';
import { assertSeedable } from './seedable-environment.ts';
import { SeedingError } from './seeding.errors.ts';
import './seeding.log-events.ts';

export const LAB_SEED_TYPES = Symbol('LAB_SEED_TYPES');

const UNKNOWN_ERROR_TYPE = 'Unknown';

@Injectable()
export class SeedRunner {
    private readonly _environment: Environment;

    constructor(
        @Inject(LAB_SEED_TYPES)
        private readonly _types: readonly LabSeedType[],
        private readonly _moduleRef: ModuleRef,
        private readonly _events: EventLogger,
        config: ConfigService,
    ) {
        this._environment = config.getOrThrow<Environment>('NODE_ENV');
    }

    async run(): Promise<void> {
        assertSeedable(this._environment);
        const seeds = this._resolve();
        for (const seed of seeds) {
            await this._apply(seed);
        }
        this._events.info('seeding.finished', { seeds: seeds.length });
    }

    async runAndReport(): Promise<boolean> {
        try {
            await this.run();
            return true;
        } catch (error) {
            this._events.error('seeding.failed', {
                errorType:
                    error instanceof Error ? error.name : UNKNOWN_ERROR_TYPE,
                errorCode: error instanceof SeedingError ? error.code : null,
            });
            return false;
        }
    }

    private _resolve(): LabSeed[] {
        const seeds = this._types.map((type) =>
            this._moduleRef.get<LabSeed>(type, { strict: false }),
        );
        const names = new Set<string>();
        for (const { name } of seeds) {
            if (names.has(name)) {
                throw new SeedingError(
                    'SEEDING_NAME_DUPLICATED',
                    'Two seeds share the same name',
                    { name },
                );
            }
            names.add(name);
        }
        return seeds;
    }

    private async _apply(seed: LabSeed): Promise<void> {
        try {
            await seed.run();
        } catch (error) {
            this._events.error(
                'seeding.seed_failed',
                { seed: seed.name },
                error instanceof Error ? error : undefined,
            );
            throw error;
        }
        this._events.info('seeding.seed_applied', { seed: seed.name });
    }
}
