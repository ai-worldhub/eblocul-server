import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { NodeKind, UnitType } from '../../domain/entities/grant-view.ts';
import {
    ACCESS_ROLES,
    type AccessRole,
    type Application,
} from '../../domain/rules/access-roles.ts';

const APPLICATIONS = [
    'admin_panel',
    'guard_panel',
    'resident_app',
] as const satisfies readonly Application[];

const NODE_KINDS = [
    'quarter',
    'zone',
    'building',
    'line',
    'entrance',
] as const satisfies readonly NodeKind[];

const UNIT_TYPES = [
    'apartment',
    'townhouse',
    'house',
    'duplex',
] as const satisfies readonly UnitType[];

export namespace MyAccess {
    @ApiSchema({ name: 'MyAccess-Complex' })
    export class Complex {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10' })
        id: string;

        @ApiProperty({ example: 'Test Quarter' })
        name: string;
    }

    @ApiSchema({ name: 'MyAccess-Node' })
    export class Node {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11' })
        id: string;

        @ApiProperty({ enum: NODE_KINDS, example: 'zone' })
        kind: NodeKind;

        @ApiProperty({ example: 'Test Zone Apartments' })
        name: string;
    }

    @ApiSchema({ name: 'MyAccess-TakenZone' })
    export class TakenZone {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b12' })
        id: string;

        @ApiProperty({ example: 'Test Zone Houses' })
        name: string;

        @ApiProperty({ example: '2026-10-09T09:00:00.000Z' })
        takenAt: Date;
    }

    @ApiSchema({ name: 'MyAccess-Unit' })
    export class Unit {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b13' })
        id: string;

        @ApiProperty({ enum: UNIT_TYPES, example: 'apartment' })
        type: UnitType;

        @ApiProperty({ example: '45' })
        number: string;

        @ApiProperty({ type: Number, nullable: true, example: 3 })
        floor: number | null;
    }

    @ApiSchema({ name: 'MyAccess-Grant' })
    export class Grant {
        @ApiProperty({
            example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b14',
            description: 'Send it in the X-Access-Grant header to act by it',
        })
        id: string;

        @ApiProperty({ enum: ACCESS_ROLES, example: 'administrator' })
        role: AccessRole;

        @ApiProperty({ example: false })
        isReadOnly: boolean;

        @ApiProperty({ type: Complex })
        complex: Complex;

        @ApiProperty({
            type: Node,
            nullable: true,
            description:
                'The node of an administration role; null for a resident',
        })
        node: Node | null;

        @ApiProperty({
            type: [TakenZone],
            description: 'Zones a chief administrator has taken over',
        })
        takenZones: TakenZone[];

        @ApiProperty({
            type: Unit,
            nullable: true,
            description:
                'The unit of a resident; null for an administration role',
        })
        unit: Unit | null;

        @ApiProperty({
            type: [Node],
            description: 'Nodes from the root of the complex down to the unit',
        })
        chain: Node[];
    }

    @ApiSchema({ name: 'MyAccess-Response' })
    export class Response {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10' })
        accountId: string;

        @ApiProperty({ enum: APPLICATIONS, example: 'admin_panel' })
        application: Application;

        @ApiProperty({ type: [Grant] })
        grants: Grant[];
    }
}
