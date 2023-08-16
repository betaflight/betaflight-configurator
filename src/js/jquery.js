import $ from 'jquery';

/**
 * jQuery has plugins which load in all sort of different ways,
 * not necessary as modules. This binds jquery package to global
 * scope and is loaded in first, so that when plugins are loaded
 * all of them have access to the same instance.
 */
if(typeof globalThis !== 'undefined') {
    // eslint-disable-next-line no-undef
    globalThis.jQuery = $;
    // eslint-disable-next-line no-undef
    globalThis.$ = $;
}

if(typeof window !== 'undefined') {
    window.jQuery = $;
    window.$ = $;
}

if(typeof global !== 'undefined') {
    global.$ = $;
    global.jQuery = $;
}

export default $;
