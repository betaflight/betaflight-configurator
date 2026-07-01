#include "bindings/bindings.h"

#import <Foundation/Foundation.h>
#import <Network/Network.h>

// Bonjour browse that raises the one-time Local Network permission prompt.
// Needs NSLocalNetworkUsageDescription and NSBonjourServices in Info.plist.
static NSNetServiceBrowser *gLocalNetworkTrigger = nil;

static void triggerLocalNetworkPermission(void) {
    gLocalNetworkTrigger = [[NSNetServiceBrowser alloc] init];
    [gLocalNetworkTrigger searchForServicesOfType:@"_betaflight._tcp" inDomain:@"local."];
}

// Network.framework TCP transport for iOS, since a raw socket never gets local network
// access even with the permission granted. Rust registers its callbacks through here.
extern "C" void rust_tcp_on_data(const uint8_t *bytes, size_t len);
extern "C" void rust_tcp_on_closed(void);
extern "C" void rust_register_tcp(int (*connect_fn)(const char *, uint16_t),
                                  void (*send_fn)(const uint8_t *, size_t),
                                  void (*close_fn)(void));

extern "C" void rust_udp_on_data(const uint8_t *bytes, size_t len);
extern "C" void rust_register_udp(int (*open_fn)(const char *, uint16_t),
                                  void (*send_fn)(const uint8_t *, size_t),
                                  void (*close_fn)(void));

static nw_connection_t gTcpConn = nil;
static dispatch_queue_t gTcpQueue = nil;

static void ios_tcp_receive_loop(nw_connection_t conn) {
    nw_connection_receive(conn, 1, 65536,
        ^(dispatch_data_t content, nw_content_context_t context, bool is_complete, nw_error_t error) {
            (void)context;
            if (content != NULL) {
                dispatch_data_apply(content,
                    ^bool(dispatch_data_t region, size_t offset, const void *buffer, size_t size) {
                        (void)region; (void)offset;
                        if (size > 0) {
                            rust_tcp_on_data((const uint8_t *)buffer, size);
                        }
                        return true;
                    });
            }
            if (error != NULL || is_complete) {
                rust_tcp_on_closed();
                return;
            }
            if (conn == gTcpConn) {
                ios_tcp_receive_loop(conn);   // Re-arm
            }
        });
}

static int ios_tcp_connect(const char *ip, uint16_t port) {
    if (gTcpQueue == nil) {
        gTcpQueue = dispatch_queue_create("app.betaflight.tcp", DISPATCH_QUEUE_SERIAL);
    }
    if (gTcpConn != nil) {
        nw_connection_cancel(gTcpConn);
        gTcpConn = nil;
    }

    char portStr[8];
    snprintf(portStr, sizeof(portStr), "%u", (unsigned)port);
    nw_endpoint_t endpoint = nw_endpoint_create_host(ip, portStr);
    nw_parameters_t params =
        nw_parameters_create_secure_tcp(NW_PARAMETERS_DISABLE_PROTOCOL, NW_PARAMETERS_DEFAULT_CONFIGURATION);
    nw_connection_t conn = nw_connection_create(endpoint, params);
    gTcpConn = conn;
    nw_connection_set_queue(conn, gTcpQueue);

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block bool ready = false;
    __block int lastState = 0;   // Last connection state
    __block int lastErrno = 0;   // POSIX errno, 0 if none
    nw_connection_set_state_changed_handler(conn,
        ^(nw_connection_state_t state, nw_error_t error) {
            lastState = (int)state;
            if (error) {
                lastErrno = nw_error_get_error_code(error);
            }
            if (state == nw_connection_state_ready) {
                ready = true;
                dispatch_semaphore_signal(sem);
                ios_tcp_receive_loop(conn);
            } else if (state == nw_connection_state_failed || state == nw_connection_state_cancelled) {
                if (!ready) {
                    dispatch_semaphore_signal(sem);
                }
                rust_tcp_on_closed();
            }
        });
    nw_connection_start(conn);

    // NWConnection waits for the permission internally, so block the caller until it's
    // ready or failed, with a 12s ceiling.
    long timedOut = dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 12LL * NSEC_PER_SEC));
    if (ready) {
        return 0;
    }
    nw_connection_cancel(conn);
    if (gTcpConn == conn) {
        gTcpConn = nil;
    }
    // Pack the state and errno into one code for tcp.rs.
    int code = lastState * 1000 + (lastErrno % 1000);
    if (code == 0) {
        code = (timedOut != 0) ? 999000 : 997000;   // Timeout or unknown, stay non-zero
    }
    return code;
}

