import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import rules from './domain';
import { Page, Card, Field, Chips, Button, styles, notify } from './ui';

export function Setup({ data, commit, go, back, busy, backOverrideRef }) {
  const initial = data.draft || {
    names: ['Team A', 'Team B'],
    rosters: [[], []],
    teamIds: [null, null],
    overs: 5,
    format: 'Custom',
    playersPerSide: 11,
    venue: '',
    tossWinner: 0,
    tossDecision: 'bat',
    maxBowlerOvers: 2,
    enforceConsecutive: true,
  };
  const [draft, setDraft] = useState(initial),
    [step, setStep] = useState(0);
  useEffect(() => {
    backOverrideRef.current = () => {
      if (step) {
        setStep(0);
        return true;
      }
      return false;
    };
    return () => {
      backOverrideRef.current = null;
    };
  }, [step, backOverrideRef]);
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setTeam = (i, teamId) => {
    const team = data.teams.find((t) => t.id === teamId);
    setDraft((d) => ({
      ...d,
      names: d.names.map((v, j) => (i === j ? team?.name || 'Guest team' : v)),
      teamIds: d.teamIds.map((v, j) => (i === j ? teamId : v)),
      rosters: d.rosters.map((v, j) =>
        i === j
          ? (team?.players || []).map((id) => ({ id, name: data.players[id]?.name || '' }))
          : v,
      ),
    }));
  };
  const saveDraft = async () => {
    if (await commit((d) => ({ ...d, draft })))
      notify('Setup saved', 'You can resume it from New match.');
  };
  const create = async () => {
    try {
      const players = { ...data.players },
        teams = draft.names.map((name, i) => ({
          id: draft.teamIds[i] || rules.id(),
          name: name.trim(),
          players: [],
        }));
      teams.forEach((t, i) => {
        for (let slot = 0; slot < Number(draft.playersPerSide); slot++) {
          const item = draft.rosters[i][slot];
          if (!item?.name.trim()) continue;
          const pid = item.id || rules.id();
          players[pid] = players[pid] || {
            id: pid,
            name: item.name.trim(),
            guest: !draft.teamIds[i],
            teamId: t.id,
          };
          t.players.push(pid);
        }
      });
      teams.forEach((t) => {
        const names = t.players.map((p) => players[p].name.toLowerCase());
        if (new Set(names).size !== names.length)
          throw Error('Use distinct names in each team to avoid ambiguous scoring.');
      });
      const m = rules.createMatch({
        ...draft,
        teams,
        overs: Number(draft.overs),
        playersPerSide: Number(draft.playersPerSide),
        maxBowlerOvers: Number(draft.maxBowlerOvers),
      });
      if (await commit((d) => ({ ...d, players, matches: [...d.matches, m], draft: null })))
        go('live', { matchId: m.id });
    } catch (e) {
      notify('Check setup', e.message);
    }
  };
  return (
    <Page
      title="New match"
      subtitle={`Step ${step + 1} of 2 · Configure your game`}
      onBack={() => (step ? setStep(0) : back())}
    >
      {step === 0 ? (
        <>
          <Card title="Teams and format">
            {[0, 1].map((i) => (
              <View key={i}>
                <Chips
                  label={`TEAM ${i ? 'B' : 'A'} · PICK SAVED OR ENTER MANUALLY`}
                  options={[
                    { value: null, label: 'Manual opponent / team' },
                    ...data.teams.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  value={draft.teamIds[i]}
                  onChange={(v) => setTeam(i, v)}
                />
                <Field
                  label={`Team ${i ? 'B' : 'A'} name`}
                  value={draft.names[i]}
                  onChangeText={(v) =>
                    change(
                      'names',
                      draft.names.map((x, j) => (j === i ? v : x)),
                    )
                  }
                />
              </View>
            ))}
            <Chips
              label="MATCH FORMAT"
              options={['T10', 'T20', 'ODI', 'Custom']}
              value={draft.format}
              onChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  format: v,
                  overs: { T10: 10, T20: 20, ODI: 50 }[v] || d.overs,
                  maxBowlerOvers: { T10: 2, T20: 4, ODI: 10 }[v] || d.maxBowlerOvers,
                }))
              }
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Overs per innings"
                  keyboardType="number-pad"
                  value={draft.overs}
                  onChangeText={(v) => change('overs', v)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Players per side (2–22)"
                  keyboardType="number-pad"
                  value={draft.playersPerSide}
                  onChangeText={(v) => change('playersPerSide', v)}
                />
              </View>
            </View>
            <Field
              label="Venue (optional)"
              value={draft.venue}
              onChangeText={(v) => change('venue', v)}
            />
          </Card>
          <Card title="Toss and bowling rules">
            <Chips
              label="TOSS WINNER"
              options={draft.names.map((name, i) => ({ value: i, label: name }))}
              value={draft.tossWinner}
              onChange={(v) => change('tossWinner', v)}
            />
            <Chips
              label="DECISION"
              options={['bat', 'bowl']}
              value={draft.tossDecision}
              onChange={(v) => change('tossDecision', v)}
            />
            <Field
              label="Maximum overs per bowler"
              value={draft.maxBowlerOvers}
              keyboardType="number-pad"
              onChangeText={(v) => change('maxBowlerOvers', v)}
            />
            <Chips
              label="PREVENT CONSECUTIVE OVERS"
              options={[
                { value: true, label: 'Yes · standard' },
                { value: false, label: 'No · friendly rules' },
              ]}
              value={draft.enforceConsecutive}
              onChange={(v) => change('enforceConsecutive', v)}
            />
            <Text style={styles.muted}>
              Use friendly rules and a larger quota for very small teams. Match rules are fixed when
              scoring starts.
            </Text>
          </Card>
          <Button
            onPress={() => {
              if (
                !Number.isInteger(Number(draft.playersPerSide)) ||
                draft.playersPerSide < 2 ||
                draft.playersPerSide > 22
              )
                return notify('Players per side must be 2–22');
              setStep(1);
            }}
          >
            Next · select players
          </Button>
        </>
      ) : (
        <>
          {[0, 1].map((i) => (
            <Card key={i} title={`${draft.names[i]} · playing side`}>
              {Array.from({ length: Number(draft.playersPerSide) }, (_, slot) => (
                <View key={slot}>
                  <Field
                    label={`Player ${slot + 1}`}
                    value={draft.rosters[i][slot]?.name || ''}
                    onChangeText={(name) => {
                      const rosters = rules.clone(draft.rosters);
                      rosters[i][slot] = { name };
                      change('rosters', rosters);
                    }}
                  />
                  <Chips
                    label="OR SELECT SAVED PLAYER"
                    options={Object.values(data.players)
                      .filter(
                        (p) =>
                          !draft.rosters.flat().some((x) => x?.id === p.id) ||
                          draft.rosters[i][slot]?.id === p.id,
                      )
                      .map((p) => ({ value: p.id, label: p.name }))}
                    value={draft.rosters[i][slot]?.id}
                    onChange={(id) => {
                      const rosters = rules.clone(draft.rosters);
                      rosters[i][slot] = { id, name: data.players[id].name };
                      change('rosters', rosters);
                    }}
                  />
                </View>
              ))}
            </Card>
          ))}
          <Text style={styles.muted}>
            Enter at least two players per side. Remaining slots can be filled during scoring. Names
            entered for a manual team become guest profiles. They keep their statistics when
            registered later. Opening batters and bowler are selected next.
          </Text>
          <Button disabled={busy} onPress={create}>
            Create match · opening setup
          </Button>
        </>
      )}
      <Button secondary disabled={busy} onPress={saveDraft}>
        Save setup for later
      </Button>
    </Page>
  );
}

