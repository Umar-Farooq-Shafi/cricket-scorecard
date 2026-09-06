import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import rules from './domain';
import { emptyState, loadState, persistState } from './storage';
import { Page, Card, Button, Field, styles, colors, notify, confirm } from './ui';
import { Setup, Teams } from './Setup';
import Live from './Live';
import Scorecard from './Scorecard';
import Analytics from './Analytics';

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <CricketApp />
    </SafeAreaProvider>
  );
}
function CricketApp() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [stack, setStack] = useState([{ screen: 'home' }]);
  const dataRef = useRef(null),
    lock = useRef(false),
    backOverrideRef = useRef(null);
  const load = useCallback(() => {
    loadState()
      .then((d) => {
        setError('');
        dataRef.current = d;
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const commit = useCallback(async (fn) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const next = fn(dataRef.current);
      await persistState(next, dataRef.current);
      dataRef.current = next;
      setData(next);
      return true;
    } catch (e) {
      notify('Save failed', `${e.message}. Your last confirmed state is preserved. Please retry.`);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  const go = useCallback((screen, params = {}) => {
    backOverrideRef.current = null;
    setStack((prev) =>
      screen === 'home' ? [{ screen: 'home' }] : [...prev, { screen, ...params }],
    );
  }, []);
  const back = useCallback(() => {
    if (backOverrideRef.current?.()) return;
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      Alert.alert('Exit Cricket ScoreCard?', 'Your saved matches will be here when you return.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Exit', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [stack.length, back]);
  if (error)
    return (
      <Page title="Could not load saved data">
        <Card>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.muted}>Your stored data has not been cleared.</Text>
          <Button onPress={load}>Retry</Button>
        </Card>
      </Page>
    );
  if (!data)
    return (
      <Page title="Opening your scorebook">
        <Text style={styles.muted}>Loading saved matches…</Text>
      </Page>
    );
  const route = stack.at(-1),
    m = data.matches.find((m) => m.id === route.matchId),
    props = { data, commit, go, back, busy, backOverrideRef };
  if (route.screen === 'setup') return <Setup {...props} />;
  if (route.screen === 'teams') return <Teams {...props} />;
  if (route.screen === 'live' && m?.version === 2) return <Live key={m.id} {...props} match={m} />;
  if (route.screen === 'summary') return <Scorecard {...props} match={m} />;
  if (['stats', 'rankings', 'profile', 'compare', 'headtohead'].includes(route.screen))
    return (
      <Analytics
        key={`${route.screen}-${route.playerId || ''}`}
        {...props}
        mode={route.screen}
        playerId={route.playerId}
      />
    );
  if (route.screen === 'settings') return <Settings {...props} />;
  if (route.screen === 'history')
    return (
      <Page title="Your matches" onBack={back}>
        {data.matches.length ? (
          [...data.matches].reverse().map((m) => (
            <Card
              key={m.id}
              title={
                m.version === 2
                  ? m.teams.map((t) => t.name).join(' vs ')
                  : `${m.team1} vs ${m.team2}`
              }
            >
              <Text style={styles.muted}>
                {new Date(m.date).toLocaleDateString()} · {rules.result(m)}
              </Text>
              <View style={styles.row}>
                <Button onPress={() => go('summary', { matchId: m.id })}>Full scorecard</Button>
                {m.version === 2 && rules.status(m) === 'live' && (
                  <Button secondary onPress={() => go('live', { matchId: m.id })}>
                    Resume match
                  </Button>
                )}
              </View>
            </Card>
          ))
        ) : (
          <Card>
            <Text style={styles.muted}>Your saved scorecards will appear here.</Text>
            <Button onPress={() => go('setup')}>Create a match</Button>
          </Card>
        )}
      </Page>
    );
  const live = data.matches.filter((m) => m.version === 2 && rules.status(m) === 'live'),
    completed = data.matches.filter((m) => rules.status(m) === 'done').length;
  return (
    <Page
      title="Your cricket. Every ball."
      subtitle="A scorebook for the games that matter to you."
    >
      <Card style={{ backgroundColor: colors.teal, borderColor: colors.teal, padding: 24 }}>
        <Text style={{ color: '#D8ECA4', fontSize: 11, fontWeight: '800', letterSpacing: 2 }}>
          MATCH DAY
        </Text>
        <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900' }}>
          Ready to take the field?
        </Text>
        <Text style={{ color: '#D1E5DA', lineHeight: 21 }}>
          Set your teams. Call the toss. Keep every run.
        </Text>
        <Button style={{ backgroundColor: '#D8ECA4' }} onPress={() => go('setup')}>
          <Text style={{ color: colors.teal }}>
            ＋ {data.draft ? 'Resume match setup' : 'New match'}
          </Text>
        </Button>
      </Card>
      {live.map((m) => (
        <Card key={m.id} title={`${m.teams[0].name} vs ${m.teams[1].name}`}>
          <Text style={styles.muted}>IN PROGRESS · saved on this device</Text>
          <Button onPress={() => go('live', { matchId: m.id })}>Continue scoring →</Button>
        </Card>
      ))}
      <View style={styles.grid}>
        {[
          ['history', '01', 'Match history', 'Reopen every innings and scorecard'],
          ['stats', '02', 'Statistics', 'Nine separate record tables'],
          ['profile', '03', 'Player profiles', 'Your players, their career records'],
          ['compare', '04', 'Compare players', 'Side-by-side figures and insights'],
          ['headtohead', '05', 'Head to head', 'Batter vs bowler, ball by ball'],
          ['rankings', '06', 'Rankings', 'Batting, bowling and fantasy'],
          ['teams', '07', 'Teams & players', 'Manage squads and registered players'],
          ['settings', '08', 'Settings', 'Qualifiers and scoring weights'],
        ].map(([screen, no, title, desc]) => (
          <Pressable
            accessibilityRole="button"
            key={screen}
            onPress={() => go(screen)}
            style={[styles.card, styles.tile]}
          >
            <Text style={styles.eyebrow}>{no} / SCOREBOOK</Text>
            <Text style={styles.title}>{title} ↗</Text>
            <Text style={styles.muted}>{desc}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.muted, { textAlign: 'center' }]}>
        {completed} completed matches · {Object.keys(data.players).length} players ·{' '}
        {Platform.OS === 'web' ? 'Browser storage' : 'MMKV on-device storage'}
      </Text>
    </Page>
  );
}

function Settings({ data, commit, back, busy }) {
  const [points, setPoints] = useState(data.points),
    [settings, setSettings] = useState(data.settings);
  const save = async () => {
    const p = Object.fromEntries(Object.entries(points).map(([k, v]) => [k, Number(v)])),
      s = Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, Number(v)]));
    if (
      [...Object.values(p), ...Object.values(s)].some((v) => !Number.isFinite(v)) ||
      Object.values(s).some((v) => v < 0) ||
      !Number.isInteger(s.minInnings) ||
      !Number.isInteger(s.minBalls)
    )
      return notify(
        'Check values',
        'Use valid numbers and non-negative qualifiers/weights. Innings and balls must be whole numbers.',
      );
    if (s.batWeight + s.strikeWeight + s.bowlWeight === 0)
      return notify('At least one comparison weight must be positive');
    if (await commit((d) => ({ ...d, points: p, settings: s })))
      notify('Settings saved', 'All analytics now use these values.');
  };
  return (
    <Page title="Settings" onBack={back}>
      <Card title="Statistics qualifiers and comparison weights">
        {Object.entries(settings).map(([k, v]) => (
          <Field
            key={k}
            label={
              {
                minBalls: 'Minimum balls · strike rate',
                minOvers: 'Minimum overs · economy',
                minInnings: 'Minimum innings · batting average',
                batWeight: 'Comparison · batting average weight',
                strikeWeight: 'Comparison · strike rate weight',
                bowlWeight: 'Comparison · bowling impact weight',
              }[k]
            }
            value={v}
            keyboardType="decimal-pad"
            onChangeText={(v) => setSettings((s) => ({ ...s, [k]: v }))}
          />
        ))}
      </Card>
      <Card title="Fantasy points">
        <Text style={styles.muted}>
          Bonuses are applied per innings. A duck penalty requires a dismissal for zero; not-outs
          are excluded.
        </Text>
        {Object.entries(points).map(([k, v]) => (
          <Field
            key={k}
            label={k.replaceAll('_', ' ')}
            value={v}
            keyboardType="numbers-and-punctuation"
            onChangeText={(v) => setPoints((p) => ({ ...p, [k]: v }))}
          />
        ))}
      </Card>
      <Button disabled={busy} onPress={save}>
        Save settings
      </Button>
      <Button
        secondary
        onPress={() => {
          setPoints({ ...rules.POINTS });
          setSettings({ ...rules.SETTINGS });
        }}
      >
        Restore default values
      </Button>
      <Card title="Device data">
        <Text style={styles.muted}>
          This is a local scorebook. Cloud accounts, authorization, synchronization, and ads can be
          connected through the storage boundary later.
        </Text>
        <Button
          danger
          disabled={busy}
          onPress={() =>
            confirm(
              'Erase this scorebook?',
              'All current players, matches, and settings will be removed from this app.',
              () => commit(() => emptyState()),
            )
          }
        >
          Erase current data
        </Button>
      </Card>
    </Page>
  );
}