static void ios_tcp_send(const uint8_t *data, size_t len) {
    nw_connection_t conn = gTcpConn;
    if (conn == nil || data == NULL || len == 0) {
        return;
    }
    dispatch_data_t dd = dispatch_data_create(data, len, gTcpQueue, DISPATCH_DATA_DESTRUCTOR_DEFAULT);
    nw_connection_send(conn, dd, NW_CONNECTION_DEFAULT_MESSAGE_CONTEXT, true,
        ^(nw_error_t error) { (void)error; });
}

static void ios_tcp_close(void) {
    if (gTcpConn != nil) {
        nw_connection_cancel(gTcpConn);
        gTcpConn = nil;
    }
}

static nw_connection_t gUdpConn = nil;
static dispatch_queue_t gUdpQueue = nil;

static void ios_udp_receive_loop(nw_connection_t conn) {
    nw_connection_receive(conn, 1, 65536,
        ^(dispatch_data_t content, nw_content_context_t context, bool is_complete, nw_error_t error) {
            (void)context; (void)is_complete;
            if (content != NULL) {
                dispatch_data_apply(content,
                    ^bool(dispatch_data_t region, size_t offset, const void *buffer, size_t size) {
                        (void)region; (void)offset;
                        if (size > 0) {
                            rust_udp_on_data((const uint8_t *)buffer, size);
                        }
                        return true;
                    });
            }
            if (error == NULL && conn == gUdpConn) {
                ios_udp_receive_loop(conn);
            }
        });
}

static int ios_udp_open(const char *ip, uint16_t port) {
    if (gUdpQueue == nil) {
        gUdpQueue = dispatch_queue_create("app.betaflight.udp", DISPATCH_QUEUE_SERIAL);
    }
    if (gUdpConn != nil) {
        nw_connection_cancel(gUdpConn);
        gUdpConn = nil;
    }

    char portStr[8];
    snprintf(portStr, sizeof(portStr), "%u", (unsigned)port);
    nw_endpoint_t endpoint = nw_endpoint_create_host(ip, portStr);
    nw_parameters_t params =
        nw_parameters_create_secure_udp(NW_PARAMETERS_DISABLE_PROTOCOL, NW_PARAMETERS_DEFAULT_CONFIGURATION);
    nw_connection_t conn = nw_connection_create(endpoint, params);
    gUdpConn = conn;
    nw_connection_set_queue(conn, gUdpQueue);

    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block bool ready = false;
    __block int lastState = 0;
    __block int lastErrno = 0;
    nw_connection_set_state_changed_handler(conn,
        ^(nw_connection_state_t state, nw_error_t error) {
            lastState = (int)state;
            if (error) {
                lastErrno = nw_error_get_error_code(error);
            }
            if (state == nw_connection_state_ready) {
                ready = true;
                dispatch_semaphore_signal(sem);
                ios_udp_receive_loop(conn);
            } else if (state == nw_connection_state_failed || state == nw_connection_state_cancelled) {
                if (!ready) {
                    dispatch_semaphore_signal(sem);
                }
            }
        });
    nw_connection_start(conn);

    long timedOut = dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, 12LL * NSEC_PER_SEC));
    if (ready) {
        return 0;
    }
    nw_connection_cancel(conn);
    if (gUdpConn == conn) {
        gUdpConn = nil;
    }
    int code = lastState * 1000 + (lastErrno % 1000);
    if (code == 0) {
        code = (timedOut != 0) ? 999000 : 997000;
    }
    return code;
}

static void ios_udp_send(const uint8_t *data, size_t len) {
    nw_connection_t conn = gUdpConn;
    if (conn == nil || data == NULL || len == 0) {
        return;
    }
    dispatch_data_t dd = dispatch_data_create(data, len, gUdpQueue, DISPATCH_DATA_DESTRUCTOR_DEFAULT);
    nw_connection_send(conn, dd, NW_CONNECTION_DEFAULT_MESSAGE_CONTEXT, true,
        ^(nw_error_t error) { (void)error; });
}

static void ios_udp_close(void) {
    if (gUdpConn != nil) {
        nw_connection_cancel(gUdpConn);
        gUdpConn = nil;
    }
}

int main(int argc, char * argv[]) {
    // Give Rust our TCP entry points before the app starts.
    rust_register_tcp(ios_tcp_connect, ios_tcp_send, ios_tcp_close);
    rust_register_udp(ios_udp_open, ios_udp_send, ios_udp_close);

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
        triggerLocalNetworkPermission();
    });

    ffi::start_app();
    return 0;
}
