import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  catalogContracts,
  emptyQuerySchema,
  movieParamsSchema,
  popularQuerySchema,
  trendingQuerySchema,
} from '@frame/contracts';
import type {
  MovieParams,
  PopularQuery,
  TrendingQuery,
} from '@frame/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  private async respond<T>(
    request: Request,
    read: (signal: AbortSignal) => Promise<T>,
  ) {
    const controller = new AbortController();
    const disconnected = () => {
      if (!request.res?.writableEnded) controller.abort();
    };
    request.once('aborted', disconnected);
    request.res?.once('close', disconnected);
    if (request.aborted) controller.abort();
    try {
      return await read(controller.signal);
    } finally {
      request.off('aborted', disconnected);
      request.res?.off('close', disconnected);
    }
  }
  @Get('movies/trending')
  @Header('Cache-Control', 'no-store')
  async trending(
    @Query(new ZodValidationPipe(trendingQuerySchema)) query: TrendingQuery,
    @Req() request: Request,
  ) {
    return catalogContracts.trending.response.parse(
      await this.respond(request, (signal) =>
        this.catalog.trending(query.timeWindow, signal),
      ),
    );
  }
  @Get('movies/popular')
  @Header('Cache-Control', 'no-store')
  async popular(
    @Query(new ZodValidationPipe(popularQuerySchema)) query: PopularQuery,
    @Req() request: Request,
  ) {
    return catalogContracts.popular.response.parse(
      await this.respond(request, (signal) =>
        this.catalog.popular(Number(query.page), signal),
      ),
    );
  }
  @Get('genres')
  @Header('Cache-Control', 'no-store')
  async genres(
    @Query(new ZodValidationPipe(emptyQuerySchema))
    _query: Record<string, never>,
    @Req() request: Request,
  ) {
    void _query;
    return catalogContracts.genres.response.parse(
      await this.respond(request, (signal) => this.catalog.genres(signal)),
    );
  }
  @Get('movies/:tmdbMovieId')
  @Header('Cache-Control', 'no-store')
  async detail(
    @Param(new ZodValidationPipe(movieParamsSchema)) params: MovieParams,
    @Query(new ZodValidationPipe(emptyQuerySchema))
    _query: Record<string, never>,
    @Req() request: Request,
  ) {
    void _query;
    return catalogContracts.detail.response.parse(
      await this.respond(request, (signal) =>
        this.catalog.detail(Number(params.tmdbMovieId), signal),
      ),
    );
  }
}
