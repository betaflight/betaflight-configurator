import { WebPlugin } from '@capacitor/core';
import { SocketPlugin } from './definitions';

export class SocketPluginWeb extends WebPlugin implements SocketPlugin {
  private readonly NOT_SUPPORTED_MESSAGE = 'Web implementation does not support raw TCP sockets.';

  async connect(options: { ip: string; port: number }): Promise<{ success: boolean }> {
    console.log(`${this.NOT_SUPPORTED_MESSAGE} Cannot connect to ${options.ip}:${options.port}`);
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

  async getStatus(): Promise<{ connected: boolean; state: string }> {
    console.log('Web implementation does not support raw TCP sockets.');
    return { connected: false, state: 'disconnected' };
  }
}
