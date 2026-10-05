const INTERVAL_MS = 25;
const TIMEOUT_MS = 10_000;

export const waitFor = async <T>(
    check: () => Promise<T | null>,
    what = 'the expected state',
): Promise<T> => {
    const deadline = Date.now() + TIMEOUT_MS;
    for (;;) {
        const result = await check();
        if (result !== null) {
            return result;
        }
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${what}`);
        }
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
};
