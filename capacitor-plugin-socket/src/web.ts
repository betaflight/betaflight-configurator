import { WebPlugin } from '@capacitor/core';
import { SocketPlugin } from './definitions';

export class SocketPluginWeb extends WebPlugin implements SocketPlugin {
  async connect(options: { ip: string; port: number }): Promise<{ success: boolean }> {
    console.log('Web implementation does not support raw TCP sockets.', options);
    return { success: false };
  }

  async send(options: { data: string }): Promise<{ success: boolean }> {
    console.log('Web implementation does not support raw TCP sockets.', options);
    return { success: false };
  }

  async receive(): Promise<{ data: string }> {
    console.log('Web implementation does not support raw TCP sockets.');
    return { data: '' };
  }

  async disconnect(): Promise<{ success: boolean }> {
    console.log('Web implementation does not support raw TCP sockets.');
    return { success: false };
  }
}
