import GUI from './gui';
import PortHandler from './port_handler';
import { isWeb } from './utils/isWeb';

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

        function reinit() {
            zeroconf.registerAddressFamily = 'ipv4'; // or 'ipv6' ('any' by default)
            zeroconf.watchAddressFamily = 'ipv4'; // or 'ipv6' ('any' by default)
            zeroconf.watch("_http._tcp.", "local.", (result) => {
                const action = result.action;
                const service = result.service;

                if (action === 'resolved' && service.name.includes("elrs_rx")) {
                    console.log("Zeroconf Service Changed", service);
                    self.mdnsBrowser.services.push({
                        addresses: service.ipv4Addresses,
                        txt: service.txtRecord,
                        fqdn: `${service.name}._http._tcp.local.`,
                        ready: true,
                    });
                } else if (action === 'added' && service.name.includes("elrs_rx")) {
                    //restart zeroconf if service ip doesn't arrive in 1000ms
                    setTimeout(() => {
                        if (self.mdnsBrowser.services.length === 0 || self.mdnsBrowser.services.filter(s => s.fqdn === `${service.name}._http._tcp.local.`)[0].ready === false) {
                            zeroconf.close();
                            reinit();
                        }
                    },1000);
                }
            });
        }

        reinit();
    } else {
        if(!isWeb()) {
            import('bonjour').then(({ default: bonjour  }) => {
                self.mdnsBrowser.browser = bonjour.find({ type: 'http' }, service => {
                    console.log("Found HTTP service", service);
                    self.mdnsBrowser.services.push({
                        addresses: service.addresses,
                        txt: service.txt,
                        fqdn: service.fqdn,
                        ready: true,
                    });
                });
            });
        }
    }

    setInterval(() => {
        if (GUI.isCordova() && self.mdnsBrowser.services.length > 0) {
            //ping removed services and enable them if they are online
            const inactiveServices = self.mdnsBrowser.services.filter(s => s.ready === false);
            inactiveServices.forEach(function (service) {
                $.ajax({
                    url: `http://${service.addresses[0]}`,
                    success: () => {
                        self.mdnsBrowser.services = self.mdnsBrowser.services
                        .map(s => {
                            if (s.fqdn === service.fqdn) {
                                return {...s, ready: true};
                            }
                            return s;
                        });
                    },
                    error: () => {},
                    timeout: TCP_TIMEOUT,
                });
            });
        }
        else if (!GUI.connected_to && self.mdnsBrowser.browser) {
            self.mdnsBrowser.browser.update();
        }
    }, MDNS_INTERVAL);

    setInterval(() => {
        self.tcpCheck();
    }, TCP_CHECK_INTERVAL);
};

MdnsDiscovery.tcpCheck = function() {
    const self = this;

    if (!self.tcpCheckLock) {
        self.tcpCheckLock = true;
        if (PortHandler.initialPorts?.length > 0) {
            const tcpPorts = PortHandler.initialPorts.filter(p => p.path.startsWith('tcp://'));
            tcpPorts.forEach(function (port) {
                const removePort = () => {
                    if (GUI.isCordova()) {
                        //disable offline services instead of removing them
                        self.mdnsBrowser.services = self.mdnsBrowser.services
                        .map(s => {
                            if (s.fqdn === port.fqdn) {
                                return {...s, ready: false};
                              }
                              return s;
                            });
                    }
                    else {
                        self.mdnsBrowser.browser._removeService(port.fqdn);
                        self.mdnsBrowser.services = self.mdnsBrowser.services.filter(s => s.fqdn !== port.fqdn);
                    }
                };
                $.ajax({
                    url: `http://${port.path.split('//').pop()}`,
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

export default MdnsDiscovery;
