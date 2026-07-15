// app.config.js — sostituisce app.json per poter interpolare le EAS file
// environment variable (google-services.json non è tracciato in git: viene
// iniettato da EAS Build tramite GOOGLE_SERVICES_JSON, cfr. `eas env:list`).
const appJson = require('./app.json');

module.exports = () => {
  const config = appJson.expo;

  return {
    expo: {
      ...config,
      android: {
        ...config.android,
        googleServicesFile:
          process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
      },
    },
  };
};
