// Pure, replayable cricket rules. All rates use legal balls, never decimal overs.
const POINTS = {
  run: 0.5,
  four_bonus: 0.5,
  six_bonus: 1,
  fifty_bonus: 8,
  hundred_bonus: 12,
  duck: -2,
  wicket: 10,
  four_wicket_haul: 4,
  five_wicket_haul: 8,
  dot_ball: 0.5,
  catch: 4,
};
const SETTINGS = {
  minBalls: 12,
  minOvers: 2,
  minInnings: 1,
  batWeight: 1,
  strikeWeight: 1,
  bowlWeight: 1,
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const overs = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const rate = (n, d, m = 1) => (d ? (n * m) / d : null);
const fmt = (n) => (n == null ? '—' : Number(n).toFixed(2));
const assert = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const bowlerCredit = (type) => ['bowled', 'caught', 'lbw', 'stumped', 'hit wicket'].includes(type);
const batter = (pid) => ({
  id: pid,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  appeared: false,
  out: false,
  dismissal: null,
});
const bowler = (pid) => ({ id: pid, balls: 0, runs: 0, wickets: 0, dots: 0, maidens: 0 });

function createMatch(config) {
  const m = { ...clone(config), id: id(), version: 2, date: new Date().toISOString(), innings: [] };
  assert(m.teams.length === 2 && m.teams.every((t) => t.name.trim()), 'Enter both team names.');
  assert(
    m.teams[0].name.trim().toLowerCase() !== m.teams[1].name.trim().toLowerCase(),
    'Choose different team names.',
  );
  assert(
    Number.isInteger(m.overs) && m.overs >= 1 && m.overs <= 100,
    'Overs must be a whole number from 1 to 100.',
  );
  assert(
    Number.isInteger(m.playersPerSide) && m.playersPerSide >= 2 && m.playersPerSide <= 22,
    'Players per side must be 2 to 22.',
  );
  assert(
    m.teams.every((t) => t.players.length >= 2 && t.players.length <= m.playersPerSide),
    'Add at least two players per side, within the configured squad size.',
  );
  const all = m.teams.flatMap((t) => t.players);
  assert(new Set(all).size === all.length, 'A player can only appear once in a match.');
  assert(m.maxBowlerOvers >= 1 && m.maxBowlerOvers <= m.overs, 'Invalid bowling quota.');
  m.firstBat = m.tossDecision === 'bat' ? m.tossWinner : 1 - m.tossWinner;
  return m;
}
function startInnings(match, striker, nonStriker, bowling) {
  const m = clone(match),
    index = m.innings.length;
  assert(
    index < 2 && (!index || deriveInnings(m, 0).closed),
    'Finish the first innings before starting the chase.',
  );
  const batting = index === 0 ? m.firstBat : 1 - m.firstBat;
  assert(
    striker !== nonStriker &&
      m.teams[batting].players.includes(striker) &&
      m.teams[batting].players.includes(nonStriker),
    'Choose two different opening batters.',
  );
  assert(m.teams[1 - batting].players.includes(bowling), 'Choose the opening bowler.');
  m.innings.push({
    batting,
    opening: { striker, nonStriker, bowler: bowling },
    events: [],
    undoFloor: 0,
  });
  return m;
}
const inningsCache = new WeakMap();
function deriveInnings(m, index) {
  const inn = m.innings[index];
  if (!inn) return null;
  const cached = inningsCache.get(m)?.[index];
  if (cached) return cached;
  const s = {
    ...inn.opening,
    batting: inn.batting,
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wide: 0, noBall: 0, byes: 0, legByes: 0 },
    batters: {},
    bowlers: {},
    deliveries: [],
    closed: false,
    needBatter: null,
    needBowler: false,
    previousOverBowlers: [],
    currentOverBowlers: [],
    overRuns: 0,
    overBowlerBalls: {},
    thisOver: [],
  };
  m.teams[inn.batting].players.forEach((p) => (s.batters[p] = batter(p)));
  m.teams[1 - inn.batting].players.forEach((p) => (s.bowlers[p] = bowler(p)));
  s.batters[s.striker].appeared = true;
  s.batters[s.nonStriker].appeared = true;
  const target = index === 1 ? deriveInnings(m, 0).runs + 1 : null;
  for (const e of inn.events) {
    if (e.type === 'batter') {
      s[e.slot] = e.player;
      s.batters[e.player].appeared = true;
      s.needBatter = null;
      continue;
    }
    if (e.type === 'bowler') {
      s.bowler = e.player;
      s.needBowler = false;
      continue;
    }
    if (e.type === 'swap') {
      [s.striker, s.nonStriker] = [s.nonStriker, s.striker];
      continue;
    }
    if (e.type === 'end') {
      s.closed = true;
      continue;
    }
    if (e.type !== 'ball') continue;
    const b = s.batters[s.striker],
      bo = s.bowlers[s.bowler],
      legal = !['wide', 'noBall'].includes(e.extra);
    if (s.balls % 6 === 0 && s.thisOver.length && s.thisOver.at(-1).over < Math.floor(s.balls / 6))
      s.thisOver = [];
    const ex =
      e.extra === 'wide'
        ? e.runs + 1
        : e.extra === 'noBall'
          ? 1
          : e.extra === 'byes' || e.extra === 'legByes'
            ? e.runs
            : 0;
    const batRuns = ['none', 'noBall'].includes(e.extra) ? e.runs : 0;
    const total = batRuns + ex,
      charged = ['byes', 'legByes'].includes(e.extra) ? 0 : total;
    const record = {
      ...e,
      striker: s.striker,
      nonStriker: s.nonStriker,
      bowler: s.bowler,
      legal,
      batRuns,
      total,
      charged,
      over: Math.floor(s.balls / 6),
      ball: (s.balls % 6) + 1,
    };
    s.deliveries.push(record);
    s.thisOver.push(record);
    s.runs += total;
    b.runs += batRuns;
    // No-balls count as balls faced; wides do not.
    if (e.extra !== 'wide') b.balls++;
    if (e.boundary && batRuns === 4) b.fours++;
    if (e.boundary && batRuns === 6) b.sixes++;
    if (e.extra !== 'none') s.extras[e.extra] += ex;
    bo.runs += charged;
    s.overRuns += charged;
    if (!s.currentOverBowlers.includes(s.bowler)) s.currentOverBowlers.push(s.bowler);
    if (legal) {
      s.balls++;
      bo.balls++;
      s.overBowlerBalls[s.bowler] = (s.overBowlerBalls[s.bowler] || 0) + 1;
    }
    if (legal && total === 0) bo.dots++;
    if (e.wicket) {
      const p = s.batters[e.wicket.player];
      p.out = true;
      p.dismissal = { ...e.wicket, bowler: s.bowler };
      s.wickets++;
      if (bowlerCredit(e.wicket.kind)) bo.wickets++;
    }
    if (e.runs % 2 === 1) [s.striker, s.nonStriker] = [s.nonStriker, s.striker];
    if (legal && s.balls % 6 === 0) {
      [s.striker, s.nonStriker] = [s.nonStriker, s.striker];
      s.needBowler = true;
      if (s.overRuns === 0)
        Object.entries(s.overBowlerBalls).forEach(([p, n]) => {
          if (n === 6) s.bowlers[p].maidens++;
        });
      s.previousOverBowlers = s.currentOverBowlers;
      s.currentOverBowlers = [];
      s.overRuns = 0;
      s.overBowlerBalls = {};
    }
    if (e.wicket) s.needBatter = s.batters[s.striker].out ? 'striker' : 'nonStriker';
    if (s.balls >= m.overs * 6 || s.wickets >= m.playersPerSide - 1 || (target && s.runs >= target))
      s.closed = true;
  }
  s.target = target;
  s.crr = rate(s.runs, s.balls, 6);
  s.rrr = target ? rate(Math.max(0, target - s.runs), Math.max(0, m.overs * 6 - s.balls), 6) : null;
  const entries = inningsCache.get(m) || [];
  entries[index] = s;
  inningsCache.set(m, entries);
  return s;
}
function eligibleBowlers(m, s) {
  return m.teams[1 - s.batting].players.filter(
    (p) =>
      s.bowlers[p].balls < m.maxBowlerOvers * 6 &&
      (!m.enforceConsecutive || !s.previousOverBowlers.includes(p)) &&
      (s.needBowler || p !== s.bowler),
  );
}
function command(match, event) {
  const m = clone(match),
    i = m.innings.length - 1,
    s = deriveInnings(m, i),
    inn = m.innings[i];
  assert(s && !s.closed, 'This innings is closed.');
  if (event.type === 'ball') {
    assert(!s.needBatter && !s.needBowler, 'Select the next batter and bowler first.');
    assert(
      Number.isInteger(event.runs) && event.runs >= 0 && event.runs <= 20,
      'Runs must be between 0 and 20.',
    );
    assert(['none', 'wide', 'noBall', 'byes', 'legByes'].includes(event.extra), 'Invalid extra.');
    assert(s.bowlers[s.bowler].balls < m.maxBowlerOvers * 6, 'This bowler has reached the quota.');
    if (event.wicket) {
      assert(
        ['bowled', 'caught', 'lbw', 'stumped', 'hit wicket', 'run out', 'retired out'].includes(
          event.wicket.kind,
        ),
        'Choose a dismissal type.',
      );
      assert([s.striker, s.nonStriker].includes(event.wicket.player), 'Choose an active batter.');
      assert(
        event.wicket.player === s.striker || ['run out', 'retired out'].includes(event.wicket.kind),
        'Only the striker can have this dismissal.',
      );
      assert(
        event.extra !== 'noBall' || ['run out', 'retired out'].includes(event.wicket.kind),
        'Only run out or retired out is supported on a no-ball.',
      );
      assert(
        event.extra !== 'wide' ||
          ['run out', 'stumped', 'hit wicket', 'retired out'].includes(event.wicket.kind),
        'This dismissal is invalid on a wide.',
      );
      assert(
        !['caught', 'bowled', 'lbw', 'stumped', 'hit wicket'].includes(event.wicket.kind) ||
          event.runs === 0,
        'This dismissal cannot include completed runs.',
      );
      if (['caught', 'stumped', 'run out'].includes(event.wicket.kind))
        assert(
          m.teams[1 - s.batting].players.includes(event.wicket.fielder),
          'Select the fielder or wicketkeeper.',
        );
    }
    if (
      s.balls % 6 === 0 &&
      (!s.deliveries.length || s.deliveries.at(-1).over < Math.floor(s.balls / 6))
    )
      inn.undoFloor = inn.events.length;
  } else if (event.type === 'bowler')
    assert(
      eligibleBowlers(m, s).includes(event.player),
      'Bowler is ineligible: consecutive over, active bowler, or quota reached.',
    );
  else if (event.type === 'batter')
    assert(
      s.needBatter === event.slot && s.batters[event.player] && !s.batters[event.player].appeared,
      'Choose a batter who has not batted.',
    );
  else assert(['swap', 'end'].includes(event.type), 'Unknown match action.');
  inn.events.push({ ...event, id: id() });
  inningsCache.delete(m);
  return m;
}
function undo(match) {
  const m = clone(match),
    i = m.innings.length - 1,
    s = deriveInnings(m, i),
    inn = m.innings[i];
  assert(s && !s.closed, 'Cannot undo across a closed innings.');
  const last = inn.events.findLastIndex((e) => e.type === 'ball');
  assert(last >= inn.undoFloor && last >= 0, 'No delivery to undo in this over.');
  inn.events = inn.events.slice(0, last);
  inningsCache.delete(m);
  return m;
}
function status(m) {
  if (m.version !== 2) return m.status === 'done' ? 'done' : 'legacy';
  return m.innings.length === 2 && deriveInnings(m, 1).closed ? 'done' : 'live';
}
function result(m) {
  if (m.version !== 2) {
    if (m.status !== 'done') return 'Archived in-progress match';
    return m.t1score === m.t2score
      ? 'Match tied'
      : m.t1score > m.t2score
        ? `${m.team1} won by ${m.t1score - m.t2score} runs`
        : `${m.team2} won by ${Math.max(0, m.t2players.length - 1 - m.t2wickets)} wickets`;
  }
  if (status(m) !== 'done') return 'Match in progress';
  const a = deriveInnings(m, 0),
    b = deriveInnings(m, 1),
    first = m.teams[m.firstBat].name,
    second = m.teams[1 - m.firstBat].name;
  return a.runs === b.runs
    ? 'Match tied'
    : a.runs > b.runs
      ? `${first} won by ${a.runs - b.runs} runs`
      : `${second} won by ${m.playersPerSide - 1 - b.wickets} wickets`;
}
function fantasy(p, b, points = POINTS) {
  const ps = { ...POINTS, ...points };
  return (
    (p?.runs || 0) * ps.run +
    (p?.fours || 0) * ps.four_bonus +
    (p?.sixes || 0) * ps.six_bonus +
    ((p?.runs || 0) >= 100 ? ps.hundred_bonus : (p?.runs || 0) >= 50 ? ps.fifty_bonus : 0) +
    (p?.out && p.runs === 0 ? ps.duck : 0) +
    (b?.wickets || 0) * ps.wicket +
    (b?.dots || 0) * ps.dot_ball +
    ((b?.wickets || 0) >= 5
      ? ps.five_wicket_haul
      : (b?.wickets || 0) >= 4
        ? ps.four_wicket_haul
        : 0)
  );
}
function statistics(matches, registry, points = POINTS, filters = {}) {
  const out = {};
  const get = (pid) =>
    out[pid] ||
    (out[pid] = {
      id: pid,
      name: registry[pid]?.name || pid,
      teams: new Set(),
      matches: 0,
      innings: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      highest: 0,
      highestNotOut: false,
      highestBalls: 0,
      highestMatch: null,
      notOuts: 0,
      dismissals: 0,
      ducks: 0,
      centuries: 0,
      fifties: 0,
      wickets: 0,
      bowlRuns: 0,
      bowlBalls: 0,
      dots: 0,
      maidens: 0,
      fiveWickets: 0,
      catches: 0,
      points: 0,
      dismissalTypes: {},
    });
  for (const m of matches) {
    if (m.version !== 2 || status(m) !== 'done') continue;
    const day = m.date.slice(0, 10);
    if (
      (filters.from && day < filters.from) ||
      (filters.to && day > filters.to) ||
      (filters.format && m.format !== filters.format) ||
      (filters.team && !m.teams.some((t) => t.name === filters.team))
    )
      continue;
    m.teams.forEach((t) =>
      t.players.forEach((p) => {
        get(p).matches++;
        get(p).teams.add(t.name);
      }),
    );
    m.innings.forEach((_, i) => {
      const s = deriveInnings(m, i);
      Object.values(s.batters).forEach((p) => {
        const a = get(p.id);
        if (!p.appeared) return;
        a.innings++;
        a.runs += p.runs;
        a.balls += p.balls;
        a.fours += p.fours;
        a.sixes += p.sixes;
        a.notOuts += !p.out ? 1 : 0;
        a.dismissals += p.out ? 1 : 0;
        a.ducks += p.out && p.runs === 0 ? 1 : 0;
        a.centuries += p.runs >= 100 ? 1 : 0;
        a.fifties += p.runs >= 50 && p.runs < 100 ? 1 : 0;
        if (!a.highestMatch || p.runs > a.highest || (p.runs === a.highest && !p.out)) {
          a.highest = p.runs;
          a.highestNotOut = !p.out;
          a.highestBalls = p.balls;
          a.highestMatch = m.id;
        }
        if (p.out)
          a.dismissalTypes[p.dismissal.kind] = (a.dismissalTypes[p.dismissal.kind] || 0) + 1;
        a.points += fantasy(p, null, points);
      });
      Object.values(s.bowlers).forEach((b) => {
        const a = get(b.id);
        a.wickets += b.wickets;
        a.bowlBalls += b.balls;
        a.bowlRuns += b.runs;
        a.dots += b.dots;
        a.maidens += b.maidens;
        a.fiveWickets += b.wickets >= 5 ? 1 : 0;
        a.points += fantasy(null, b, points);
      });
      s.deliveries.forEach((d) => {
        if (d.wicket?.kind === 'caught') {
          const p = get(d.wicket.fielder);
          p.catches++;
          p.points += points.catch ?? POINTS.catch;
        }
      });
    });
  }
  return Object.values(out).map((p) => ({
    ...p,
    teams: [...p.teams].join(', '),
    average: rate(p.runs, p.dismissals),
    strikeRate: rate(p.runs, p.balls, 100),
    economy: rate(p.bowlRuns, p.bowlBalls, 6),
    points: Math.round(p.points * 100) / 100,
    pointsPerMatch: rate(p.points, p.matches),
  }));
}
function headToHead(matches, a, b) {
  const out = {
    deliveries: 0,
    balls: 0,
    ballsFaced: 0,
    runs: 0,
    conceded: 0,
    dots: 0,
    fours: 0,
    sixes: 0,
    dismissals: 0,
  };
  matches
    .filter((m) => m.version === 2)
    .forEach((m) =>
      m.innings.forEach((_, i) =>
        deriveInnings(m, i)
          .deliveries.filter((d) => d.striker === a && d.bowler === b)
          .forEach((d) => {
            out.deliveries++;
            out.balls += d.legal ? 1 : 0;
            out.ballsFaced += d.extra !== 'wide' ? 1 : 0;
            out.runs += d.batRuns;
            out.conceded += d.charged;
            out.dots += d.legal && d.total === 0 ? 1 : 0;
            out.fours += d.boundary && d.batRuns === 4 ? 1 : 0;
            out.sixes += d.boundary && d.batRuns === 6 ? 1 : 0;
            out.dismissals += d.wicket?.player === a && bowlerCredit(d.wicket.kind) ? 1 : 0;
          }),
      ),
    );
  return {
    ...out,
    strikeRate: rate(out.runs, out.ballsFaced, 100),
    economy: rate(out.conceded, out.balls, 6),
  };
}
function compare(a, b, settings = SETTINGS) {
  if (!a || !b || a.id === b.id) return 'Select two different players.';
  const min = Math.max(1, settings.minInnings),
    balls = Math.max(1, settings.minBalls);
  if (a.innings < min || b.innings < min || a.balls < balls || b.balls < balls)
    return `Insufficient data: both players need ${min} innings and ${balls} balls faced.`;
  let scoreA = 0,
    scoreB = 0;
  const used = [];
  const add = (label, x, y, w, lower = false) => {
    if (x == null || y == null || !w) return;
    const sum = Math.abs(x) + Math.abs(y);
    if (!sum) return;
    scoreA += (w * (lower ? y : x)) / sum;
    scoreB += (w * (lower ? x : y)) / sum;
    used.push(label);
  };
  add('average', a.average, b.average, settings.batWeight);
  add('strike rate', a.strikeRate, b.strikeRate, settings.strikeWeight);
  if (a.bowlBalls >= settings.minOvers * 6 && b.bowlBalls >= settings.minOvers * 6) {
    add('wickets per match', a.wickets / a.matches, b.wickets / b.matches, settings.bowlWeight / 2);
    add('economy', a.economy, b.economy, settings.bowlWeight / 2, true);
  }
  if (!used.length) return 'Insufficient comparable data for a verdict.';
  return Math.abs(scoreA - scoreB) < 0.01
    ? `Evenly matched on ${used.join(', ')}.`
    : `${scoreA > scoreB ? a.name : b.name} rates higher on the configured comparison of ${used.join(', ')}. This is a statistical assessment, not a prediction.`;
}
function sorted(rows, key, ascending = false) {
  return [...rows].sort((a, b) =>
    a[key] == null
      ? b[key] == null
        ? a.name.localeCompare(b.name)
        : 1
      : b[key] == null
        ? -1
        : (typeof a[key] === 'string' ? a[key].localeCompare(b[key]) : a[key] - b[key]) *
            (ascending ? 1 : -1) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
  );
}
module.exports = {
  POINTS,
  SETTINGS,
  clone,
  id,
  overs,
  rate,
  fmt,
  createMatch,
  startInnings,
  deriveInnings,
  eligibleBowlers,
  command,
  undo,
  status,
  result,
  statistics,
  headToHead,
  compare,
  sorted,
  fantasy,
};
