const fs = require('fs');
const path = require('path');

// 1. Patch warnOfExpoGoPushUsage.js
const warnFile = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'warnOfExpoGoPushUsage.js');
if (fs.existsSync(warnFile)) {
  let content = fs.readFileSync(warnFile, 'utf8');
  if (content.includes("throw new Error(message);")) {
    content = content.replace(
      /if \(Platform\.OS === 'android'\) \{\s*throw new Error\(message\);\s*\}\s*else if \(__DEV__\) \{/g,
      "if (!didWarn) {"
    );
    fs.writeFileSync(warnFile, content, 'utf8');
    console.log('[patch] Successfully patched expo-notifications warnOfExpoGoPushUsage.js');
  } else {
    console.log('[patch] warnOfExpoGoPushUsage.js already patched.');
  }
} else {
  console.log('[patch] warnOfExpoGoPushUsage.js not found, skipping patch.');
}

// 2. Patch TopicSubscriptionModule.android.js to prevent "Cannot find native module 'ExpoTopicSubscriptionModule'" crash in Expo Go
const topicFile = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'TopicSubscriptionModule.android.js');
if (fs.existsSync(topicFile)) {
  let topicContent = fs.readFileSync(topicFile, 'utf8');
  if (topicContent.includes("requireNativeModule('ExpoTopicSubscriptionModule')")) {
    topicContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
const nativeModule = requireOptionalNativeModule('ExpoTopicSubscriptionModule');
const fallbackModule = {
  addListener: () => {},
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
export default nativeModule || fallbackModule;
`;
    fs.writeFileSync(topicFile, topicContent, 'utf8');
    console.log('[patch] Successfully patched expo-notifications TopicSubscriptionModule.android.js');
  } else {
    console.log('[patch] TopicSubscriptionModule.android.js already patched.');
  }
} else {
  console.log('[patch] TopicSubscriptionModule.android.js not found, skipping patch.');
}

