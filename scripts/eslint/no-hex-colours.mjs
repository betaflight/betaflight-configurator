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

/*
 * ESLint rule: no hex colour literals in a component's styles (#4995, #5542).
 *
 * Colours come from the theme tokens in `src/css/theme.css`, so light, dark and the colour
 * themes all apply. ESLint parses only a `.vue` file's template and script, so this reads the
 * `<style>` blocks from vue-eslint-parser's document fragment, and static `style` attributes from
 * the template. Comments are skipped, so a token's value can still be quoted in one.
 */

const HEX_COLOUR = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])/gi;

/** The text with its comments blanked, so offsets still line up with the source. */
function withoutComments(text) {
    return text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) => comment.replaceAll(/[^\n]/g, " "));
}

/** Matches in a CSS comment are skipped; `//` only starts a comment in Less, never in a url(). */
function hexColours(text) {
    const css = withoutComments(text.replaceAll(/url\([^)]*\)/g, (url) => " ".repeat(url.length)));
    return [...css.matchAll(HEX_COLOUR)].map((match) => ({ value: match[0], offset: match.index }));
}

export default {
    meta: {
        type: "problem",
        docs: { description: "Disallow hex colour literals in .vue styles; use a theme token" },
        schema: [],
        messages: {
            hexColour: "Hard-coded colour {{value}}: use a theme token from src/css/theme.css instead (#4995, #5542).",
        },
    },
    create(context) {
        const { sourceCode } = context;
        const services = sourceCode.parserServices;

        function report(start, value) {
            context.report({
                loc: {
                    start: sourceCode.getLocFromIndex(start),
                    end: sourceCode.getLocFromIndex(start + value.length),
                },
                messageId: "hexColour",
                data: { value },
            });
        }

        function scan(text, start) {
            for (const { value, offset } of hexColours(text)) {
                report(start + offset, value);
            }
        }

        if (typeof services?.getDocumentFragment !== "function") {
            return {};
        }

        const template = {
            "VAttribute[directive=false][key.name='style']"(node) {
                if (node.value) {
                    // A quoted value's range includes its quotes.
                    const quoted = /["']/.test(sourceCode.text[node.value.range[0]]);
                    scan(node.value.value, node.value.range[0] + (quoted ? 1 : 0));
                }
            },
        };
        const script = {
            Program() {
                const fragment = services.getDocumentFragment();
                for (const block of fragment?.children ?? []) {
                    if (block.type !== "VElement" || block.name !== "style") {
                        continue;
                    }
                    for (const child of block.children) {
                        if (child.type === "VText") {
                            scan(child.value, child.range[0]);
                        }
                    }
                }
            },
        };
        return services.defineTemplateBodyVisitor(template, script);
    },
};
