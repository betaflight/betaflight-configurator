export  function checkBrowserCompatibility() {
    const compatible = "serial" in navigator;

    if (!compatible) {
        const errorMessage = "Betaflight app requires Chrome, Chromium, Edge or Vivaldi browser.";
        const newDiv = document.createElement("div");

        $('body')
        .empty()
        .css({
            "height": "100%",
            "display": "grid",
            "background-image": "url(../images/osd-bg-1.jpg",
            "background-size": "cover",
            "background-repeat": "no-repeat",
        })
        .append(newDiv);

        $('div')
        .append(errorMessage)
        .css({
            "font-size": "16px",
            "background-color": "var(--surface-200)",
            "color": "var(--text)",
            "padding": "1rem",
            "margin": "auto",
            "border-radius": "0.75rem",
            "border": "2px solid var(--surface-500)",
        });

        throw new Error("No compatible browser found.");
    }
}
