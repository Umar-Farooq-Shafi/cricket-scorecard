const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/domain');

const registry = Object.fromEntries(
  ['a', 'b', 'c', 'x', 'y', 'z'].map((id) => [id, { id, name: id.toUpperCase() }]),
);
function match(overrides = {}) {
  return r.startInnings(
    r.createMatch({
      teams: [
        { id: 'a-team', name: 'Falcons', players: ['a', 'b', 'c'] },
        { id: 'x-team', name: 'Lions', players: ['x', 'y', 'z'] },
      ],
      overs: 3,
      playersPerSide: 3,
      format: 'Custom',
      maxBowlerOvers: 2,
      enforceConsecutive: true,
      tossWinner: 0,
      tossDecision: 'bat',
      ...overrides,
    }),
    'a',
    'b',
    'x',
  );
}
const ball = (m, runs = 0, extra = 'none', wicket = null) =>
  r.command(m, { type: 'ball', runs, extra, wicket, boundary: [4, 6].includes(runs) });
test('extras use distinct batter, team and bowler accounting', () => {
  let m = match();
  m = ball(m, 2, 'byes');
  m = ball(m, 2, 'legByes');
  m = ball(m, 0, 'wide');
  m = ball(m, 4, 'noBall');
  const s = r.deriveInnings(m, 0);
  assert.equal(s.runs, 10);
  assert.equal(s.balls, 2);
  assert.equal(s.batters.a.runs, 4);
  assert.equal(s.batters.a.balls, 3);
  assert.equal(s.bowlers.x.runs, 6);
  assert.deepEqual(s.extras, { wide: 1, noBall: 1, byes: 2, legByes: 2 });
  assert.equal(s.batters.a.fours, 1);
});
test('undo restores complete delivery state and preserves original match', () => {
  const before = match();
  const m = ball(before, 1);
  const undone = r.undo(m);
  assert.deepEqual(r.deriveInnings(undone, 0), r.deriveInnings(before, 0));
  assert.equal(r.deriveInnings(m, 0).runs, 1);
  assert.equal(r.deriveInnings(before, 0).runs, 0);
});
test('run out of non-striker at over boundary selects correct replacement slot', () => {
  let m = match();
  for (let i = 0; i < 5; i++) m = ball(m);
  m = ball(m, 0, 'none', { kind: 'run out', player: 'b', fielder: 'y' });
  let s = r.deriveInnings(m, 0);
  assert.equal(s.needBatter, 'striker');
  assert.equal(s.needBowler, true);
  assert.equal(s.bowlers.x.wickets, 0);
  m = r.command(m, { type: 'batter', slot: 'striker', player: 'c' });
  s = r.deriveInnings(m, 0);
  assert.equal(s.striker, 'c');
  assert.equal(s.nonStriker, 'a');
  m = r.undo(m);
  s = r.deriveInnings(m, 0);
  assert.equal(s.wickets, 0);
  assert.equal(s.balls, 5);
  assert.equal(s.nonStriker, 'b');
  assert.equal(s.batters.c.appeared, false);
});
test('undo cannot leak into the previous over after undoing first ball of new over', () => {
  let m = match();
  for (let i = 0; i < 6; i++) m = ball(m);
  m = r.command(m, { type: 'bowler', player: 'y' });
  m = ball(m);
  m = r.undo(m);
  assert.throws(() => r.undo(m), /No delivery/);
});
test('closed innings cannot be undone and chase ends at target', () => {
  let m = match({ overs: 1, maxBowlerOvers: 1 });
  m = ball(m, 2);
  m = r.command(m, { type: 'end' });
  assert.throws(() => r.undo(m), /closed innings/);
  m = r.startInnings(m, 'x', 'y', 'a');
  m = ball(m, 4);
  assert.equal(r.status(m), 'done');
  assert.equal(r.result(m), 'Lions won by 2 wickets');
  assert.throws(() => ball(m), /closed/);
});
test('bowler quota and consecutive-over restrictions are enforced', () => {
  let m = match({ maxBowlerOvers: 1 });
  for (let i = 0; i < 6; i++) m = ball(m);
  assert.throws(() => r.command(m, { type: 'bowler', player: 'x' }), /ineligible/);
  m = r.command(m, { type: 'bowler', player: 'y' });
  for (let i = 0; i < 6; i++) m = ball(m);
  assert.deepEqual(r.eligibleBowlers(m, r.deriveInnings(m, 0)), ['z']);
});
test('injury replacement keeps figures separate and neither can bowl the next over', () => {
  let m = ball(match(), 2);
  m = r.command(m, { type: 'bowler', player: 'y' });
  for (let i = 0; i < 5; i++) m = ball(m);
  const s = r.deriveInnings(m, 0);
  assert.equal(s.bowlers.x.balls, 1);
  assert.equal(s.bowlers.y.balls, 5);
  assert.deepEqual(r.eligibleBowlers(m, s), ['z']);
});
test('invalid wickets are rejected; caught dismissal credits fielder and bowler', () => {
  assert.throws(
    () => ball(match(), 0, 'noBall', { kind: 'caught', player: 'a', fielder: 'y' }),
    /no-ball/,
  );
  assert.throws(() => ball(match(), 0, 'none', { kind: 'caught', player: 'a' }), /fielder/);
  let m = ball(match(), 0, 'none', { kind: 'caught', player: 'a', fielder: 'y' });
  assert.equal(r.deriveInnings(m, 0).bowlers.x.wickets, 1);
  m = r.command(m, { type: 'end' });
  m = r.startInnings(m, 'x', 'y', 'a');
  m = ball(m, 1);
  const stats = r.statistics([m], registry);
  assert.equal(stats.find((p) => p.id === 'a').ducks, 1);
  assert.equal(stats.find((p) => p.id === 'y').catches, 1);
  assert.equal(stats.find((p) => p.id === 'b').ducks, 0);
});
test('head-to-head uses direct deliveries and excludes run-out bowling credit', () => {
  let m = ball(match(), 4);
  m = ball(m, 0, 'wide');
  m = ball(m, 0, 'none', { kind: 'run out', player: 'a', fielder: 'y' });
  const h = r.headToHead([m], 'a', 'x');
  assert.equal(h.deliveries, 3);
  assert.equal(h.balls, 2);
  assert.equal(h.runs, 4);
  assert.equal(h.conceded, 5);
  assert.equal(h.dismissals, 0);
  assert.equal(h.economy, 15);
  assert.equal(r.headToHead([m], 'b', 'x').deliveries, 0);
});
test('rates treat 1.3 overs as 9 balls and no dismissals as undefined average', () => {
  assert.equal(r.overs(9), '1.3');
  assert.equal(r.rate(9, 9, 6), 6);
  assert.equal(r.rate(25, 0), null);
  assert.equal(r.fmt(null), '—');
});
test('fantasy milestones and duck bonuses are evaluated per innings', () => {
  const p = { runs: 50, balls: 30, fours: 0, sixes: 0, out: false };
  assert.equal(r.fantasy(p, null), 33);
  assert.equal(r.fantasy({ ...p, runs: 0 }, null), 0);
  assert.equal(r.fantasy({ ...p, runs: 0, out: true }, null), -2);
  const complete = () => {
    let m = match({ overs: 20, maxBowlerOvers: 20, enforceConsecutive: false });
    for (let i = 0; i < 8; i++) {
      const s = r.deriveInnings(m, 0);
      if (s.needBowler) {
        m = r.command(m, { type: 'bowler', player: s.bowler });
        m = r.command(m, { type: 'swap' });
      }
      m = ball(m, 6);
    }
    m = ball(m, 2);
    m = r.command(m, { type: 'end' });
    m = r.startInnings(m, 'x', 'y', 'a');
    return r.command(m, { type: 'end' });
  };
  const stats = r.statistics([complete(), complete()], registry);
  const p1 = stats.find((p) => p.id === 'a');
  assert.equal(p1.centuries, 0);
  assert.equal(p1.fifties, 2);
  assert.equal(p1.notOuts, 2);
  assert.equal(p1.average, null);
  assert.equal(p1.points, 82);
  assert.equal(p1.battingPoints, 82);
  assert.equal(p1.bowlingPoints, 0);
});
test('rankings separate batting and bowling fantasy points from runs, wickets and catches', () => {
  let m = match({ enforceConsecutive: false });
  for (const runs of [2, 2, 2, 1, 6]) m = ball(m, runs);
  m = r.command(m, { type: 'bowler', player: 'y' });
  m = ball(m);
  m = r.command(m, { type: 'bowler', player: 'x' });
  m = ball(m, 0, 'none', { kind: 'caught', player: 'a', fielder: 'z' });
  m = r.command(m, { type: 'batter', slot: 'striker', player: 'c' });
  m = r.command(m, { type: 'bowler', player: 'y' });
  m = ball(m);
  m = r.command(m, { type: 'end' });
  m = r.startInnings(m, 'x', 'y', 'a');
  m = ball(m, 4);
  m = ball(m, 0, 'none', { kind: 'caught', player: 'x', fielder: 'b' });
  m = r.command(m, { type: 'end' });
  const rows = r.statistics([m], registry);
  const byId = Object.fromEntries(rows.map((p) => [p.id, p]));
  assert.equal(byId.a.runs, 7);
  assert.equal(byId.b.runs, 6);
  assert.equal(byId.a.battingPoints, 3.5);
  assert.equal(byId.b.battingPoints, 4);
  assert.equal(byId.a.bowlingPoints, 10.5);
  assert.equal(byId.a.points, 14);
  assert.equal(byId.b.bowlingPoints, 0);
  assert.equal(byId.b.points, 8);
  assert.equal(byId.z.battingPoints, 0);
  assert.equal(byId.z.bowlingPoints, 0);
  assert.equal(byId.z.points, 4);
  assert.equal(r.sorted(rows, 'runs')[0].id, 'a');
  assert.equal(r.sorted(rows, 'battingPoints')[0].id, 'b');
  assert.equal(r.sorted(rows, 'points')[0].id, 'a');

  const custom = r.statistics([m], registry, { dot_ball: 12, catch: 7 });
  const y = custom.find((p) => p.id === 'y');
  assert.equal(y.wickets, 0);
  assert.equal(y.bowlingPoints, 24);
  assert.equal(r.sorted(custom, 'bowlingPoints')[0].id, 'y');
  assert.equal(custom.find((p) => p.id === 'b').points, 11);
  for (const p of custom) {
    assert.equal(p.points, p.battingPoints + p.bowlingPoints + p.catches * 7);
  }
  assert.deepEqual(r.statistics([m], registry, undefined, { team: 'Other team' }), []);
});
test('maiden over includes wickets but excludes an over with bowler-charged extras', () => {
  let m = match();
  for (let i = 0; i < 6; i++) m = ball(m);
  assert.equal(r.deriveInnings(m, 0).bowlers.x.maidens, 1);
  m = match();
  m = ball(m, 0, 'wide');
  for (let i = 0; i < 6; i++) m = ball(m);
  assert.equal(r.deriveInnings(m, 0).bowlers.x.maidens, 0);
});
test('reopening serialized events reproduces scorecard and stats', () => {
  let m = ball(match(), 6);
  m = r.command(m, { type: 'end' });
  m = r.startInnings(m, 'x', 'y', 'a');
  m = ball(m, 0);
  m = r.command(m, { type: 'end' });
  const saved = JSON.parse(JSON.stringify(m));
  assert.deepEqual(r.deriveInnings(saved, 0), r.deriveInnings(m, 0));
  assert.deepEqual(r.statistics([saved], registry), r.statistics([m], registry));
});
test('guest registration does not change identity or historical stats', () => {
  let m = ball(match(), 6);
  m = r.command(m, { type: 'end' });
  m = r.startInnings(m, 'x', 'y', 'a');
  m = r.command(m, { type: 'end' });
  const guest = { ...registry, a: { id: 'a', name: 'A', guest: true } },
    registered = { ...guest, a: { ...guest.a, guest: false } };
  assert.deepEqual(r.statistics([m], guest), r.statistics([m], registered));
});
test('comparison requires a meaningful sample and ties are deterministic', () => {
  assert.match(r.compare({ id: 'a', innings: 0 }, { id: 'b', innings: 0 }), /Insufficient/);
  assert.deepEqual(
    r
      .sorted(
        [
          { id: 'b', name: 'B', runs: 10 },
          { id: 'a', name: 'A', runs: 10 },
        ],
        'runs',
      )
      .map((p) => p.id),
    ['a', 'b'],
  );
});
