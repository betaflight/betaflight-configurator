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

let deleteAccountFocusRequested = false;

/**
 * Whether a page path is the public account deletion link (app.betaflight.com/delete).
 * @param pathname - a URL path, e.g. window.location.pathname.
 */
export function isDeleteAccountPath(pathname: string): boolean {
    return pathname === "/delete" || pathname === "/delete/";
}

export function requestDeleteAccountFocus(): void {
    deleteAccountFocusRequested = true;
}

/**
 * @returns whether the delete account section was asked to take focus; clears the request.
 */
export function consumeDeleteAccountFocus(): boolean {
    const requested = deleteAccountFocusRequested;
    deleteAccountFocusRequested = false;
    return requested;
}
