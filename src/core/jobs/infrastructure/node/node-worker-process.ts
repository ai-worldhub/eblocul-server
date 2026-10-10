import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { WorkerProcess } from '../../ports/worker-process.port.ts';

const STOP_SIGNAL = 'SIGTERM';
const FAILURE_EXIT_CODE = 1;
const FORCED_EXIT_AFTER_MS = 15_000;

@Injectable()
export class NodeWorkerProcess implements WorkerProcess, OnApplicationShutdown {
    private _isTerminating = false;

    terminate(): void {
        if (this._isTerminating) {
            return;
        }
        this._isTerminating = true;
        setTimeout(() => {
            process.exit(FAILURE_EXIT_CODE);
        }, FORCED_EXIT_AFTER_MS).unref();
        process.kill(process.pid, STOP_SIGNAL);
    }

    onApplicationShutdown(): void {
        if (this._isTerminating) {
            process.exit(FAILURE_EXIT_CODE);
        }
    }
}
