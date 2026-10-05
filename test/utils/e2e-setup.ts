import { cleanDatabase } from './clean-database.ts';
import {
    createTestApp,
    type TestApp,
    type TestAppOverrides,
} from './test-app.factory.ts';

export const useTestApp = (overrides?: TestAppOverrides): TestApp => {
    let testApp: TestApp | undefined;

    const current = (): TestApp => {
        if (testApp === undefined) {
            throw new Error(
                'Test app is not ready: use it inside tests or hooks',
            );
        }
        return testApp;
    };

    beforeAll(async () => {
        testApp = await createTestApp(overrides);
    });

    beforeEach(async () => {
        await cleanDatabase(current().db);
    });

    afterAll(async () => {
        await testApp?.app.close();
    });

    return {
        get app() {
            return current().app;
        },
        get db() {
            return current().db;
        },
        http: () => current().http(),
    };
};
