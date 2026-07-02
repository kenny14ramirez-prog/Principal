import { execSync } from 'child_process';

export const searchAPK = () => execSync('grep -r "crozzo-android-apk" app/').toString();
export const searchTouch = () => execSync('grep -r "crozzo-touch-shell" app/').toString();
export const searchDesktop = () => execSync('grep -r "html:not(.crozzo-touch-shell)" app/').toString();
export const searchModules = () => execSync('grep -r "PAGE_SCRIPTS" app/core/').toString();

// Para probar el script:
// node scripts/_ia-search-helper.mjs
