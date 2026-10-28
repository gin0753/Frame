import { Module } from '@nestjs/common';
import { TMDB_OPTIONS, TmdbAdapter } from './tmdb.adapter';
import { tmdbConfig } from './tmdb.config';

@Module({
  providers: [
    { provide: TMDB_OPTIONS, useFactory: () => ({ config: tmdbConfig() }) },
    TmdbAdapter,
  ],
  exports: [TmdbAdapter],
})
export class TmdbModule {}
