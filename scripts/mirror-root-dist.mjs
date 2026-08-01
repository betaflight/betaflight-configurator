import fs from "node:fs";
import path from "node:path";

const projectDist = path.resolve("dist");
const rootDist = path.resolve("/dist");
const shouldMirrorRootDist = process.cwd() === "/app" || process.env.GIGFPV_MIRROR_ROOT_DIST === "1";

if (!fs.existsSync(path.join(projectDist, "index.html"))) {
    console.error("Build output missing: dist/index.html");
    process.exit(1);
}

if (projectDist === rootDist) {
    process.exit(0);
}

if (!shouldMirrorRootDist) {
    process.exit(0);
}

try {
    fs.rmSync(rootDist, { recursive: true, force: true });
    fs.cpSync(projectDist, rootDist, { recursive: true });
    console.log("Mirrored build output to /dist for absolute-path hosting builders.");
} catch (error) {
    console.warn(`Skipping /dist mirror: ${error.message}`);
}
