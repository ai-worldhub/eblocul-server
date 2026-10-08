export { StructureModule } from './structure.module.ts';
export { TestHouseSeed } from './application/seeds/test-house.seed.ts';
export { TestQuarterSeed } from './application/seeds/test-quarter.seed.ts';
export {
    type NewChild,
    type NewRoot,
    type NewUnit,
    TreeBuildingService,
} from './application/services/tree-building.service.ts';
export { TreeReadingService } from './application/services/tree-reading.service.ts';
export type { NodeSnapshot } from './domain/entities/node.entity.ts';
export type { Subtree, UnitChain } from './domain/entities/tree.ts';
export type { UnitSnapshot } from './domain/entities/unit.entity.ts';
export type { NodeKind } from './domain/rules/node-levels.ts';
export type { UnitType } from './domain/rules/unit-placement.ts';
