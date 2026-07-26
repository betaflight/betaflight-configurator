import Foundation
import Network

// iOS gates access to local-network addresses (where an ELRS Wi-Fi module lives) behind a
// per-app Local Network permission. Plain BSD/POSIX sockets — which the Rust TCP transport
// uses — do not engage that privacy machinery, so the OS never registers the app under
// Settings > Privacy & Security > Local Network, never shows the prompt, and silently blocks
// the connection. Starting an NWBrowser via Network.framework does engage it: it registers the
// app, triggers the prompt, and once granted opens the app-wide gate so the subsequent raw
// socket connect is allowed. The declared Bonjour type must also be listed in NSBonjourServices.
//
// Exposed as a C symbol so the Rust `tcp_connect` command can trigger it on iOS.

private final class LocalNetworkTrigger {
    static let shared = LocalNetworkTrigger()
    private var browser: NWBrowser?

    func activate() {
        // Starting the browser once is enough to register the app and raise the prompt; keep the
        // reference alive so the system can evaluate it rather than tearing it down immediately.
        guard browser == nil else { return }
        let params = NWParameters()
        params.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: "_betaflight._tcp", domain: nil), using: params)
        browser.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled:
                self?.browser = nil
            default:
                break
            }
        }
        self.browser = browser
        browser.start(queue: .main)
    }
}

@_cdecl("bf_trigger_local_network_permission")
public func bf_trigger_local_network_permission() {
    DispatchQueue.main.async {
        LocalNetworkTrigger.shared.activate()
    }
}
