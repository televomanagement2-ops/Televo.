// =============================================================================
// ESLint flat config (ESLint 9). Usa il preset di Expo + ignora gli artefatti.
// =============================================================================
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'babel.config.js', 'metro.config.js'],
  },
];
