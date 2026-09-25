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

/**
 * The contract between ReceiverTab and the stick popup it opens (receiver_msp.html). The popup
 * is a separate document with its own module graph, so the opener hands it what it needs as
 * properties on the popup's window.
 */

/** The slice of the app's i18n instance the popup uses. */
export interface StickWindowI18n {
    getMessage(messageID: string): string;
    updatePageDirection(targetDocument?: Document): void;
}

export interface StickWindowHost {
    /** Sends the channel values over MSP; false once the connection has gone away. */
    setRawRx?: (channels: number[]) => boolean;
    i18n?: StickWindowI18n;
}
