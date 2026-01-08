# Teleprompter for Smart Glasses - Development Guide

## Overview
A teleprompter app for MentraOS smart glasses that displays scrolling text with speech-tracking capability.

## Commands
- **Dev**: `bun run dev` - Runs with hot reload
- **Start**: `bun run start` - Runs the app
- **Build**: `bun run build` - Compiles TypeScript
- **Test**: `bun run test:local` - Run tests locally
- **Lint**: `npx eslint 'src/**/*.ts'` - Run ESLint
- **Format**: `npx prettier --write 'src/**/*.ts'` - Format code

## Architecture

### Key Files
- `src/index.ts` - Main app (TeleprompterApp extends TpaServer) and TeleprompterManager class
- `src/remoteControl.ts` - HTTP API for Bluetooth remote control
- `src/utils/src/stageDirections.ts` - Stage direction filtering utilities
- `app_config.json` - Settings schema for MentraOS console import
- `ios-remote/` - iOS companion app for Bluetooth presentation remotes

### Features
- **Speech-based scrolling**: Matches spoken words to script, auto-advances position
- **Time-based scrolling**: Falls back to WPM-based scrolling when speech disabled
- **Stage direction filtering**: Supports [square], (round), {curly} delimiters
  - Display modes: normal, dimmed (shows in parentheses), hidden
  - Stage directions stripped for speech matching regardless of display mode
- **Configurable display**: Line width, number of lines, scroll speed, auto-replay
- **Remote control API**: HTTP endpoints for external control via Bluetooth presentation remotes

### Remote Control API
The app exposes HTTP endpoints for external control (e.g., iOS app with Bluetooth clicker):

- `GET /api/remote/sessions` - List active teleprompter sessions
- `POST /api/remote/control/:userId/scroll` - Scroll forward/back
- `POST /api/remote/control/:userId/reset` - Reset to beginning
- `POST /api/remote/control/:userId/goto` - Jump to specific line
- `GET /api/remote/control/:userId/status` - Get session status

**Security**: Set `REMOTE_CONTROL_API_KEY` in `.env` to require Bearer token authentication. If no key is configured, the remote control API is disabled entirely.

### iOS Companion App

The `ios-remote/` directory contains a SwiftUI app that captures Bluetooth HID keyboard events from presentation remotes and sends scroll commands to the server.

**Requirements**:
- Apple Developer Account ($99/year) - Required to install on physical iPhone
- Mac with Xcode 15.0+
- iPhone with iOS 16.0+ (physical device required, simulator doesn't support Bluetooth HID)

**Quick Start**:
1. Open `ios-remote/TeleprompterRemote` in Xcode
2. Configure signing with your Apple Developer account
3. Connect iPhone via USB, enable Developer Mode in Settings
4. Build and run (⌘R)
5. Pair Bluetooth remote in iPhone Settings > Bluetooth
6. Configure server URL and API key in the app

**Supported Remotes**: Logitech Spotlight/R400/R500/R800, DinoFire, BEBONCOOL, and most generic Bluetooth presentation clickers that send Page Up/Down or Arrow keys.

See `ios-remote/README.md` for detailed build and setup instructions.

### Session Management
- `SessionTimers` interface tracks all 5 timer types per session
- Sessions registered immediately before async operations (prevents race conditions)
- Proper cleanup on disconnect via `onStop()`

## Code Style Guidelines
- **TypeScript**: Strict mode enabled, ES2020 target
- **Formatting**: 2-space indentation, trailing commas
- **Modules**: CommonJS module system
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Types**: Always define return types and parameter types

## Development Setup
1. Copy `.env.example` to `.env` and configure PACKAGE_NAME, MENTRAOS_API_KEY, PORT
2. Run `bun install`
3. Start ngrok: `ngrok http --url=YOUR_NGROK_URL 3000`
4. Run `bun run dev`
5. Configure app in MentraOS console (console.mentra.glass)
6. Import `app_config.json` for settings

## Testing
Tests in `src/__tests__/`. Run with `bun run test:local`.

## Dependencies
- Main: @mentra/sdk, express, ws
- Dev: TypeScript, bun
