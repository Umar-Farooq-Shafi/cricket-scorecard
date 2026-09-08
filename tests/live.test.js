const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { transformFileSync } = require('@babel/core');
const React = require('react');
const rules = require('../src/domain');

// Evaluate the real screen JSX with native hosts stubbed. Keep React elements so
// native prop contracts can be checked without an emulator or a DOM renderer.
function loadScreen(file, overrides) {
  const { code } = transformFileSync(path.join(__dirname, '../src', file), {
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in overrides, `Unexpected dependency: ${name}`);
      return overrides[name];
    },
  });
  return exports;
}
const native = Object.fromEntries(
  ['Image', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'Modal'].map((x) => [x, x]),
);
const ui = loadScreen('ui.js', {
  react: React,
  'react-native': { ...native, StyleSheet: { create: (x) => x } },
  'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-status-bar': { StatusBar: 'StatusBar' },
});
const Live = loadScreen('Live.js', {
  react: { ...React, useState: (initial) => [initial, () => {}] },
  'react-native': native,
  './domain': rules,
  './ui': ui,
}).default;

function buttons(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(buttons);
  return [...(element.type === ui.Button ? [element] : []), ...buttons(element.props?.children)];
}
for (const slot of ['striker', 'nonStriker']) {
  test(`resumed match renders safe native buttons after ${slot} is out`, () => {
    let match = rules.startInnings(
      rules.createMatch({
        teams: [
          { name: 'Falcons', players: ['a', 'b', 'c'] },
          { name: 'Lions', players: ['x', 'y', 'z'] },
        ],
        overs: 3,
        playersPerSide: 3,
        maxBowlerOvers: 2,
        tossWinner: 0,
        tossDecision: 'bat',
      }),
      'a',
      'b',
      'x',
    );
    match = rules.clone(match);
    match = rules.command(match, {
      type: 'ball',
      runs: 0,
      extra: 'none',
      wicket: { kind: 'run out', player: slot === 'striker' ? 'a' : 'b', fielder: 'x' },
    });
    assert.equal(rules.deriveInnings(match, 0).needBatter, slot);
    const data = { players: {} };
    const render = (m) => buttons(Live({ match: m, data, busy: false }));
    for (const button of render(match)) {
      assert.equal(
        typeof (button.props.disabled ?? false),
        'boolean',
        String(button.props.children),
      );
      assert.equal(typeof ui.Button(button.props).props.disabled, 'boolean');
    }
    const pending = render(rules.clone(match));
    assert.equal(
      pending.find((b) => b.props.children === 'Change / injured bowler').props.disabled,
      true,
    );
    match = rules.command(match, { type: 'batter', slot, player: 'c' });
    assert.equal(
      render(match).find((b) => b.props.children === 'Change / injured bowler').props.disabled,
      false,
    );
  });
}
