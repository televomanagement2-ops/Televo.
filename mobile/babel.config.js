// Babel — Televo (Expo SDK 54 + NativeWind v4 + Reanimated 4)
// Reanimated 4 delega il plugin a react-native-worklets (pacchetto separato,
// installato come dipendenza). Il plugin va tenuto come ULTIMO della lista.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      'react-native-worklets/plugin',
    ],
  };
};
