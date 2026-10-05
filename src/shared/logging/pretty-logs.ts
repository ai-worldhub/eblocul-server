import { Writable } from 'node:stream';
import { styleText } from 'node:util';

type Style = Parameters<typeof styleText>[0];
type LogLine = Record<string, unknown>;

const paint = (style: Style, text: string): string =>
    styleText(style, text, { stream: process.stdout });

const LEVELS: Record<number, [string, Style]> = {
    10: ['TRACE', 'gray'],
    20: ['DEBUG', 'blue'],
    30: ['INFO ', 'green'],
    40: ['WARN ', 'yellow'],
    50: ['ERROR', ['red', 'bold']],
    60: ['FATAL', ['bgRed', 'white', 'bold']],
};

const SERVICE_KEYS = new Set([
    'level',
    'time',
    'pid',
    'hostname',
    'event',
    'requestId',
    'context',
    'error',
]);

const STACK_LINES = 5;

const text = (value: unknown): string =>
    typeof value === 'string' ? value : JSON.stringify(value);

const clock = (time: unknown): string => {
    if (typeof time !== 'number') {
        return '--:--:--.---';
    }
    const date = new Date(time);
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${date.toTimeString().slice(0, 8)}.${ms}`;
};

const statusStyle = (status: number): Style => {
    if (status >= 500) return ['red', 'bold'];
    if (status >= 400) return 'yellow';
    if (status >= 300) return 'cyan';
    return 'green';
};

const fields = (line: LogLine): string =>
    Object.entries(line)
        .filter(([key]) => !SERVICE_KEYS.has(key))
        .map(([key, value]) => `${paint('gray', `${key}=`)}${text(value)}`)
        .join(' ');

const httpRequest = (line: LogLine): string => {
    const status = Number(line['status']);
    const durationMs = Number(line['durationMs']);
    const route =
        typeof line['route'] === 'string'
            ? line['route']
            : paint('gray', '(no route)');
    return [
        paint(['cyan', 'bold'], 'http.request'),
        `${text(line['method'])} ${route}`,
        paint(statusStyle(status), String(status)),
        paint(durationMs >= 500 ? 'yellow' : 'gray', `${durationMs}ms`),
        typeof line['userId'] === 'string'
            ? paint('gray', `user=${line['userId']}`)
            : '',
    ]
        .filter((part) => part !== '')
        .join('  ');
};

const stack = (error: unknown): string[] => {
    const value = (error as { stack?: unknown } | undefined)?.stack;
    if (typeof value !== 'string') {
        return [];
    }
    return value
        .split('\n')
        .map((frame) => frame.trim())
        .filter(
            (frame) =>
                frame.startsWith('at ') &&
                !frame.includes('node_modules') &&
                !frame.includes('node:'),
        )
        .slice(0, STACK_LINES)
        .map(
            (frame) =>
                `      ${paint('dim', frame.replace('file://', '').replace(`${process.cwd()}/`, ''))}`,
        );
};

export const formatLogLine = (line: LogLine): string => {
    const [label, style] = LEVELS[Number(line['level'])] ?? ['LOG  ', 'white'];
    const event = text(line['event'] ?? '');
    let body: string;
    if (line['event'] === 'http.request') {
        body = httpRequest(line);
    } else if (typeof line['context'] === 'string') {
        body = paint('gray', `[${line['context']}] ${event}`);
    } else {
        body = [paint(['magenta', 'bold'], event), fields(line)]
            .filter((part) => part !== '')
            .join('  ');
    }
    const requestId =
        typeof line['requestId'] === 'string'
            ? paint('gray', `req=${line['requestId'].slice(0, 8)}`)
            : '';
    const head = [
        paint('gray', clock(line['time'])),
        paint(style, label),
        body,
        requestId,
    ]
        .filter((part) => part !== '')
        .join('  ');
    return [head, ...stack(line['error'])].join('\n');
};

const formatRaw = (raw: string): string => {
    try {
        return formatLogLine(JSON.parse(raw) as LogLine);
    } catch {
        return raw;
    }
};

export const prettyLogs = (): Writable => {
    let rest = '';
    return new Writable({
        write: (chunk: Buffer, _encoding, callback) => {
            const lines = (rest + chunk.toString()).split('\n');
            rest = lines.pop() ?? '';
            for (const raw of lines.filter((line) => line !== '')) {
                process.stdout.write(`${formatRaw(raw)}\n`);
            }
            callback();
        },
    });
};
