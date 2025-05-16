export interface SocketPlugin {
  connect(options: { ip: string; port: number }): Promise<{ success: boolean }>;
  send(options: { data: string }): Promise<{ success: boolean }>;
  receive(): Promise<{ data: string }>;
  disconnect(): Promise<{ success: boolean }>;
  getStatus(): Promise<{ connected: boolean, state: string }>;
}
