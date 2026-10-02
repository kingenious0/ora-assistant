const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: withOraAssistantCore
 * Injects:
 * 1. Android Default Digital Assistant intent filters (ACTION_ASSIST & VOICE_COMMAND)
 * 2. VoiceInteractionService & VoiceInteractionSessionService with res/xml/ora_assistant_config.xml
 * 3. Accessibility Service & res/xml/ora_accessibility_config.xml for zero-touch screen locking
 * 4. Device Admin Receiver & res/xml/ora_device_admin.xml for enterprise lock screen fallback
 * 5. Quick Settings Tile Service (OraTileService)
 * 6. Native Foreground Service with FOREGROUND_SERVICE_MICROPHONE for background wake words
 * 7. Telephony, SMS, Contacts, and hardware permissions
 */
const withOraAssistantConfigXml = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }

      // 1. Digital Assistant Voice Interaction Config
      const voiceXmlPath = path.join(xmlDir, 'ora_assistant_config.xml');
      const voiceXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<voice-interaction-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:sessionService="com.hex8.ora.services.OraVoiceInteractionSessionService"
    android:supportsAssist="true"
    android:supportsLocalInteraction="true" />
`;
      fs.writeFileSync(voiceXmlPath, voiceXmlContent, 'utf-8');

      // 2. Accessibility Service Config (Screen Lock)
      const accessXmlPath = path.join(xmlDir, 'ora_accessibility_config.xml');
      const accessXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault"
    android:canRetrieveWindowContent="false"
    android:notificationTimeout="100" />
`;
      fs.writeFileSync(accessXmlPath, accessXmlContent, 'utf-8');

      // 3. Device Admin Config (Admin Screen Lock Fallback)
      const adminXmlPath = path.join(xmlDir, 'ora_device_admin.xml');
      const adminXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <force-lock />
    </uses-policies>
</device-admin>
`;
      fs.writeFileSync(adminXmlPath, adminXmlContent, 'utf-8');

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
      'android.permission.MODIFY_AUDIO_SETTINGS',
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

    // B. Native Voice Interaction Session Service (Milestone 6: Floating Overlay)
    const sessionServiceName = 'com.hex8.ora.services.OraVoiceInteractionSessionService';
    const hasSessionService = mainApplication.service.some(
      (s) => s.$['android:name'] === sessionServiceName
    );
    if (!hasSessionService) {
      mainApplication.service.push({
        $: {
          'android:name': sessionServiceName,
          'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
          'android:exported': 'true',
        },
      });
    }

    // C. Native Accessibility Service (Zero-Touch Screen Locking)
    const accessibilityServiceName = 'com.hex8.ora.services.OraAccessibilityService';
    const hasAccessibilityService = mainApplication.service.some(
      (s) => s.$['android:name'] === accessibilityServiceName
    );
    if (!hasAccessibilityService) {
      mainApplication.service.push({
        $: {
          'android:name': accessibilityServiceName,
          'android:label': 'Ora Assistant Lock Screen Service',
          'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.accessibilityservice.AccessibilityService',
                },
              },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.accessibilityservice',
              'android:resource': '@xml/ora_accessibility_config',
            },
          },
        ],
      });
    }

    // D. Native Foreground Microphone Listener Service
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

    // E. Quick Settings Tile Service
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

    // 4. Register Device Admin Receiver (Admin Screen Lock Fallback)
    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }
    const adminReceiverName = 'com.hex8.ora.services.OraDeviceAdminReceiver';
    const hasAdminReceiver = mainApplication.receiver.some(
      (r) => r.$['android:name'] === adminReceiverName
    );
    if (!hasAdminReceiver) {
      mainApplication.receiver.push({
        $: {
          'android:name': adminReceiverName,
          'android:label': 'Ora Assistant Screen Lock Admin',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.app.device_admin',
              'android:resource': '@xml/ora_device_admin',
            },
          },
        ],
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED',
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
