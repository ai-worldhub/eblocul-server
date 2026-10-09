import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import {
    IsISO8601,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    MaxLength,
} from 'class-validator';
import { ListQuery as PageQuery } from '../../../../shared/http/list.dto.ts';
import {
    ACTOR_KINDS,
    ACTOR_ROLES,
    type ActorKind,
    type ActorRole,
} from '../../domain/entities/journal-entry.ts';
import {
    NODE_KINDS,
    type NodeKind,
    UNIT_TYPES,
    type UnitType,
} from '../../domain/entities/journal-entry-view.ts';

const MOMENT =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const ACTION_NAME_MAX_LENGTH = 100;

export namespace JournalEntry {
    @ApiSchema({ name: 'JournalEntry-Person' })
    export class Person {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10' })
        id: string;

        @ApiProperty({ type: String, nullable: true, example: 'Test' })
        firstName: string | null;

        @ApiProperty({ type: String, nullable: true, example: 'Administrator' })
        lastName: string | null;
    }

    @ApiSchema({ name: 'JournalEntry-Actor' })
    export class Actor {
        @ApiProperty({ enum: ACTOR_KINDS, example: 'account' })
        kind: ActorKind;

        @ApiProperty({
            type: Person,
            nullable: true,
            description: 'Who acted; null when the system did',
        })
        account: Person | null;

        @ApiProperty({
            enum: ACTOR_ROLES,
            nullable: true,
            example: 'administrator',
            description: 'The role the account acted by, if it acted by one',
        })
        role: ActorRole | null;
    }

    @ApiSchema({ name: 'JournalEntry-Node' })
    export class Node {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b11' })
        id: string;

        @ApiProperty({ enum: NODE_KINDS, example: 'zone' })
        kind: NodeKind;

        @ApiProperty({ example: 'Test Zone Apartments' })
        name: string;
    }

    @ApiSchema({ name: 'JournalEntry-Unit' })
    export class Unit {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b13' })
        id: string;

        @ApiProperty({ enum: UNIT_TYPES, example: 'apartment' })
        type: UnitType;

        @ApiProperty({ example: '45' })
        number: string;
    }

    @ApiSchema({ name: 'JournalEntry-Card' })
    export class Card {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b14' })
        id: string;

        @ApiProperty({ example: '2026-10-09T09:00:00.000Z' })
        createdAt: Date;

        @ApiProperty({
            example: 'membership.role_assigned',
            description:
                'One of the values the action filter of this endpoint lists',
        })
        action: string;

        @ApiProperty({ type: Actor })
        actor: Actor;

        @ApiProperty({
            type: Node,
            description: 'The node the action was taken on',
        })
        node: Node;

        @ApiProperty({
            type: Person,
            nullable: true,
            description: 'The person the action is about, if there is one',
        })
        subjectAccount: Person | null;

        @ApiProperty({
            type: Unit,
            nullable: true,
            description: 'The unit the action is about, if there is one',
        })
        subjectUnit: Unit | null;

        @ApiProperty({
            type: 'object',
            additionalProperties: {
                oneOf: [
                    { type: 'string' },
                    { type: 'integer' },
                    { type: 'boolean' },
                ],
            },
            example: {
                assignmentId: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b15',
                role: 'administrator',
            },
            description:
                'Ids, numbers and enum values the action declares; never free text',
        })
        details: Record<string, string | number | boolean>;
    }

    @ApiSchema({ name: 'JournalEntry-ListQuery' })
    export class ListQuery extends PageQuery {
        @ApiPropertyOptional({
            example: '2026-10-01T00:00:00+03:00',
            description: 'Entries made at this moment or later',
        })
        @IsOptional()
        @IsISO8601({ strict: true })
        @Matches(MOMENT)
        from?: string;

        @ApiPropertyOptional({
            example: '2026-11-01T00:00:00+02:00',
            description: 'Entries made before this moment',
        })
        @IsOptional()
        @IsISO8601({ strict: true })
        @Matches(MOMENT)
        to?: string;

        @ApiPropertyOptional({ example: 'membership.role_assigned' })
        @IsOptional()
        @IsString()
        @MaxLength(ACTION_NAME_MAX_LENGTH)
        action?: string;

        @ApiPropertyOptional({
            example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10',
            description: 'Entries this account is the author of',
        })
        @IsOptional()
        @IsUUID()
        actorAccountId?: string;
    }

    @ApiSchema({ name: 'JournalEntry-ListResponse' })
    export class ListResponse {
        @ApiProperty({ type: [Card] })
        items: Card[];

        @ApiProperty({ type: String, nullable: true, example: null })
        nextCursor: string | null;
    }
}
