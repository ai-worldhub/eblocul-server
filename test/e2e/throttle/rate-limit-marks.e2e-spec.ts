import { Controller, Get, type Type } from '@nestjs/common';
import {
    defineRateLimit,
    RateLimitService,
    ThrottleModule,
} from '../../../src/core/throttle/index.ts';
import { ClockModule } from '../../../src/shared/clock/clock.module.ts';
import { Clock } from '../../../src/shared/clock/clock.service.ts';
import { SetupConfigModule } from '../../../src/shared/configs/setup-config.module.ts';
import { DbModule } from '../../../src/shared/db/db.module.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { Public } from '../../../src/shared/http/public.decorator.ts';
import {
    NoRateLimit,
    RateLimit,
} from '../../../src/shared/http/rate-limit.decorator.ts';
import { IdsModule } from '../../../src/shared/ids/ids.module.ts';
import { cleanDatabase } from '../../utils/clean-database.ts';
import { ClockDouble } from '../../utils/clock.double.ts';
import { createProbeApp, type ProbeApp } from '../../utils/probe-app.ts';
import { responseBody } from '../../utils/response-body.ts';

type ErrorBody = { code: string; details?: Record<string, unknown> };

const NOW = new Date('2026-10-08T10:00:00.000Z');
const PUBLIC_BURST = 60;
const PROBE_LIMIT = { group: 'probe_pair', burst: 2, refillSeconds: 10 };

@Controller('probe')
class ProbeController {
    @Get('open')
    @Public()
    open(): { isOpen: boolean } {
        return { isOpen: true };
    }

    @Get('closed')
    closed(): { isOpen: boolean } {
        return { isOpen: false };
    }

    @Get('first')
    @Public()
    @RateLimit(PROBE_LIMIT)
    first(): { isOpen: boolean } {
        return { isOpen: true };
    }

    @Get('second')
    @RateLimit(PROBE_LIMIT)
    second(): { isOpen: boolean } {
        return { isOpen: false };
    }

    @Get('unlimited')
    @Public()
    @NoRateLimit()
    unlimited(): { isOpen: boolean } {
        return { isOpen: true };
    }
}

@Controller('broken')
class UncountableController {
    @Get()
    @RateLimit({ group: 'probe_broken', burst: 0, refillSeconds: 1 })
    read(): { isOpen: boolean } {
        return { isOpen: false };
    }
}

@Controller('disagreeing')
class DisagreeingController {
    @Get()
    @RateLimit({ ...PROBE_LIMIT, burst: 3 })
    read(): { isOpen: boolean } {
        return { isOpen: false };
    }
}

const PROBE_IMPORTS = [
    SetupConfigModule,
    DbModule,
    ClockModule,
    IdsModule,
    ThrottleModule,
];

describe('Rate limit marks on endpoints (e2e)', () => {
    const clock = new ClockDouble(NOW);
    let probe: ProbeApp;

    beforeAll(async () => {
        probe = await createProbeApp([ProbeController], {
            imports: PROBE_IMPORTS,
            overrides: (builder) =>
                builder.overrideProvider(Clock).useValue(clock),
        });
    });

    beforeEach(async () => {
        await cleanDatabase(probe.app.get(DbService));
    });

    afterAll(async () => {
        await probe.app.close();
    });

    const statusesOf = async (
        path: string,
        times: number,
    ): Promise<number[]> => {
        const statuses: number[] = [];
        for (let request = 0; request < times; request += 1) {
            statuses.push(
                (await probe.http().get(`/api/v1/probe/${path}`)).status,
            );
        }
        return statuses;
    };

    it('puts the general limit on a public endpoint that carries no mark', async () => {
        expect(await statusesOf('open', PUBLIC_BURST + 1)).toEqual([
            ...Array<number>(PUBLIC_BURST).fill(200),
            429,
        ]);
    });

    it('puts no general limit on an endpoint that is not public', async () => {
        expect(await statusesOf('closed', PUBLIC_BURST + 10)).toEqual(
            Array<number>(PUBLIC_BURST + 10).fill(200),
        );
        expect(await probe.app.get(DbService).rateBucket.count()).toBe(0);
    });

    it('takes the burst and the refill time from the decorator', async () => {
        expect(await statusesOf('first', 2)).toEqual([200, 200]);

        const refused = await probe.http().get('/api/v1/probe/first');

        expect(refused.status).toBe(429);
        expect(responseBody<ErrorBody>(refused)).toMatchObject({
            code: 'THROTTLE_RATE_LIMITED',
            details: { retryAfterSeconds: 10 },
        });
        expect(refused.headers['retry-after']).toBe('10');
    });

    it('spends one bucket for every endpoint of a group, public or not', async () => {
        expect(await statusesOf('first', 1)).toEqual([200]);
        expect(await statusesOf('second', 2)).toEqual([200, 429]);
        expect(await statusesOf('first', 1)).toEqual([429]);
        expect(await statusesOf('open', 1)).toEqual([200]);
    });

    it('leaves an endpoint marked as unlimited alone', async () => {
        expect(await statusesOf('unlimited', PUBLIC_BURST + 10)).toEqual(
            Array<number>(PUBLIC_BURST + 10).fill(200),
        );
    });

    it('counts a limit of another module by any key it is given', async () => {
        const limits = probe.app.get(RateLimitService);
        const pause = defineRateLimit({
            group: 'probe_resend',
            burst: 1,
            refillSeconds: 60,
        });
        const refusedFor = (seconds: number): Record<string, unknown> => ({
            code: 'THROTTLE_RATE_LIMITED',
            details: { retryAfterSeconds: seconds },
        });

        await limits.spend(pause, '+37300000001');
        await expect(limits.spend(pause, '+37300000001')).rejects.toMatchObject(
            refusedFor(60),
        );
        await limits.spend(pause, '+37300000002');
        clock.advance(59_000);
        await expect(limits.spend(pause, '+37300000001')).rejects.toMatchObject(
            refusedFor(1),
        );
        clock.advance(1000);
        await limits.spend(pause, '+37300000001');

        const rows = await probe.app.get(DbService).rateBucket.findMany();
        expect(rows).toHaveLength(2);
        expect(JSON.stringify(rows)).not.toContain('373');
    });
});

describe('Rate limit marks that cannot work (e2e)', () => {
    const startWith = (controller: Type<unknown>): Promise<ProbeApp> =>
        createProbeApp([ProbeController, controller], {
            imports: PROBE_IMPORTS,
        });

    it('does not start with a mark that cannot be counted', async () => {
        await expect(startWith(UncountableController)).rejects.toMatchObject({
            code: 'THROTTLE_RULE_INVALID',
            details: { group: 'probe_broken' },
        });
    });

    it('does not start when endpoints of one group disagree about the numbers', async () => {
        await expect(startWith(DisagreeingController)).rejects.toMatchObject({
            code: 'THROTTLE_RULE_INVALID',
            details: { group: 'probe_pair' },
        });
    });
});
