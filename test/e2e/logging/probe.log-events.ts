export {};

declare module '../../../src/shared/logging/log-events.ts' {
    interface LogEvents {
        'probe.item_viewed': { itemId: string };
        'probe.leaky': {
            itemId: string;
            session: { refreshToken: string; nested: { password: string } };
        };
    }
}
