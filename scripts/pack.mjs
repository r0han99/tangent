#!/usr/bin/env node
/**
 * Build the extension and zip dist/ contents for Chrome Web Store upload.
 * Zip root = extension root (not a nested dist/ folder).
 */
import { execSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outName = `offthread-${pkg.version}.zip`;
const outPath = join(root, outName);

console.log("Building…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

if (!existsSync(dist)) {
  console.error("dist/ missing after build");
  process.exit(1);
}

rmSync(outPath, { force: true });

try {
  execSync(`zip -r -q "${outPath}" .`, { cwd: dist, stdio: "inherit" });
} catch {
  console.log("System zip unavailable; packing with Node…");
  await zipDir(dist, outPath);
}

console.log(`Wrote ${outName}`);
console.log("Upload this file in the Chrome Web Store developer console.");

async function zipDir(srcDir, destZip) {
  const files = [];
  walk(srcDir, (abs) => {
    const name = relative(srcDir, abs).split("\\").join("/");
    if (!name) return;
    files.push({ name, abs });
  });

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const f of files) {
    const data = readFileSync(f.abs);
    const compressed = deflateRawSync(data);
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const localFull = Buffer.concat([local, nameBuf, compressed]);
    localParts.push(localFull);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  const out = createWriteStream(destZip);
  for (const p of localParts) out.write(p);
  out.write(centralDir);
  out.write(end);
  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, onFile);
    else onFile(abs);
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}
