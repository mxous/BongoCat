# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BongoCat is a cross-platform desktop app (Windows, macOS, Linux/X11) that displays an interactive Live2D cat mascot responding to keyboard, mouse, and gamepad input. Built with Tauri v2 (Rust backend) and Vue 3 (TypeScript frontend).

## Build & Development Commands

```bash
# Install dependencies (must use pnpm)
pnpm install

# Development - starts Vite dev server + Tauri window
pnpm tauri dev

# Frontend only dev server (port 1420)
pnpm dev

# Production build (frontend + Tauri bundle)
pnpm tauri build

# Lint (ESLint with auto-fix on src/)
pnpm lint
```

There is no test suite in this project.

## Architecture

### Two-Process Model (Tauri v2)

**Rust backend** (`src-tauri/src/`) handles native OS integration:

- `lib.rs` — App entry point, registers all Tauri plugins and commands
- `core/device.rs` — Cross-platform keyboard/mouse input via `rdev` crate; emits `"device-changed"` events to the frontend
- External `raw-mouse-plugin` (`../raw-mouse-plugin`) — Windows raw input (WM_INPUT) for mouse tracking; supports relative (delta) and absolute (screen position) modes. `lib.rs` has thin command wrappers that delegate to the plugin.
- `core/gamepad.rs` — Gamepad input via `gilrs` crate; emits `"gamepad-changed"` events
- `plugins/window/` — Custom Tauri plugin for window management (show/hide/always-on-top); macOS uses NSPanel for floating panel behavior
- `core/setup/` — Platform-specific initialization (macOS NSPanel vs common window setup)

**Vue 3 frontend** (`src/`) handles UI and rendering:

- Two windows configured in `tauri.conf.json`: `"main"` (transparent, always-on-top cat overlay) and `"preference"` (settings UI)
- Hash-based routing: `/` → main cat display, `/preference` → settings

### Data Flow: Input → Animation

1. Rust captures OS input events (keyboard, mouse, gamepad)
2. Events emitted via Tauri event system (`"device-changed"`, `"gamepad-changed"`)
3. `useDevice.ts` composable listens and updates Pinia stores
4. `useModel.ts` composable maps input state to Live2D parameters (ParamMouseX/Y, etc.)
5. `live2d.ts` utility drives pixi-live2d-display rendering on a PIXI.js canvas

### State Management

Pinia stores with Tauri persistence (`@tauri-store/pinia`):

- `cat.ts` — Cat window behavior (scale, opacity, passThrough, alwaysOnTop, rumble, mouseMode, hideOnHover, autoReleaseDelay)
- `model.ts` — Current Live2D model, available models, pressed keys, motions/expressions
- `general.ts` — App settings (autostart, theme, language, update preferences)
- `shortcut.ts` — Keyboard shortcut bindings

### Key Composables

- `useDevice.ts` — Bridges Tauri device events to store updates; handles auto-release delay for key animations; manages mouse tracking modes (relative: accumulates raw deltas with rumble/boundary logic + rAF throttling; absolute: polls `get_mouse_position` at ~60fps and normalizes screen coords to virtual 0-4000/0-2000 space)
- `useModel.ts` — Live2D model lifecycle (load, resize, animate); maps device input to model parameters
- `useGamepad.ts` — Gamepad stick axis tracking and button mapping

### Custom Tauri Plugin

`src-tauri/src/plugins/window/` is a workspace-local Tauri plugin providing cross-platform window commands. On macOS it wraps `tauri-nspanel` for NSPanel behavior; on other platforms it uses standard Tauri window APIs.

## Conventions

- **Commits**: Conventional commits enforced via commitlint (`feat:`, `fix:`, etc.)
- **Pre-commit**: lint-staged runs ESLint on all staged files
- **ESLint**: Uses `@antfu/eslint-config` with 1tbs brace style, alphabetical import ordering, and `unused-imports/no-unused-imports: error`
- **Styling**: UnoCSS (atomic CSS) with Ant Design Vue components
- **i18n**: Four locales — `zh-CN`, `en-US`, `vi-VN`, `pt-BR` (files in `src/locales/`)
- **Path alias**: `@/*` maps to `src/*`
- **Rust edition**: 2024
- **Package manager**: pnpm only (enforced via preinstall script)

## Platform-Specific Notes

- **Windows**: Uses `raw-mouse-plugin` for mouse tracking (relative/absolute modes via raw input API); `rdev` is used for keyboard and mouse button events
- **macOS**: Uses NSPanel via `tauri-nspanel` crate for always-on-top floating panel; requires accessibility permissions
- **Linux**: X11 only; uses `rdev` for all input events

## Next Up

- **Expand mouse movement boundaries**: The virtual coordinate space is currently hardcoded to 4000x2000 (`X_MAX`/`Y_MAX` in `useDevice.ts`, mapped to Live2D parameter ranges in `useModel.ts`). Investigate allowing the cat model to reach farther — this likely requires adjusting the Live2D parameter mapping in `handleMouseMove` (`useModel.ts`) where `xRatio`/`yRatio` drive `ParamMouseX`, `ParamMouseY`, `ParamAngleX`, `ParamAngleY` via `getParameterRange`/`setParameterValue`. May need to change how the ratio-to-parameter-value math works, or adjust the virtual bounds, or both.
