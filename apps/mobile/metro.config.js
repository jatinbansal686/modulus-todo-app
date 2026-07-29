const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

// `withNativeWind` wraps the config so Metro compiles global.css through Tailwind
// and feeds the result to react-native-css-interop. Omit the `input` option and
// NativeWind produces no styles at all — every className resolves to nothing,
// which presents as a layout bug rather than as a missing build step.
module.exports = withNativeWind(
  mergeConfig(getDefaultConfig(__dirname), config),
  { input: './global.css' },
);
