import { clientPlugin, defineConfig } from '@vitebook/client/node';
import { vueMarkdownPlugin } from '@vitebook/markdown-vue/node';
import { vuePlugin } from '@vitebook/vue/node';
import { defaultThemePlugin } from '@vitebook/theme-default/node';

export default defineConfig({
  srcDir: 'src/components',
  include: ['src/**/*.{md,vue}'],
  plugins: [
    defaultThemePlugin(),
    vueMarkdownPlugin(),
    vuePlugin({
      appFile: 'App.vue',
      vue: { include: /\.(md|vue)/ },
    }),
    clientPlugin()
  ],
  site: {
    title: 'betaflight-configurator',
    description: 'Betaflight configurator components',
    /** @type {(import('@vitebook/theme-default/node').DefaultThemeConfig} */
    theme: {
      navbar: {},
      sidebar: {
        '/docs': {
          items: 'auto',
          style: 'docs',
          categories: true,
        },
        '/playground': {
          items: [
            // ...
          ],
          style: 'explorer',
          iconColors: true,
        },
      }
    },
  },
});
