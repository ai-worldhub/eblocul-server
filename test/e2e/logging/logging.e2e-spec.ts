import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { EventLogger } from '../../../src/shared/logging/event-logger.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';
import { responseBody } from '../../utils/response-body.ts';
import './probe.log-events.ts';

type LogLine = Record<string, unknown>;

class ProbeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ProbeError';
    }
}

const stackOf = (line: LogLine | undefined): string | undefined =>
    (line?.['error'] as { stack?: string } | undefined)?.stack;

@Controller()
class LoggingProbeController {
    constructor(private readonly _events: EventLogger) {}

    @Get('health')
    health(): { status: string } {
        return { status: 'ok' };
    }

    @Get('metrics')
    metrics(): string {
        return 'probe_metric 1';
    }

    @Get('probe/items/:itemId')
    item(@Param('itemId') itemId: string): { itemId: string } {
        this._events.info('probe.item_viewed', { itemId });
        return { itemId };
    }

    @Post('probe/items')
    create(@Body() body: unknown): { ok: boolean } {
        void body;
        return { ok: true };
    }

    @Get('probe/boom')
    boom(): never {
        throw new Error('apartment42 of secret@example.com');
    }

    @Get('probe/leaky')
    leaky(): { ok: boolean } {
        this._events.info('probe.leaky', {
            itemId: 'item-9',
            session: {
                refreshToken: 'refresh-secret-value',
                nested: { password: 'password-secret-value' },
            },
        });
        return { ok: true };
    }

    @Get('probe/multiline')
    multiline(): never {
        throw new Error(
            'failed\n    at secret@example.com (apartment42.ts:1:1)\nat apartment42',
        );
    }

    @Get('probe/domain')
    domain(): never {
        throw new ProbeError('apartment42 for secret@example.com');
    }
}

