import { HttpException, NotFoundException } from '@nestjs/common';

export class MovieNotFoundException extends NotFoundException {}

export class CatalogUnavailableException extends HttpException {
  constructor(status: 502 | 503) {
    super('Catalog unavailable', status);
  }
}
