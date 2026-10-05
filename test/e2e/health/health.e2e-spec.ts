import { useTestApp } from '../../utils/e2e-setup.ts';
import { responseBody } from '../../utils/response-body.ts';

type HealthResponse = {
    status: string;
};

describe('Health (e2e)', () => {
    const testApp = useTestApp();

    it('GET /api/v1/health responds with status ok', async () => {
        const response = await testApp.http().get('/api/v1/health').expect(200);

        expect(responseBody<HealthResponse>(response)).toEqual({
            status: 'ok',
        });
    });
});
