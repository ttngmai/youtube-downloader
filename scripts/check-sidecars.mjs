import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binariesDir = path.join(root, "src-tauri", "binaries");
const extension = process.platform === "win32" ? ".exe" : "";
const names = ["yt-dlp", "ffmpeg", "ffprobe"];

const triple = hostTriple();
const missing = [];

for (const name of names) {
  const sidecar = path.join(binariesDir, `${name}-${triple}${extension}`);
  if (fs.existsSync(sidecar)) {
    continue;
  }

  const fallback = path.join(binariesDir, `${name}${extension}`);
  if (fs.existsSync(fallback)) {
    linkOrCopy(fallback, sidecar);
    continue;
  }

  missing.push(path.relative(root, sidecar));
}

if (missing.length > 0) {
  console.error("설치본에 넣을 sidecar 바이너리가 없습니다:");
  for (const file of missing) {
    console.error(`  - ${file}`);
  }
  console.error(
    `\nsrc-tauri/binaries 에 ${names.map((name) => `${name}-${triple}${extension}`).join(", ")} 를 준비한 뒤 다시 빌드하세요.`,
  );
  process.exit(1);
}

console.log(`sidecar 준비 완료 (${triple})`);

function hostTriple() {
  try {
    const printed = execSync("rustc --print host-tuple", {
      encoding: "utf8",
    }).trim();
    if (printed) {
      return printed;
    }
  } catch {
    // rustc 1.84 미만은 host-tuple을 지원하지 않습니다.
  }

  const verbose = execSync("rustc -Vv", { encoding: "utf8" });
  const match = verbose.match(/^host:\s+(\S+)/m);
  if (!match) {
    throw new Error("rustc host triple을 확인하지 못했습니다.");
  }
  return match[1];
}

function linkOrCopy(from, to) {
  try {
    fs.linkSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
  }
}
