import { Global, Module } from '@nestjs/common';
import { Ids, UuidV7Ids } from './ids.service.ts';

@Global()
@Module({
    providers: [{ provide: Ids, useClass: UuidV7Ids }],
    exports: [Ids],
})
export class IdsModule {}
