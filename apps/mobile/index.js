/**
 * @format
 */

import { AppRegistry } from 'react-native';

import App from '@app/App';
import { name as appName } from './app.json';

// `appName` must stay in sync with MainActivity.getMainComponentName() on the
// native side. Reading it from app.json rather than repeating the literal is what
// keeps the two from drifting into an "Application ... has not been registered"
// red box that looks like a bundler fault but is a one-word mismatch.
AppRegistry.registerComponent(appName, () => App);
