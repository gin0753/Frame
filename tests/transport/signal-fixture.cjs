const { bootstrap } = require('../../apps/api/dist/main');
bootstrap().then(() => {
  process.send?.('ready');
  // Windows cannot deliver POSIX signals. Exercise the registered signal listeners
  // in isolation; POSIX runners send the real signal instead.
  process.on('message', (signal) => process.emit(signal));
});
