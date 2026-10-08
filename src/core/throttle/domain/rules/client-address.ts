const UNKNOWN_ADDRESS = 'unknown';
const HEX = 16;
const GROUPS = 8;
const PREFIX_GROUPS = 4;
const MAPPED_ZERO_GROUPS = 5;
const MAPPED_MARK = 'ffff';
const BYTE = 256;
const DOTTED = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const GROUP = /^[0-9a-f]{1,4}$/;

const dottedGroups = (part: string): string[] | null => {
    const bytes = DOTTED.exec(part)?.slice(1).map(Number);
    if (bytes === undefined || bytes.some((byte) => byte >= BYTE)) {
        return null;
    }
    const [first = 0, second = 0, third = 0, fourth = 0] = bytes;
    return [
        (first * BYTE + second).toString(HEX),
        (third * BYTE + fourth).toString(HEX),
    ];
};

const groupsOf = (part: string): string[] | null => {
    if (part === '') {
        return [];
    }
    const groups: string[] = [];
    for (const piece of part.split(':')) {
        const parsed = piece.includes('.')
            ? dottedGroups(piece)
            : GROUP.test(piece)
              ? [Number.parseInt(piece, HEX).toString(HEX)]
              : null;
        if (parsed === null) {
            return null;
        }
        groups.push(...parsed);
    }
    return groups;
};

const expand = (address: string): string[] | null => {
    const halves = address.split('::');
    const head = groupsOf(halves[0] ?? '');
    const tail = groupsOf(halves[1] ?? '');
    if (head === null || tail === null || halves.length > 2) {
        return null;
    }
    const missing = GROUPS - head.length - tail.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) {
        return null;
    }
    return [...head, ...Array<string>(missing).fill('0'), ...tail];
};

const mappedIpv4 = (groups: string[]): string | null => {
    const isMapped =
        groups.slice(0, MAPPED_ZERO_GROUPS).every((group) => group === '0') &&
        groups[MAPPED_ZERO_GROUPS] === MAPPED_MARK;
    if (!isMapped) {
        return null;
    }
    return groups
        .slice(MAPPED_ZERO_GROUPS + 1)
        .flatMap((group) => {
            const value = Number.parseInt(group, HEX);
            return [Math.floor(value / BYTE), value % BYTE];
        })
        .join('.');
};

const BRACKETED = /^\[([^\]]+)\](?::\d+)?$/;
const DOTTED_WITH_PORT = /^([\d.]+):\d+$/;

const withoutPort = (text: string): string =>
    BRACKETED.exec(text)?.[1] ?? DOTTED_WITH_PORT.exec(text)?.[1] ?? text;

const ipv4 = (text: string): string | null => {
    const bytes = DOTTED.exec(text)?.slice(1).map(Number);
    return bytes === undefined || bytes.some((byte) => byte >= BYTE)
        ? null
        : bytes.join('.');
};

const ipv6 = (text: string): string | null => {
    const groups = expand(text.split('%')[0] ?? '');
    if (groups === null) {
        return null;
    }
    return (
        mappedIpv4(groups) ?? `${groups.slice(0, PREFIX_GROUPS).join(':')}::/64`
    );
};

export const clientAddressKey = (address: string | undefined): string => {
    const text = withoutPort((address ?? '').trim().toLowerCase());
    return (text.includes(':') ? ipv6(text) : ipv4(text)) ?? UNKNOWN_ADDRESS;
};
