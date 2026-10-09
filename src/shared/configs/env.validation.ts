import { plainToInstance } from 'class-transformer';
import {
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    Max,
    Min,
    MinLength,
    ValidateIf,
    validateSync,
} from 'class-validator';

const ENVIRONMENTS = ['lab', 'production', 'e2e'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

const LOG_FORMATS = ['json', 'pretty'] as const;
type LogFormat = (typeof LOG_FORMATS)[number];

const SWITCHES = ['true', 'false'] as const;
type Switch = (typeof SWITCHES)[number];

const ORIGIN_LIST = /^https?:\/\/[^\s,/]+(,https?:\/\/[^\s,/]+)*$/;
const ORIGIN_SEPARATOR = ',';
const ORIGIN_WILDCARD = '*';
const SECURE_ORIGIN = 'https://';

export const parseOriginList = (value: string): string[] =>
    value.split(ORIGIN_SEPARATOR).filter((origin) => origin !== '');

const isExactOrigin = (value: string): boolean =>
    !value.includes(ORIGIN_WILDCARD) &&
    URL.canParse(value) &&
    new URL(value).origin === value;

const NAME_LIST = /^[a-z0-9_]+(,[a-z0-9_]+)*$/;
const WORKER_CONCURRENCY_MAX = 64;
const POLL_INTERVAL_MIN_MS = 10;
const POLL_INTERVAL_MAX_MS = 60_000;
const PROXY_HOPS_MAX = 8;
const KEY_SECRET_MIN_LENGTH = 32;
const CONSENT_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SMS_CODE = /^\d{6}$/;
const FIXED_CODE_ENVIRONMENT: Environment = 'lab';

const isUnset = (value: unknown): boolean =>
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '');

export class EnvironmentVariables {
    @IsIn(ENVIRONMENTS)
    NODE_ENV: Environment;

    @IsInt()
    @Min(1)
    @Max(65535)
    SERVER_PORT: number = 3000;

    @IsIn(LOG_FORMATS)
    LOG_FORMAT: LogFormat = 'json';

    @IsOptional()
    @Matches(NAME_LIST)
    JOBS_WORKER_CLASSES?: string;

    @IsInt()
    @Min(1)
    @Max(WORKER_CONCURRENCY_MAX)
    JOBS_WORKER_CONCURRENCY: number = 4;

    @IsInt()
    @Min(POLL_INTERVAL_MIN_MS)
    @Max(POLL_INTERVAL_MAX_MS)
    JOBS_POLL_INTERVAL_MS: number = 1000;

    @IsUrl({
        protocols: ['postgres', 'postgresql'],
        require_protocol: true,
        require_tld: false,
    })
    DATABASE_URL: string;

    @Matches(ORIGIN_LIST)
    WEB_PANEL_ORIGINS: string;

    @IsIn(SWITCHES)
    SESSION_COOKIE_SECURE: Switch = 'true';

    @IsOptional()
    @IsString()
    SEED_ADMIN_PASSWORD?: string;

    @IsInt()
    @Min(0)
    @Max(PROXY_HOPS_MAX)
    TRUSTED_PROXY_HOPS: number;

    @IsString()
    @MinLength(KEY_SECRET_MIN_LENGTH)
    THROTTLE_KEY_SECRET: string;

    @Matches(CONSENT_VERSION)
    LEGAL_CONSENT_VERSION: string;

    @ValidateIf((env: EnvironmentVariables) => !isUnset(env.LAB_FIXED_SMS_CODE))
    @Matches(SMS_CODE)
    LAB_FIXED_SMS_CODE?: string;

    @IsString()
    @IsNotEmpty()
    MAIL_SMTP_HOST: string;
    @IsInt()
    @Min(1)
    @Max(65535)
    MAIL_SMTP_PORT: number = 1025;
    @IsEmail()
    MAIL_FROM: string;
}

const originProblems = (env: EnvironmentVariables): string[] => {
    const origins = parseOriginList(
        typeof env.WEB_PANEL_ORIGINS === 'string' ? env.WEB_PANEL_ORIGINS : '',
    );
    return [
        ...(origins.every(isExactOrigin)
            ? []
            : [
                  'WEB_PANEL_ORIGINS: each origin must be exact, as the browser sends it',
              ]),
        ...(env.NODE_ENV === 'production' &&
        origins.some((origin) => !origin.startsWith(SECURE_ORIGIN))
            ? ['WEB_PANEL_ORIGINS: must be https in production']
            : []),
    ];
};

const proxyHopsProblems = (config: Record<string, unknown>): string[] =>
    isUnset(config['TRUSTED_PROXY_HOPS'])
        ? [
              'TRUSTED_PROXY_HOPS: must be set to the number of proxies in front of the application, 0 for none',
          ]
        : [];

const fixedCodeProblems = (
    env: EnvironmentVariables,
    config: Record<string, unknown>,
): string[] =>
    !isUnset(config['LAB_FIXED_SMS_CODE']) &&
    env.NODE_ENV !== FIXED_CODE_ENVIRONMENT
        ? ['LAB_FIXED_SMS_CODE: is allowed only when NODE_ENV is lab']
        : [];

export const validateEnv = (
    config: Record<string, unknown>,
): EnvironmentVariables => {
    const env = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });
    const problems = [
        ...validateSync(env, { skipMissingProperties: false }).map(
            (error) =>
                `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
        ),
        ...(env.NODE_ENV === 'production' &&
        env.SESSION_COOKIE_SECURE !== 'true'
            ? ['SESSION_COOKIE_SECURE: must be true in production']
            : []),
        ...originProblems(env),
        ...proxyHopsProblems(config),
        ...fixedCodeProblems(env, config),
    ];

    if (problems.length > 0) {
        throw new Error(
            `Invalid environment variables: ${problems.join('; ')}`,
        );
    }

    return env;
};
