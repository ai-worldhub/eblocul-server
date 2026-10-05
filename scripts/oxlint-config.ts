const KINDS = ['core', 'modules'] as const;
const LAYERS = [
    'domain',
    'ports',
    'application',
    'infrastructure',
    'presentation',
] as const;
const DEPTHS = [1, 2] as const;

type Kind = (typeof KINDS)[number];
type Layer = (typeof LAYERS)[number];

type RestrictedPath = { name: string; importNames?: string[]; message: string };
type RestrictedGroup = { group: string[]; message: string };
type Override = { files: string[]; rules: Record<string, unknown> };

const LOGGER_MESSAGE = 'Log through EventLogger from src/shared/logging';
const HTTP_EXCEPTION_MESSAGE =
    'application/ and infrastructure/ throw domain errors: HttpException belongs to presentation/';
const BOUNDARY_MESSAGE =
    'From outside the module import only core/<module>/index.ts, shared/ and generated/; applied modules do not import each other, core does not import applied modules';
const DOMAIN_MESSAGE =
    'domain/ depends on nothing: no other modules, no other layers, no ports/, no shared/, no Nest, no Prisma';
const PORTS_MESSAGE =
    'ports/ holds abstract classes only: it uses domain/, shared/ and core index.ts, and no other layer, no Nest, no Prisma';
const APPLICATION_MESSAGE =
    'application/ uses domain/, ports/ and infrastructure/*.select.ts, not other infrastructure/ or presentation/';
const INFRASTRUCTURE_MESSAGE =
    'infrastructure/ implements ports/ and must not use application/ or presentation/';
const PRESENTATION_MESSAGE =
    'presentation/ talks to application/ and uses infrastructure/*.select.ts only, never ports/';
const SHARED_MESSAGE =
    'shared/ imports nothing outside shared/ and generated/: the direction is app -> modules -> core -> shared';
const APP_MESSAGE = 'app/ wires modules through their index.ts only';
const TRANSACTION_MESSAGE =
    'Open a transaction through Transactions.run from src/shared/db: timeouts and session settings live there';
const BODY_MESSAGE =
    'Read the body through responseBody from test/utils/response-body.ts: it checks the answer for secrets';

const NEST_LOGGER: RestrictedPath = {
    name: '@nestjs/common',
    importNames: ['Logger', 'ConsoleLogger'],
    message: LOGGER_MESSAGE,
};

const PINO: RestrictedPath[] = ['nestjs-pino', 'pino', 'pino-http'].map(
    (name) => ({ name, message: LOGGER_MESSAGE }),
);

const LOGGERS: RestrictedPath[] = [NEST_LOGGER, ...PINO];

const HTTP_EXCEPTIONS: RestrictedPath = {
    name: '@nestjs/common',
    importNames: [
        'HttpException',
        'BadRequestException',
        'UnauthorizedException',
        'ForbiddenException',
        'NotFoundException',
        'MethodNotAllowedException',
        'NotAcceptableException',
        'RequestTimeoutException',
        'ConflictException',
        'GoneException',
        'PreconditionFailedException',
        'PayloadTooLargeException',
        'UnsupportedMediaTypeException',
        'UnprocessableEntityException',
        'ImATeapotException',
        'MisdirectedException',
        'InternalServerErrorException',
        'NotImplementedException',
        'BadGatewayException',
        'ServiceUnavailableException',
        'GatewayTimeoutException',
        'HttpVersionNotSupportedException',
    ],
    message: HTTP_EXCEPTION_MESSAGE,
};

const up = (levels: number): string => '../'.repeat(levels);

const restrictedImports = (
    groups: RestrictedGroup[],
    paths: RestrictedPath[],
): Record<string, unknown> => ({
    'no-restricted-imports': [
        'error',
        groups.length === 0 ? { paths } : { patterns: groups, paths },
    ],
});

const boundary = (
    kind: Kind,
    depth: number,
    generated = true,
): RestrictedGroup => {
    const outside = up(depth + 1);
    const src = up(depth + 2);
    return {
        group: [
            `${outside}**`,
            kind === 'core'
                ? `!${outside}*/index.ts`
                : `!${src}core/*/index.ts`,
            `!${src}shared/**`,
            ...(generated ? [`!${src}generated/**`] : []),
        ],
        message: BOUNDARY_MESSAGE,
    };
};

