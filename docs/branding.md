# GOYO Branding Guide

GOYO의 MVP 브랜딩 자산은 `public/branding` 아래에서 관리한다. 앱 설치, 홈 화면 아이콘, 스플래시, 문서용 로고를 분리해 두어 정식 브랜드 자산으로 교체하기 쉽도록 한다.

## Asset Structure

```text
public/branding/
  app-icon/
    icon-192.png
    icon-512.png
    maskable-icon-512.png
  logo/
    goyo-header-logo.svg
    goyo-wordmark.svg
  splash/
    splash-logo.svg
```

## Logo Rules

### Header Logo

- File: `public/branding/logo/goyo-header-logo.svg`
- Usage: 앱 내부 상단 로고 또는 작은 브랜드 표시
- Recommended visual size: 80-120px wide
- Background: white or very light neutral only
- Minimum clear space: logo height의 25% 이상

### Splash Logo

- File: `public/branding/splash/splash-logo.svg`
- Usage: 앱 시작 스플래시 중앙 로고
- Recommended visual size: 120-160px wide on mobile
- Background: `#ffffff`
- Animation: minimal fade only

### App Icon Logo

- Files:
  - `public/branding/app-icon/icon-192.png`
  - `public/branding/app-icon/icon-512.png`
  - `public/branding/app-icon/maskable-icon-512.png`
- Usage: PWA manifest, Android install icon, iOS home screen icon
- Keep the main GOYO mark centered.
- Maskable icon must include enough safe padding so the mark is not clipped by Android adaptive icon masks.

## Icon Rules

- `icon-192.png`: required for Android install prompts and small launcher contexts.
- `icon-512.png`: required for high-resolution app install surfaces.
- `maskable-icon-512.png`: required for adaptive Android home screen icons.
- Manifest paths must point to existing files and must not return 404.
- Current icons are temporary GOYO text placeholders. Replace them with final artwork using the same filenames to avoid code changes.

## Splash Rules

- App-level splash uses a white full-screen layer with the centered GOYO splash logo.
- Splash should be short and quiet; avoid loading spinners, gradients, or marketing copy.
- Current implementation shows once per browser session using `sessionStorage`.
- Native PWA splash behavior is still controlled by manifest `background_color`, `theme_color`, and app icon.

## Color Rules

- Primary app text: `#1D1D1F`
- App background and splash background: `#ffffff`
- Installed-app theme color: `#ffffff`
- Avoid decorative gradients or high-saturation brand treatments in MVP.

## Replacement Checklist

1. Replace PNG files in `public/branding/app-icon` with final app icons.
2. Replace SVG files in `public/branding/logo` and `public/branding/splash` if the wordmark changes.
3. Keep filenames and manifest paths unchanged unless a migration is intentional.
4. Run `npm run build`.
5. Verify `/manifest.webmanifest` and all icon paths return `200`.
