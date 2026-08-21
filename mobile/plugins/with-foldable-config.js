const { withAndroidManifest } = require('@expo/config-plugins');

// Handle these config changes in-activity instead of recreating it. Adding
// smallestScreenSize + screenLayout + density is what keeps a foldable's
// fold/unfold (a configuration change) from destroying + recreating MainActivity
// — which would reset navigation state and interrupt whatever the user is doing.
const CONFIG_CHANGES =
  'keyboard|keyboardHidden|orientation|screenSize|smallestScreenSize|screenLayout|uiMode|density|navigation|fontScale';

module.exports = function withFoldableConfig(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application && cfg.modResults.manifest.application[0];
    const activities = (app && app.activity) || [];
    for (const activity of activities) {
      const name = activity.$ && activity.$['android:name'];
      if (name === '.MainActivity') {
        activity.$['android:configChanges'] = CONFIG_CHANGES;
        activity.$['android:resizeableActivity'] = 'true';
      }
    }
    return cfg;
  });
};
