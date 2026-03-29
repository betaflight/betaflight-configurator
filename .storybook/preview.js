import { setup } from "@storybook/vue3";
import i18next from "i18next";
import HttpBackend from "i18next-http-backend";
import I18NextVue from "i18next-vue";

/**
 * Logic from ../src/js/localization.js
 */
function parseInputFile(data) {
    // Remove the $n interpolate of Chrome $1, $2, ... -> {{1}}, {{2}}, ...
    const REGEXP_CHROME = /\$([1-9])/g;
    const dataChrome = data.replace(REGEXP_CHROME, "{{$1}}");

    // Remove the .message of the nesting $t(xxxxx.message) -> $t(xxxxx)
    const REGEXP_NESTING = /\$t\(([^\)]*).message\)/g;
    const dataNesting = dataChrome.replace(REGEXP_NESTING, "$t($1)");

    // Move the .message of the json object to root xxxxx.message -> xxxxx
    const jsonData = JSON.parse(dataNesting);
    Object.entries(jsonData).forEach(([key, value]) => {
        jsonData[key] = value.message;
    });

    return jsonData;
}

i18next.use(HttpBackend).init({
    lng: "en",
    debug: true,
    ns: ["messages"],
    defaultNS: ["messages"],
    fallbackLng: {
        default: ["en"],
    },
    backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json",
        parse: parseInputFile,
    },
});

setup((app) => {
    app.use(I18NextVue, { i18next });
});

export const decorators = [
    (story) => ({
        components: { story },
        template: `
    <div style="margin: 1rem;">
      <link rel="stylesheet" href="/css/opensans_webfontkit/fonts.css" />
      <link rel="stylesheet" href="/css/theme.css" />
      <story />
    </div>
`,
    }),
];

export const parameters = {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
        matchers: {
            color: /(background|color)$/i,
            date: /Date$/,
        },
    },
};
