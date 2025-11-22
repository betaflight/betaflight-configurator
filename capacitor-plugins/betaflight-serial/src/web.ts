import { WebPlugin } from '@capacitor/core';

import type { SerialDevice, ConnectOptions, WriteOptions } from './definitions';

export class BetaflightSerialWeb extends WebPlugin {
  async requestPermission(): Promise<{ devices: SerialDevice[] }> {
    throw this.unimplemented('Not implemented on web. Use Web Serial API directly.');
  }

  async getDevices(): Promise<{ devices: SerialDevice[] }> {
    throw this.unimplemented('Not implemented on web. Use Web Serial API directly.');
  }

  async connect(_options: ConnectOptions): Promise<{ success: boolean; error?: string }> {
    throw this.unimplemented('Not implemented on web. Use Web Serial API directly.');
  }

  async disconnect(): Promise<{ success: boolean }> {
    throw this.unimplemented('Not implemented on web. Use Web Serial API directly.');
  }

  async write(_options: WriteOptions): Promise<{ bytesSent: number }> {
    throw this.unimplemented('Not implemented on web. Use Web Serial API directly.');
  }

  async read(): Promise<{ data: string }> {
    throw this.unimplemented('Not implemented on web. Use Web Serial API directly.');
  }
}
