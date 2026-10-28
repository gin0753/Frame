import { Module } from '@nestjs/common';
import { TmdbModule } from './tmdb/tmdb.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
@Module({
  imports: [TmdbModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
