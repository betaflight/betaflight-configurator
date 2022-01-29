import Layout from './layout/Layout.svelte';
import NotFound from './layout/404.svelte';

const Theme = /** @type {import('@vitebook/client').ClientTheme} */ ({
  Layout,
  NotFound,
  configureRouter(router) {
    // ...
  },
});

export default Theme;
