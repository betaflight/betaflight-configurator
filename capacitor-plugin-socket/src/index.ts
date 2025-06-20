import { registerPlugin } from '@capacitor/core';

const SocketPlugin = registerPlugin('SocketPlugin', {
  web: () => import('./web').then(m => new m.SocketPluginWeb()),
});

export * from './definitions';
export { SocketPlugin };
