import React, { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import rules from './domain';
import { Page, Card, Button, Chips, Field, Avatar, styles, colors, notify, confirm } from './ui';

export default function Live({ match: m, data, commit, go, back, busy }) {
  const [extra, setExtra] = useState('none'),
    [dialog, setDialog] = useState(null),
    [kind, setKind] = useState('bowled'),
    [outId, setOutId] = useState(null),
    [fielder, setFielder] = useState(null),
    [wRuns, setWRuns] = useState('0'),
    [guest, setGuest] = useState('');
  const [opener, setOpener] = useState(null),
    [partner, setPartner] = useState(null),
    [firstBowler, setFirstBowler] = useState(null);
  const i = m.innings.length - 1,
    s = rules.deriveInnings(m, i),
    name = (p) => data.players[p]?.name || 'Unknown';
  const update = async (fn) => {
    try {
      const updated = fn(m);
      return await commit((d) => ({
        ...d,
        matches: d.matches.map((x) => (x.id === m.id ? updated : x)),
      }));
    } catch (e) {
      notify('Cannot score this action', e.message);
      return false;
    }
  };
  const act = (event) => update((m) => rules.command(m, event));
  const choices = (ids) => ids.map((p) => ({ value: p, label: name(p) }));
  if (!s || s.closed) {
    const done = rules.status(m) === 'done',
      team = m.innings.length === 0 ? m.firstBat : 1 - m.firstBat;
    if (done)
      return (
        <Page title="Match complete" onBack={back}>
          <Card title={rules.result(m)}>
            <Button onPress={() => go('summary', { matchId: m.id })}>Open full scorecard</Button>
          </Card>
        </Page>
      );
    return (
      <Page title={s ? 'Start the chase' : 'Opening setup'} onBack={back}>
        <Card title={`${m.teams[team].name} bats ${s ? 'next' : 'first'}`}>
          {s && <Text style={styles.metric}>Target {s.runs + 1}</Text>}
          <Chips
            label="STRIKER"
            options={choices(m.teams[team].players)}
            value={opener}
            onChange={setOpener}
          />
          <Chips
            label="NON-STRIKER"
            options={choices(m.teams[team].players.filter((p) => p !== opener))}
            value={partner}
            onChange={setPartner}
          />
          <Chips
            label="OPENING BOWLER"
            options={choices(m.teams[1 - team].players)}
            value={firstBowler}
            onChange={setFirstBowler}
          />
          <Button
            disabled={busy || !opener || !partner || !firstBowler || opener === partner}
            onPress={async () => {
              if (await update((m) => rules.startInnings(m, opener, partner, firstBowler))) {
                setOpener(null);
                setPartner(null);
                setFirstBowler(null);
              }
            }}
          >
            Start innings
          </Button>
          <Text style={styles.muted}>Setup is saved. You can return Home safely.</Text>
        </Card>
        {!m.innings.length && (
          <Button
            secondary
            onPress={() =>
              confirm(
                'Revise match setup?',
                'This unstarted match will return to the setup form.',
                async () => {
                  const draft = {
                    names: m.teams.map((t) => t.name),
                    teamIds: m.teams.map((t) =>
                      data.teams.some((x) => x.id === t.id) ? t.id : null,
                    ),
                    rosters: m.teams.map((t) => t.players.map((id) => ({ id, name: name(id) }))),
                    overs: m.overs,
                    format: m.format,
                    playersPerSide: m.playersPerSide,
                    venue: m.venue,
                    tossWinner: m.tossWinner,
                    tossDecision: m.tossDecision,
                    maxBowlerOvers: m.maxBowlerOvers,
                    enforceConsecutive: m.enforceConsecutive,
                  };
                  if (
                    await commit((d) => ({
                      ...d,
                      matches: d.matches.filter((x) => x.id !== m.id),
                      draft,
                    }))
                  )
                    go('setup');
                },
              )
            }
          >
            Edit teams and playing side
          </Button>
        )}
      </Page>
    );
  }
  const record = async (runs, wicket = null) => {
    if (
      await act({
        type: 'ball',
        runs,
        extra,
        wicket,
        boundary: !wicket && [4, 6].includes(runs) && ['none', 'noBall'].includes(extra),
      })
    ) {
      setExtra('none');
      setDialog(null);
    }
  };
  const ready = !busy && !s.needBatter && !s.needBowler;
  const bowlChoices = rules.eligibleBowlers(m, s);
  const addGuest = async (teamIndex = 1 - s.batting) => {
    if (!guest.trim()) return notify('Enter a player name');
    if (
      m.teams[teamIndex].players.some((id) => name(id).toLowerCase() === guest.trim().toLowerCase())
    )
      return notify('That name already exists in this side');
    const id = rules.id(),
      updated = rules.clone(m);
    updated.teams[teamIndex].players.push(id);
    if (
      await commit((d) => ({
        ...d,
        players: {
          ...d.players,
          [id]: { id, name: guest.trim(), guest: true, teamId: m.teams[teamIndex].id },
        },
        matches: d.matches.map((x) => (x.id === m.id ? updated : x)),
      }))
    )
      setGuest('');
  };
  const bowlerPanel = (
    <>
      <Text style={styles.muted}>
        Quota: {m.maxBowlerOvers} overs per bowler.{' '}
        {m.enforceConsecutive
          ? 'A bowler from the previous over cannot bowl this over.'
          : 'Consecutive overs allowed.'}
      </Text>
      {bowlChoices.map((p) => (
        <Button
          key={p}
          disabled={busy}
          secondary
          onPress={async () => {
            if (await act({ type: 'bowler', player: p })) setDialog(null);
          }}
        >
          {name(p)} · {rules.overs(s.bowlers[p].balls)} overs
        </Button>
      ))}
      {!bowlChoices.length && (
        <Text style={styles.error}>
          No eligible bowler. Add an injury substitute or end the innings.
        </Text>
      )}
      <Field label="Add guest / injury substitute bowler" value={guest} onChangeText={setGuest} />
      <Button disabled={busy || !guest.trim()} secondary onPress={() => addGuest()}>
        Add player with separate figures
      </Button>
    </>
  );
  return (
    <Page
      compact
      title={`Live · innings ${i + 1}`}
      subtitle={`${m.teams[0].name} vs ${m.teams[1].name}`}
      onBack={back}
    >
      <Card style={{ backgroundColor: colors.teal, borderColor: colors.teal, padding: 14, gap: 3 }}>
        <Text style={[styles.label, { color: '#CCE2CD' }]}>
          {m.teams[s.batting].name.toUpperCase()}
        </Text>
        <Text style={[styles.score, { fontSize: 42, lineHeight: 48 }]}>
          {s.runs}
          <Text style={{ fontSize: 32, color: '#D8ECA4' }}> / {s.wickets}</Text>
        </Text>
        <Text style={styles.white}>
          {rules.overs(s.balls)} / {m.overs} overs · CRR {rules.fmt(s.crr)}
        </Text>
        {s.target && (
          <Text style={[styles.white, { fontWeight: '800' }]}>
            Target {s.target} · {Math.max(0, s.target - s.runs)} from {m.overs * 6 - s.balls} balls
            · RRR {rules.fmt(s.rrr)}
          </Text>
        )}
      </Card>
      <Card style={{ padding: 12, gap: 8 }}>
        {[s.striker, s.nonStriker].map((id, j) => (
          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ width: 12, color: colors.teal }}>{j ? '' : '●'}</Text>
            <Avatar player={data.players[id]} size={22} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontWeight: '800', color: colors.ink }}>
                {name(id)}
              </Text>
            </View>
            <Text style={{ fontWeight: '800' }}>
              {s.batters[id].runs} ({s.batters[id].balls})
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, width: 64, textAlign: 'right' }}>
              SR {rules.fmt(rules.rate(s.batters[id].runs, s.batters[id].balls, 100))}
            </Text>
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}>
            Bowler · {name(s.bowler)}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {rules.overs(s.bowlers[s.bowler].balls)} ov · {s.bowlers[s.bowler].runs} R ·{' '}
            {s.bowlers[s.bowler].wickets} W · ER{' '}
            {rules.fmt(rules.rate(s.bowlers[s.bowler].runs, s.bowlers[s.bowler].balls, 6))}
          </Text>
        </View>
      </Card>
      <View style={[styles.row, { paddingHorizontal: 4 }]}>
        <Text style={styles.muted}>This over</Text>
        {s.thisOver.map((d) => (
          <Text
            key={d.id}
            style={{
              backgroundColor: d.wicket ? '#FCE5DC' : '#E7EFDF',
              padding: 7,
              borderRadius: 10,
              fontWeight: '800',
            }}
          >
            {d.wicket ? 'W' : d.total}
            {{ none: '', wide: 'wd', noBall: 'nb', byes: 'b', legByes: 'lb' }[d.extra]}
          </Text>
        ))}
        {!s.thisOver.length && <Text style={styles.muted}>—</Text>}
      </View>
      <Button
        secondary
        disabled={
          busy ||
          !m.innings[i].events.some((e, j) => e.type === 'ball' && j >= m.innings[i].undoFloor)
        }
        onPress={() => {
          const last = m.innings[i].events.findLast((e) => e.type === 'ball');
          if (last?.wicket)
            confirm('Undo wicket?', 'Restore the complete state before this dismissal.', () =>
              update(rules.undo),
            );
          else update(rules.undo);
        }}
      >
        ↶ Undo last ball
      </Button>
      {s.needBatter && (
        <Card title="Select the next batter">
          <Field label="Add a guest batter on the fly" value={guest} onChangeText={setGuest} />
          <Button secondary disabled={busy || !guest.trim()} onPress={() => addGuest(s.batting)}>
            Add guest batter
          </Button>
          {m.teams[s.batting].players
            .filter((p) => !s.batters[p].appeared)
            .map((p) => (
              <Button
                disabled={busy}
                key={p}
                onPress={() => act({ type: 'batter', slot: s.needBatter, player: p })}
              >
                {name(p)}
              </Button>
            ))}
        </Card>
      )}
      {s.needBowler && <Card title="Over complete · select a bowler">{bowlerPanel}</Card>}
      <Card style={{ padding: 12, gap: 8 }}>
        <Chips
          options={[
            { value: 'none', label: 'Normal' },
            { value: 'wide', label: 'Wide +1' },
            { value: 'noBall', label: 'No-ball +1' },
            { value: 'byes', label: 'Byes' },
            { value: 'legByes', label: 'Leg byes' },
          ]}
          value={extra}
          onChange={setExtra}
        />
        <Text style={styles.muted}>
          {extra === 'none'
            ? 'Runs off the bat'
            : extra === 'noBall'
              ? 'Runs off the bat, plus 1 no-ball penalty'
              : extra === 'wide'
                ? 'Additional wide runs, plus 1 automatic penalty'
                : 'Extras only · no runs credited to the batter'}
        </Text>
        <View style={styles.grid}>
          {[0, 1, 2, 3, 4, 5, 6].map((r) => (
            <Button
              key={r}
              disabled={!ready}
              style={{
                minWidth: 64,
                minHeight: 48,
                flexGrow: 1,
                backgroundColor: r === 4 ? '#517931' : r === 6 ? '#39556C' : colors.teal,
              }}
              onPress={() => record(r)}
            >
              {r}
            </Button>
          ))}
        </View>
        <Button
          danger
          disabled={!ready}
          onPress={() => {
            setOutId(s.striker);
            setFielder(null);
            setKind('bowled');
            setWRuns('0');
            setDialog('wicket');
          }}
        >
          Wicket · choose dismissal
        </Button>
      </Card>
      <View style={styles.row}>
        <Button secondary disabled={!ready} onPress={() => act({ type: 'swap' })}>
          Swap strike
        </Button>
        <Button secondary disabled={busy || s.needBatter} onPress={() => setDialog('bowler')}>
          Change / injured bowler
        </Button>
        <Button secondary onPress={() => go('summary', { matchId: m.id })}>
          Full scorecard
        </Button>
      </View>
      <Button
        secondary
        disabled={busy}
        onPress={() =>
          confirm(
            'End innings early?',
            'This closes the innings. Undo cannot cross this boundary.',
            () => act({ type: 'end' }),
          )
        }
      >
        End innings early
      </Button>
      <Modal
        visible={!!dialog}
        transparent
        animationType="slide"
        onRequestClose={() => setDialog(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{
              maxHeight: '88%',
              backgroundColor: colors.bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
            contentContainerStyle={{ padding: 20, gap: 12 }}
          >
            <Button secondary onPress={() => setDialog(null)}>
              Close
            </Button>
            {dialog === 'bowler' ? (
              bowlerPanel
            ) : (
              <>
                <Text style={styles.title}>Dismissal details</Text>
                <Chips
                  label="HOW OUT"
                  options={[
                    'bowled',
                    'caught',
                    'lbw',
                    'stumped',
                    'hit wicket',
                    'run out',
                    'retired out',
                  ]}
                  value={kind}
                  onChange={setKind}
                />
                <Chips
                  label="DISMISSED BATTER"
                  options={choices([s.striker, s.nonStriker])}
                  value={outId}
                  onChange={setOutId}
                />
                {['caught', 'stumped', 'run out'].includes(kind) && (
                  <Chips
                    label="FIELDER / KEEPER"
                    options={choices(m.teams[1 - s.batting].players)}
                    value={fielder}
                    onChange={setFielder}
                  />
                )}
                <Field
                  label="Completed runs before dismissal"
                  value={wRuns}
                  keyboardType="number-pad"
                  onChangeText={setWRuns}
                />
                <Text style={styles.muted}>
                  Delivery type: {extra}. Run outs and retired-out dismissals do not credit the
                  bowler.
                </Text>
                <Button
                  danger
                  disabled={busy}
                  onPress={() => record(Number(wRuns), { kind, player: outId, fielder })}
                >
                  Record wicket
                </Button>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </Page>
  );
}
