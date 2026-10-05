import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'ErrorResponse' })
export class ErrorResponse {
    @ApiProperty({ example: 'DOCUMENT_NOT_FOUND' })
    code: string;

    @ApiProperty({ example: 'Document was not found' })
    message: string;

    @ApiPropertyOptional({ type: Object })
    details?: Record<string, unknown>;

    @ApiProperty({
        description: 'Same id as the X-Request-Id header and the log line',
        example: '8d3f2a1e-6b7c-4e21-9f0a-2c5d8e7b1a90',
    })
    requestId: string;
}
