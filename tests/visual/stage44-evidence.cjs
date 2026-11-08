// Stage 4.4 evidence metadata only; never changes application/benchmark behavior.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
const git = (...args) =>
  cp.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const hash = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function provenance(collector, browser) {
  const pointer = path.join(root, 'tmp/stage44-current.txt');
  const directory =
    process.env.FRAME_STAGE44_EVIDENCE_DIRECTORY ||
    (fs.existsSync(pointer) ? fs.readFileSync(pointer, 'utf8').trim() : null);
  const metadataFile =
    directory && path.join(root, directory, 'environment.json');
  const metadata =
    metadataFile && fs.existsSync(metadataFile)
      ? JSON.parse(fs.readFileSync(metadataFile))
      : {
          stage: '4.4 QA',
          baselineHead: git('rev-parse', 'HEAD'),
          initialGitStatus: git('status', '--porcelain'),
          node: process.version,
          next: require(
            path.join(root, 'apps/web/node_modules/next/package.json'),
          ).version,
          react: require(
            path.join(root, 'apps/web/node_modules/react/package.json'),
          ).version,
          os: os.release(),
          cpu: os.cpus()[0]?.model,
          logicalCpus: os.cpus().length,
          memoryBytes: os.totalmem(),
          chromiumExecutable: process.env.FRAME_CHROMIUM_EXECUTABLE,
          metadataSource:
            'Standalone collector entry; no task-level metadata supplied',
        };
  return {
    ...metadata,
    buildId: fs
      .readFileSync(path.join(root, 'apps/web/.next/BUILD_ID'), 'utf8')
      .trim(),
    sourceDirtyStatus: git('status', '--porcelain'),
    collector: path.relative(root, collector),
    collectorSha256: hash(collector),
    helperSha256: hash(__filename),
    harnessSha256: hash(path.join(__dirname, 'discover.test.cjs')),
    browser: browser.version(),
    createdAt: new Date().toISOString(),
  };
}
function sessionCLS(entries) {
  let largest = 0,
    sum = 0,
    start = 0,
    last = 0;
  for (const e of entries.filter((e) => !e.hadRecentInput)) {
    if (!sum || e.startTime - last >= 1000 || e.startTime - start >= 5000) {
      sum = 0;
      start = e.startTime;
    }
    sum += e.value;
    last = e.startTime;
    largest = Math.max(largest, sum);
  }
  return largest;
}
module.exports = { provenance, sessionCLS };

// Run with node --test; importing this helper never registers tests.
if (require.main === module) {
  const test = require('node:test');
  const assert = require('node:assert/strict');
  const homepageCLS = require('./homepage-acceptance.cjs').cls;
  const shift = (startTime, value, hadRecentInput = false) => ({
    startTime,
    value,
    hadRecentInput,
  });
  const cases = [
    ...[999.999, 1000, 1000.001].map((gap) => ({
      name: `gap ${gap}ms`,
      entries: [shift(0, 0.06), shift(gap, 0.06)],
      expected: gap < 1000 ? 0.12 : 0.06,
    })),
    ...[4999.999, 5000, 5000.001].map((span) => ({
      name: `span ${span}ms with sub-1000ms gaps`,
      entries: [
        ...[0, 900, 1800, 2700, 3600, 4500].map((t) => shift(t, 0.01)),
        shift(span, 0.04),
      ],
      expected: span < 5000 ? 0.1 : 0.06,
    })),
    {
      name: 'recent-input shifts do not contribute or bridge sessions',
      entries: [shift(0, 0.02), shift(900, 0.9, true), shift(1000, 0.03)],
      expected: 0.03,
    },
    {
      name: 'largest window is returned rather than the last or total',
      entries: [shift(0, 0.07), shift(100, 0.02), shift(2000, 0.03)],
      expected: 0.09,
    },
    { name: 'empty input', entries: [], expected: 0 },
  ];
  for (const [name, calculate] of [
    ['Search/Discover', sessionCLS],
    [
      'Homepage',
      (entries) =>
        homepageCLS(
          entries.map(({ startTime, value, hadRecentInput }) => ({
            start: startTime,
            value,
            recentInput: hadRecentInput,
          })),
        ),
    ],
  ]) {
    for (const c of cases) {
      test(`${name} CLS: ${c.name}`, () => {
        assert.ok(Math.abs(calculate(c.entries) - c.expected) < 1e-12);
      });
    }
  }
}
