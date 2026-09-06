import React from 'react';
import { Text, View } from 'react-native';
import rules from './domain';
import { Page, Card, Button, Table, PlayerName, styles } from './ui';

export default function Scorecard({ match: m, data, go, back }) {
  if (!m)
    return (
      <Page title="Scorecard" onBack={back}>
        <Text>Match not found.</Text>
      </Page>
    );
  if (m.version !== 2)
    return (
      <Page title="Archived scorecard" onBack={back}>
        <Card title={rules.result(m)}>
          <Text style={styles.muted}>
            Imported from the original app. No ball-by-ball or extras breakdown was saved. These
            snapshots are preserved as recorded and excluded from new analytics.
          </Text>
        </Card>
        {[1, 2].map((i) => (
          <Card key={i} title={`${m[`team${i}`]} · ${m[`t${i}score`]}/${m[`t${i}wickets`]}`}>
            <Text>
              {rules.overs(m[`t${i}balls`] || 0)} / {m.overs} overs
            </Text>
            <Table
              columns={[
                { key: 'name', label: 'BATTER', width: 170 },
                { key: 'runs', label: 'R' },
                { key: 'balls', label: 'B' },
                { key: 'out', label: 'STATUS', width: 110 },
              ]}
              rows={(m[`t${i}players`] || []).map((p, j) => ({
                ...p,
                id: j,
                out: p.out ? 'Out' : 'Not out',
              }))}
            />
            <Table
              columns={[
                { key: 'name', label: 'BOWLER', width: 170 },
                { key: 'overs', label: 'OVERS' },
                { key: 'runs', label: 'R' },
                { key: 'wickets', label: 'W' },
              ]}
              rows={(m[`t${i}bowlers`] || []).map((p, j) => ({
                ...p,
                id: j,
                overs: rules.overs(p.balls),
              }))}
            />
          </Card>
        ))}
      </Page>
    );
  const name = (id) => data.players[id]?.name || 'Unknown';
  const dismissal = (p) => {
    if (!p.appeared) return 'Did not bat';
    if (!p.out) return 'Not out';
    const d = p.dismissal;
    return d.kind === 'caught'
      ? `c ${name(d.fielder)} b ${name(d.bowler)}`
      : d.kind === 'stumped'
        ? `st ${name(d.fielder)} b ${name(d.bowler)}`
        : d.kind === 'run out'
          ? `run out (${name(d.fielder)})`
          : d.kind === 'retired out'
            ? 'retired out'
            : `${d.kind} b ${name(d.bowler)}`;
  };
  const mom =
    rules.status(m) === 'done'
      ? rules.sorted(rules.statistics([m], data.players, data.points), 'points')[0]
      : null;
  return (
    <Page
      title="Full scorecard"
      subtitle={`${m.teams[0].name} vs ${m.teams[1].name}`}
      onBack={back}
    >
      <Card title={rules.result(m)}>
        <Text style={styles.muted}>
          {m.format} · {m.overs} overs · {m.venue || 'Venue not specified'} ·{' '}
          {new Date(m.date).toLocaleDateString()}
        </Text>
        <Text style={styles.muted}>
          Toss: {m.teams[m.tossWinner].name} chose to {m.tossDecision}.
        </Text>
        {mom && (
          <Text style={styles.title}>
            Player of the match · {mom.name} ({mom.points} points)
          </Text>
        )}
        {rules.status(m) === 'live' && (
          <Button onPress={() => go('live', { matchId: m.id })}>Continue scoring</Button>
        )}
      </Card>
      {m.innings.map((_, i) => {
        const s = rules.deriveInnings(m, i);
        return (
          <Card key={i} title={`Innings ${i + 1} · ${m.teams[s.batting].name}`}>
            <View style={styles.row}>
              <Text style={styles.metric}>
                {s.runs}/{s.wickets}
              </Text>
              <Text style={styles.muted}>
                {rules.overs(s.balls)} / {m.overs} overs · RR {rules.fmt(s.crr)}
                {s.target ? ` · Target ${s.target} · RRR ${rules.fmt(s.rrr)}` : ''}
              </Text>
            </View>
            <Table
              columns={[
                { key: 'name', label: 'BATTER', width: 185 },
                { key: 'dismissal', label: 'DISMISSAL', width: 220 },
                { key: 'runs', label: 'R', width: 50 },
                { key: 'balls', label: 'B', width: 50 },
                { key: 'fours', label: '4s', width: 50 },
                { key: 'sixes', label: '6s', width: 50 },
                { key: 'sr', label: 'SR', width: 75 },
              ]}
              rows={Object.values(s.batters).map((p) => ({
                ...p,
                name: (
                  <PlayerName
                    player={data.players[p.id]}
                    onPress={() => go('profile', { playerId: p.id })}
                  />
                ),
                dismissal: dismissal(p),
                sr: rules.fmt(rules.rate(p.runs, p.balls, 100)),
              }))}
            />
            <Text style={styles.muted}>
              Extras {Object.values(s.extras).reduce((a, b) => a + b, 0)} · wides {s.extras.wide},
              no-balls {s.extras.noBall}, byes {s.extras.byes}, leg-byes {s.extras.legByes}
            </Text>
            <Table
              columns={[
                { key: 'name', label: 'BOWLER', width: 185 },
                { key: 'overs', label: 'O', width: 65 },
                { key: 'maidens', label: 'M', width: 50 },
                { key: 'runs', label: 'R', width: 50 },
                { key: 'wickets', label: 'W', width: 50 },
                { key: 'er', label: 'ER', width: 75 },
              ]}
              rows={Object.values(s.bowlers)
                .filter((b) => s.deliveries.some((d) => d.bowler === b.id))
                .map((b) => ({
                  ...b,
                  name: (
                    <PlayerName
                      player={data.players[b.id]}
                      onPress={() => go('profile', { playerId: b.id })}
                    />
                  ),
                  overs: rules.overs(b.balls),
                  er: rules.fmt(rules.rate(b.runs, b.balls, 6)),
                }))}
            />
            <Text style={styles.label}>{s.closed ? 'INNINGS CLOSED' : 'IN PROGRESS'}</Text>
          </Card>
        );
      })}
      {!m.innings.length && (
        <Card>
          <Text style={styles.muted}>Opening players have not been selected yet.</Text>
        </Card>
      )}
    </Page>
  );
}
