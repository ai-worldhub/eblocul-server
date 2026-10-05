import {
    defineJob,
    type JobDefinition,
    JobHandler,
    type JobRun,
} from '../../src/core/jobs/index.ts';

export type ProbePayload = { label: string };

type Behaviour = (payload: ProbePayload, run: JobRun) => Promise<void>;

export const PROBE_JOB = defineJob<ProbePayload>({
    kind: 'probe.work',
    class: 'p1',
    retry: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60_000 },
});

export const BARRIER_JOB = defineJob<ProbePayload>({
    kind: 'probe.barrier',
    class: 'p3',
});

export const UNKNOWN_JOB = defineJob<ProbePayload>({
    kind: 'probe.unknown',
    class: 'p0',
});

export class JobHandlerDouble extends JobHandler<ProbePayload> {
    readonly runs: { label: string; attempt: number }[] = [];
    behaviour: Behaviour = () => Promise.resolve();

    constructor(readonly job: JobDefinition<ProbePayload>) {
        super();
    }

    async handle(payload: ProbePayload, run: JobRun): Promise<void> {
        this.runs.push({ label: payload.label, attempt: run.attempt });
        await this.behaviour(payload, run);
    }
}

export class ProbeHandlerDouble extends JobHandlerDouble {
    constructor() {
        super(PROBE_JOB);
    }
}

export class BarrierHandlerDouble extends JobHandlerDouble {
    constructor() {
        super(BARRIER_JOB);
    }
}
