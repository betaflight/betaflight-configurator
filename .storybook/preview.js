import Vue from "vue";
import VueI18Next from "@panter/vue-i18next";
import i18next from "i18next";
import i18nextXHRBackend from "i18next-xhr-backend";

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

i18next.use(i18nextXHRBackend).init({
  lng: "en",
  debug: true,
  getAsync: false,
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

Vue.use(VueI18Next);

const i18n = new VueI18Next(i18next);

export const decorators = [
  (story) => ({
    i18n,
    components: { story },
    template: `
    <div style="margin: 1rem;">
      <link rel="stylesheet" href="/css/opensans_webfontkit/fonts.css" />
      <link rel="stylesheet" href="/css/main.css" />
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
