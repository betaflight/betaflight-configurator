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
 * Whether this is a development build or a PR/master preview deployment, where development
 * options default on.
 *
 * Development is taken from the build, not the hostname: release Tauri (`tauri://localhost`,
 * `http://tauri.localhost`) and Capacitor (`https://localhost`) builds are served from localhost.
 */
export function isPreviewOrDevBuild(href: string = window.location.href, dev: boolean = import.meta.env.DEV): boolean {
    if (dev) {
        return true;
    }

    try {
        // Previews deploy to Cloudflare Pages branch aliases: PR<number> for pull requests, master for pushes.
        const subdomain = new URL(href).hostname.split(".")[0] ?? "";
        return /^pr\d+$/i.test(subdomain) || subdomain.toLowerCase() === "master";
    } catch {
        return false;
    }
}
