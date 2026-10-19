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
 * Keeps a popup's theme in step with the window that opened it. The app sets dark mode as the
 * `dark` class on <html> and the colour theme as `data-theme` on <body>; both are copied once
 * and then again whenever the source changes, so an open popup follows the Options dialog, the
 * sidebar toggle and the OS setting alike.
 *
 * @returns a function that stops following the source.
 */
export function mirrorTheme(source: Document, target: Document): () => void {
    const sync = () => {
        target.documentElement.classList.toggle("dark", source.documentElement.classList.contains("dark"));
        const colorTheme = source.body.dataset.theme;
        if (colorTheme) {
            target.body.dataset.theme = colorTheme;
        } else {
            delete target.body.dataset.theme;
        }
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(source.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(source.body, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
}
