import { plainToInstance } from 'class-transformer';
import {
    IsEmail,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsString,
    IsUrl,
    Max,
    Min,
    MinLength,
    validateSync,
} from 'class-validator';

const ENVIRONMENTS = ['lab', 'production', 'e2e'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

const LOG_FORMATS = ['json', 'pretty'] as const;
type LogFormat = (typeof LOG_FORMATS)[number];

const SWITCHES = ['on', 'off'] as const;
type Switch = (typeof SWITCHES)[number];

const RELAY_INTERVAL_MAX_SECONDS = 3600;
const SECRET_LENGTH = 32;

export class EnvironmentVariables {
    @IsIn(ENVIRONMENTS)
    NODE_ENV: Environment;

    @IsInt()
    @Min(1)
    @Max(65535)
    SERVER_PORT: number = 3000;

    @IsIn(LOG_FORMATS)
    LOG_FORMAT: LogFormat = 'json';

    @IsIn(SWITCHES)
    JOBS_SCHEDULE: Switch = 'on';

    @IsInt()
    @Min(0)
    @Max(RELAY_INTERVAL_MAX_SECONDS)
    JOBS_RELAY_INTERVAL_SECONDS: number = 5;

    @IsUrl({
        protocols: ['postgres', 'postgresql'],
        require_protocol: true,
        require_tld: false,
    })
    DATABASE_URL: string;

    @IsString()
    @MinLength(SECRET_LENGTH)
    AUTH_JWT_SECRET: string;

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

export const validateEnv = (
    config: Record<string, unknown>,
): EnvironmentVariables => {
    const env = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });
    const errors = validateSync(env, { skipMissingProperties: false });

    if (errors.length > 0) {
        const details = errors
            .map(
                (error) =>
                    `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
            )
            .join('; ');
        throw new Error(`Invalid environment variables: ${details}`);
    }

    return env;
};
