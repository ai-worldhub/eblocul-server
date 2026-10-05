import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation.ts';

const resolveEnvFiles = (
    nodeEnv = process.env['NODE_ENV'] ?? 'lab',
): string[] =>
    nodeEnv === 'e2e' ? ['.env.e2e'] : ['.env.local', `.env.${nodeEnv}`];

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: resolveEnvFiles(),
            isGlobal: true,
            validate: validateEnv,
        }),
    ],
    providers: [],
    exports: [],
})
export class SetupConfigModule {}
