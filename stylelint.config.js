/*
 * Colours in a component come from the theme, never from a literal: a hard-coded hex will
 * not follow light/dark mode or a theme switch.
 *
 * A warning rather than an error. 19 SFCs still hard-code colours, and they get cleaned up
 * as #4995 conversions move them onto `var(--…)` — not in one sweep here, and not via an
 * allowlist anyone has to maintain.
 *
 * `npm run lint:css` points this at SFCs only. `src/css/theme.css` and the blackbox viewer's
 * bridge are where the palette is defined, so a literal colour is the point there, and
 * `src/css/main.less` is legacy. `color-no-hex` is the only rule: a standard config would
 * bury the signal under formatting findings that Prettier already owns.
 *
 * `postcss-less` is not optional. Six of those SFCs use `<style lang="less">`, and without
 * it postcss-html cannot parse the block — stylelint then skips the file silently.
 */

export default {
    rules: {
        "color-no-hex": [true, { severity: "warning" }],
    },
    overrides: [{ files: ["**/*.vue"], customSyntax: "postcss-html" }],
};
