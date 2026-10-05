import { isSecretKey } from '../../src/shared/logging/secrets.ts';

const SECRET_PATTERNS: readonly (readonly [string, RegExp])[] = [
    ['JWT', /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]+/],
    ['S3 address', /s3:\/\/|amazonaws\.com|x-amz-/i],
    ['AWS ARN', /arn:aws:/i],
    ['password hash', /\$argon2(?:id|i|d)\$|\$2[aby]\$\d{2}\$/],
    ['database URL', /postgres(?:ql)?:\/\//i],
];

export type SecretCheckOptions = {
    // Keys whose values are the point of the endpoint, e.g. tokens on sign-in.
    allowKeys?: readonly string[];
    // Environment values that must never leave the server, e.g. a bucket name.
    values?: readonly string[];
};

const collect = (
    value: unknown,
    allowKeys: ReadonlySet<string>,
    keys: string[],
): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => collect(item, allowKeys, keys));
    }
    if (value === null || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !allowKeys.has(key))
            .map(([key, item]) => {
                keys.push(key);
                return [key, collect(item, allowKeys, keys)];
            }),
    );
};

export const expectNoSecrets = (
    body: unknown,
    options: SecretCheckOptions = {},
): void => {
    const keys: string[] = [];
    const text = JSON.stringify(
        collect(body, new Set(options.allowKeys ?? []), keys),
    );

    expect(keys.filter(isSecretKey), 'secret field names').toEqual([]);
    for (const [name, pattern] of SECRET_PATTERNS) {
        expect(text, name).not.toMatch(pattern);
    }
    for (const value of options.values ?? []) {
        expect(text, 'environment value').not.toContain(value);
    }
};
