import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const bundlesFlag = args.indexOf("--bundles");
const bundles =
  bundlesFlag >= 0
    ? args[bundlesFlag + 1]
    : process.platform === "win32"
      ? "nsis"
      : process.platform === "darwin"
        ? "dmg"
        : null;

if (!bundles) {
  console.error("이 OS의 설치 패키지는 지원하지 않습니다. Windows 또는 macOS에서 빌드하세요.");
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["tauri", "build", "--bundles", bundles],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
