import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../http/public.decorator.ts';
import { Health } from './health.dto.ts';

@ApiTags('health')
@Controller('health')
export class HealthController {
    @Get()
    @Public()
    @ApiOperation({ summary: 'Answer that the application is up' })
    @ApiOkResponse({ type: Health.StatusResponse })
    check(): Health.StatusResponse {
        return { status: 'ok' };
    }
}
