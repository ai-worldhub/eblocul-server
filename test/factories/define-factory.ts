export const defineFactory = <T extends object>(
    defaults: (sequence: number) => T,
) => {
    let sequence = 0;

    const build = (overrides: Partial<T> = {}): T => {
        sequence += 1;
        return { ...defaults(sequence), ...overrides };
    };

    const buildMany = (
        count: number,
        overrides: (index: number) => Partial<T> = () => ({}),
    ): T[] =>
        Array.from({ length: count }, (_, index) => build(overrides(index)));

    return { build, buildMany };
};
