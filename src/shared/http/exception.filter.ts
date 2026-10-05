import {
    type ArgumentsHost,
    Catch,
    type ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { EventLogger } from '../logging/event-logger.ts';

export type ErrorStatuses = Readonly<Record<string, number>>;

type ErrorBody = {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const codeOf = (value: unknown): string | null =>
    isRecord(value) && typeof value['code'] === 'string' ? value['code'] : null;

const toErrorBody = (
    code: string,
    source: Record<string, unknown>,
    fallbackMessage: string,
): ErrorBody => {
    const message = source['message'];
    const details = source['details'];
    return {
        code,
        message: typeof message === 'string' ? message : fallbackMessage,
        ...(isRecord(details) ? { details } : {}),
    };
};

const exposedClientStatus = (error: unknown): number | null => {
    if (!isRecord(error)) {
        return null;
    }
    const { expose, status } = error;
    return expose === true &&
        typeof status === 'number' &&
        status >= 400 &&
        status < 500
        ? status
        : null;
};

const statusCode = (status: number): string =>
    HttpStatus[status] ?? 'HTTP_ERROR';

const retryAfterOf = (status: number, body: ErrorBody): string | null => {
    if (status !== HttpStatus.TOO_MANY_REQUESTS) {
        return null;
    }
    const seconds = body.details?.['retryAfterSeconds'];
    return typeof seconds === 'number' && Number.isFinite(seconds)
        ? String(Math.max(0, Math.ceil(seconds)))
        : null;
};

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
    constructor(
        private readonly _adapterHost: HttpAdapterHost,
        private readonly _events: EventLogger,
        private readonly _errorStatuses: ErrorStatuses,
    ) {}

    catch(error: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const requestId = http.getRequest<{ id?: unknown }>().id;
        const { status, body } = this.toResponse(error);
        const retryAfter = retryAfterOf(status, body);
        if (retryAfter !== null) {
            this._adapterHost.httpAdapter.setHeader(
                http.getResponse<unknown>(),
                'Retry-After',
                retryAfter,
            );
        }
        this._adapterHost.httpAdapter.reply(
            http.getResponse<unknown>(),
            typeof requestId === 'string' ? { ...body, requestId } : body,
            status,
        );
    }

    private toResponse(error: unknown): { status: number; body: ErrorBody } {
        if (error instanceof HttpException) {
            const status = error.getStatus();
            const response = error.getResponse();
            const code = codeOf(response);
            return {
                status,
                body:
                    code !== null && isRecord(response)
                        ? toErrorBody(code, response, error.message)
                        : { code: statusCode(status), message: error.message },
            };
        }

        if (error instanceof Error) {
            const code = codeOf(error);
            const status =
                code === null ? undefined : this._errorStatuses[code];
            if (code !== null && status !== undefined) {
                return {
                    status,
                    body: toErrorBody(
                        code,
                        {
                            message: error.message,
                            details: (error as { details?: unknown }).details,
                        },
                        error.message,
                    ),
                };
            }
        }

        const clientStatus = exposedClientStatus(error);
        if (clientStatus !== null) {
            return {
                status: clientStatus,
                body: {
                    code: statusCode(clientStatus),
                    message:
                        error instanceof Error ? error.message : 'Bad request',
                },
            };
        }

        this._events.error(
            'http.unhandled_error',
            {
                errorType: error instanceof Error ? error.name : typeof error,
                errorCode: codeOf(error),
            },
            error instanceof Error ? error : undefined,
        );
        return {
            status: 500,
            body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
        };
    }
}
