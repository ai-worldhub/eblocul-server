import type { WorkerProcess } from '../../src/core/jobs/ports/worker-process.port.ts';

export class WorkerProcessDouble implements WorkerProcess {
    terminations = 0;
    onTerminate: () => void = () => undefined;

    terminate(): void {
        this.terminations += 1;
        this.onTerminate();
    }
}
