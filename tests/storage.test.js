const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository, emptyState } = require('../src/repository');
function memory() {
  const values = new Map();
  return {
    values,
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
    multiGet: (keys) => keys.map((k) => [k, values.get(k) ?? null]),
    multiSet: (entries) => entries.forEach(([k, v]) => values.set(k, v)),
  };
}
test('legacy migration preserves completed and in-progress snapshots without fake events', async () => {
  const kv = memory(),
    legacy = memory();
  legacy.setItem(
    'cricket_scorecard_v1',
    JSON.stringify({
      matches: [{ id: 1, status: 'done' }],
      currentMatch: { id: 2, status: 'live' },
      pointsSystem: { run: 2 },
    }),
  );
  const repo = createRepository(kv, legacy),
    data = await repo.loadState();
  assert.equal(data.matches.length, 2);
  assert.equal(data.points.run, 2);
  assert.equal(data.matches[0].innings, undefined);
  assert.deepEqual((await repo.loadState()).matches, data.matches);
  assert.ok(legacy.getItem('cricket_scorecard_v1'));
});
test('interrupted multi-key writes recover before loading', async () => {
  const kv = memory(),
    repo = createRepository(kv, memory()),
    before = emptyState();
  await repo.persistState(before, emptyState());
  const after = { ...before, matches: [{ id: 'm', events: [1] }] };
  const write = kv.multiSet;
  kv.multiSet = (entries) => {
    write(entries.slice(0, 1));
    throw Error('disk interrupted');
  };
  await assert.rejects(repo.persistState(after, before), /interrupted/);
  kv.multiSet = write;
  assert.deepEqual((await repo.loadState()).matches, after.matches);
  assert.equal(kv.getItem('cricket_v2_pending'), null);
});
test('failure before journal write leaves confirmed data untouched', async () => {
  const kv = memory(),
    repo = createRepository(kv, memory()),
    before = emptyState();
  await repo.persistState(before, emptyState());
  const write = kv.setItem;
  kv.setItem = () => {
    throw Error('disk full');
  };
  await assert.rejects(
    repo.persistState({ ...before, matches: [{ id: 'new' }] }, before),
    /disk full/,
  );
  kv.setItem = write;
  assert.equal((await repo.loadState()).matches.length, 0);
});
test('a delivery saves only the changed match, not the full historical database or photos', async () => {
  const kv = memory(),
    repo = createRepository(kv, memory()),
    before = {
      ...emptyState(),
      matches: [
        { id: 'm', events: [] },
        { id: 'old', events: [1] },
      ],
    },
    after = { ...before, matches: [{ id: 'm', events: [2] }, before.matches[1]] };
  await repo.persistState(before, emptyState());
  const writes = [];
  const write = kv.multiSet;
  kv.multiSet = (entries) => {
    writes.push(...entries.map((x) => x[0]));
    write(entries);
  };
  await repo.persistState(after, before);
  assert.deepEqual(writes, ['cricket_v2_match_m']);
});
test('corrupt or missing indexed data reports an error instead of resetting', async () => {
  const kv = memory(),
    repo = createRepository(kv, memory());
  kv.setItem('cricket_v2_index', JSON.stringify({ matchIds: ['missing'] }));
  await assert.rejects(repo.loadState(), /missing/);
  assert.ok(kv.getItem('cricket_v2_index'));
});
