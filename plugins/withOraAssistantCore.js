const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: withOraAssistantCore
 * Injects:
 * 1. Android Default Digital Assistant intent filters (ACTION_ASSIST & VOICE_COMMAND)
 * 2. VoiceInteractionService & res/xml/ora_assistant_config.xml for Android default assistant selection
 * 3. Quick Settings Tile Service (OraTileService)
 * 4. Native Foreground Service with FOREGROUND_SERVICE_MICROPHONE for background wake words
 * 5. Telephony, SMS, Contacts, and wake-lock permissions
 */
const withOraAssistantConfigXml = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }
      const xmlPath = path.join(xmlDir, 'ora_assistant_config.xml');
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<voice-interaction-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:supportsAssist="true"
    android:supportsLocalInteraction="true" />
`;
      fs.writeFileSync(xmlPath, xmlContent, 'utf-8');
      return config;
    },
  ]);
};

const withOraAssistantManifest = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    const mainApplication = androidManifest.application[0];

    // 1. Ensure required permissions are declared
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const requiredPermissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.CALL_PHONE',
      'android.permission.SEND_SMS',
      'android.permission.READ_CONTACTS',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'com.android.alarm.permission.SET_ALARM',
      'android.permission.QUERY_ALL_PACKAGES',
    ];

    for (const perm of requiredPermissions) {
      const exists = androidManifest['uses-permission'].some((p) => p.$['android:name'] === perm);
      if (!exists) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    // Ensure queries tag exists for Android 11+ (API 30+) package visibility
    if (!androidManifest['queries']) {
      androidManifest['queries'] = [];
    }
    const hasMainQuery = androidManifest['queries'].some((q) =>
      q.intent?.some((i) => i.action?.some((a) => a.$['android:name'] === 'android.intent.action.MAIN'))
    );
    if (!hasMainQuery) {
      androidManifest['queries'].push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          },
        ],
      });
    }

    // 2. Add Android Digital Assistant intent filters to MainActivity
    const mainActivity = mainApplication.activity.find(
      (a) => a.$['android:name'] === '.MainActivity' || a.$['android:name'] === 'com.hex8.ora.MainActivity'
    ) || mainApplication.activity[0];

    if (mainActivity) {
      if (!mainActivity['intent-filter']) {
        mainActivity['intent-filter'] = [];
      }

      // Check if ASSIST intent filter exists
      const hasAssist = mainActivity['intent-filter'].some((filter) =>
        filter.action?.some((act) => act.$['android:name'] === 'android.intent.action.ASSIST')
      );

      if (!hasAssist) {
        mainActivity['intent-filter'].push({
          action: [
            { $: { 'android:name': 'android.intent.action.ASSIST' } },
            { $: { 'android:name': 'android.intent.action.VOICE_COMMAND' } },
          ],
          category: [
            { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          ],
        });
      }
    }

    // 3. Register Native Services
    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    // A. Native Voice Interaction Service (Default Digital Assistant App)
    const voiceServiceName = 'com.hex8.ora.services.OraVoiceInteractionService';
    const hasVoiceService = mainApplication.service.some(
      (s) => s.$['android:name'] === voiceServiceName
    );
    if (!hasVoiceService) {
      mainApplication.service.push({
        $: {
          'android:name': voiceServiceName,
          'android:label': 'Ora Assistant',
          'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
          'android:exported': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.voice_interaction',
              'android:resource': '@xml/ora_assistant_config',
            },
          },
        ],
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.voice.VoiceInteractionService',
                },
              },
            ],
          },
        ],
      });
    }

    // B. Native Foreground Microphone Listener Service
    const foregroundServiceName = 'com.hex8.ora.services.OraForegroundListenerService';
    const hasForegroundService = mainApplication.service.some(
      (s) => s.$['android:name'] === foregroundServiceName
    );
    if (!hasForegroundService) {
      mainApplication.service.push({
        $: {
          'android:name': foregroundServiceName,
          'android:label': 'Ora Assistant Voice Engine',
          'android:foregroundServiceType': 'microphone',
          'android:exported': 'false',
        },
      });
    }

    // C. Quick Settings Tile Service
    const tileServiceName = 'com.hex8.ora.services.OraTileService';
    const hasTileService = mainApplication.service.some(
      (s) => s.$['android:name'] === tileServiceName
    );
    if (!hasTileService) {
      mainApplication.service.push({
        $: {
          'android:name': tileServiceName,
          'android:label': 'Ora Voice Assistant',
          'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.quicksettings.action.QS_TILE',
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });
};

const withOraAssistantCore = (config) => {
  return withOraAssistantConfigXml(withOraAssistantManifest(config));
};

module.exports = withOraAssistantCore;
