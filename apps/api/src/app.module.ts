import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { TmdbModule } from './catalog/tmdb/tmdb.module';
@Module({ imports: [HealthModule, DatabaseModule, TmdbModule] })
export class AppModule {}
