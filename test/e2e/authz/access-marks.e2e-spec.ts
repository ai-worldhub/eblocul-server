import {
    Controller,
    Get,
    Global,
    Module,
    Patch,
    Post,
    type Type,
} from '@nestjs/common';
import {
    Access,
    type AccessAction,
    AuthzModule,
    defineAction,
} from '../../../src/core/authz/index.ts';
import { DbService } from '../../../src/shared/db/db.service.ts';
import { Public } from '../../../src/shared/http/public.decorator.ts';
import { SessionOnly } from '../../../src/shared/http/session-only.decorator.ts';
import { createProbeApp } from '../../utils/probe-app.ts';

const READ = defineAction({
    name: 'probe.read',
    kind: 'read',
    grants: { administrator: ['perimeter'], chairman: ['perimeter'] },
});
const CHANGE = defineAction({
    name: 'probe.change',
    kind: 'change',
    grants: { administrator: ['perimeter'] },
});
const UNLISTED = defineAction({
    name: 'probe.unlisted',
    kind: 'read',
    grants: { administrator: ['perimeter'] },
});
const SAME_NAME = defineAction({
    name: 'probe.read',
    kind: 'read',
    grants: { chief_administrator: ['quarter'] },
});
const ACTIONS = [READ, CHANGE];
const DONE = { done: true };

@Global()
@Module({
    providers: [{ provide: DbService, useValue: {} }],
    exports: [DbService],
})
class NoDatabaseModule {}

@Controller('marked')
class MarkedController {
    @Get('open')
    @Public()
    open(): typeof DONE {
        return DONE;
    }

    @Get('mine')
    @SessionOnly()
    mine(): typeof DONE {
        return DONE;
    }

    @Get('nodes/:nodeId')
    @Access(READ, { node: 'nodeId' })
    read(): typeof DONE {
        return DONE;
    }

    @Patch('units/:unitId')
    @Access(CHANGE, { unit: 'unitId' })
    change(): typeof DONE {
        return DONE;
    }

    helper(): typeof DONE {
        return DONE;
    }
}

@Controller('unmarked')
class UnmarkedController {
    @Get()
    read(): typeof DONE {
        return DONE;
    }
}

@Controller('twice')
class TwiceMarkedController {
    @Get()
    @Public()
    @Access(READ)
    read(): typeof DONE {
        return DONE;
    }
}

@Controller('session-and-access')
class SessionAndAccessController {
    @Get()
    @SessionOnly()
    @Access(READ)
    read(): typeof DONE {
        return DONE;
    }
}

@Controller('changing-get')
class ChangingGetController {
    @Get()
    @Access(CHANGE)
    change(): typeof DONE {
        return DONE;
    }
}

@Controller('reading-post')
class ReadingPostController {
    @Post()
    @Access(READ)
    read(): typeof DONE {
        return DONE;
    }
}

@Controller('unlisted')
class UnlistedActionController {
    @Get()
    @Access(UNLISTED)
    read(): typeof DONE {
        return DONE;
    }
}

@Controller('nodes/:nodeId/wrong-target')
class WrongTargetController {
    @Get()
    @Access(READ, { node: 'houseId' })
    read(): typeof DONE {
        return DONE;
    }
}

const start = (
    controller: Type<unknown>,
    actions: readonly AccessAction[] = ACTIONS,
): ReturnType<typeof createProbeApp> =>
    createProbeApp([controller], {
        imports: [NoDatabaseModule, AuthzModule.register(actions)],
    });

const refusalOf = async (
    work: Promise<unknown>,
): Promise<{ code: unknown; details: unknown }> => {
    const refusal: unknown = await work.then(
        () => null,
        (error: unknown) => error,
    );
    if (typeof refusal !== 'object' || refusal === null) {
        throw new Error('The application started');
    }
    const { code, details } = refusal as { code?: unknown; details?: unknown };
    return { code, details };
};

describe('Access marks at start (e2e)', () => {
    it('starts when every endpoint carries one mark that fits its method and its route', async () => {
        const probe = await start(MarkedController);

        await probe.http().get('/api/v1/marked/open').expect(200);
        await probe.app.close();
    });

    it('does not start with an endpoint that carries no mark', async () => {
        expect(await refusalOf(start(UnmarkedController))).toEqual({
            code: 'AUTHZ_ACCESS_MARK_INVALID',
            details: { controller: 'UnmarkedController', handler: 'read' },
        });
    });

    it('does not start with an endpoint that carries two marks', async () => {
        for (const controller of [
            TwiceMarkedController,
            SessionAndAccessController,
        ]) {
            expect(await refusalOf(start(controller))).toEqual({
                code: 'AUTHZ_ACCESS_MARK_INVALID',
                details: { controller: controller.name, handler: 'read' },
            });
        }
    });

    it('does not start with a changing action on GET', async () => {
        expect(await refusalOf(start(ChangingGetController))).toEqual({
            code: 'AUTHZ_ACCESS_MARK_INVALID',
            details: { controller: 'ChangingGetController', handler: 'change' },
        });
    });

    it('does not start with a reading action on a changing method', async () => {
        expect(await refusalOf(start(ReadingPostController))).toEqual({
            code: 'AUTHZ_ACCESS_MARK_INVALID',
            details: { controller: 'ReadingPostController', handler: 'read' },
        });
    });

    it('does not start with an action that is not in the list of access actions', async () => {
        expect(await refusalOf(start(UnlistedActionController))).toEqual({
            code: 'AUTHZ_ACCESS_MARK_INVALID',
            details: {
                controller: 'UnlistedActionController',
                handler: 'read',
            },
        });
    });

    it('does not start with a target the route has no parameter for', async () => {
        expect(await refusalOf(start(WrongTargetController))).toEqual({
            code: 'AUTHZ_ACCESS_MARK_INVALID',
            details: { controller: 'WrongTargetController', handler: 'read' },
        });
    });

    it('does not start with two actions of one name in the list', async () => {
        expect(
            await refusalOf(start(MarkedController, [...ACTIONS, SAME_NAME])),
        ).toEqual({
            code: 'AUTHZ_ACTION_INVALID',
            details: { action: 'probe.read' },
        });
    });
});