export function Teams({ data, commit, back, busy }) {
  const [name, setName] = useState(''),
    [playerName, setPlayerName] = useState(''),
    [teamId, setTeamId] = useState(data.teams[0]?.id);
  return (
    <Page title="Teams & players" onBack={back}>
      <Card title="Saved teams">
        <Field label="New team name" value={name} onChangeText={setName} />
        <Button
          disabled={busy}
          onPress={async () => {
            if (!name.trim()) return notify('Enter a team name');
            if (data.teams.some((t) => t.name.toLowerCase() === name.trim().toLowerCase()))
              return notify('Team already exists');
            const id = rules.id();
            if (
              await commit((d) => ({
                ...d,
                teams: [...d.teams, { id, name: name.trim(), players: [] }],
              }))
            ) {
              setName('');
              setTeamId(id);
            }
          }}
        >
          Add team
        </Button>
        <Chips
          options={data.teams.map((t) => ({
            value: t.id,
            label: `${t.name} (${t.players.length})`,
          }))}
          value={teamId}
          onChange={setTeamId}
        />
      </Card>
      <Card title="Add a registered player">
        <Field label="Player name" value={playerName} onChangeText={setPlayerName} />
        <Button
          disabled={busy || !teamId}
          onPress={async () => {
            if (!playerName.trim()) return notify('Enter a player name');
            const id = rules.id();
            if (
              await commit((d) => ({
                ...d,
                players: {
                  ...d.players,
                  [id]: { id, name: playerName.trim(), teamId, guest: false },
                },
                teams: d.teams.map((t) =>
                  t.id === teamId ? { ...t, players: [...t.players, id] } : t,
                ),
              }))
            )
              setPlayerName('');
          }}
        >
          Add player to selected team
        </Button>
      </Card>
      {data.teams
        .filter((t) => t.id === teamId)
        .map((t) => (
          <Card key={t.id} title={t.name}>
            {t.players.map((p) => (
              <Text key={p} style={styles.muted}>
                {data.players[p]?.name}
              </Text>
            ))}
            {!t.players.length && <Text style={styles.muted}>No players yet.</Text>}
          </Card>
        ))}
    </Page>
  );
}
