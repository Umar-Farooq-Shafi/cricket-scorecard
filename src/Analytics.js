import React, { useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import rules from './domain';
import { Page, Card, Chips, Button, Field, Table, Avatar, PlayerName, styles, notify } from './ui';

const metrics = [
  ['matches', 'Matches'],
  ['innings', 'Batting innings'],
  ['runs', 'Runs'],
  ['highest', 'Highest score'],
  ['average', 'Batting average'],
  ['notOuts', 'Not outs'],
  ['strikeRate', 'Strike rate'],
  ['balls', 'Balls faced'],
  ['fours', 'Fours'],
  ['sixes', 'Sixes'],
  ['ducks', 'Ducks'],
  ['centuries', 'Centuries'],
  ['fifties', 'Half-centuries'],
  ['dismissals', 'Dismissals'],
  ['wickets', 'Wickets'],
  ['bowlBalls', 'Overs bowled'],
  ['bowlRuns', 'Runs conceded'],
  ['economy', 'Bowling economy'],
  ['maidens', 'Maidens'],
  ['dots', 'Dot balls'],
  ['fiveWickets', 'Five-wicket hauls'],
  ['catches', 'Catches'],
  ['battingPoints', 'Batting fantasy points'],
  ['bowlingPoints', 'Bowling fantasy points'],
  ['points', 'Fantasy points'],
  ['pointsPerMatch', 'Points / match'],
];
const display = (p, key) =>
  !p
    ? '—'
    : key === 'highest'
      ? `${p.highest}${p.highestNotOut ? '*' : ''}`
      : key === 'bowlBalls'
        ? rules.overs(p.bowlBalls)
        : ['average', 'strikeRate', 'economy', 'pointsPerMatch'].includes(key)
          ? rules.fmt(p[key])
          : p[key];
function Board({ title, rows, metric, label, data, ascending = false, extraColumns = [], go }) {
  const [sort, setSort] = useState(metric),
    [asc, setAsc] = useState(ascending),
    [page, setPage] = useState(0);
  const ordered = rules.sorted(rows, sort, asc);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(ordered.length / 50) - 1));
  return (
    <Card title={title}>
      <Table
        columns={[
          { key: 'rank', label: '#', width: 42 },
          { key: 'name', label: 'PLAYER', width: 200 },
          { key: 'teams', label: 'TEAM', width: 130 },
          { key: metric, label, width: 110 },
          ...extraColumns,
        ]}
        sortKey={sort}
        ascending={asc}
        onSort={(key) => {
          setPage(0);
          if (key === 'rank') return;
          if (sort === key) setAsc((x) => !x);
          else {
            setSort(key);
            setAsc(key === 'economy' || key === 'name');
          }
        }}
        rows={ordered.slice(currentPage * 50, (currentPage + 1) * 50).map((p, i) => ({
          ...p,
          rank: currentPage * 50 + i + 1,
          name: (
            <PlayerName
              player={data.players[p.id]}
              onPress={() => go('profile', { playerId: p.id })}
            />
          ),
          [metric]: display(p, metric),
          ...Object.fromEntries(
            extraColumns.map((c) => [
              c.key,
              c.key === 'highestMatch' ? (
                <Button secondary onPress={() => go('summary', { matchId: p.highestMatch })}>
                  Scorecard
                </Button>
              ) : (
                display(p, c.key)
              ),
            ]),
          ),
        }))}
      />
      {ordered.length > 50 && (
        <View style={styles.row}>
          <Button secondary disabled={currentPage === 0} onPress={() => setPage(currentPage - 1)}>
            Previous
          </Button>
          <Text style={styles.muted}>
            Page {currentPage + 1} / {Math.ceil(ordered.length / 50)}
          </Text>
          <Button
            secondary
            disabled={(currentPage + 1) * 50 >= ordered.length}
            onPress={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </View>
      )}
    </Card>
  );
}
export default function Analytics({ mode, data, commit, go, back, playerId, busy }) {
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [team, setTeam] = useState(''),
    [format, setFormat] = useState(''),
    [search, setSearch] = useState('');
  const rows = useMemo(
    () => rules.statistics(data.matches, data.players, data.points, { from, to, team, format }),
    [data.matches, data.players, data.points, from, to, team, format],
  );
  const players = Object.values(data.players).sort((a, b) => a.name.localeCompare(b.name));
  const [a, setA] = useState(playerId || players[0]?.id),
    [b, setB] = useState(players.find((p) => p.id !== (playerId || players[0]?.id))?.id);
  const pa = rows.find((p) => p.id === a),
    pb = rows.find((p) => p.id === b),
    titles = {
      stats: 'Statistics',
      rankings: 'Rankings',
      profile: 'Player profile',
      compare: 'Compare players',
      headtohead: 'Head to head',
    };
  const pick = (title, value, fn, exclude) => (
    <Chips
      label={title}
      options={players
        .filter((p) => p.id !== exclude && p.name.toLowerCase().includes(search.toLowerCase()))
        .map((p) => ({ value: p.id, label: `${p.name}${p.guest ? ' · guest' : ''}` }))}
      value={value}
      onChange={fn}
    />
  );
  const updatePhoto = async (camera) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return notify('Camera permission required');
      }
      const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 };
      const picked = await (camera
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (asset.type && asset.type !== 'image') throw Error('Please choose an image.');
      if (asset.mimeType && !asset.mimeType.startsWith('image/'))
        throw Error('Unsupported file type.');
      if (asset.fileSize > 10 * 1024 * 1024) throw Error('Choose an image smaller than 10 MB.');
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width: Math.min(320, asset.width || 320) });
      const image = await context.renderAsync();
      const result = await image.saveAsync({
        compress: 0.7,
        format: SaveFormat.JPEG,
        base64: true,
      });
      if (!result.base64 || result.base64.length > 500000)
        throw Error('The compressed photo is too large. Try a smaller image.');
      await commit((d) => ({
        ...d,
        players: {
          ...d.players,
          [a]: { ...d.players[a], photo: `data:image/jpeg;base64,${result.base64}` },
        },
      }));
    } catch (e) {
      notify('Photo could not be saved', e.message);
    }
  };
  const config = data.settings;
  const h2h = mode === 'headtohead' ? rules.headToHead(data.matches, a, b) : null;
  return (
    <Page title={titles[mode]} subtitle="Every figure comes from recorded deliveries" onBack={back}>
      {['stats', 'rankings'].includes(mode) ? (
        <>
          <Card title="Filter records">
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label="From date · YYYY-MM-DD"
                  placeholder="2026-01-01"
                  value={from}
                  onChangeText={setFrom}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="To date · YYYY-MM-DD"
                  placeholder="2026-12-31"
                  value={to}
                  onChangeText={setTo}
                />
              </View>
            </View>
            {((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
              (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
              (from && to && from > to)) && (
              <Text style={styles.error}>Use valid YYYY-MM-DD dates, with From before To.</Text>
            )}
            <Chips
              label="FORMAT"
              options={[{ value: '', label: 'All' }, 'T10', 'T20', 'ODI', 'Custom']}
              value={format}
              onChange={setFormat}
            />
            <Chips
              label="MATCHES INVOLVING TEAM"
              options={[
                { value: '', label: 'All teams' },
                ...[
                  ...new Set(
                    data.matches
                      .filter((m) => m.version === 2)
                      .flatMap((m) => m.teams.map((t) => t.name)),
                  ),
                ],
              ]}
              value={team}
              onChange={setTeam}
            />
            <Text style={styles.muted}>
              Completed matches only. Qualifiers: {config.minBalls} balls for strike rate,{' '}
              {config.minOvers} overs for economy, {config.minInnings} innings for average. Ties
              sort by name, then player ID.
            </Text>
          </Card>
          {mode === 'stats' ? (
            [
              [
                'Highest score',
                'highest',
                'RUNS',
                false,
                rows,
                [
                  { key: 'highestBalls', label: 'BALLS', width: 70 },
                  { key: 'highestMatch', label: 'MATCH', width: 125 },
                ],
              ],
              [
                'Strike rate',
                'strikeRate',
                'SR',
                false,
                rows.filter((p) => p.balls >= config.minBalls && p.balls > 0),
              ],
              [
                'Batting average',
                'average',
                'AVERAGE',
                false,
                rows.filter((p) => p.innings >= config.minInnings && p.average != null),
              ],
              ['Most sixes', 'sixes', 'SIXES', false, rows],
              ['Most ducks', 'ducks', 'DUCKS', false, rows],
              ['Centuries', 'centuries', '100s', false, rows],
              ['Half-centuries', 'fifties', '50s', false, rows],
              [
                'Best economy',
                'economy',
                'ER',
                true,
                rows.filter((p) => p.bowlBalls >= config.minOvers * 6 && p.bowlBalls > 0),
              ],
              ['Five-wicket hauls', 'fiveWickets', '5W', false, rows],
            ].map(([title, metric, label, ascending, records, extraColumns]) => (
              <Board
                key={metric}
                {...{ title, metric, label, ascending, data, go, extraColumns }}
                rows={records}
              />
            ))
          ) : (
            <>
              <Text style={styles.muted}>
                Batting and bowling rankings use their own fantasy points. Overall fantasy points
                include batting, bowling and catches.
              </Text>
              <Board
                title="Batting rankings"
                rows={rows}
                metric="battingPoints"
                label="BAT PTS"
                data={data}
                go={go}
                extraColumns={[
                  { key: 'runs', label: 'RUNS' },
                  { key: 'average', label: 'AVG' },
                  { key: 'strikeRate', label: 'SR' },
                ]}
              />
              <Board
                title="Bowling rankings"
                rows={rows}
                metric="bowlingPoints"
                label="BOWL PTS"
                data={data}
                go={go}
                extraColumns={[
                  { key: 'wickets', label: 'WICKETS' },
                  { key: 'economy', label: 'ER' },
                  { key: 'fiveWickets', label: '5W' },
                ]}
              />
              <Board
                title="Fantasy rankings"
                rows={rows}
                metric="points"
                label="POINTS"
                data={data}
                go={go}
                extraColumns={[
                  { key: 'matches', label: 'MATCHES' },
                  { key: 'pointsPerMatch', label: 'PTS / MATCH', width: 115 },
                ]}
              />
            </>
          )}
        </>
      ) : (
        <>
          <Card title="Choose players">
            <Field
              label="Search registered and guest players"
              value={search}
              onChangeText={setSearch}
            />
            {pick(
              mode === 'headtohead' ? 'BATTER' : 'PLAYER A',
              a,
              setA,
              mode === 'profile' ? null : b,
            )}
            {mode !== 'profile' && pick(mode === 'headtohead' ? 'BOWLER' : 'PLAYER B', b, setB, a)}
            {!players.length && (
              <Text style={styles.muted}>Add players in Teams & players or create a match.</Text>
            )}
          </Card>
          {mode === 'profile' && data.players[a] && (
            <>
              <Card>
                <View style={styles.row}>
                  <Avatar player={data.players[a]} size={76} />
                  <View>
                    <Text style={styles.heading}>{data.players[a].name}</Text>
                    <Text style={styles.muted}>
                      {data.players[a].guest ? 'Guest player' : 'Registered player'} ·{' '}
                      {pa?.teams || 'No completed matches'}
                    </Text>
                  </View>
                </View>
                <View style={styles.row}>
                  <Button secondary disabled={busy} onPress={() => updatePhoto(false)}>
                    Update photo
                  </Button>
                  {Platform.OS !== 'web' && (
                    <Button secondary disabled={busy} onPress={() => updatePhoto(true)}>
                      Camera
                    </Button>
                  )}
                  {data.players[a].photo && (
                    <Button
                      secondary
                      disabled={busy}
                      onPress={() =>
                        commit((d) => ({
                          ...d,
                          players: { ...d.players, [a]: { ...d.players[a], photo: null } },
                        }))
                      }
                    >
                      Remove photo
                    </Button>
                  )}
                  {data.players[a].guest && (
                    <Button
                      disabled={busy}
                      onPress={() =>
                        commit((d) => ({
                          ...d,
                          players: { ...d.players, [a]: { ...d.players[a], guest: false } },
                        }))
                      }
                    >
                      Register · keep all statistics
                    </Button>
                  )}
                </View>
              </Card>
              <Card title="Career figures">
                <Table
                  columns={[
                    { key: 'label', label: 'METRIC', width: 190 },
                    { key: 'value', label: 'VALUE', width: 120 },
                  ]}
                  rows={metrics.map(([key, label]) => ({
                    id: key,
                    label,
                    value: display(pa, key),
                  }))}
                />
                <Text style={styles.muted}>
                  — means no qualifying data. A player with no dismissals has no defined batting
                  average.
                </Text>
              </Card>
              <Card title="Dismissal breakdown">
                {pa && Object.entries(pa.dismissalTypes).length ? (
                  Object.entries(pa.dismissalTypes).map(([type, n]) => (
                    <Text key={type} style={styles.muted}>
                      {type}: {n}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.muted}>No recorded dismissals.</Text>
                )}
              </Card>
            </>
          )}
          {mode === 'compare' && (
            <>
              <Card title="Performance assessment">
                <Text style={styles.muted}>{rules.compare(pa, pb, config)}</Text>
                <Text style={styles.muted}>
                  Weights: average {config.batWeight}, strike rate {config.strikeWeight}, bowling{' '}
                  {config.bowlWeight}. Each available metric uses the player’s share of the pair’s
                  total; lower economy is favored. Bowling needs both players to qualify.
                </Text>
              </Card>
              <Card>
                <Table
                  columns={[
                    { key: 'metric', label: 'METRIC', width: 180 },
                    { key: 'a', label: data.players[a]?.name || 'Player A', width: 125 },
                    { key: 'b', label: data.players[b]?.name || 'Player B', width: 125 },
                  ]}
                  rows={metrics.map(([key, label]) => {
                    const lower = ['economy', 'ducks'].includes(key),
                      comparable =
                        pa?.[key] != null &&
                        pb?.[key] != null &&
                        ![
                          'matches',
                          'innings',
                          'balls',
                          'bowlBalls',
                          'dismissals',
                          'bowlRuns',
                          'notOuts',
                        ].includes(key);
                    return {
                      id: key,
                      metric: label,
                      a: (
                        <Text
                          style={{
                            color:
                              comparable && (lower ? pa[key] < pb[key] : pa[key] > pb[key])
                                ? '#246B38'
                                : '#172D31',
                            fontWeight: '700',
                          }}
                        >
                          {display(pa, key)}
                        </Text>
                      ),
                      b: (
                        <Text
                          style={{
                            color:
                              comparable && (lower ? pb[key] < pa[key] : pb[key] > pa[key])
                                ? '#246B38'
                                : '#172D31',
                            fontWeight: '700',
                          }}
                        >
                          {display(pb, key)}
                        </Text>
                      ),
                    };
                  })}
                />
                <Text style={styles.muted}>
                  Green highlights a favorable value. Sample sizes remain visible.
                </Text>
              </Card>
              <Card title="Dismissal types">
                <Table
                  columns={[
                    { key: 'kind', label: 'TYPE', width: 170 },
                    { key: 'a', label: data.players[a]?.name || 'A', width: 100 },
                    { key: 'b', label: data.players[b]?.name || 'B', width: 100 },
                  ]}
                  rows={[
                    ...new Set([
                      ...Object.keys(pa?.dismissalTypes || {}),
                      ...Object.keys(pb?.dismissalTypes || {}),
                    ]),
                  ].map((kind) => ({
                    id: kind,
                    kind,
                    a: pa?.dismissalTypes[kind] || 0,
                    b: pb?.dismissalTypes[kind] || 0,
                  }))}
                />
              </Card>
            </>
          )}
          {mode === 'headtohead' && (
            <Card
              title={`${data.players[a]?.name || 'Batter'} batting vs ${data.players[b]?.name || 'Bowler'} bowling`}
            >
              <Text style={styles.muted}>
                {h2h.deliveries
                  ? 'Only their direct deliveries, including live matches.'
                  : 'No direct deliveries recorded for this matchup.'}{' '}
                Dismissals count wickets credited to this bowler; run outs are excluded.
              </Text>
              <Table
                columns={[
                  { key: 'metric', label: 'METRIC', width: 200 },
                  { key: 'value', label: 'VALUE', width: 100 },
                ]}
                rows={Object.entries({
                  deliveries: 'All deliveries',
                  balls: 'Legal balls',
                  ballsFaced: 'Balls faced',
                  runs: 'Batter runs',
                  conceded: 'Bowler runs conceded',
                  dots: 'Dot balls',
                  fours: 'Fours',
                  sixes: 'Sixes',
                  dismissals: 'Dismissals',
                  strikeRate: 'Strike rate',
                  economy: 'Economy',
                }).map(([key, metric]) => ({
                  id: key,
                  metric,
                  value: ['strikeRate', 'economy'].includes(key) ? rules.fmt(h2h[key]) : h2h[key],
                }))}
              />
              <Button
                secondary
                onPress={() => {
                  setA(b);
                  setB(a);
                }}
              >
                Reverse matchup
              </Button>
            </Card>
          )}
        </>
      )}
      {data.matches.some((m) => m.version !== 2) && (
        <Text style={styles.muted}>
          Older app snapshots remain in Match history. They are excluded from these analytics
          because they have no delivery log.
        </Text>
      )}
    </Page>
  );
}
