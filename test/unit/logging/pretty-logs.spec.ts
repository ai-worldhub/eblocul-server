import { formatLogLine } from '../../../src/shared/logging/pretty-logs.ts';

const time = new Date(2026, 8, 16, 8, 5, 3, 7).getTime();

describe('app-pretty-logs', () => {
    it('puts an http request on one line', () => {
        expect(
            formatLogLine({
                level: 30,
                time,
                event: 'http.request',
                requestId: '8d3f2a1e-6b7c-4e21-9f0a-2c5d8e7b1a90',
                method: 'GET',
                route: '/api/v1/me/medications/:medicationId',
                status: 200,
                durationMs: 3,
                userId: null,
            }),
        ).toBe(
            '08:05:03.007  INFO   http.request  GET /api/v1/me/medications/:medicationId  200  3ms  req=8d3f2a1e',
        );
    });

    it('shows module event fields and a request without a route', () => {
        expect(
            formatLogLine({
                level: 40,
                time,
                event: 'access.code_expired',
                codeId: 'c1',
                days: 3,
            }),
        ).toBe('08:05:03.007  WARN   access.code_expired  codeId=c1 days=3');
        expect(
            formatLogLine({
                level: 30,
                time,
                event: 'http.request',
                method: 'GET',
                route: null,
                status: 404,
                durationMs: 0,
            }),
        ).toBe('08:05:03.007  INFO   http.request  GET (no route)  404  0ms');
    });

    it('keeps only own stack frames under an error', () => {
        const line = formatLogLine({
            level: 50,
            time,
            event: 'http.unhandled_error',
            errorType: 'Error',
            errorCode: null,
            error: {
                type: 'Error',
                stack: [
                    `    at Service.run (${process.cwd()}/src/demo/demo.service.ts:4:9)`,
                    `    at next (${process.cwd()}/node_modules/router/lib/route.js:157:13)`,
                    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
                ].join('\n'),
            },
        });

        expect(line.split('\n')).toEqual([
            '08:05:03.007  ERROR  http.unhandled_error  errorType=Error errorCode=null',
            '      at Service.run (src/demo/demo.service.ts:4:9)',
        ]);
    });

    it('prints Nest system lines with their context', () => {
        expect(
            formatLogLine({
                level: 30,
                time,
                event: 'Nest application successfully started',
                context: 'NestApplication',
            }),
        ).toBe(
            '08:05:03.007  INFO   [NestApplication] Nest application successfully started',
        );
    });
});
