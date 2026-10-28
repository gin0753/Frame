import { HttpException } from '@nestjs/common';

export class CatalogUnavailableException extends HttpException {
  constructor(status: 502 | 503) {
    super('Catalog unavailable', status);
  }
}
