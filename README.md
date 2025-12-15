# Teleprompter for Smart Glasses

A teleprompter app for MentraOS smart glasses that displays scrolling text with speech-tracking capability.

## Features

- **Speech-based scrolling**: Automatically advances based on your spoken words
- **Time-based scrolling**: Falls back to WPM-based scrolling when speech mode is disabled
- **Stage direction filtering**: Mark stage directions with `[brackets]`, `(parentheses)`, or `{braces}`
  - **Normal**: Shows stage directions unchanged
  - **Dimmed**: Converts to parentheses for visual distinction
  - **Hidden**: Completely hides stage directions
- **Auto-replay**: Optionally restart from the beginning when finished
- **Progress tracking**: Shows percentage, elapsed time, and estimated total time

## Quick Start

1. Clone this repository
2. Copy `.env.example` to `.env` and configure:
   ```
   PACKAGE_NAME=com.yourcompany.teleprompter
   MENTRAOS_API_KEY=your_api_key_here
   PORT=3000
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Start ngrok tunnel to your local port:
   ```bash
   ngrok http --url=YOUR_NGROK_URL 3000
   ```
5. Run the app:
   ```bash
   bun run dev
   ```

## MentraOS Console Setup

1. Go to [console.mentra.glass](https://console.mentra.glass)
2. Create/configure your app with the ngrok URL as the webhook endpoint
3. Import `app_config.json` to set up the settings UI

## Settings

| Setting | Description |
|---------|-------------|
| Text to Display | The script/text to show on the teleprompter |
| Speech-based scrolling | Enable/disable voice-tracking mode |
| Scroll speed (WPM) | Words per minute for time-based scrolling |
| Auto Replay | Restart from beginning when finished |
| Line width | Medium or Wide display |
| Number of lines | 3 or 4 lines visible at once |
| Show Estimated Total Time | Display projected total duration |
| Stage direction markers | None, [Square], (Round), or {Curly} |
| Stage direction display | Normal, Dimmed, or Hidden |

## Development

```bash
# Development with hot reload
bun run dev

# Build TypeScript
bun run build

# Start without hot reload
bun run start

# Run tests
bun run test:local
```

## Architecture

- `src/index.ts` - Main app (TeleprompterApp extends TpaServer)
- `src/utils/src/stageDirections.ts` - Stage direction filtering
- `src/utils/src/text-wrapping/` - Text wrapping and processing
- `app_config.json` - Settings schema for MentraOS console

## License

See [LICENSE](LICENSE) file.
