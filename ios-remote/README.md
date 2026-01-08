# Teleprompter Remote - iOS Companion App

An iOS app that captures Bluetooth HID keyboard events from presentation remotes and sends scroll commands to the teleprompter server.

## Features

- Captures Page Up/Down, Arrow keys, and Space from Bluetooth presentation clickers
- Sends scroll commands to the teleprompter server via HTTP API
- Shows connection status and session progress
- Manual scroll controls as backup
- Saves server URL and API key for convenience

## Supported Remotes

Most Bluetooth presentation remotes that send standard keyboard keys will work:

- **Logitech Spotlight, R400, R500, R800**
- **DinoFire Wireless Presenter** (Amazon ASIN: B01MYTLMFK)
- **BEBONCOOL Presenter** (Amazon ASIN: B07K9ZKPQD)
- Generic Bluetooth presentation clickers

These remotes typically send:
- Page Down / Right Arrow / Space → Scroll Forward
- Page Up / Left Arrow → Scroll Back

## Setup Instructions

### 1. Build the App

1. Open `TeleprompterRemote` folder in Xcode
2. Select your development team in Signing & Capabilities
3. Build and run on your iPhone (not simulator - needs Bluetooth)

### 2. Pair Your Remote

1. Put your Bluetooth remote in pairing mode
2. Go to iPhone Settings > Bluetooth
3. Find and pair the remote

### 3. Configure the App

1. Open the Teleprompter Remote app
2. Tap the gear icon (⚙️) to open Settings
3. Enter your server URL:
   - Local development: `http://YOUR_COMPUTER_IP:3000`
   - ngrok: `https://your-ngrok-url.ngrok.io`
4. Enter your API key (from `REMOTE_CONTROL_API_KEY` in server .env)
5. Tap "Refresh Sessions" to see active teleprompter sessions
6. Select the session to control

### 4. Use the Remote

1. Keep the app in the foreground (iOS limitation)
2. Ensure the blue "Remote Control Active" area is focused
3. Press buttons on your Bluetooth remote to scroll

## Key Mappings

| Remote Button | Key Sent | Action |
|--------------|----------|--------|
| Forward/Next | Page Down, Down Arrow, Right Arrow, Space | Scroll Forward |
| Back/Previous | Page Up, Up Arrow, Left Arrow | Scroll Back |
| Start (if available) | Home, Escape | Reset to Beginning |

## Troubleshooting

### Remote not working
- Ensure the app is in foreground
- Tap the keyboard icon area to focus it
- Check if remote is paired in Bluetooth settings
- Try pressing the screen once before using remote

### Connection failed
- Verify server URL is correct
- Check if teleprompter server is running
- Ensure your phone is on the same network (for local URLs)
- Verify API key matches server configuration

### No sessions showing
- Start the teleprompter on your smart glasses first
- Tap "Refresh Sessions" in settings
- Check server logs for connection issues

## Development Notes

### Project Structure

```
TeleprompterRemote/
├── TeleprompterRemoteApp.swift  # App entry point
├── ContentView.swift            # Main UI with keyboard capture
├── SettingsView.swift           # Configuration screen
├── TeleprompterService.swift    # API client
└── Info.plist                   # App configuration
```

### API Endpoints Used

- `GET /api/remote/sessions` - List active sessions
- `POST /api/remote/control/:userId/scroll` - Scroll forward/back
- `POST /api/remote/control/:userId/reset` - Reset to beginning
- `GET /api/remote/control/:userId/status` - Get session status

### Building for Distribution

For TestFlight or App Store distribution, ensure you:
1. Remove `NSAllowsArbitraryLoads` from Info.plist
2. Use HTTPS for server URL in production
3. Set proper bundle identifier
4. Add required privacy descriptions if needed

## Requirements

- iOS 16.0+
- iPhone with Bluetooth
- Xcode 15.0+ for building
- Teleprompter server with remote control API enabled
