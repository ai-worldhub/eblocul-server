import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client.ts';
import type { Tx } from '../../../../shared/db/tx.ts';
import type {
    UnitEntity,
    UnitSnapshot,
} from '../../domain/entities/unit.entity.ts';
import { StructureError } from '../../domain/structure.errors.ts';
import type { UnitRepository } from '../../ports/unit.repository.ts';
import { UNIT_ID_SELECT, type UnitStateRow } from '../unit.select.ts';

true satisfies [UnitStateRow] extends [UnitSnapshot]
    ? [UnitSnapshot] extends [UnitStateRow]
        ? true
        : false
    : false;

const UNIQUE_VIOLATION = 'P2002';

const isUniqueViolation = (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION;

@Injectable()
export class PrismaUnitRepository implements UnitRepository {
    async add(tx: Tx, unit: UnitEntity): Promise<void> {
        const row = unit.view();
        try {
            await tx.unit.create({ data: row, select: UNIT_ID_SELECT });
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new StructureError(
                    'STRUCTURE_UNIT_NUMBER_TAKEN',
                    'The node already has a unit with this number',
                    { nodeId: row.nodeId },
                );
            }
            throw error;
        }
    }
}
