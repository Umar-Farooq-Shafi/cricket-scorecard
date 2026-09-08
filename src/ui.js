import React from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
export const colors = {
  ink: '#172D31',
  teal: '#135D57',
  green: '#D8ECA4',
  muted: '#647773',
  bg: '#F3F5EF',
  line: '#DCE5DB',
  red: '#A83E31',
};
export function notify(title, message = '') {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
}
export function confirm(title, message, action) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) action();
  } else
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: action },
    ]);
}
export function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  style,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={Boolean(disabled)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && { backgroundColor: colors.red },
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.teal }]}>{children}</Text>
    </Pressable>
  );
}
export function Page({ title, subtitle, onBack, children, toolbar, compact = false }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={[styles.header, compact && { paddingVertical: 10 }]}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={onBack}
          >
            <Text style={styles.back}>‹</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          {!compact && <Text style={styles.eyebrow}>CREASE / CRICKET SCORECARD</Text>}
          <Text style={[styles.heading, compact && { fontSize: 22 }]}>{title}</Text>
          {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
        </View>
        {toolbar}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, compact && { padding: 12, gap: 10 }]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Card({ title, children, style }) {
  return (
    <View style={[styles.card, style]}>
      {title && <Text style={styles.title}>{title}</Text>}
      {children}
    </View>
  );
}
export function Field({ label, value, onChangeText, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={String(value ?? '')}
        onChangeText={onChangeText}
        placeholderTextColor="#7C8D87"
        {...props}
      />
    </View>
  );
}
export function Chips({ label, options, value, onChange }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.row}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o,
            l = typeof o === 'object' ? o.label : o;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: v === value }}
              key={String(v)}
              onPress={() => onChange(v)}
              style={[styles.chip, v === value && styles.selected]}
            >
              <Text style={[styles.chipText, v === value && { color: '#fff' }]}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
export function Avatar({ player, size = 32 }) {
  return player?.photo ? (
    <Image
      accessibilityLabel={`${player.name} photo`}
      source={{ uri: player.photo }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#DEEBDA',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontWeight: '800', color: colors.teal }}>
        {player?.name?.slice(0, 2).toUpperCase() || '?'}
      </Text>
    </View>
  );
}
export function PlayerName({ player, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Avatar player={player} />
      <Text style={{ color: colors.ink, fontWeight: '700', maxWidth: 170 }}>
        {player?.name || 'Unknown'}
        {player?.guest ? ' · guest' : ''}
      </Text>
    </Pressable>
  );
}
export function Table({
  columns,
  rows,
  sortKey,
  onSort,
  ascending,
  empty = 'No qualifying records.',
}) {
  return (
    <ScrollView horizontal nestedScrollEnabled maximumZoomScale={2} minimumZoomScale={1}>
      <View
        style={{
          minWidth: Math.max(
            300,
            columns.reduce((n, c) => n + (c.width || 85), 0),
          ),
        }}
      >
        <View style={[styles.tr, { backgroundColor: '#EFF4EC' }]}>
          {columns.map((c) => (
            <Pressable
              accessibilityRole={onSort ? 'button' : undefined}
              key={c.key}
              onPress={() => onSort?.(c.key)}
              style={{ width: c.width || 85, padding: 10 }}
            >
              <Text style={styles.th}>
                {c.label}
                {sortKey === c.key ? (ascending ? ' ↑' : ' ↓') : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        {rows.length ? (
          rows.map((r, i) => (
            <View style={styles.tr} key={r.id ?? i}>
              {columns.map((c) => (
                <View
                  key={c.key}
                  style={{ width: c.width || 85, padding: 10, justifyContent: 'center' }}
                >
                  {React.isValidElement(r[c.key]) ? (
                    r[c.key]
                  ) : (
                    <Text style={styles.td}>{r[c.key] ?? '—'}</Text>
                  )}
                </View>
              ))}
            </View>
          ))
        ) : (
          <Text style={{ padding: 18, color: colors.muted }}>{empty}</Text>
        )}
      </View>
    </ScrollView>
  );
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    color: colors.teal,
    marginBottom: 6,
  },
  heading: { fontSize: 27, fontWeight: '900', color: colors.ink },
  back: { fontSize: 40, color: colors.teal },
  content: {
    padding: 18,
    gap: 14,
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    paddingBottom: 50,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 7 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    minHeight: 46,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: '#FAFCF8',
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 11,
    backgroundColor: colors.teal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondary: { backgroundColor: '#E8F0E2' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: '#fff',
    minHeight: 42,
  },
  selected: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.line },
  th: { fontSize: 11, color: colors.muted, fontWeight: '800' },
  td: { fontSize: 13, color: colors.ink },
  metric: { fontSize: 34, fontWeight: '900', color: colors.teal },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: 280 },
  score: { fontSize: 64, fontWeight: '900', color: '#fff' },
  white: { color: '#fff' },
  error: { color: colors.red, fontSize: 13, lineHeight: 20 },
});
