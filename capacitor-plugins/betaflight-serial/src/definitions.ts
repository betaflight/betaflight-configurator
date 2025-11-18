export interface BetaflightSerialPlugin {
  /**
   * Request permission to access USB devices and get list of connected devices
   * This must be called before connecting to any device
   * 
   * @returns Promise with array of available serial devices
   */
  requestPermission(): Promise<{ devices: SerialDevice[] }>;

  /**
   * Get list of devices that have been granted permission
   * 
   * @returns Promise with array of granted serial devices
   */
  getDevices(): Promise<{ devices: SerialDevice[] }>;

  /**
   * Open a connection to a serial device
   * 
   * @param options Connection options including deviceId and baudRate
   * @returns Promise with connection result
   */
  connect(options: ConnectOptions): Promise<{ success: boolean; error?: string }>;

  /**
   * Close the current serial connection
   * 
   * @returns Promise with disconnect result
   */
  disconnect(): Promise<{ success: boolean }>;

  /**
   * Write data to the serial port
   * Data should be provided as a hex string (e.g., "24580000fb")
   * 
   * @param options Write options with hex string data
   * @returns Promise with bytes sent count
   */
  write(options: WriteOptions): Promise<{ bytesSent: number }>;

  /**
   * Read available data from the serial port
   * Returns data as a hex string
   * 
   * @returns Promise with hex string data
   */
  read(): Promise<{ data: string }>;

  /**
   * Add a listener for serial data received events
   * Received data will be provided as hex strings
   * 
   * @param eventName The event name ('dataReceived')
   * @param listenerFunc Callback function that receives the data
   * @returns Promise with listener ID
   */
  addListener(
    eventName: 'dataReceived',
    listenerFunc: (data: DataReceivedEvent) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Add a listener for device attach events
   * 
   * @param eventName The event name ('deviceAttached')
   * @param listenerFunc Callback function that receives device info
   * @returns Promise with listener ID
   */
  addListener(
    eventName: 'deviceAttached',
    listenerFunc: (device: SerialDevice) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Add a listener for device detach events
   * 
   * @param eventName The event name ('deviceDetached')
   * @param listenerFunc Callback function that receives device info
   * @returns Promise with listener ID
   */
  addListener(
    eventName: 'deviceDetached',
    listenerFunc: (device: SerialDevice) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Remove all listeners for this plugin
   */
  removeAllListeners(): Promise<void>;
}

/**
 * Represents a USB serial device
 */
export interface SerialDevice {
  /**
   * Unique device identifier (combination of vendorId:productId:deviceId)
   */
  deviceId: string;

  /**
   * USB Vendor ID
   */
  vendorId: number;

  /**
   * USB Product ID
   */
  productId: number;

  /**
   * Human-readable device name
   */
  deviceName?: string;

  /**
   * Manufacturer name
   */
  manufacturer?: string;

  /**
   * Product name
   */
  product?: string;

  /**
   * Device class code
   */
  deviceClass?: number;

  /**
   * Device subclass code
   */
  deviceSubclass?: number;
}

/**
 * Options for connecting to a serial device
 */
export interface ConnectOptions {
  /**
   * Device ID to connect to
   */
  deviceId: string;

  /**
   * Baud rate for serial communication
   * @default 115200
   */
  baudRate?: number;

  /**
   * Data bits (5, 6, 7, or 8)
   * @default 8
   */
  dataBits?: number;

  /**
   * Stop bits (1 or 2)
   * @default 1
   */
  stopBits?: number;

  /**
   * Parity ('none', 'even', 'odd', 'mark', 'space')
   * @default 'none'
   */
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';

  /**
   * Flow control ('none', 'hardware', 'software')
   * @default 'none'
   */
  flowControl?: 'none' | 'hardware' | 'software';
}

/**
 * Options for writing data to serial port
 */
export interface WriteOptions {
  /**
   * Data to write as a hex string (e.g., "24580000fb")
   */
  data: string;
}

/**
 * Event emitted when data is received
 */
export interface DataReceivedEvent {
  /**
   * Received data as hex string
   */
  data: string;
}

/**
 * Plugin listener handle for removing listeners
 */
export interface PluginListenerHandle {
  remove: () => Promise<void>;
}
