import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const USER_AGENT = "youtube-downloader/0.1.0";
const names = ["yt-dlp", "ffmpeg", "ffprobe"];
const checkOnly = process.argv.includes("--check-only");
const force = process.argv.includes("--force");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binariesDir = path.join(root, "src-tauri", "binaries");
const extension = process.platform === "win32" ? ".exe" : "";
const triple = hostTriple();

await main();

async function main() {
  fs.mkdirSync(binariesDir, { recursive: true });

  if (!checkOnly) {
    await prepareSidecars();
  }

  const missing = names
    .map((name) => sidecarPath(name))
    .filter((file) => !fs.existsSync(file));

  if (missing.length > 0) {
    console.error("설치본에 넣을 sidecar 바이너리가 없습니다:");
    for (const file of missing) {
      console.error(`  - ${path.relative(root, file)}`);
    }
    console.error(
      `\n\`npm run prepare:sidecars\` 로 ${names
        .map((name) => path.basename(sidecarPath(name)))
        .join(", ")} 를 준비한 뒤 다시 빌드하세요.`,
    );
    process.exit(1);
  }

  if (process.platform !== "win32") {
    for (const name of names) {
      fs.chmodSync(sidecarPath(name), 0o755);
    }
  }

  console.log(`sidecar 준비 완료 (${triple})`);
}

async function prepareSidecars() {
  const needed = names.filter((name) => force || !fs.existsSync(sidecarPath(name)));
  if (needed.length === 0) {
    return;
  }

  await prepareYtdlp(needed.includes("yt-dlp"));
  await prepareFfmpeg(needed.includes("ffmpeg") || needed.includes("ffprobe"));
}

async function prepareYtdlp(needed) {
  if (!needed) {
    return;
  }

  const dest = sidecarPath("yt-dlp");
  const url = ytdlpUrl();
  console.log(`yt-dlp 다운로드 중: ${url}`);
  await downloadToFile(url, dest);
  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
  }
}

async function prepareFfmpeg(needed) {
  if (!needed) {
    return;
  }

  const source = ffmpegSource();
  if (!source) {
    copyFromPathOrThrow("ffmpeg");
    copyFromPathOrThrow("ffprobe");
    return;
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "youtube-downloader-ffmpeg-"));
  try {
    if (source.kind === "zip") {
      const zipPath = path.join(temp, "ffmpeg.zip");
      await downloadFirst(source.urls, zipPath);
      extractZip(zipPath, temp);
      copyFoundBinary(temp, "ffmpeg", sidecarPath("ffmpeg"));
      copyFoundBinary(temp, "ffprobe", sidecarPath("ffprobe"));
      return;
    }

    for (const name of ["ffmpeg", "ffprobe"]) {
      const zipPath = path.join(temp, `${name}.zip`);
      await downloadFirst(source[name], zipPath);
      const extracted = path.join(temp, name);
      fs.mkdirSync(extracted, { recursive: true });
      extractZip(zipPath, extracted);
      copyFoundBinary(extracted, name, sidecarPath(name));
    }
  } catch (error) {
    console.warn(`ffmpeg 다운로드에 실패해 PATH 복사를 시도합니다: ${error.message}`);
    copyFromPathOrThrow("ffmpeg");
    copyFromPathOrThrow("ffprobe");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function ytdlpUrl() {
  if (process.platform === "win32") {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  }
  if (process.platform === "darwin") {
    return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";
  }
  return "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
}

function ffmpegSource() {
  if (triple === "x86_64-pc-windows-msvc") {
    return {
      kind: "zip",
      urls: [
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
      ],
    };
  }
  if (triple === "aarch64-apple-darwin") {
    return {
      kind: "zip-each",
      ffmpeg: martinRiedlUrls("macos", "arm64", "ffmpeg"),
      ffprobe: martinRiedlUrls("macos", "arm64", "ffprobe"),
    };
  }
  if (triple === "x86_64-apple-darwin") {
    return {
      kind: "zip-each",
      ffmpeg: martinRiedlUrls("macos", "amd64", "ffmpeg"),
      ffprobe: martinRiedlUrls("macos", "amd64", "ffprobe"),
    };
  }
  return null;
}

function martinRiedlUrls(os, arch, name) {
  return ["release", "snapshot"].map(
    (channel) =>
      `https://ffmpeg.martin-riedl.de/redirect/latest/${os}/${arch}/${channel}/${name}.zip`,
  );
}

function copyFromPathOrThrow(name) {
  const dest = sidecarPath(name);
  if (fs.existsSync(dest) && !force) {
    return;
  }

  const found = which(name);
  if (!found) {
    throw new Error(`${name} 바이너리를 다운로드하거나 PATH에서 찾지 못했습니다.`);
  }

  console.warn(`PATH의 ${found} 를 sidecar로 복사합니다. 배포용 정적 빌드가 아닐 수 있습니다.`);
  fs.copyFileSync(found, dest);
  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
  }
}

function copyFoundBinary(dir, name, dest) {
  const found = findBinary(dir, name);
  if (!found) {
    throw new Error(`${name} 실행 파일을 압축에서 찾지 못했습니다.`);
  }
  fs.copyFileSync(found, dest);
  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
  }
}

function findBinary(dir, name) {
  const wanted = new Set([name, `${name}.exe`]);
  return walkFiles(dir).find((file) => wanted.has(path.basename(file)));
}

function walkFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destDir)} -Force`,
      { stdio: "inherit" },
    );
    return;
  }
  execFileSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function downloadFirst(urls, dest) {
  let lastError;
  for (const url of urls) {
    try {
      console.log(`다운로드 중: ${url}`);
      await downloadToFile(url, dest);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`실패: ${error.message}`);
    }
  }
  throw lastError ?? new Error("다운로드 URL이 없습니다.");
}

async function downloadToFile(url, dest) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`${url} 다운로드 실패 (${response.status})`);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(dest));
  const size = fs.statSync(dest).size;
  if (size < 1_000) {
    throw new Error(`${url} 다운로드 결과가 너무 작습니다 (${size} bytes)`);
  }
}

function sidecarPath(name) {
  return path.join(binariesDir, `${name}-${triple}${extension}`);
}

function which(name) {
  try {
    const output = execSync(process.platform === "win32" ? `where ${name}` : `which ${name}`, {
      encoding: "utf8",
    });
    return output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function hostTriple() {
  try {
    const printed = execFileSync("rustc", ["--print", "host-tuple"], rustcOptions()).trim();
    if (printed) {
      return printed;
    }
  } catch {
    // rustc가 없거나 1.84 미만이면 Node 정보로 맞춥니다.
  }

  try {
    const verbose = execFileSync("rustc", ["-Vv"], rustcOptions());
    const match = verbose.match(/^host:\s+(\S+)/m);
    if (match) {
      return match[1];
    }
  } catch {
    // PATH에 rustc가 없을 수 있습니다.
  }

  const fallback = nodeHostTriple();
  if (!fallback) {
    throw new Error("rustc host triple을 확인하지 못했습니다.");
  }
  return fallback;
}

function rustcOptions() {
  return { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
}

function nodeHostTriple() {
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "x86_64-unknown-linux-gnu";
  }
  return null;
}
