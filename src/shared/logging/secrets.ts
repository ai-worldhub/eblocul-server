const SECRET_KEY =
    /password|passwd|secret|authorization|cookie|api_?key|access_?key|salt|token$/i;

const MAX_DEPTH = 8;

export const REDACTED = '[redacted]';

export const isSecretKey = (key: string): boolean => SECRET_KEY.test(key);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const redact = (value: unknown, depth: number): unknown => {
    if (Array.isArray(value)) {
        if (depth > MAX_DEPTH) {
            return REDACTED;
        }
        return value.map((item) => redact(item, depth + 1));
    }
    if (!isPlainObject(value)) {
        return value;
    }
    if (depth > MAX_DEPTH) {
        return REDACTED;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            isSecretKey(key) ? REDACTED : redact(item, depth + 1),
        ]),
    );
};

export const redactSecrets = (
    fields: Record<string, unknown>,
): Record<string, unknown> => redact(fields, 0) as Record<string, unknown>;
