import type { Tx } from '../../../shared/db/tx.ts';
import type { UnitEntity } from '../domain/entities/unit.entity.ts';

export abstract class UnitRepository {
    abstract add(tx: Tx, unit: UnitEntity): Promise<void>;
}
