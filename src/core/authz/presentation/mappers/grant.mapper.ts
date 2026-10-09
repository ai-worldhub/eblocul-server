import type { SessionContext } from '../../../identity/index.ts';
import type { GrantView } from '../../domain/entities/grant-view.ts';
import type { MyAccess } from '../dto/my-access.dto.ts';

const toGrant = (view: GrantView): MyAccess.Grant => ({
    id: view.id,
    role: view.role,
    isReadOnly: view.isReadOnly,
    complex: { id: view.complex.id, name: view.complex.name },
    node:
        view.node === null
            ? null
            : { id: view.node.id, kind: view.node.kind, name: view.node.name },
    takenZones: view.takenZones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        takenAt: zone.takenAt,
    })),
    unit:
        view.unit === null
            ? null
            : {
                  id: view.unit.id,
                  type: view.unit.type,
                  number: view.unit.number,
                  floor: view.unit.floor,
              },
    chain: view.chain.map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.name,
    })),
});

export const toMyAccessResponse = (
    session: SessionContext,
    grants: GrantView[],
): MyAccess.Response => ({
    accountId: session.accountId,
    application: session.application,
    grants: grants.map(toGrant),
});
