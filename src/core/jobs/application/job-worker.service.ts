import {
    Injectable,
    type OnApplicationBootstrap,
    type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import { EventLogger } from '../../../shared/logging/event-logger.ts';
import { type JobClass, parseJobClasses } from '../domain/job-class.ts';
import { JobHandlerRegistry } from './job-handler-registry.service.ts';
import { JobRunnerService } from './job-runner.service.ts';
import './jobs.log-events.ts';

const SHUTDOWN_GRACE_MS = 8000;

const pause = async (
    durationMs: number,
    signal: AbortSignal,
): Promise<boolean> => {
    try {
        await delay(durationMs, undefined, { signal });
        return true;
    } catch {
        return false;
    }
};

@Injectable()
export class JobWorkerService
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly _classes: JobClass[];
    private readonly _concurrency: number;
    private readonly _pollIntervalMs: number;
    private readonly _stopping = new AbortController();
    private _loops: Promise<void>[] = [];

    constructor(
        config: ConfigService,
        private readonly _runner: JobRunnerService,
        private readonly _handlers: JobHandlerRegistry,
        private readonly _events: EventLogger,
    ) {
        this._classes = parseJobClasses(
            config.get<string>('JOBS_WORKER_CLASSES'),
        );
        this._concurrency = config.getOrThrow<number>(
            'JOBS_WORKER_CONCURRENCY',
        );
        this._pollIntervalMs = config.getOrThrow<number>(
            'JOBS_POLL_INTERVAL_MS',
        );
    }

    onApplicationBootstrap(): void {
        this._loops = [
            ...Array.from({ length: this._concurrency }, () => this._work()),
            this._keepLeases(),
        ];
        this._events.info('jobs.worker_started', {
            concurrency: this._concurrency,
            kinds: this._handlers.kinds().length,
        });
    }

    async onModuleDestroy(): Promise<void> {
        this._stopping.abort();
        this._runner.stopActive();
        const grace = new AbortController();
        const isDrained = await Promise.race([
            Promise.all(this._loops).then(() => true),
            pause(SHUTDOWN_GRACE_MS, grace.signal).then(() => false),
        ]);
        grace.abort();
        const abandoned = isDrained ? 0 : await this._runner.releaseActive();
        this._events.info('jobs.worker_stopped', { abandoned });
    }

    private async _work(): Promise<void> {
        while (!this._stopping.signal.aborted) {
            const hasRun = await this._guarded(() =>
                this._runner.runNext(this._classes),
            );
            if (hasRun !== true) {
                await pause(this._pollIntervalMs, this._stopping.signal);
            }
        }
    }

    private async _keepLeases(): Promise<void> {
        while (!this._stopping.signal.aborted) {
            await this._guarded(() => this._runner.renewLeases());
            await pause(this._pollIntervalMs, this._stopping.signal);
        }
    }

    private async _guarded<T>(work: () => Promise<T>): Promise<T | null> {
        try {
            return await work();
        } catch (error) {
            this._events.error(
                'jobs.poll_failed',
                {},
                error instanceof Error ? error : undefined,
            );
            return null;
        }
    }
}
