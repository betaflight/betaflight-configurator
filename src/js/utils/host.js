/**
 * Removes the brackets around an IPv6 host: [fe80::1] becomes fe80::1.
 * A native socket API accepts a bare address only.
 * @param {string} host - a host name or an IP address, with or without brackets.
 * @returns {string} the host, without brackets.
 */
export function unbracketHost(host) {
    return host.replace(/^\[|\]$/g, "");
}

/**
 * Puts brackets around an IPv6 host: fe80::1 becomes [fe80::1].
 * A URL and a host:port pair need the brackets, because an IPv6 address contains colons.
 * @param {string} host - a host name or an IP address, without brackets.
 * @returns {string} the host, with brackets if the host is IPv6.
 */
export function bracketHost(host) {
    return host.includes(":") ? `[${host}]` : host;
}
