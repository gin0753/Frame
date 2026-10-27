const { randomBytes } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '../../..');
const localFile = resolve(root, '.env.database.local');

function localEnvironment() {
  if (!existsSync(localFile)) throw new Error('Run pnpm db:init first');
  // Explicit local tooling only. This never loads environment files in the API.
  const local = parseEnv(readFileSync(localFile, 'utf8'));
  for (const [kind, role] of [
    ['DEV', 'frame_dev'],
    ['TEST', 'frame_test'],
  ]) {
    const password = local[`FRAME_${kind}_DB_PASSWORD`];
    const port = local[`FRAME_${kind}_DB_PORT`];
    if (
      !/^[0-9a-f]{48}$/.test(password ?? '') ||
      !/^\d+$/.test(port ?? '') ||
      Number(port) < 1024 ||
      Number(port) > 65535
    )
      throw new Error('Unsafe local database configuration');
    const key = kind === 'DEV' ? 'DATABASE_URL' : 'TEST_DATABASE_URL';
    if (
      local[key] !==
      `postgresql://${role}:${password}@127.0.0.1:${port}/${role}`
    )
      throw new Error('Unsafe local database configuration');
  }
  // Local commands must never inherit a production DATABASE_URL from the shell.
  Object.assign(process.env, local);
  return local;
}

function testTarget(value, expected) {
  try {
    const url = new URL(value);
    if (
      value !== expected ||
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      url.username !== 'frame_test' ||
      url.pathname !== '/frame_test' ||
      !url.password ||
      url.search ||
      url.hash ||
      !url.port
    )
      throw new Error();
    return url;
  } catch {
    throw new Error('Unsafe integration database target');
  }
}

function compose(args) {
  const result = spawnSync(
    'docker',
    ['compose', '--env-file', localFile, ...args],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error('Local database command failed');
}

if (require.main === module) {
  try {
    const command = process.argv[2];
    if (command === 'init') {
      if (existsSync(localFile))
        throw new Error('Local database environment already exists; preserved');
      const dev = randomBytes(24).toString('hex');
      const test = randomBytes(24).toString('hex');
      writeFileSync(
        localFile,
        [
          `FRAME_DEV_DB_PASSWORD=${dev}`,
          `FRAME_TEST_DB_PASSWORD=${test}`,
          'FRAME_DEV_DB_PORT=5433',
          'FRAME_TEST_DB_PORT=5434',
          `DATABASE_URL=postgresql://frame_dev:${dev}@127.0.0.1:5433/frame_dev`,
          `TEST_DATABASE_URL=postgresql://frame_test:${test}@127.0.0.1:5434/frame_test`,
          '',
        ].join('\n'),
        { flag: 'wx', mode: 0o600 },
      );
      console.log(
        'Created ignored local database environment; credentials are not printed.',
      );
    } else {
      localEnvironment();
      if (command === 'up')
        compose(['up', '-d', '--wait', '--wait-timeout', '90']);
      else if (command === 'down') compose(['down']);
      else if (command === 'status') compose(['ps']);
      else if (command === 'test') {
        testTarget(
          process.env.TEST_DATABASE_URL,
          process.env.TEST_DATABASE_URL,
        );
        const result = spawnSync(
          process.execPath,
          ['--test', 'test/database.integration.cjs'],
          {
            cwd: resolve(__dirname, '..'),
            stdio: 'inherit',
            env: process.env,
          },
        );
        process.exitCode = result.status ?? 1;
      } else if (['migrate', 'status-migrations', 'diff'].includes(command)) {
        const cli = require.resolve('prisma/build/index.js');
        const args =
          command === 'migrate'
            ? ['migrate', 'deploy']
            : command === 'status-migrations'
              ? ['migrate', 'status']
              : [
                  'migrate',
                  'diff',
                  '--from-config-datasource',
                  '--to-schema',
                  'prisma/schema.prisma',
                  '--exit-code',
                ];
        const result = spawnSync(process.execPath, [cli, ...args], {
          cwd: resolve(__dirname, '..'),
          stdio: 'inherit',
          env: process.env,
        });
        process.exitCode = result.status ?? 1;
      } else throw new Error('Unknown database command');
    }
  } catch (error) {
    // Never print subprocess errors containing URL arguments or environment values.
    console.error(
      error.message.startsWith('Run ') ||
        error.message.startsWith('Local database environment')
        ? error.message
        : 'Local database operation failed; check configuration and Docker availability.',
    );
    process.exitCode = 1;
  }
}

module.exports = { localEnvironment, testTarget, compose };
