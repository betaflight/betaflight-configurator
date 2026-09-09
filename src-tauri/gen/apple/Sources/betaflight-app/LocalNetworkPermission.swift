import Foundation
import Network
import UIKit
import WebKit

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


// WebKit here does not honour `viewport-fit=cover`: it keeps the layout viewport inside the
// view's safe area even though wry already sizes the webview to the whole window, so the page
// is laid out 78pt short on a notched screen and the strips above and below it are webview
// background no CSS can reach. Cancelling the view controller's safe area frees the layout to
// use the full window; the real insets are handed to the page as `--bf-inset-*` custom
// properties so it can still keep clear of the notch and the home indicator itself.
//
// Exposed as a C symbol so the Rust side can call it once the app has started.

private func firstWebView(in view: UIView) -> WKWebView? {
    if let webView = view as? WKWebView {
        return webView
    }
    for subview in view.subviews {
        if let found = firstWebView(in: subview) {
            return found
        }
    }
    return nil
}

private final class FullScreenWebView: NSObject {
    static let shared = FullScreenWebView()

    private var attempts = 0
    private weak var webView: WKWebView?
    private weak var controller: UIViewController?
    private var observation: NSKeyValueObservation?

    func apply() {
        guard webView == nil else { return }

        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }

        // wry creates the webview after the app starts, so poll briefly rather than assume it
        // is already there.
        guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first,
              let webView = firstWebView(in: window),
              let controller = window.rootViewController
        else {
            retry()
            return
        }

        self.webView = webView
        self.controller = controller

        // Otherwise the scroll view re-applies the insets the cancelled safe area just removed.
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // A document that loads later — a reload, or the dev server's hot refresh — starts with
        // no custom properties set, so seed them at document start as well as pushing now.
        webView.configuration.userContentController.addUserScript(
            WKUserScript(source: script(for: window.safeAreaInsets),
                         injectionTime: .atDocumentStart,
                         forMainFrameOnly: true)
        )

        // Re-push once each navigation commits; KVO keeps wry's own navigation delegate intact.
        observation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] _, _ in
            self?.sync()
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(sync),
            name: UIDevice.orientationDidChangeNotification, object: nil
        )

        sync()
    }

    private func script(for insets: UIEdgeInsets) -> String {
        """
        (function () {
          var s = document.documentElement.style;
          s.setProperty('--bf-inset-top', '\(insets.top)px');
          s.setProperty('--bf-inset-bottom', '\(insets.bottom)px');
          s.setProperty('--bf-inset-left', '\(insets.left)px');
          s.setProperty('--bf-inset-right', '\(insets.right)px');
        })();
        """
    }

    @objc private func sync() {
        guard let webView, let controller, let window = webView.window else { return }

        // The window keeps reporting the true insets; only the controller's view loses them.
        let insets = window.safeAreaInsets
        controller.additionalSafeAreaInsets = UIEdgeInsets(
            top: -insets.top, left: -insets.left,
            bottom: -insets.bottom, right: -insets.right
        )
        webView.evaluateJavaScript(script(for: insets), completionHandler: nil)
    }

    private func retry() {
        attempts += 1
        guard attempts < 40 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.apply()
        }
    }
}

@_cdecl("bf_use_full_screen_webview")
public func bf_use_full_screen_webview() {
    DispatchQueue.main.async {
        FullScreenWebView.shared.apply()
    }
}
