export function isWeb() {
    return import.meta.env.MODE !== 'nwjs';
}
