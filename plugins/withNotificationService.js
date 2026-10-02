const { withAndroidManifest } = require('@expo/config-plugins');

const withNotificationService = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    const mainApplication = androidManifest.application[0];

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const serviceName = 'com.hex8.ora.notifications.NotificationReplyService';
    const exists = mainApplication.service.some((s) => s.$['android:name'] === serviceName);

    if (!exists) {
      mainApplication.service.push({
        $: {
          'android:name': serviceName,
          'android:label': 'Ora Notification Action Service',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.notification.NotificationListenerService',
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

module.exports = withNotificationService;
