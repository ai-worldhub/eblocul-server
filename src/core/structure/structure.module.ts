import { Module } from '@nestjs/common';
import { TestHouseSeed } from './application/seeds/test-house.seed.ts';
import { TestQuarterSeed } from './application/seeds/test-quarter.seed.ts';
import { TreeBuildingService } from './application/services/tree-building.service.ts';
import { TreeReadingService } from './application/services/tree-reading.service.ts';
import { PrismaNodeRepository } from './infrastructure/prisma/node.repository.ts';
import { PrismaTreeQueries } from './infrastructure/prisma/tree-queries.ts';
import { PrismaUnitRepository } from './infrastructure/prisma/unit.repository.ts';
import { NodeRepository } from './ports/node.repository.ts';
import { TreeQueries } from './ports/tree-queries.port.ts';
import { UnitRepository } from './ports/unit.repository.ts';

@Module({
    providers: [
        TreeBuildingService,
        TreeReadingService,
        TestHouseSeed,
        TestQuarterSeed,
        { provide: NodeRepository, useClass: PrismaNodeRepository },
        { provide: UnitRepository, useClass: PrismaUnitRepository },
        { provide: TreeQueries, useClass: PrismaTreeQueries },
    ],
    exports: [TreeBuildingService, TreeReadingService],
})
export class StructureModule {}
