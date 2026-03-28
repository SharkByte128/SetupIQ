/**
 * Web Bluetooth driver for SkyRC SCWS2000 corner weight scale.
 *
 * The SCWS2000 exposes a custom BLE GATT service.
 * This module discovers the device, connects, and streams weight readings.
 *
 * NOTE: The exact UUIDs below are placeholders — they will need to be
 * updated once the real GATT service/characteristic UUIDs are confirmed
 * via BLE scanning. The architecture is production-ready regardless.
 */

// Placeholder UUIDs — replace with real values from BLE scan
const SCALE_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
const WEIGHT_CHARACTERISTIC_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";

export interface CornerWeightReading {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
  unit: "g";
  timestamp: number;
}

export type ScaleConnectionState = "disconnected" | "connecting" | "connected" | "error";

type Listener = (reading: CornerWeightReading) => void;
type StateListener = (state: ScaleConnectionState) => void;

class BluetoothScaleDriver {
  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners: Set<Listener> = new Set();
  private stateListeners: Set<StateListener> = new Set();
  private _state: ScaleConnectionState = "disconnected";

  get state() {
    return this._state;
  }

  private setState(state: ScaleConnectionState) {
    this._state = state;
    this.stateListeners.forEach((fn) => fn(state));
  }

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth is not supported in this browser");
    }

    try {
      this.setState("connecting");

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SCALE_SERVICE_UUID] }],
        optionalServices: [SCALE_SERVICE_UUID],
      });

      this.device.addEventListener("gattserverdisconnected", () => {
        this.setState("disconnected");
        this.characteristic = null;
      });

      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService(SCALE_SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(WEIGHT_CHARACTERISTIC_UUID);

      // Start notifications
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener("characteristicvaluechanged", this.handleNotification);

      this.setState("connected");
    } catch (err) {
      this.setState("error");
      throw err;
    }
  }

  disconnect() {
    if (this.characteristic) {
      this.characteristic.removeEventListener("characteristicvaluechanged", this.handleNotification);
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
    this.setState("disconnected");
  }

  private handleNotification = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const data = target.value;
    if (!data) return;

    const reading = this.parseWeightData(data);
    if (reading) {
      this.listeners.forEach((fn) => fn(reading));
    }
  };

  /**
   * Parse raw BLE data into corner weight readings.
   * Expected format: 4 × 16-bit little-endian unsigned integers (8 bytes total),
   * representing FL, FR, RL, RR weights in 0.1g resolution.
   *
   * NOTE: This parsing logic is a best-guess and may need adjustment
   * once real packet captures are available.
   */
  private parseWeightData(data: DataView): CornerWeightReading | null {
    if (data.byteLength < 8) return null;

    return {
      frontLeft: data.getUint16(0, true) / 10,
      frontRight: data.getUint16(2, true) / 10,
      rearLeft: data.getUint16(4, true) / 10,
      rearRight: data.getUint16(6, true) / 10,
      unit: "g",
      timestamp: Date.now(),
    };
  }

  /** Read a single measurement (one-shot) */
  async readOnce(): Promise<CornerWeightReading | null> {
    if (!this.characteristic) return null;
    const data = await this.characteristic.readValue();
    return this.parseWeightData(data);
  }

  onReading(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStateChange(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }
}

export const scaleDriver = new BluetoothScaleDriver();
