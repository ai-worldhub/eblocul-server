import { createOpenApiDocument } from '../../../src/app/app.setup.ts';
import { useTestApp } from '../../utils/e2e-setup.ts';

const SCHEMA_PREFIX = '#/components/schemas/';
const ERROR_SCHEMA = `${SCHEMA_PREFIX}ErrorResponse`;
const NO_BODY = new Set(['204']);
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Schema = {
    $ref?: string;
    properties?: Record<string, unknown>;
    enum?: unknown[];
    items?: Schema;
    allOf?: Schema[];
};

type Response = {
    content?: Record<string, { schema?: Schema }>;
};

type Operation = {
    operationId?: string;
    summary?: string;
    tags?: string[];
    requestBody?: unknown;
    parameters?: { name: string; in: string; schema?: unknown }[];
    responses: Record<string, Response>;
};

type Described = {
    paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
    components?: { schemas?: Record<string, Schema> };
};

type Listed = { path: string; where: string; op: Operation };

const operationsOf = (document: Described): Listed[] =>
    Object.entries(document.paths).flatMap(([path, item]) =>
        METHODS.flatMap((method) => {
            const op = item[method];
            return op === undefined
                ? []
                : [{ path, where: `${method.toUpperCase()} ${path}`, op }];
        }),
    );

const jsonSchemaOf = (response: Response | undefined): Schema | undefined =>
    response?.content?.['application/json']?.schema;

const refOf = (schema: Schema | undefined): string | undefined =>
    schema?.$ref ?? schema?.items?.$ref ?? schema?.allOf?.[0]?.$ref;

describe('OpenAPI description (e2e)', () => {
    const testApp = useTestApp();

    let text: string;
    let document: Described;
    let operations: Listed[];

    beforeAll(() => {
        text = JSON.stringify(createOpenApiDocument(testApp.app));
        document = JSON.parse(text) as Described;
        operations = operationsOf(document);
    });

    it('describes every route the application serves', () => {
        expect(operations.length).toBeGreaterThan(0);
        for (const { where, op } of operations) {
            expect(op.summary, `${where}: no summary`).toBeTruthy();
            expect(op.tags?.length, `${where}: no tag`).toBeTruthy();
        }
    });

    it('gives every answer a schema of its own', () => {
        for (const { where, op } of operations) {
            const success = Object.keys(op.responses).filter((code) =>
                code.startsWith('2'),
            );
            expect(success, `${where}: no success response`).toHaveLength(1);

            const code = success[0] ?? '';
            const schema = jsonSchemaOf(op.responses[code]);
            if (NO_BODY.has(code)) {
                expect(
                    schema,
                    `${where}: ${code} answers with a body`,
                ).toBeUndefined();
                continue;
            }
            expect(
                refOf(schema),
                `${where}: ${code} does not point at a DTO`,
            ).toBeTruthy();
        }
    });

    it('describes every error with the common error body', () => {
        for (const { where, op } of operations) {
            for (const [code, response] of Object.entries(op.responses)) {
                if (code.startsWith('2')) {
                    continue;
                }
                expect(
                    refOf(jsonSchemaOf(response)),
                    `${where}: ${code} is not the common error body`,
                ).toBe(ERROR_SCHEMA);
            }
        }
    });

    it('describes the 400 that any input can produce', () => {
        for (const { where, op } of operations) {
            const takesInput =
                (op.parameters ?? []).length > 0 ||
                op.requestBody !== undefined;
            if (!takesInput) {
                continue;
            }
            expect(
                Object.keys(op.responses),
                `${where}: takes input and does not describe a 400`,
            ).toContain('400');
        }
    });

    it('names every path parameter it takes', () => {
        for (const { where, path, op } of operations) {
            const declared = (op.parameters ?? [])
                .filter((parameter) => parameter.in === 'path')
                .map((parameter) => parameter.name);
            for (const name of path.match(/{(\w+)}/g) ?? []) {
                expect(
                    declared,
                    `${where}: ${name} is not described`,
                ).toContain(name.slice(1, -1));
            }
            for (const parameter of op.parameters ?? []) {
                expect(
                    parameter.schema,
                    `${where}: ${parameter.name} has no schema`,
                ).toBeTruthy();
            }
        }
    });

    it('keeps every schema it points at, and keeps them filled', () => {
        const schemas = document.components?.schemas ?? {};
        for (const ref of text.match(/#\/components\/schemas\/[\w-]+/g) ?? []) {
            expect(Object.keys(schemas), `${ref} is not defined`).toContain(
                ref.slice(SCHEMA_PREFIX.length),
            );
        }
        for (const [name, schema] of Object.entries(schemas)) {
            if (schema.enum !== undefined) {
                continue;
            }
            expect(
                Object.keys(schema.properties ?? {}).length,
                `${name} has no fields: an answer built without a DTO`,
            ).toBeGreaterThan(0);
        }
    });

    it('gives every operation an id of its own', () => {
        const ids = operations.map(({ op }) => op.operationId);
        expect(ids.filter((id) => id === undefined)).toEqual([]);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('does not present the session identifier as a JWT', () => {
        expect(text).not.toContain('"bearerFormat"');
    });
});
