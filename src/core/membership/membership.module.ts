import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.ts';
import { StructureModule } from '../structure/index.ts';
import { TestResidentSeed } from './application/seeds/test-resident.seed.ts';
import { TestRolesSeed } from './application/seeds/test-roles.seed.ts';
import { NodeAssignmentService } from './application/services/node-assignment.service.ts';
import { RequestRoutingService } from './application/services/request-routing.service.ts';
import { TakeoverReleaseService } from './application/services/takeover-release.service.ts';
import { UnitMembershipService } from './application/services/unit-membership.service.ts';
import { ZoneTakeoverService } from './application/services/zone-takeover.service.ts';
import { PrismaNodeAssignmentRepository } from './infrastructure/prisma/node-assignment.repository.ts';
import { PrismaRecipientQueries } from './infrastructure/prisma/recipient-queries.ts';
import { PrismaUnitMembershipRepository } from './infrastructure/prisma/unit-membership.repository.ts';
import { NodeAssignmentRepository } from './ports/node-assignment.repository.ts';
import { RecipientQueries } from './ports/recipient-queries.port.ts';
import { UnitMembershipRepository } from './ports/unit-membership.repository.ts';

@Module({
    imports: [IdentityModule, StructureModule],
    providers: [
        UnitMembershipService,
        NodeAssignmentService,
        ZoneTakeoverService,
        TakeoverReleaseService,
        RequestRoutingService,
        TestRolesSeed,
        TestResidentSeed,
        {
            provide: UnitMembershipRepository,
            useClass: PrismaUnitMembershipRepository,
        },
        {
            provide: NodeAssignmentRepository,
            useClass: PrismaNodeAssignmentRepository,
        },
        { provide: RecipientQueries, useClass: PrismaRecipientQueries },
    ],
    exports: [
        UnitMembershipService,
        NodeAssignmentService,
        ZoneTakeoverService,
        RequestRoutingService,
    ],
})
export class MembershipModule {}
