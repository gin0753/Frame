import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { ZodType } from 'zod';
import { CATALOG_COORDINATOR_OPTIONS } from './catalog.policy';
import type {
  CatalogCoordinatorOptions,
  CatalogResource,
} from './catalog.policy';

export class CatalogCoordinationError extends Error {
  constructor(
    readonly category: 'CAPACITY' | 'CANCELLED' | 'TIMEOUT' | 'SHUTDOWN',
  ) {
    super(`Catalog coordination failure: ${category}`);
  }
}
interface Flight {
  controller: AbortController;
  deadline: number;
  consumers: number;
  subscriptions: number;
  abandoned: boolean;
  settled: boolean;
  promise: Promise<unknown>;
}
interface Entry {
  value: unknown;
  expires: number;
  bytes: number;
}

/** Catalog-only, process-local coordination; no disk, per-entry timer or public endpoint. */
@Injectable()
export class CatalogCoordinator implements OnModuleDestroy {
  #options: CatalogCoordinatorOptions;
  #now: () => number;
  #entries = new Map<string, Entry>();
  #flights = new Map<string, Set<Flight>>();
  #flightCount = 0;
  #consumers = 0;
  #bytes = 0;
  #closed = false;
  #metrics = {
    hits: 0,
    misses: 0,
    coalesced: 0,
    operations: 0,
    evictions: 0,
    expired: 0,
    oversize: 0,
    capacityRejected: 0,
    cancelled: 0,
    timeouts: 0,
  };

  constructor(
    @Inject(CATALOG_COORDINATOR_OPTIONS) options: CatalogCoordinatorOptions,
  ) {
    // Defensive copy prevents policy mutation after requests have begun.
    this.#options = { ...options, ttlMs: { ...options.ttlMs } };
    this.#now = options.now ?? (() => performance.now());
    for (const [value, min, max] of [
      [options.maxEntries, 1, 1024],
      [options.maxBytes, 1, 16 * 1024 * 1024],
      [options.maxFlights, 1, 128],
      [options.maxConsumers, 1, 512],
      [options.maxConsumersPerFlight, 1, 32],
      [options.operationTimeoutMs, 1, 2200],
      [options.minimumJoinRemainingMs, 1, options.operationTimeoutMs],
      ...Object.values(options.ttlMs).map((value) => [value, 0, 86400000]),
    ])
      if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new Error('Invalid catalog policy');
  }

  diagnostics() {
    return {
      ...this.#metrics,
      activeFlights: this.#flightCount,
      activeConsumers: this.#consumers,
      retainedEntries: this.#entries.size,
      retainedBytes: this.#bytes,
      retentionEnabled: this.#options.retentionEnabled,
    };
  }

  async get<T>(
    key: string,
    resource: CatalogResource,
    schema: ZodType<T>,
    load: (signal: AbortSignal) => Promise<T>,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    if (this.#closed) throw new CatalogCoordinationError('SHUTDOWN');
    if (callerSignal?.aborted) throw new CatalogCoordinationError('CANCELLED');
    this.expire();
    const entry = this.#entries.get(key);
    if (entry) {
      this.#metrics.hits++;
      this.#entries.delete(key);
      this.#entries.set(key, entry);
      return structuredClone(entry.value) as T;
    }
    this.#metrics.misses++;
    if (this.#consumers >= this.#options.maxConsumers) return this.capacity();
    const now = this.#now();
    let flight = [...(this.#flights.get(key) ?? [])]
      .reverse()
      .find(
        (item) =>
          !item.abandoned &&
          !item.settled &&
          !item.controller.signal.aborted &&
          item.deadline - now >= this.#options.minimumJoinRemainingMs &&
          item.subscriptions < this.#options.maxConsumersPerFlight,
      );
    if (flight) this.#metrics.coalesced++;
    else {
      if (this.#flightCount >= this.#options.maxFlights) return this.capacity();
      flight = this.start(key, resource, schema, load);
    }
    return this.subscribe<T>(flight, callerSignal);
  }

  private capacity(): never {
    this.#metrics.capacityRejected++;
    throw new CatalogCoordinationError('CAPACITY');
  }

  private start<T>(
    key: string,
    resource: CatalogResource,
    schema: ZodType<T>,
    load: (signal: AbortSignal) => Promise<T>,
  ): Flight {
    const controller = new AbortController();
    const flight: Flight = {
      controller,
      deadline: this.#now() + this.#options.operationTimeoutMs,
      consumers: 0,
      subscriptions: 0,
      abandoned: false,
      settled: false,
      promise: Promise.resolve(),
    };
    const group = this.#flights.get(key) ?? new Set<Flight>();
    group.add(flight);
    this.#flights.set(key, group);
    this.#flightCount++;
    this.#metrics.operations++;
    const timer = setTimeout(() => {
      this.#metrics.timeouts++;
      flight.abandoned = true;
      controller.abort(
        new DOMException('Catalog operation deadline exceeded', 'TimeoutError'),
      );
    }, this.#options.operationTimeoutMs);
    flight.promise = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      })
      .then((value) => {
        controller.signal.throwIfAborted();
        const parsed = schema.parse(value);
        if (!flight.abandoned && !this.#closed)
          this.retain(key, resource, parsed);
        return parsed;
      })
      .finally(() => {
        clearTimeout(timer);
        flight.settled = true;
        group.delete(flight);
        this.#flightCount--;
        if (!group.size) this.#flights.delete(key);
      });
    // An abandoned flight may have no subscribers when its adapter finally settles.
    void flight.promise.catch(() => undefined);
    return flight;
  }

  private subscribe<T>(flight: Flight, callerSignal?: AbortSignal): Promise<T> {
    flight.consumers++;
    // Bound lifetime promise handlers as well as active consumers during churn.
    flight.subscriptions++;
    this.#consumers++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (error?: unknown, value?: unknown, failed = false) => {
        if (done) return;
        done = true;
        callerSignal?.removeEventListener('abort', callerAbort);
        flight.controller.signal.removeEventListener('abort', operationAbort);
        flight.consumers--;
        this.#consumers--;
        if (!flight.consumers && !flight.settled) {
          flight.abandoned = true;
          flight.controller.abort(
            callerSignal?.aborted ? callerSignal.reason : undefined,
          );
        }
        if (failed) reject(error);
        else {
          try {
            resolve(structuredClone(value) as T);
          } catch {
            reject(new CatalogCoordinationError('CAPACITY'));
          }
        }
      };
      const callerAbort = () => {
        this.#metrics.cancelled++;
        finish(new CatalogCoordinationError('CANCELLED'), undefined, true);
      };
      const operationAbort = () =>
        finish(
          new CatalogCoordinationError(
            flight.controller.signal.reason?.name === 'TimeoutError'
              ? 'TIMEOUT'
              : 'CANCELLED',
          ),
          undefined,
          true,
        );
      callerSignal?.addEventListener('abort', callerAbort, { once: true });
      flight.controller.signal.addEventListener('abort', operationAbort, {
        once: true,
      });
      flight.promise.then(
        (value) => finish(undefined, value),
        (error: unknown) => finish(error, undefined, true),
      );
      if (callerSignal?.aborted) callerAbort();
      else if (flight.controller.signal.aborted) operationAbort();
    });
  }

  private remove(key: string) {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#bytes -= entry.bytes;
    this.#entries.delete(key);
  }
  private expire() {
    const now = this.#now();
    for (const [key, entry] of this.#entries)
      if (entry.expires <= now) {
        this.remove(key);
        this.#metrics.expired++;
      }
  }
  private retain(key: string, resource: CatalogResource, value: unknown) {
    if (!this.#options.retentionEnabled || !this.#options.ttlMs[resource])
      return;
    const bytes =
      Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value));
    if (bytes > this.#options.maxBytes) {
      this.#metrics.oversize++;
      return;
    }
    this.expire();
    this.remove(key);
    while (
      this.#entries.size >= this.#options.maxEntries ||
      this.#bytes + bytes > this.#options.maxBytes
    ) {
      this.remove(this.#entries.keys().next().value!);
      this.#metrics.evictions++;
    }
    this.#entries.set(key, {
      value: structuredClone(value),
      bytes,
      expires: this.#now() + this.#options.ttlMs[resource],
    });
    this.#bytes += bytes;
  }

  // Invalidation also cancels in-flight work; abandoned slots remain accounted for
  // until the supported adapter settles. New callers cannot reuse those flights.
  clear() {
    this.#entries.clear();
    this.#bytes = 0;
    for (const group of this.#flights.values())
      for (const flight of group) {
        flight.abandoned = true;
        flight.controller.abort();
      }
  }
  onModuleDestroy() {
    this.#closed = true;
    this.clear();
  }
}
