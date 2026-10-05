import { Module } from '@nestjs/common';
import { SeedingModule } from '../shared/seeding/seeding.module.ts';
import { AppModule } from './app.module.ts';
import { LAB_SEEDS } from './lab-seeds.ts';

@Module({
    imports: [AppModule, SeedingModule.register(LAB_SEEDS)],
})
export class SeedModule {}
