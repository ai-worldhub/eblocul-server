import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../../shared/db/tx.ts';
import {
    UnitEntity,
    type UnitSnapshot,
} from '../../domain/entities/unit.entity.ts';
import { StructureError } from '../../domain/structure.errors.ts';
import type { UnitRepository } from '../../ports/unit.repository.ts';
import { UNIT_STATE_SELECT, type UnitStateRow } from '../unit.select.ts';

true satisfies [UnitStateRow] extends [UnitSnapshot]
    ? [UnitSnapshot] extends [UnitStateRow]
        ? true
        : false
    : false;

@Injectable()
export class PrismaUnitRepository implements UnitRepository {
    async addOrFind(tx: Tx, unit: UnitEntity): Promise<UnitEntity> {
        const row = unit.view();
        const { count } = await tx.unit.createMany({
            data: [row],
            skipDuplicates: true,
        });
        if (count === 1) {
            return unit;
        }
        const existing = await tx.unit.findUnique({
            where: { id: row.id },
            select: UNIT_STATE_SELECT,
        });
        if (existing === null) {
            throw new StructureError(
                'STRUCTURE_UNIT_NUMBER_TAKEN',
                'The node already has a unit with this number',
                { nodeId: row.nodeId },
            );
        }
        return UnitEntity.restore(existing);
    }
}
