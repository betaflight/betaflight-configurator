'use strict';

const MDNS_INTERVAL = 10000;
const TCP_CHECK_INTERVAL = 5000;
const TCP_TIMEOUT = 2000;

const MdnsDiscovery = new function() {
    this.mdnsBrowser = {
        services: [],
        browser: null,
    };

    this.tcpCheckLock = false;
};

MdnsDiscovery.initialize = function() {
    const self = this;

    if (GUI.isCordova()) {
        const zeroconf = cordova.plugins.zeroconf;

        zeroconf.registerAddressFamily = 'ipv4'; // or 'ipv6' ('any' by default)
        zeroconf.watchAddressFamily = 'ipv4'; // or 'ipv6' ('any' by default)
        zeroconf.watch("_http._tcp.", "local.", result => {
            const action = result.action;
            const service = result.service;

            if (action === 'resolved') {
                console.log("Zeroconf Service Changed", service);
                self.mdnsBrowser.services.push({
                    addresses: service.ipv4Addresses,
                    txt: service.txtRecord,
                    fqdn: `${service.name}._http._tcp.local.`,
                });
            } else {
                console.log("Zeroconf Service Removed", service);
                self.services = self.services.filter(s => s.fqdn !== service.hostname);
            }
        });
    } else {
        const bonjour = require('bonjour')();

        self.mdnsBrowser.browser = bonjour.find({ type: 'http' }, service => {
            console.log("Found HTTP service", service);
            self.mdnsBrowser.services.push({
                addresses: service.addresses,
                txt: service.txt,
                fqdn: service.fqdn,
            });
        });

        if (self.mdns_timer) {
            clearInterval(self.mdns_timer);
        }

        if (!GUI.connected_to) {
            self.mdns_timer = setInterval(self.mdnsBrowser.browser.update(), MDNS_INTERVAL);
        }
    }

    setTimeout(() => {
        self.tcpCheck();
    }, TCP_CHECK_INTERVAL);
};

MdnsDiscovery.tcpCheck = function() {
    const self = this;

    if (!self.tcpCheckLock) {
        self.tcpCheckLock = true;

        if (PortHandler.initialPorts?.length > 0) {
            const tcpPorts = PortHandler.initialPorts.filter(p => p.path.startsWith('tcp://'));

            tcpPorts.forEach(port => {
                console.log("check");
                const removePort = () => {
                    console.log('Remove port', self.mdnsBrowser.services, port);

                    if (!GUI.isCordova()) {
                        self.mdnsBrowser.browser._removeService(port.fqdn);
                    }
                    self.mdnsBrowser.services = self.mdnsBrowser.services.filter(s => s.fqdn !== port.fqdn);
                };

                $.ajax({
                    url: port.path.split('//').pop(),
                    error: removePort,
                    timeout: TCP_TIMEOUT,
                });
            });

            //timeout is 2000ms for every found port, so wait that time before checking again
            setTimeout(() => {
                self.tcpCheckLock = false;
            }, Math.min(tcpPorts.length, 1) * (TCP_TIMEOUT + 1));
        } else {
            self.tcpCheckLock = false;
        }
    }
};
