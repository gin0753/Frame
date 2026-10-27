import {
  Controller,
  Get,
  Header,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('ready')
class ReadinessController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async ready() {
    if (!(await this.database.isReady()))
      throw new ServiceUnavailableException();
    return { status: 'ready', service: 'frame-api' };
  }
}

@Module({
  providers: [DatabaseService],
  controllers: [ReadinessController],
  exports: [DatabaseService],
})
export class DatabaseModule {}
