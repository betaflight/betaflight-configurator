#!/usr/bin/env node
/*
 * Generate the static downloads index for downloads.betaflight.com.
 *
 * Inputs:
 *   --manifest <path>     JSON manifest of today's nightly artefact URLs (R2)
 *   --releases <path>     JSON file with the GitHub releases payload (output of `gh api releases`)
 *   --output <dir>        Output directory; index.html, logo.svg and favicon.png are written here
 *   --master-url <url>    URL to the master branch web app deploy
 *   --release-url <url>   URL to the release web app (default: https://app.betaflight.com)
 *
 * The manifest schema is documented in the workflow that calls this script.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, "");
        args[key] = argv[i + 1];
    }
    return args;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = Number(bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
        return "";
    }
    return date.toISOString().slice(0, 10);
}

function downloadCard({ label, sub, url }) {
    const subLine = sub ? `<div class="sub">${escapeHtml(sub)}</div>` : "";
    return `
                <div class="card">
                    <div class="label">${escapeHtml(label)}</div>
                    ${subLine}
                    <a class="download-btn" href="${escapeHtml(url)}">Download</a>
                </div>`;
}

function renderWebAppSection(masterUrl, releaseUrl) {
    return `
            <section>
                <h2>Web app</h2>
                <div class="card-grid">
                    ${downloadCard({
                        label: "Latest release",
                        sub: "Stable, runs in your browser",
                        url: releaseUrl,
                    })}
                    ${downloadCard({
                        label: "Master (development)",
                        sub: "Latest commit on master",
                        url: masterUrl,
                    })}
                </div>
            </section>`;
}

function renderNightlySection(nightly) {
    if (!nightly) {
        return `
            <section>
                <h2>Nightly build</h2>
                <p class="empty">Nightly artefacts unavailable.</p>
            </section>`;
    }

    const desktop = nightly.desktop || {};
    const platforms = [
        { key: "windows", title: "Windows" },
        { key: "macos", title: "macOS" },
        { key: "linux", title: "Linux" },
    ];

    const desktopHtml = platforms
        .filter((p) => Array.isArray(desktop[p.key]) && desktop[p.key].length > 0)
        .map((p) => {
            const cards = desktop[p.key]
                .map((entry) =>
                    downloadCard({
                        label: entry.label,
                        sub: formatBytes(entry.size),
                        url: entry.url,
                    }),
                )
                .join("");
            return `
                <h3>${escapeHtml(p.title)}</h3>
                <div class="card-grid">${cards}
                </div>`;
        })
        .join("");

    const androidHtml = nightly.android
        ? `
                <h3>Android</h3>
                <div class="card-grid">${downloadCard({
                    label: nightly.android.label || "Android APK",
                    sub: formatBytes(nightly.android.size),
                    url: nightly.android.url,
                })}
                </div>`
        : "";

    const commitShort = nightly.commit ? nightly.commit.slice(0, 8) : "";
    const metaParts = [];
    if (nightly.date) {
        metaParts.push(`Built ${escapeHtml(nightly.date)}`);
    }
    if (commitShort) {
        metaParts.push(
            `commit <a href="https://github.com/betaflight/betaflight-configurator/commit/${escapeHtml(nightly.commit)}">${escapeHtml(commitShort)}</a>`,
        );
    }
    if (nightly.version) {
        metaParts.push(`version ${escapeHtml(nightly.version)}`);
    }
    const meta = metaParts.length ? `<p class="meta">${metaParts.join(" &middot; ")}</p>` : "";

    return `
            <section>
                <h2>Nightly build</h2>
                ${meta}
                ${desktopHtml}
                ${androidHtml}
            </section>`;
}

function renderLatestStableSection(latest) {
    if (!latest) {
        return `
            <section>
                <h2>Latest stable release</h2>
                <p class="empty">No stable releases found.</p>
            </section>`;
    }

    const assets = (latest.assets || []).filter((a) => !a.name.endsWith(".sha256"));
    const cards = assets
        .map((asset) =>
            downloadCard({
                label: asset.name,
                sub: formatBytes(asset.size),
                url: asset.browser_download_url,
            }),
        )
        .join("");

    const meta = `Released ${escapeHtml(formatDate(latest.published_at))} &middot; tag <a href="${escapeHtml(latest.html_url)}">${escapeHtml(latest.tag_name)}</a>`;

    return `
            <section>
                <h2>Latest stable release</h2>
                <p class="meta">${meta}</p>
                <div class="card-grid">${cards || `<p class="empty">No assets attached.</p>`}
                </div>
            </section>`;
}

function renderReleaseHistorySection(releases) {
    if (!releases?.length) {
        return `
            <section>
                <h2>All releases</h2>
                <p class="empty">No releases found.</p>
            </section>`;
    }

    const items = releases
        .map((release) => {
            const assets = (release.assets || []).filter((a) => !a.name.endsWith(".sha256"));
            const assetItems = assets.length
                ? assets
                      .map(
                          (asset) =>
                              `<li><a href="${escapeHtml(asset.browser_download_url)}">${escapeHtml(asset.name)}</a> <span class="sub">${formatBytes(asset.size)}</span></li>`,
                      )
                      .join("")
                : `<li class="empty">No assets attached.</li>`;
            const tag = escapeHtml(release.tag_name);
            const meta = [formatDate(release.published_at), release.prerelease ? "pre-release" : null]
                .filter(Boolean)
                .map((s) => escapeHtml(s))
                .join(" &middot; ");
            return `
                <details>
                    <summary>
                        <a href="${escapeHtml(release.html_url)}">${tag}</a>
                        <span class="release-meta">${meta}</span>
                    </summary>
                    <ul>${assetItems}</ul>
                </details>`;
        })
        .join("");

    return `
            <section>
                <h2>All releases</h2>
                ${items}
            </section>`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.output) {
        throw new Error("--output is required");
    }
    const outputDir = resolve(args.output);
    mkdirSync(outputDir, { recursive: true });

    const manifest = args.manifest ? JSON.parse(readFileSync(args.manifest, "utf8")) : { nightly: null };
    const releases = args.releases ? JSON.parse(readFileSync(args.releases, "utf8")) : [];

    const stableReleases = releases.filter((r) => !r.draft && !r.prerelease);
    const latestStable = stableReleases[0] || null;

    const masterUrl = args["master-url"] || "https://master.betaflight-app.pages.dev";
    const releaseUrl = args["release-url"] || "https://app.betaflight.com";

    const sections = [
        renderWebAppSection(masterUrl, releaseUrl),
        renderNightlySection(manifest.nightly),
        renderLatestStableSection(latestStable),
        renderReleaseHistorySection(releases),
    ].join("\n");

    const templatePath = join(__dirname, "templates", "downloads-index.html");
    const template = readFileSync(templatePath, "utf8");
    const generatedAt = manifest.generatedAt || new Date().toISOString();
    const html = template
        .replace("<!--SECTIONS-->", sections)
        .replace("<!--GENERATED_AT-->", escapeHtml(generatedAt));

    writeFileSync(join(outputDir, "index.html"), html);

    const repoRoot = resolve(__dirname, "..");
    copyFileSync(join(repoRoot, "src/images/dark-wide-2-compact.svg"), join(outputDir, "logo.svg"));
    copyFileSync(join(repoRoot, "src-tauri/icons/bf_icon_128.png"), join(outputDir, "favicon.png"));

    console.log(`Wrote ${join(outputDir, "index.html")}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
