import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JobsError } from '../domain/jobs.errors.ts';
import type { JobHandler, JobHandlerType } from '../ports/job-handler.port.ts';

export const JOB_HANDLER_TYPES = Symbol('JOB_HANDLER_TYPES');

@Injectable()
export class JobHandlerRegistry implements OnModuleInit {
    private readonly _byKind = new Map<string, JobHandler>();

    constructor(
        @Inject(JOB_HANDLER_TYPES)
        private readonly _types: readonly JobHandlerType[],
        private readonly _moduleRef: ModuleRef,
    ) {}

    onModuleInit(): void {
        for (const type of this._types) {
            const handler = this._moduleRef.get<JobHandler>(type, {
                strict: false,
            });
            const { kind } = handler.job;
            if (this._byKind.has(kind)) {
                throw new JobsError(
                    'JOBS_KIND_DUPLICATED',
                    'Two handlers claim the same job kind',
                    { kind },
                );
            }
            this._byKind.set(kind, handler);
        }
    }

    kinds(): string[] {
        return [...this._byKind.keys()];
    }

    handlerOf(kind: string): JobHandler {
        const handler = this._byKind.get(kind);
        if (handler === undefined) {
            throw new JobsError(
                'JOBS_KIND_UNKNOWN',
                'No handler is registered for the job kind',
                { kind },
            );
        }
        return handler;
    }
}
