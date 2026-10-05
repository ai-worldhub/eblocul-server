import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, MinLength, ValidateNested } from 'class-validator';
import type { Response } from 'supertest';
import { PaginationError } from '../../../src/shared/http/pagination.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';
import { responseBody } from '../../utils/response-body.ts';

const OVER_BODY_LIMIT = 150_000;
const RETRY_AFTER_SECONDS = 42;

type ErrorBody = {
    code: string;
    message: string;
    details?: Record<string, unknown>;
};

const withoutRequestId = (response: Response): ErrorBody => {
    const { requestId, ...body } = responseBody<
        ErrorBody & { requestId?: unknown }
    >(response);
    expect(requestId).toBe(response.headers['x-request-id']);
    return body;
};

class MetaInput {
    @IsString()
    @MinLength(2)
    title: string;
}

class CheckRequest {
    @ValidateNested()
    @Type(() => MetaInput)
    meta: MetaInput;
}

class UnregisteredError extends Error {
    readonly code = 'SOMETHING_UNREGISTERED';
}

@Controller('probe')
class ErrorsProbeController {
    @Get('registered')
    registered(): never {
        throw new PaginationError();
    }

    @Get('unregistered')
    unregistered(): never {
        throw new UnregisteredError('Code is not in any status table');
    }

    @Get('unauthorized')
    unauthorized(): never {
        throw new UnauthorizedException();
    }

    @Get('coded')
    coded(): never {
        throw new BadRequestException({
            code: 'CUSTOM_CODE',
            message: 'Custom message',
            details: { reason: 'test' },
        });
    }

    @Get('code-only')
    codeOnly(): never {
        throw new BadRequestException({ code: 'CODE_ONLY' });
    }

    @Get('leaky')
    leaky(): never {
        throw new BadRequestException({
            code: 'LEAKY',
            message: 'Leaky message',
            internalUserId: 'user-42',
            details: 'not an object',
        });
    }

    @Get('throttled')
    throttled(): never {
        throw new HttpException(
            {
                code: 'TOO_MANY_ATTEMPTS',
                message: 'Too many attempts',
                details: { retryAfterSeconds: RETRY_AFTER_SECONDS },
            },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }

    @Get('boom')
    boom(): never {
        throw new Error('postgresql://secret-user:secret-password@db/eblocul');
    }

    @Post('check')
    @HttpCode(200)
    check(@Body() body: CheckRequest): { title: string } {
        return { title: body.meta.title };
    }
}

describe('Error responses (e2e)', () => {
    let probe: ProbeApp;

    beforeAll(async () => {
        probe = await createProbeApp([ErrorsProbeController]);
    });

    afterAll(async () => {
        await probe.app.close();
    });

    it('maps a domain error through the status table', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/registered')
            .expect(400);

        expect(withoutRequestId(response)).toEqual({
            code: 'INVALID_CURSOR',
            message: 'Cursor is malformed',
        });
    });

    it('answers 500 for a domain code missing from every status table', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/unregistered')
            .expect(500);

        expect(responseBody<ErrorBody>(response).code).toBe('INTERNAL_ERROR');
    });

    it('names HttpException codes after the status', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/unauthorized')
            .expect(401);

        expect(responseBody<ErrorBody>(response).code).toBe('UNAUTHORIZED');
    });

    it('keeps the body of an HttpException that already has a code', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/coded')
            .expect(400);

        expect(withoutRequestId(response)).toEqual({
            code: 'CUSTOM_CODE',
            message: 'Custom message',
            details: { reason: 'test' },
        });
    });

    it('fills in the message when a coded HttpException has none', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/code-only')
            .expect(400);
        const body = responseBody<ErrorBody>(response);

        expect(body.code).toBe('CODE_ONLY');
        expect(typeof body.message).toBe('string');
        expect(Object.keys(body).sort()).toEqual([
            'code',
            'message',
            'requestId',
        ]);
    });

    it('drops unknown fields and non-object details from a coded HttpException', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/leaky')
            .expect(400);

        expect(withoutRequestId(response)).toEqual({
            code: 'LEAKY',
            message: 'Leaky message',
        });
    });

    it('answers JSON for an unknown route', async () => {
        const response = await probe.http().get('/api/v1/nowhere').expect(404);

        expect(responseBody<ErrorBody>(response).code).toBe('NOT_FOUND');
    });

    it('hides unexpected errors', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/boom')
            .expect(500);

        expect(withoutRequestId(response)).toEqual({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        });
        expect(response.text).not.toContain('secret');
    });

    it('copies retryAfterSeconds of a 429 into the Retry-After header', async () => {
        const response = await probe
            .http()
            .get('/api/v1/probe/throttled')
            .expect(429);

        expect(response.headers['retry-after']).toBe(
            String(RETRY_AFTER_SECONDS),
        );
        expect(responseBody<ErrorBody>(response).code).toBe(
            'TOO_MANY_ATTEMPTS',
        );
    });

    it('returns validation errors with nested paths and rules', async () => {
        const response = await probe
            .http()
            .post('/api/v1/probe/check')
            .send({ meta: { title: 'x' } })
            .expect(400);

        expect(withoutRequestId(response)).toEqual({
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed',
            details: { fields: [{ path: 'meta.title', rules: ['minLength'] }] },
        });
    });

    it('answers 400 for malformed JSON', async () => {
        const response = await probe
            .http()
            .post('/api/v1/probe/check')
            .set('content-type', 'application/json')
            .send('{"meta": ')
            .expect(400);

        expect(responseBody<ErrorBody>(response).code).toBe('BAD_REQUEST');
    });

    it('answers 413 for a body over the parser limit', async () => {
        const response = await probe
            .http()
            .post('/api/v1/probe/check')
            .send({ meta: { title: 'a'.repeat(OVER_BODY_LIMIT) } })
            .expect(413);

        expect(responseBody<ErrorBody>(response).code).toBe(
            'PAYLOAD_TOO_LARGE',
        );
    });
});
