const rules = require('./domain');
const ROOT = 'cricket_v2_index',
  JOURNAL = 'cricket_v2_pending';
const matchKey = (id) => `cricket_v2_match_${id}`;
const emptyState = () => ({
  players: {},
  teams: [],
  matches: [],
  settings: { ...rules.SETTINGS },
  points: { ...rules.POINTS },
  draft: null,
});

function createRepository(kv, legacy) {
  async function recover() {
    const raw = await kv.getItem(JOURNAL);
    if (raw) {
      await kv.multiSet(JSON.parse(raw));
      await kv.removeItem(JOURNAL);
    }
  }
  async function persistState(next, previous) {
    const { matches, ...meta } = next;
    const previousRefs = new Set(previous.matches),
      nextIds = new Set(matches.map((m) => m.id));
    const entries = matches
      .filter((m) => !previousRefs.has(m))
      .map((m) => [matchKey(m.id), JSON.stringify(m)]);
    const idsChanged =
      matches.length !== previous.matches.length ||
      matches.some((m, i) => m.id !== previous.matches[i]?.id);
    const metaChanged = Object.keys(meta).some(
      (key) => key !== 'matchIds' && meta[key] !== previous[key],
    );
    if (idsChanged || metaChanged || !(await kv.getItem(ROOT)))
      entries.push([ROOT, JSON.stringify({ ...meta, matchIds: matches.map((m) => m.id) })]);
    if (!entries.length) return;
    // Write-ahead journal makes the match + index recoverable after interrupted saves.
    await kv.setItem(JOURNAL, JSON.stringify(entries));
    await kv.multiSet(entries);
    await kv.removeItem(JOURNAL);
    for (const old of previous.matches)
      if (!nextIds.has(old.id)) await kv.removeItem(matchKey(old.id));
  }
  async function loadState() {
    await recover();
    const raw = await kv.getItem(ROOT);
    if (raw) {
      const root = JSON.parse(raw),
        entries = root.matchIds.length ? await kv.multiGet(root.matchIds.map(matchKey)) : [];
      return {
        ...emptyState(),
        ...root,
        matches: entries.map(([key, value]) => {
          if (!value) throw Error(`Saved match is missing: ${key}`);
          return JSON.parse(value);
        }),
      };
    }
    const old = await legacy.getItem('cricket_scorecard_v1');
    if (!old) return emptyState();
    const data = JSON.parse(old),
      matches = [...(data.matches || [])];
    if (data.currentMatch && !matches.some((m) => m.id === data.currentMatch.id))
      matches.push(data.currentMatch);
    const migrated = {
      ...emptyState(),
      matches,
      points: { ...rules.POINTS, ...data.pointsSystem },
      legacyImported: matches.length > 0,
    };
    await persistState(migrated, emptyState());
    return migrated;
  }
  return { loadState, persistState };
}
module.exports = { createRepository, emptyState };
