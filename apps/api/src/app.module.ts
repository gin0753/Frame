import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { CatalogModule } from './catalog/catalog.module';
@Module({ imports: [HealthModule, DatabaseModule, CatalogModule] })
export class AppModule {}
