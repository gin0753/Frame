const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getEventListeners } = require('node:events');
const { z } = require('zod');
const {
  CatalogCoordinator,
  CatalogCoordinationError,
} = require('../dist/catalog/catalog.coordinator');
const { catalogPolicy, catalogKey } = require('../dist/catalog/catalog.policy');
const schema = z.strictObject({ value: z.string() });
const tick = () => new Promise(setImmediate);
const options = (patch = {}) => ({ ...catalogPolicy({}), ...patch });
const cached = (patch = {}) =>
  options({
    retentionEnabled: true,
    ttlMs: {
      trending: 100,
      popular: 100,
      genres: 100,
      detail: 100,
      configuration: 100,
    },
    ...patch,
  });
function deferred(cooperative = true) {
  const calls = [];
  const load = (signal) =>
    new Promise((resolve, reject) => {
      const cleanup = () => signal.removeEventListener('abort', abort);
      const abort = () => {
        if (cooperative) {
          cleanup();
          reject(signal.reason);
        }
      };
      const call = {
        signal,
        resolve: (value = { value: 'synthetic' }) => {
          cleanup();
          resolve(value);
        },
        reject: (error = new Error('synthetic failure')) => {
          cleanup();
          reject(error);
        },
      };
      calls.push(call);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  return { load, calls };
}
const category = (expected) => (error) =>
  error instanceof CatalogCoordinationError && error.category === expected;

test('rights gate fails closed, policy values are bounded and keys isolate all semantic dimensions', () => {
  assert.equal(catalogPolicy({}).retentionEnabled, false);
  assert.ok(Object.values(catalogPolicy({}).ttlMs).every((ttl) => ttl === 0));
  for (const env of [
    { CATALOG_CACHE_ENABLED: 'true' },
    { CATALOG_CACHE_ENABLED: 'yes' },
    { CATALOG_MAX_INFLIGHT: '0' },
    { CATALOG_MAX_CONSUMERS: '9999' },
    { CATALOG_CACHE_MAX_BYTES: '99999999999999' },
    { CATALOG_CACHE_GENRES_TTL_SECONDS: '86401' },
  ])
    assert.throws(() => catalogPolicy(env));
  const keys = [
    catalogKey('trending', ['day', 1]),
    catalogKey('trending', ['week', 1]),
    catalogKey('popular', [1]),
    catalogKey('popular', [2]),
    catalogKey('detail', [1, 'credits,videos']),
    catalogKey('detail', [2, 'credits,videos']),
    catalogKey('detail', [1, 'credits']),
    catalogKey('genres', [], 'en-US'),
    catalogKey('genres', [], 'fr-FR'),
    catalogKey('configuration'),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(catalogKey('popular', [1]), catalogKey('popular', [1]));
});

test('identical requests share one operation, clone results, remove listeners and leave no registry entry', async () => {
  const coordinator = new CatalogCoordinator(options());
  const provider = deferred();
  const callers = Array.from({ length: 8 }, () => new AbortController());
  try {
    const results = callers.map((caller) =>
      coordinator.get('same', 'genres', schema, provider.load, caller.signal),
    );
    await tick();
    assert.equal(provider.calls.length, 1);
    provider.calls[0].resolve();
    const values = await Promise.all(results);
    values[0].value = 'mutated';
    assert.equal(values[1].value, 'synthetic');
    assert.equal(coordinator.diagnostics().coalesced, 7);
    assert.equal(coordinator.diagnostics().activeFlights, 0);
    assert.equal(coordinator.diagnostics().activeConsumers, 0);
    for (const caller of callers)
      assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
    assert.equal(
      getEventListeners(provider.calls[0].signal, 'abort').length,
      0,
    );
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('different keys remain independent while retention disabled never reuses settled data', async () => {
  const coordinator = new CatalogCoordinator(options());
  let calls = 0;
  const load = async () => ({ value: String(++calls) });
  try {
    const values = await Promise.all(
      ['a', 'b'].map((key) => coordinator.get(key, 'genres', schema, load)),
    );
    assert.deepEqual(values, [{ value: '1' }, { value: '2' }]);
    assert.equal(
      (await coordinator.get('a', 'genres', schema, load)).value,
      '3',
    );
    assert.equal(coordinator.diagnostics().retainedEntries, 0);
    assert.equal(coordinator.diagnostics().retainedBytes, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('one caller abort leaves shared work alive for the remaining consumer', async () => {
  const coordinator = new CatalogCoordinator(options());
  const provider = deferred();
  const caller = new AbortController();
  try {
    const first = coordinator.get(
      'shared',
      'genres',
      schema,
      provider.load,
      caller.signal,
    );
    const rejected = assert.rejects(first, category('CANCELLED'));
    const second = coordinator.get('shared', 'genres', schema, provider.load);
    await tick();
    caller.abort();
    await rejected;
    assert.equal(provider.calls[0].signal.aborted, false);
    provider.calls[0].resolve();
    assert.deepEqual(await second, { value: 'synthetic' });
    assert.equal(coordinator.diagnostics().activeFlights, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('all consumers abort; abandoned operation is not reused and remains capacity-accounted until settled', async () => {
  const coordinator = new CatalogCoordinator(options({ maxFlights: 1 }));
  const provider = deferred(false);
  const caller = new AbortController();
  try {
    const pending = coordinator.get(
      'same',
      'genres',
      schema,
      provider.load,
      caller.signal,
    );
    const rejected = assert.rejects(pending, category('CANCELLED'));
    await tick();
    caller.abort();
    await rejected;
    assert.equal(provider.calls[0].signal.aborted, true);
    await assert.rejects(
      coordinator.get('same', 'genres', schema, provider.load),
      category('CAPACITY'),
    );
    provider.calls[0].resolve();
    await tick();
    const next = coordinator.get('same', 'genres', schema, provider.load);
    await tick();
    assert.equal(provider.calls.length, 2);
    provider.calls[1].resolve();
    await next;
    assert.equal(coordinator.diagnostics().activeFlights, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('shared failures and invalid results never enter cache and are removed for the next caller', async () => {
  const coordinator = new CatalogCoordinator(cached());
  const provider = deferred();
  try {
    const one = coordinator.get('same', 'genres', schema, provider.load);
    const two = coordinator.get('same', 'genres', schema, provider.load);
    const rejected = Promise.all([
      assert.rejects(one, /synthetic failure/),
      assert.rejects(two, /synthetic failure/),
    ]);
    await tick();
    provider.calls[0].reject();
    await rejected;
    assert.equal(coordinator.diagnostics().activeFlights, 0);
    await assert.rejects(
      coordinator.get('same', 'genres', schema, async () => ({
        wrong: 'shape',
      })),
    );
    assert.equal(coordinator.diagnostics().retainedEntries, 0);
    assert.deepEqual(
      await coordinator.get('same', 'genres', schema, async () => ({
        value: 'recovered',
      })),
      { value: 'recovered' },
    );
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('late arrivals get fresh bounded work instead of inheriting insufficient remaining time', async () => {
  let now = 0;
  const coordinator = new CatalogCoordinator(options({ now: () => now }));
  const provider = deferred();
  try {
    const first = coordinator.get('same', 'genres', schema, provider.load);
    await tick();
    now = 401;
    const second = coordinator.get('same', 'genres', schema, provider.load);
    await tick();
    assert.equal(provider.calls.length, 2);
    provider.calls.forEach((call) => call.resolve());
    await Promise.all([first, second]);
    assert.equal(coordinator.diagnostics().activeFlights, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('global flight and consumer capacities reject promptly without adding registry entries', async () => {
  for (const patch of [{ maxFlights: 1 }, { maxConsumers: 1 }]) {
    const coordinator = new CatalogCoordinator(options(patch));
    const provider = deferred();
    const caller = new AbortController();
    try {
      const pending = coordinator.get(
        'a',
        'genres',
        schema,
        provider.load,
        caller.signal,
      );
      const rejected = assert.rejects(pending, category('CANCELLED'));
      await tick();
      await assert.rejects(
        coordinator.get('b', 'genres', schema, provider.load),
        category('CAPACITY'),
      );
      assert.equal(coordinator.diagnostics().activeFlights, 1);
      caller.abort();
      await rejected;
      await tick();
      assert.equal(coordinator.diagnostics().activeFlights, 0);
    } finally {
      coordinator.onModuleDestroy();
    }
  }
});

test('coalesced operation deadline rejects all consumers and releases cooperative provider work', async () => {
  const coordinator = new CatalogCoordinator(
    options({ operationTimeoutMs: 40, minimumJoinRemainingMs: 10 }),
  );
  const provider = deferred();
  try {
    const one = coordinator.get('same', 'genres', schema, provider.load);
    const two = coordinator.get('same', 'genres', schema, provider.load);
    await Promise.all([
      assert.rejects(one, category('TIMEOUT')),
      assert.rejects(two, category('TIMEOUT')),
    ]);
    await tick();
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].signal.aborted, true);
    assert.equal(coordinator.diagnostics().activeFlights, 0);
    assert.equal(coordinator.diagnostics().activeConsumers, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('individual caller deadline does not shorten another active consumer lifetime', async () => {
  const coordinator = new CatalogCoordinator(
    options({ operationTimeoutMs: 500, minimumJoinRemainingMs: 300 }),
  );
  const provider = deferred();
  try {
    const first = coordinator.get(
      'same',
      'genres',
      schema,
      provider.load,
      AbortSignal.timeout(20),
    );
    const rejected = assert.rejects(first, category('CANCELLED'));
    const second = coordinator.get('same', 'genres', schema, provider.load);
    await rejected;
    assert.equal(provider.calls[0].signal.aborted, false);
    provider.calls[0].resolve();
    await second;
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('synthetic TTL cache hits are copied, expire exactly, and never serve stale after a failed refresh', async () => {
  let now = 0;
  let calls = 0;
  const coordinator = new CatalogCoordinator(cached({ now: () => now }));
  const load = async () => ({ value: String(++calls) });
  try {
    const first = await coordinator.get('key', 'genres', schema, load);
    first.value = 'mutated';
    now = 99;
    assert.deepEqual(await coordinator.get('key', 'genres', schema, load), {
      value: '1',
    });
    assert.equal(calls, 1);
    now = 100;
    await assert.rejects(
      coordinator.get('key', 'genres', schema, async () => {
        throw new Error('unavailable');
      }),
    );
    assert.equal(coordinator.diagnostics().retainedEntries, 0);
    assert.deepEqual(await coordinator.get('key', 'genres', schema, load), {
      value: '2',
    });
    assert.equal(coordinator.diagnostics().expired, 1);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('synthetic cache obeys LRU, entry count, aggregate byte weight and oversize bounds', async () => {
  const coordinator = new CatalogCoordinator(
    cached({ maxEntries: 2, maxBytes: 100 }),
  );
  let calls = 0;
  const load = async () => ({ value: String(++calls) });
  try {
    await coordinator.get('a', 'genres', schema, load);
    await coordinator.get('b', 'genres', schema, load);
    await coordinator.get('a', 'genres', schema, load);
    await coordinator.get('c', 'genres', schema, load);
    assert.equal(calls, 3);
    await coordinator.get('b', 'genres', schema, load);
    assert.equal(calls, 4);
    assert.equal(coordinator.diagnostics().retainedEntries, 2);
    assert.ok(coordinator.diagnostics().evictions >= 2);
    await coordinator.get('large', 'genres', schema, async () => ({
      value: 'x'.repeat(200),
    }));
    assert.equal(coordinator.diagnostics().oversize, 1);
    assert.ok(coordinator.diagnostics().retainedBytes <= 100);
    for (let index = 0; index < 10; index++)
      await coordinator.get(String(index), 'genres', schema, async () => ({
        value: 'x'.repeat(40),
      }));
    assert.ok(coordinator.diagnostics().retainedBytes <= 100);
    assert.ok(coordinator.diagnostics().retainedEntries <= 2);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('configuration and movie cache entries remain isolated, clear invalidates retained and in-flight work', async () => {
  const coordinator = new CatalogCoordinator(cached());
  const provider = deferred();
  const caller = new AbortController();
  try {
    await coordinator.get(
      catalogKey('configuration'),
      'configuration',
      schema,
      async () => ({ value: 'config' }),
    );
    await coordinator.get(
      catalogKey('detail', [42]),
      'detail',
      schema,
      async () => ({ value: 'movie' }),
    );
    assert.equal(
      (
        await coordinator.get(
          catalogKey('configuration'),
          'configuration',
          schema,
          provider.load,
        )
      ).value,
      'config',
    );
    const pending = coordinator.get(
      'inflight',
      'genres',
      schema,
      provider.load,
      caller.signal,
    );
    const rejected = assert.rejects(pending, category('CANCELLED'));
    await tick();
    coordinator.clear();
    await rejected;
    await tick();
    assert.equal(coordinator.diagnostics().retainedEntries, 0);
    assert.equal(coordinator.diagnostics().activeFlights, 0);
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0);
    coordinator.onModuleDestroy();
    await assert.rejects(
      coordinator.get('closed', 'genres', schema, provider.load),
      category('SHUTDOWN'),
    );
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('subscription churn has a lifetime per-flight bound, not just an active-consumer bound', async () => {
  const coordinator = new CatalogCoordinator(
    options({ maxConsumersPerFlight: 2, maxFlights: 2 }),
  );
  const provider = deferred();
  const first = new AbortController();
  const transient = new AbortController();
  const later = new AbortController();
  try {
    const held = coordinator.get(
      'same',
      'genres',
      schema,
      provider.load,
      first.signal,
    );
    const heldRejected = assert.rejects(held, category('CANCELLED'));
    const joined = coordinator.get(
      'same',
      'genres',
      schema,
      provider.load,
      transient.signal,
    );
    const joinedRejected = assert.rejects(joined, category('CANCELLED'));
    await tick();
    transient.abort();
    await joinedRejected;
    const next = coordinator.get(
      'same',
      'genres',
      schema,
      provider.load,
      later.signal,
    );
    const nextRejected = assert.rejects(next, category('CANCELLED'));
    await tick();
    assert.equal(provider.calls.length, 2);
    first.abort();
    later.abort();
    await Promise.all([heldRejected, nextRejected]);
    await tick();
    assert.equal(coordinator.diagnostics().activeFlights, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('cached nested values are isolated from both loader inputs and later caller mutations', async () => {
  const coordinator = new CatalogCoordinator(cached());
  const nested = z.strictObject({
    items: z.array(z.strictObject({ names: z.array(z.string()) })),
  });
  const input = { items: [{ names: ['original'] }] };
  try {
    const result = await coordinator.get(
      'nested',
      'genres',
      nested,
      async () => input,
    );
    input.items[0].names.push('loader mutation');
    result.items[0].names.push('caller mutation');
    const hit = await coordinator.get('nested', 'genres', nested, async () =>
      assert.fail('cache hit must not load'),
    );
    assert.deepEqual(hit, { items: [{ names: ['original'] }] });
  } finally {
    coordinator.onModuleDestroy();
  }
});

test('an undefined rejection remains a failure rather than becoming an undefined success', async () => {
  const coordinator = new CatalogCoordinator(cached());
  try {
    await assert.rejects(
      coordinator.get('undefined-error', 'genres', schema, async () =>
        Promise.reject(undefined),
      ),
    );
    assert.equal(coordinator.diagnostics().retainedEntries, 0);
    assert.equal(coordinator.diagnostics().activeFlights, 0);
  } finally {
    coordinator.onModuleDestroy();
  }
});
