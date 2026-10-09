import type { MockInstance } from 'vitest';
import { NodeWorkerProcess } from '../../../src/core/jobs/infrastructure/node/node-worker-process.ts';

const FORCED_EXIT_AFTER_MS = 15_000;

class Exited extends Error {}

describe('NodeWorkerProcess', () => {
    let kill: MockInstance<typeof process.kill>;
    let exit: MockInstance<typeof process.exit>;

    const calls = (): { kill: unknown[][]; exit: unknown[][] } => ({
        kill: kill.mock.calls,
        exit: exit.mock.calls,
    });

    beforeEach(() => {
        vi.useFakeTimers();
        kill = vi.spyOn(process, 'kill').mockReturnValue(true);
        exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Exited('exit');
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('asks its own process to stop the way the platform does', () => {
        new NodeWorkerProcess().terminate();

        expect(calls()).toEqual({
            kill: [[process.pid, 'SIGTERM']],
            exit: [],
        });
    });

    it('asks once, however many handlers hang', () => {
        const workerProcess = new NodeWorkerProcess();

        workerProcess.terminate();
        workerProcess.terminate();

        expect(calls().kill).toHaveLength(1);
    });

    it('leaves with a failure code once the application has shut down', () => {
        const workerProcess = new NodeWorkerProcess();

        workerProcess.terminate();

        expect(() => {
            workerProcess.onApplicationShutdown();
        }).toThrow(Exited);
        expect(calls().exit).toEqual([[1]]);
    });

    it('leaves by force when the shutdown does not finish in time', () => {
        new NodeWorkerProcess().terminate();

        vi.advanceTimersByTime(FORCED_EXIT_AFTER_MS - 1);
        expect(calls().exit).toEqual([]);

        expect(() => vi.advanceTimersByTime(1)).toThrow(Exited);
        expect(calls().exit).toEqual([[1]]);
    });

    it('does not touch the exit of an ordinary shutdown', () => {
        new NodeWorkerProcess().onApplicationShutdown();

        vi.advanceTimersByTime(FORCED_EXIT_AFTER_MS);

        expect(calls()).toEqual({ kill: [], exit: [] });
    });
});
