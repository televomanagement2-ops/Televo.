// =============================================================================
// ESLint flat config (ESLint 9). Usa il preset di Expo + ignora gli artefatti.
// =============================================================================
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'babel.config.js', 'metro.config.js'],
  },
  {
    // CM6.5: i popup nativi chiari sono banditi — tutti i dialoghi passano
    // dalle primitive dark (mostraMenu/conferma/avvisa in @/lib/dialoghi).
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Alert',
          property: 'alert',
          message: 'Usa mostraMenu/conferma/avvisa da @/lib/dialoghi (dialoghi dark, CM6.5).',
        },
      ],
    },
  },
];
