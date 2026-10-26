const { createApp } = require('../../apps/api/dist/main');
const { Controller, Get, Module } = require('@nestjs/common');
class Failure {
  fail() {
    throw new Error('PRIVATE_SECRET');
  }
}
Controller('transport-failure')(Failure);
Get()(
  Failure.prototype,
  'fail',
  Object.getOwnPropertyDescriptor(Failure.prototype, 'fail'),
);
class TestModule {}
Module({
  imports: [require('../../apps/api/dist/app.module').AppModule],
  controllers: [Failure],
})(TestModule);
(async () => {
  const app = await createApp(TestModule);
  app
    .getHttpAdapter()
    .getInstance()
    .use((req, res, next) => {
      process.send?.({
        url: req.url,
        method: req.method,
        host: req.headers.host,
        origin: req.headers.origin,
        ip: req.ip,
        protocol: req.protocol,
        hostname: req.hostname,
        forwarded: req.headers['x-forwarded-for'],
        cookie: req.headers.cookie,
      });
      next();
    });
  await app.listen(Number(process.env.PORT), '127.0.0.1');
  process.on('message', async (message) => {
    if (message === 'close') {
      await app.close();
      process.exit(0);
    }
  });
})();
