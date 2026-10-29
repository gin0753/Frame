import { Module } from '@nestjs/common';
import { TmdbModule } from './tmdb/tmdb.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogCoordinator } from './catalog.coordinator';
import { CATALOG_COORDINATOR_OPTIONS, catalogPolicy } from './catalog.policy';
@Module({
  imports: [TmdbModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    CatalogCoordinator,
    { provide: CATALOG_COORDINATOR_OPTIONS, useFactory: () => catalogPolicy() },
  ],
})
export class CatalogModule {}