const layerGroups = (
    kind: Kind,
    layer: Layer,
    depth: number,
): RestrictedGroup[] => {
    const root = up(depth);
    if (layer === 'domain') {
        return [
            {
                group: [
                    `${up(depth + 1)}**`,
                    `${root}*.ts`,
                    `${root}ports/**`,
                    `${root}application/**`,
                    `${root}infrastructure/**`,
                    `${root}presentation/**`,
                    '@nestjs/*',
                    '@prisma/*',
                ],
                message: DOMAIN_MESSAGE,
            },
        ];
    }
    if (layer === 'ports') {
        return [
            boundary(kind, depth, false),
            {
                group: [
                    `${root}*.ts`,
                    `${root}application/**`,
                    `${root}infrastructure/**`,
                    `${root}presentation/**`,
                    '@nestjs/*',
                    '@prisma/*',
                ],
                message: PORTS_MESSAGE,
            },
        ];
    }
    if (layer === 'application') {
        return [
            boundary(kind, depth),
            {
                group: [
                    `${root}infrastructure/**`,
                    `!${root}infrastructure/*.select.ts`,
                    `${root}presentation/**`,
                ],
                message: APPLICATION_MESSAGE,
            },
        ];
    }
    if (layer === 'infrastructure') {
        return [
            boundary(kind, depth),
            {
                group: [`${root}application/**`, `${root}presentation/**`],
                message: INFRASTRUCTURE_MESSAGE,
            },
        ];
    }
    return [
        boundary(kind, depth),
        {
            group: [
                `${root}ports/**`,
                `${root}infrastructure/**`,
                `!${root}infrastructure/*.select.ts`,
            ],
            message: PRESENTATION_MESSAGE,
        },
    ];
};

const layerPaths = (layer: Layer): RestrictedPath[] =>
    layer === 'application' || layer === 'infrastructure'
        ? [...LOGGERS, HTTP_EXCEPTIONS]
        : LOGGERS;

const moduleOverrides = (kind: Kind): Override[] => [
    {
        files: [`src/${kind}/*/*.ts`],
        rules: restrictedImports([boundary(kind, 0)], LOGGERS),
    },
    ...LAYERS.flatMap((layer) =>
        DEPTHS.map((depth) => ({
            files: [`src/${kind}/*/${layer}/${'*/'.repeat(depth - 1)}*.ts`],
            rules: restrictedImports(
                layerGroups(kind, layer, depth),
                layerPaths(layer),
            ),
        })),
    ),
];

const sharedGroup = (depth: number): RestrictedGroup => ({
    group: [`${up(depth + 1)}*/**`, `!${up(depth + 1)}generated/**`],
    message: SHARED_MESSAGE,
});

const SHARED_OVERRIDES: Override[] = [
    {
        files: ['src/shared/*/*.ts'],
        rules: restrictedImports([sharedGroup(1)], LOGGERS),
    },
    {
        files: ['src/shared/*/*/*.ts'],
        rules: restrictedImports([sharedGroup(2)], LOGGERS),
    },
    {
        files: ['src/shared/logging/*.ts'],
        rules: restrictedImports([sharedGroup(1)], [NEST_LOGGER]),
    },
];

const APP_OVERRIDES: Override[] = [
    {
        files: ['src/app/*.ts'],
        rules: restrictedImports(
            [
                {
                    group: [
                        '../core/*/**',
                        '../modules/*/**',
                        '!../core/*/index.ts',
                        '!../modules/*/index.ts',
                    ],
                    message: APP_MESSAGE,
                },
            ],
            LOGGERS,
        ),
    },
    {
        files: ['src/main.ts'],
        rules: restrictedImports([], [NEST_LOGGER]),
    },
];

const OTHER_OVERRIDES: Override[] = [
    {
        files: ['test/setup/*.ts', 'vitest.config*.ts', 'prisma.config.ts'],
        rules: { 'import/no-default-export': 'off' },
    },
    {
        files: ['**/log-events.ts', '**/*.log-events.ts'],
        rules: { 'typescript/consistent-type-definitions': 'off' },
    },
    {
        files: ['test/e2e/**/*.ts'],
        rules: {
            'no-restricted-properties': [
                'error',
                { property: 'body', message: BODY_MESSAGE },
            ],
        },
    },
    {
        files: ['src/**/*.ts'],
        rules: {
            'node/no-process-env': 'error',
            'no-restricted-properties': [
                'error',
                { property: '$transaction', message: TRANSACTION_MESSAGE },
            ],
        },
    },
    {
        files: ['src/shared/configs/*.ts'],
        rules: { 'node/no-process-env': 'off' },
    },
    {
        files: ['src/shared/db/*.ts'],
        rules: { 'no-restricted-properties': 'off' },
    },
];

export const OXLINT_CONFIG = {
    $schema: './node_modules/oxlint/configuration_schema.json',
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'node'],
    ignorePatterns: ['src/generated/**'],
    env: { node: true },
    rules: {
        'typescript/no-explicit-any': 'error',
        'typescript/no-floating-promises': 'error',
        'typescript/no-misused-promises': 'error',
        'typescript/no-unsafe-argument': 'error',
        'typescript/no-unsafe-assignment': 'error',
        'typescript/no-unsafe-call': 'error',
        'typescript/no-unsafe-member-access': 'error',
        'typescript/no-unsafe-return': 'error',
        'typescript/strict-boolean-expressions': 'error',
        'typescript/no-non-null-assertion': 'error',
        'typescript/consistent-type-definitions': ['error', 'type'],
        'import/no-cycle': 'error',
        'import/no-default-export': 'error',
        'no-console': 'error',
        'func-style': ['error', 'expression'],
        'prefer-arrow-callback': 'error',
        ...restrictedImports([], LOGGERS),
    },
    overrides: [
        ...KINDS.flatMap(moduleOverrides),
        ...SHARED_OVERRIDES,
        ...APP_OVERRIDES,
        ...OTHER_OVERRIDES,
    ],
};
