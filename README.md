# YouTube Downloader

Windows와 macOS에서 설치해 쓰는 개인용 YouTube 다운로드 앱입니다.

## 설치

각 OS에서 해당 설치 파일을 받아 실행하세요.

| 플랫폼 | 설치 파일 | 방법 |
|--------|-----------|------|
| Windows | NSIS 설치 프로그램 (`.exe`) | 실행 후 안내에 따라 설치 |
| macOS 12+ | 디스크 이미지 (`.dmg`) | 앱을 `응용 프로그램`으로 끌어다 놓기 |

설치본에는 `yt-dlp`, `ffmpeg`, `ffprobe`가 포함됩니다. 별도의 터미널 설치는 필요 없습니다.

macOS에서 “확인되지 않은 개발자” 경고가 나오면 Finder에서 앱을 우클릭한 뒤 **열기**를 선택하세요.

## 개발

필요 도구:

- Node.js 22+
- Rust (`rustup`)
- [Tauri 2 선행 조건](https://v2.tauri.app/start/prerequisites/)
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: WebView2 (보통 이미 설치되어 있음)

개발 실행은 PATH의 `yt-dlp` / `ffmpeg`를 써도 됩니다.

```bash
npm install
brew install yt-dlp ffmpeg   # macOS 개발용, 선택
npm run tauri dev
```

## 설치본 빌드

빌드는 대상 OS에서 실행해야 합니다. Windows 설치본은 Windows에서, macOS 설치본은 Mac에서 만듭니다.

```bash
npm install
npm run prepare:sidecars
npm run build:desktop
```

또는 OS를 지정합니다.

```bash
npm run build:windows   # NSIS .exe
npm run build:macos     # .dmg
```

결과물 위치:

- Windows: `src-tauri/target/release/bundle/nsis/`
- macOS: `src-tauri/target/release/bundle/dmg/`

`prepare:sidecars`는 현재 머신용 `yt-dlp` / `ffmpeg` / `ffprobe`를 `src-tauri/binaries/`에 받습니다. 이미 파일이 있으면 다시 받지 않습니다. 강제로 다시 받으려면 `node scripts/prepare-sidecars.mjs --force`를 실행하세요.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