describe('Structured logs (e2e)', () => {
    const lines: LogLine[] = [];
    let raw = '';
    let probe: ProbeApp;

    const flush = (): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, 20));

    beforeAll(async () => {
        const logs = new Writable({
            write: (chunk: Buffer, _encoding, callback) => {
                const text = chunk.toString();
                raw += text;
                for (const line of text
                    .split('\n')
                    .filter((part) => part !== '')) {
                    lines.push(JSON.parse(line) as LogLine);
                }
                callback();
            },
        });
        probe = await createProbeApp([LoggingProbeController], { logs });
    });

    beforeEach(() => {
        lines.length = 0;
        raw = '';
    });

    afterAll(async () => {
        await probe.app.close();
    });

    it('writes one http.request line with the route template and no request data', async () => {
        const response = await probe
            .http()
            .post('/api/v1/probe/items?q=apartment42')
            .send({ email: 'secret@example.com', unit: 'apartment42' })
            .expect(201);
        await flush();

        const requests = lines.filter(
            (line) => line['event'] === 'http.request',
        );
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            level: 30,
            method: 'POST',
            route: '/api/v1/probe/items',
            status: 201,
            userId: null,
            requestId: response.headers['x-request-id'],
        });
        expect(typeof requests[0]?.['durationMs']).toBe('number');
        expect(Object.keys(requests[0] ?? {})).not.toEqual(
            expect.arrayContaining(['req']),
        );
        expect(Object.keys(requests[0] ?? {})).not.toEqual(
            expect.arrayContaining(['res']),
        );
        expect(raw).not.toContain('secret@example.com');
        expect(raw).not.toContain('apartment42');
    });

    it('does not log health checks', async () => {
        await probe.http().get('/api/v1/health').expect(200);
        await flush();

        expect(
            lines.filter((line) => line['event'] === 'http.request'),
        ).toHaveLength(0);
    });

    it('does not log metrics scrapes', async () => {
        await probe.http().get('/api/v1/metrics').expect(200);
        await flush();

        expect(
            lines.filter((line) => line['event'] === 'http.request'),
        ).toHaveLength(0);
    });

    it('logs other requests to health paths', async () => {
        await probe.http().post('/api/v1/health').expect(404);
        await probe.http().get('/api/v1/healthcheck').expect(404);
        await probe.http().get('/api/v1/health/unknown').expect(404);
        await flush();

        expect(
            lines.filter((line) => line['event'] === 'http.request'),
        ).toHaveLength(3);
    });

    it('keeps a valid X-Request-Id and binds it to events inside the request', async () => {
        const requestId = randomUUID();
        const response = await probe
            .http()
            .get('/api/v1/probe/items/item-7')
            .set('X-Request-Id', requestId)
            .expect(200);
        await flush();

        expect(response.headers['x-request-id']).toBe(requestId);
        const viewed = lines.find(
            (line) => line['event'] === 'probe.item_viewed',
        );
        expect(viewed).toMatchObject({
            itemId: 'item-7',
            requestId,
            level: 30,
        });
        expect(
            lines.find((line) => line['event'] === 'http.request'),
        ).toMatchObject({
            route: '/api/v1/probe/items/:itemId',
            requestId,
        });
    });

    it('replaces an X-Request-Id that is not a UUID', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/items/item-1')
            .set('X-Request-Id', 'secret@example.com')
            .expect(200);
        await flush();

        expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
        expect(raw).not.toContain('secret@example.com');
    });

    it('returns requestId in the error body and logs 500 without the message', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/boom')
            .expect(500);
        await flush();
        const body = responseBody<{ code: string; requestId?: string }>(
            response,
        );

        expect(body.code).toBe('INTERNAL_ERROR');
        expect(body.requestId).toBe(response.headers['x-request-id']);
        const unhandled = lines.find(
            (line) => line['event'] === 'http.unhandled_error',
        );
        expect(unhandled).toMatchObject({
            level: 50,
            errorType: 'Error',
            errorCode: null,
            requestId: body.requestId,
        });
        expect(stackOf(unhandled)).toContain('at ');
        expect(
            lines.find((line) => line['event'] === 'http.request'),
        ).toMatchObject({
            level: 50,
            status: 500,
        });
        expect(raw).not.toContain('apartment42');
        expect(raw).not.toContain('secret@example.com');
    });

    it('masks fields with secret names at any depth', async () => {
        await probe.http().get('/api/v1/probe/leaky').expect(200);
        await flush();

        expect(
            lines.find((line) => line['event'] === 'probe.leaky'),
        ).toMatchObject({
            itemId: 'item-9',
            session: {
                refreshToken: '[redacted]',
                nested: { password: '[redacted]' },
            },
        });
        expect(raw).not.toContain('secret-value');
    });

    it('does not log message lines that look like stack frames', async () => {
        await probe.http().get('/api/v1/probe/multiline').expect(500);
        await flush();

        const stack = stackOf(
            lines.find((line) => line['event'] === 'http.unhandled_error'),
        );
        expect(stack).toContain('at LoggingProbeController.multiline');
        expect(raw).not.toContain('secret@example.com');
        expect(raw).not.toContain('apartment42');
    });

    it('keeps the stack of an error class that renames itself', async () => {
        await probe.http().get('/api/v1/probe/domain').expect(500);
        await flush();

        const unhandled = lines.find(
            (line) => line['event'] === 'http.unhandled_error',
        );
        expect(unhandled).toMatchObject({ errorType: 'ProbeError' });
        expect(stackOf(unhandled)).toContain(
            'at LoggingProbeController.domain',
        );
        expect(raw).not.toContain('secret@example.com');
    });

    it('adds requestId to handled error bodies too', async () => {
        const response = await probe.http().get('/api/v1/nowhere').expect(404);
        const body = responseBody<{ code: string; requestId?: string }>(
            response,
        );

        expect(body).toMatchObject({
            code: 'NOT_FOUND',
            requestId: response.headers['x-request-id'],
        });
    });
});
