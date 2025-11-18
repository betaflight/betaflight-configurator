import { registerPlugin } from '@capacitor/core';

import type { BetaflightSerialPlugin } from './definitions';

const BetaflightSerial = registerPlugin<BetaflightSerialPlugin>('BetaflightSerial', {
  web: () => import('./web').then(m => new m.BetaflightSerialWeb()),
});

export * from './definitions';
export { BetaflightSerial };
