#!/usr/bin/env node
/*
 * Generate the static downloads index for downloads.betaflight.com.
 *
 * Inputs:
 *   --manifest <path>     JSON manifest of today's nightly artefact URLs (R2)
 *   --releases <path>     JSON file with the GitHub releases payload (output of `gh api releases`)
 *   --output <dir>        Output directory; index.html and favicon.png are written here
 *   --master-url <url>    URL to the master branch web app deploy
 *   --release-url <url>   URL to the release web app (default: https://app.betaflight.com)
 *
 * The manifest schema is documented in the workflow that calls this script.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ALLOWED_FLAGS = new Set(["manifest", "releases", "output", "master-url", "release-url"]);

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const flag = argv[i];
        if (!flag?.startsWith("--")) {
            throw new Error(`Expected a CLI flag starting with --, got: ${flag ?? "<missing>"}`);
        }
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`Missing value for CLI flag: ${flag}`);
        }
        const key = flag.slice(2);
        if (!ALLOWED_FLAGS.has(key)) {
            throw new Error(`Unknown CLI flag: ${flag}`);
        }
        args[key] = value;
    }
    return args;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
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

function filenameFrom(entry) {
    if (entry.filename) {
        return entry.filename;
    }
    try {
        return basename(new URL(entry.url).pathname);
    } catch {
        return entry.url;
    }
}

function fileListItem(entry) {
    const filename = filenameFrom(entry);
    const size = formatBytes(entry.size);
    const sizeHtml = size ? `<span class="size">${escapeHtml(size)}</span>` : "";
    return `<li><a href="${escapeHtml(entry.url)}">${escapeHtml(filename)}</a> ${sizeHtml}</li>`;
}

function fileList(entries) {
    if (!entries.length) {
        return `<p class="empty">No files available.</p>`;
    }
    return `<ul class="file-list">${entries.map(fileListItem).join("")}</ul>`;
}

// The per-release web app lives at https://<major>-<minor>.app.betaflight.com
// (CalVer, e.g. 2026.6.0-RC1 -> https://2026-6.app.betaflight.com). That scheme
// begins with 2026.6; older releases have no such subdomain.
const RELEASE_WEBAPP_MIN = { major: 2026, minor: 6 };

// Parse a CalVer/SemVer tag ("2026.6.0", "2026.6.0-RC1", "v2026.6.0") into its
// numeric parts plus an optional pre-release string.
function parseVersion(tag) {
    // Start-anchored with a bounded pre-release class to keep matching linear.
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(tag || "");
    if (!match) {
        return null;
    }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] || null };
}

// SemVer pre-release comparison, natural within each dot identifier so RC10 > RC2.
function comparePre(a, b) {
    const chunks = (s) => s.match(/\d+|\D+/g) || [];
    const ca = chunks(a);
    const cb = chunks(b);
    for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
        const x = ca[i];
        const y = cb[i];
        if (x === undefined) {
            return -1;
        }
        if (y === undefined) {
            return 1;
        }
        const xn = /^\d+$/.test(x);
        const yn = /^\d+$/.test(y);
        if (xn && yn) {
            const d = Number(x) - Number(y);
            if (d !== 0) {
                return d;
            }
        } else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}

// Returns >0 when a is the higher version. A final release outranks a
// pre-release of the same major.minor.patch (SemVer precedence).
function compareVersions(a, b) {
    for (const key of ["major", "minor", "patch"]) {
        if (a[key] !== b[key]) {
            return a[key] - b[key];
        }
    }
    if (!a.pre && b.pre) {
        return 1;
    }
    if (a.pre && !b.pre) {
        return -1;
    }
    if (!a.pre && !b.pre) {
        return 0;
    }
    return comparePre(a.pre, b.pre);
}

// Highest-versioned release (CalVer/SemVer), regardless of publish order.
function highestRelease(releases) {
    let best = null;
    for (const release of releases) {
        const version = parseVersion(release.tag_name);
        if (!version) {
            continue;
        }
        if (!best || compareVersions(version, best.version) > 0) {
            best = { release, version };
        }
    }
    return best;
}

// Which web app the hero should point at. A final release is what
// app.betaflight.com already serves, so link there; a pre-release (e.g. an RC)
// gets its own versioned subdomain. Pre-releases predating the versioned scheme
// have no subdomain, so no hero.
function heroWebApp(top, releaseUrl) {
    if (!top) {
        return null;
    }
    if (!top.release.prerelease) {
        return { url: releaseUrl };
    }
    const { major, minor } = top.version;
    if (major * 1000 + minor < RELEASE_WEBAPP_MIN.major * 1000 + RELEASE_WEBAPP_MIN.minor) {
        return null;
    }
    return { url: `https://${major}-${minor}.app.betaflight.com` };
}

function renderReleaseWebAppSection(top, hero) {
    if (!top || !hero) {
        return "";
    }
    const tag = escapeHtml(top.release.tag_name);
    const host = escapeHtml(hero.url.replace(/^https:\/\//, ""));
    return `
            <section class="release-hero">
                <h2>Betaflight App &mdash; ${tag}</h2>
                <p><a class="hero-link" href="${escapeHtml(hero.url)}">Open the web app for this release &rarr;</a></p>
                <p class="meta">Runs in your browser at ${host}</p>
            </section>`;
}

function renderWebAppSection(masterUrl, releaseUrl) {
    return `
            <section>
                <h2>Web app</h2>
                <ul class="link-list">
                    <li><a href="${escapeHtml(releaseUrl)}">Latest release</a> — stable, runs in your browser</li>
                    <li><a href="${escapeHtml(masterUrl)}">Master (development)</a> — latest commit on master</li>
                </ul>
            </section>`;
}

function renderNightlySection(nightly) {
    const desktop = nightly?.desktop || {};
    const platforms = [
        { key: "windows", title: "Windows" },
        { key: "macos", title: "macOS" },
        { key: "linux", title: "Linux" },
    ];
    const hasDesktop = platforms.some((p) => Array.isArray(desktop[p.key]) && desktop[p.key].length > 0);
    const hasAndroid = Boolean(nightly?.android);

    if (!nightly || (!hasDesktop && !hasAndroid)) {
        return `
            <section>
                <h2>Nightly build</h2>
                <p class="empty">Nightly artefacts unavailable.</p>
            </section>`;
    }

    const platformBlocks = platforms
        .filter((p) => Array.isArray(desktop[p.key]) && desktop[p.key].length > 0)
        .map((p) => `<h3>${escapeHtml(p.title)}</h3>${fileList(desktop[p.key])}`)
        .join("");

    const androidBlock = hasAndroid ? `<h3>Android</h3>${fileList([nightly.android])}` : "";

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
                ${platformBlocks}
                ${androidBlock}
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

    const assets = (latest.assets || [])
        .filter((a) => !a.name.endsWith(".sha256"))
        .map((a) => ({ filename: a.name, url: a.browser_download_url, size: a.size }));

    const meta = `Released ${escapeHtml(formatDate(latest.published_at))} &middot; tag <a href="${escapeHtml(latest.html_url)}">${escapeHtml(latest.tag_name)}</a>`;

    return `
            <section>
                <h2>Latest stable release</h2>
                <p class="meta">${meta}</p>
                ${fileList(assets)}
            </section>`;
}

const RECENT_RELEASE_YEARS = 4;
const PRERELEASE_VISIBILITY_MONTHS = 9;
const RELEASES_INDEX_URL = "https://github.com/betaflight/betaflight-configurator/releases";

function renderReleaseHistorySection(releases) {
    if (!releases?.length) {
        return `
            <section>
                <h2>Recent releases</h2>
                <p class="empty">No releases found.</p>
            </section>`;
    }

    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - RECENT_RELEASE_YEARS);
    const prereleaseCutoff = new Date();
    prereleaseCutoff.setMonth(prereleaseCutoff.getMonth() - PRERELEASE_VISIBILITY_MONTHS);
    const recent = releases
        .map((r) => ({ release: r, assets: (r.assets || []).filter((a) => !a.name.endsWith(".sha256")) }))
        .filter(({ release, assets }) => {
            if (!release.published_at) {
                return false;
            }
            if (!assets.length) {
                return false;
            }
            const published = new Date(release.published_at);
            if (published < cutoff) {
                return false;
            }
            if (release.prerelease && published < prereleaseCutoff) {
                return false;
            }
            return true;
        });
    const olderCount = releases.length - recent.length;
    const olderNote = olderCount
        ? `<p class="meta">Earlier releases are available on <a href="${RELEASES_INDEX_URL}">GitHub</a>.</p>`
        : "";

    if (!recent.length) {
        return `
            <section>
                <h2>Recent releases</h2>
                <p class="empty">No releases with downloadable assets in the last ${RECENT_RELEASE_YEARS} years.</p>
                ${olderNote}
            </section>`;
    }

    const items = recent
        .map(({ release, assets }) => {
            const assetItems = assets
                .map(
                    (asset) =>
                        `<li><a href="${escapeHtml(asset.browser_download_url)}">${escapeHtml(asset.name)}</a> <span class="size">${formatBytes(asset.size)}</span></li>`,
                )
                .join("");
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
                <h2>Recent releases</h2>
                ${items}
                ${olderNote}
            </section>`;
}

try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.output) {
        throw new Error("--output is required");
    }
    const outputDir = resolve(args.output);
    mkdirSync(outputDir, { recursive: true });

    const manifest = args.manifest ? JSON.parse(readFileSync(args.manifest, "utf8")) : { nightly: null };
    const releases = args.releases ? JSON.parse(readFileSync(args.releases, "utf8")) : [];
    if (!Array.isArray(releases)) {
        throw new Error(`Releases payload at ${args.releases} is not an array`);
    }

    const publicReleases = releases.filter((r) => !r.draft);
    const latestStable = publicReleases.find((r) => !r.prerelease) || null;

    const masterUrl = args["master-url"] || "https://master.betaflight-app.pages.dev";
    const releaseUrl = args["release-url"] || "https://app.betaflight.com";

    // Feature the highest-versioned release at the top: final releases link to
    // app.betaflight.com, pre-releases to their own versioned subdomain.
    const topRelease = highestRelease(publicReleases);
    const hero = heroWebApp(topRelease, releaseUrl);

    const sections = [
        renderReleaseWebAppSection(topRelease, hero),
        renderWebAppSection(masterUrl, releaseUrl),
        renderNightlySection(manifest.nightly),
        renderLatestStableSection(latestStable),
        renderReleaseHistorySection(publicReleases),
    ].join("\n");

    const templatePath = join(__dirname, "templates", "downloads-index.html");
    const template = readFileSync(templatePath, "utf8");
    const generatedAt = manifest.generatedAt || new Date().toISOString();
    const html = template
        .replace("<!--SECTIONS-->", sections)
        .replace("<!--GENERATED_AT-->", escapeHtml(generatedAt));

    writeFileSync(join(outputDir, "index.html"), html);

    const repoRoot = resolve(__dirname, "..");
    copyFileSync(join(repoRoot, "src-tauri/icons/bf_icon_128.png"), join(outputDir, "favicon.png"));

    console.log(`Wrote ${join(outputDir, "index.html")}`);
} catch (error) {
    console.error(error);
    process.exit(1);
}
