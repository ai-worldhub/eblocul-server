import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import { EventLogger } from './event-logger.ts';
import { prettyLogs } from './pretty-logs.ts';
import { redactSecrets } from './secrets.ts';

type AppRequest = IncomingMessage & {
    route?: { path?: unknown };
    user?: { userId?: unknown };
};

const UNLOGGED_PATHS = new Set(['/api/v1/health', '/api/v1/metrics']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestIdOf = (req: IncomingMessage, res: ServerResponse): string => {
    const header = req.headers['x-request-id'];
    const id =
        typeof header === 'string' && UUID.test(header) ? header : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
};

const completedRequest = (
    req: AppRequest,
    res: ServerResponse,
    val: unknown,
): Record<string, unknown> => ({
    ...(val as Record<string, unknown>),
    method: req.method ?? null,
    route:
        typeof req.route?.path === 'string' && !req.route.path.startsWith('*')
            ? req.route.path
            : null,
    status: res.statusCode,
    userId: typeof req.user?.userId === 'string' ? req.user.userId : null,
});

const HTTP_OPTIONS: Options<AppRequest, ServerResponse> = {
    messageKey: 'event',
    genReqId: requestIdOf,
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'requestId', responseTime: 'durationMs' },
    autoLogging: {
        ignore: (req) =>
            req.method === 'GET' &&
            UNLOGGED_PATHS.has((req.url ?? '').split('?')[0] ?? ''),
    },
    customLogLevel: (_req, res, error) =>
        error !== undefined || res.statusCode >= 500 ? 'error' : 'info',
    customSuccessMessage: () => 'http.request',
    customErrorMessage: () => 'http.request',
    customSuccessObject: completedRequest,
    customErrorObject: (req, res, _error, val) =>
        completedRequest(req, res, val),
    serializers: {
        req: () => undefined,
        res: () => undefined,
        err: () => undefined,
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    formatters: { log: redactSecrets },
};

@Global()
@Module({})
export class AppLoggingModule {
    static register(destination?: DestinationStream): DynamicModule {
        return {
            module: AppLoggingModule,
            imports: [
                LoggerModule.forRootAsync({
                    inject: [ConfigService],
                    useFactory: (config: ConfigService) => {
                        const stream =
                            destination ??
                            (config.get<string>('LOG_FORMAT') === 'pretty'
                                ? prettyLogs()
                                : undefined);
                        return {
                            pinoHttp:
                                stream === undefined
                                    ? HTTP_OPTIONS
                                    : [HTTP_OPTIONS, stream],
                        };
                    },
                }),
            ],
            providers: [EventLogger],
            exports: [EventLogger],
        };
    }
}
