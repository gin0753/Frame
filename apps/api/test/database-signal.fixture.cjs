const { bootstrap } = require('../dist/main');
const { DatabaseService } = require('../dist/database/database.service');

bootstrap().then((app) => {
  const database = app.get(DatabaseService);
  const close = database.onApplicationShutdown.bind(database);
  let calls = 0;
  database.onApplicationShutdown = async () => {
    calls++;
    await close();
    process.send?.({ closed: calls });
  };
  process.send?.('ready');
  // Same Windows limitation as the existing transport lifecycle fixture.
  process.on('message', (signal) => process.emit(signal));
});
