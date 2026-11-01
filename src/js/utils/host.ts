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
 * Removes the brackets around an IPv6 host: [fe80::1] becomes fe80::1.
 * A native socket API accepts a bare address only.
 * @param host - a host name or an IP address, with or without brackets.
 * @returns the host, without brackets.
 */
export function unbracketHost(host: string): string {
    return host.replace(/^\[|\]$/g, "");
}

/**
 * Puts brackets around an IPv6 host: fe80::1 becomes [fe80::1].
 * A URL and a host:port pair need the brackets, because an IPv6 address contains colons.
 * @param host - a host name or an IP address, without brackets.
 * @returns the host, with brackets if the host is IPv6.
 */
export function bracketHost(host: string): string {
    return host.includes(":") ? `[${host}]` : host;
}
