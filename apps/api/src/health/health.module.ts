import {
  Controller,
  Get,
  Header,
  Injectable,
  Module,
  Inject,
} from '@nestjs/common';
@Injectable()
export class HealthService {
  getHealth() {
    return { status: 'ok', service: 'frame-api' } as const;
  }
}
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth() {
    return this.health.getHealth();
  }
}
@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
