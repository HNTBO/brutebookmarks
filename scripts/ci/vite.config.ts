import { mergeConfig } from 'vite';
import appConfig from '../../vite.config';

// The two WXT extensions have their own HTML entry points and dependencies.
export default mergeConfig(appConfig, { optimizeDeps: { entries: ['index.html'] } });
