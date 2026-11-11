/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { TinyEmitter } from "tiny-emitter";

export type DevicePermissionType = "bluetooth" | "serial" | "usb";

/** Every event on the bus, and the arguments its listeners receive. */
export interface EventBusEvents {
    "autocomplete:build:start": [];
    "autocomplete:build:stop": [];
    "expert-mode-change": [enabled: boolean];
    "ports-input:change": [port: string];
    "ports-input:request-permission-bluetooth": [];
    "ports-input:request-permission-serial": [];
    "ports-input:request-permission-usb": [];
    "device-handler:auto-select-serial-device": [path: string];
    // `undefined` when the DFU event carried no device and no port was selected either:
    // `selectedDevice === device?.path` in device_handler then holds for two `undefined`s.
    "device-handler:auto-select-usb-device": [path: string | undefined];
    "device-handler:device-removed": [path: string];
}

export type EventBusEvent = keyof EventBusEvents;
export type EventBusListener<E extends EventBusEvent> = (...args: EventBusEvents[E]) => void;

// The app's only emitter; `tiny-emitter/instance` is exactly this, minus the types.
const emitter = new TinyEmitter();

export const EventBus = {
    $on: <E extends EventBusEvent>(event: E, listener: EventBusListener<E>) => emitter.on(event, listener),
    $once: <E extends EventBusEvent>(event: E, listener: EventBusListener<E>) => emitter.once(event, listener),
    $off: <E extends EventBusEvent>(event: E, listener?: EventBusListener<E>) => emitter.off(event, listener),
    $emit: <E extends EventBusEvent>(event: E, ...args: EventBusEvents[E]) => emitter.emit(event, ...args),
};
