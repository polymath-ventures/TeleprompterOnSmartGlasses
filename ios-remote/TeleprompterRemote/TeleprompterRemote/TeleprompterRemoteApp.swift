/**
 * TeleprompterRemote - iOS Companion App
 *
 * This app captures Bluetooth HID keyboard events from presentation remotes
 * and sends scroll commands to the teleprompter server.
 *
 * Supported remotes (typically send Page Up/Down or Arrow keys):
 * - Logitech Spotlight, R400, R500
 * - Most generic Bluetooth presentation clickers
 *
 * Setup:
 * 1. Pair your Bluetooth remote with your iPhone in Settings > Bluetooth
 * 2. Configure the server URL and API key in this app
 * 3. Keep this app in the foreground while presenting
 */

import SwiftUI

@main
struct TeleprompterRemoteApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
