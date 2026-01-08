/**
 * ContentView - Main UI with Keyboard Event Capture
 *
 * This view captures keyboard events from Bluetooth HID devices
 * and translates them to teleprompter scroll commands.
 *
 * Key Mappings:
 * - Page Down / Down Arrow / Right Arrow / Space -> Scroll Forward
 * - Page Up / Up Arrow / Left Arrow -> Scroll Back
 * - Home / Escape -> Reset to Beginning
 */

import SwiftUI

struct ContentView: View {
    @StateObject private var service = TeleprompterService()
    @State private var showSettings = false
    @FocusState private var isKeyboardFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Connection Status
                    connectionStatusView

                    // Session Info
                    if let session = service.currentSession {
                        sessionInfoView(session)
                    } else if service.isConnected {
                        noSessionView
                    }

                    // Keyboard capture area
                    keyboardCaptureView
                        .padding(.vertical, 20)

                    // Manual controls
                    manualControlsView

                    // Last action/error
                    statusMessageView
                }
                .padding()
            }
            .scrollDismissesKeyboard(.never)
            .navigationTitle("Teleprompter Remote")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gear")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView(service: service)
            }
            .onAppear {
                service.startPolling()
                isKeyboardFocused = true
            }
            .onDisappear {
                service.stopPolling()
            }
        }
    }

    // MARK: - Subviews

    private var connectionStatusView: some View {
        HStack {
            Circle()
                .fill(service.isConnected ? Color.green : Color.red)
                .frame(width: 12, height: 12)
            Text(service.isConnected ? "Connected" : "Disconnected")
                .font(.headline)
            Spacer()
            if service.isConnected {
                Text("\(service.sessions.count) session\(service.sessions.count == 1 ? "" : "s")")
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }

    private func sessionInfoView(_ session: SessionInfo) -> some View {
        VStack(spacing: 12) {
            HStack {
                Text("Session: \(session.userId)")
                    .font(.headline)
                Spacer()
                if session.speechScrollEnabled {
                    Label("Speech", systemImage: "waveform")
                        .font(.caption)
                        .foregroundColor(.blue)
                }
            }

            // Progress bar
            VStack(alignment: .leading, spacing: 4) {
                ProgressView(value: session.progressPercentage, total: 100)
                    .progressViewStyle(.linear)
                HStack {
                    Text("Line \(session.currentLine)")
                    Spacer()
                    Text("\(Int(session.progressPercentage))%")
                    Spacer()
                    Text("\(session.totalLines) total")
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }

            if session.isAtEnd {
                Label("End of script", systemImage: "checkmark.circle.fill")
                    .foregroundColor(.green)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }

    private var noSessionView: some View {
        VStack(spacing: 8) {
            Image(systemName: "text.alignleft")
                .font(.largeTitle)
                .foregroundColor(.secondary)
            Text("No active sessions")
                .font(.headline)
            Text("Start the teleprompter on your glasses")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }

    private var keyboardCaptureView: some View {
        VStack(spacing: 12) {
            Image(systemName: "keyboard")
                .font(.system(size: 48))
                .foregroundColor(isKeyboardFocused ? .blue : .secondary)

            Text("Remote Control Active")
                .font(.headline)

            Text("Press buttons on your Bluetooth remote")
                .font(.caption)
                .foregroundColor(.secondary)

            // Invisible text field to capture keyboard events
            KeyboardCaptureTextField(
                onKeyPress: handleKeyPress
            )
            .focused($isKeyboardFocused)
            .frame(width: 1, height: 1)
            .opacity(0.01)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isKeyboardFocused ? Color.blue : Color.gray, lineWidth: 2)
                .background(Color(.systemGray6).cornerRadius(16))
        )
        .onTapGesture {
            isKeyboardFocused = true
        }
    }

    private var manualControlsView: some View {
        VStack(spacing: 12) {
            Text("Manual Controls")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack(spacing: 20) {
                Button {
                    Task { await service.reset() }
                } label: {
                    VStack {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.title2)
                        Text("Reset")
                            .font(.caption)
                    }
                }
                .buttonStyle(.bordered)

                Button {
                    Task { await service.scrollBack() }
                } label: {
                    VStack {
                        Image(systemName: "chevron.up")
                            .font(.title)
                        Text("Back")
                            .font(.caption)
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.large)

                Button {
                    Task { await service.scrollForward() }
                } label: {
                    VStack {
                        Image(systemName: "chevron.down")
                            .font(.title)
                        Text("Forward")
                            .font(.caption)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
        .disabled(!service.isConnected || service.selectedUserId == nil)
    }

    private var statusMessageView: some View {
        VStack(spacing: 4) {
            if let action = service.lastAction {
                Label(action, systemImage: "checkmark.circle")
                    .foregroundColor(.green)
                    .font(.caption)
            }
            if let error = service.lastError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundColor(.red)
                    .font(.caption)
            }
        }
        .frame(height: 40)
    }

    // MARK: - Key Handling

    private func handleKeyPress(_ key: KeyboardKey) {
        guard service.selectedUserId != nil else { return }

        Task {
            switch key {
            case .pageDown, .downArrow, .rightArrow, .space:
                await service.scrollForward()
            case .pageUp, .upArrow, .leftArrow:
                await service.scrollBack()
            case .home, .escape:
                await service.reset()
            case .unknown:
                break
            }
        }
    }
}

// MARK: - Keyboard Key Enum

enum KeyboardKey {
    case pageDown
    case pageUp
    case downArrow
    case upArrow
    case leftArrow
    case rightArrow
    case space
    case home
    case escape
    case unknown

    init(keyCode: Int) {
        switch keyCode {
        case 0x79: self = .pageDown      // Page Down
        case 0x74: self = .pageUp        // Page Up
        case 0x7D: self = .downArrow     // Down Arrow
        case 0x7E: self = .upArrow       // Up Arrow
        case 0x7B: self = .leftArrow     // Left Arrow
        case 0x7C: self = .rightArrow    // Right Arrow
        case 0x31: self = .space         // Space
        case 0x73: self = .home          // Home
        case 0x35: self = .escape        // Escape
        default: self = .unknown
        }
    }
}

// MARK: - Keyboard Capture TextField

struct KeyboardCaptureTextField: UIViewRepresentable {
    var onKeyPress: (KeyboardKey) -> Void

    func makeUIView(context: Context) -> KeyCaptureTextField {
        let textField = KeyCaptureTextField()
        textField.keyPressHandler = onKeyPress
        textField.autocorrectionType = .no
        textField.autocapitalizationType = .none
        textField.keyboardType = .default
        return textField
    }

    func updateUIView(_ uiView: KeyCaptureTextField, context: Context) {
        uiView.keyPressHandler = onKeyPress
    }
}

class KeyCaptureTextField: UITextField {
    var keyPressHandler: ((KeyboardKey) -> Void)?

    override var canBecomeFirstResponder: Bool { true }

    // Hide the software keyboard - we only need hardware key capture
    override var inputView: UIView? {
        get { UIView() }
        set { }
    }

    // Capture hardware keyboard events
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for press in presses {
            if let key = press.key {
                let keyboardKey = mapUIKey(key)
                if keyboardKey != .unknown {
                    keyPressHandler?(keyboardKey)
                    return
                }
            }
        }
        super.pressesBegan(presses, with: event)
    }

    private func mapUIKey(_ key: UIKey) -> KeyboardKey {
        switch key.keyCode {
        case .keyboardPageDown:
            return .pageDown
        case .keyboardPageUp:
            return .pageUp
        case .keyboardDownArrow:
            return .downArrow
        case .keyboardUpArrow:
            return .upArrow
        case .keyboardLeftArrow:
            return .leftArrow
        case .keyboardRightArrow:
            return .rightArrow
        case .keyboardSpacebar:
            return .space
        case .keyboardHome:
            return .home
        case .keyboardEscape:
            return .escape
        default:
            return .unknown
        }
    }

    // Prevent any text input
    override func insertText(_ text: String) {
        // Ignore text input, we only care about key presses
    }

    override func deleteBackward() {
        // Ignore delete
    }
}

// MARK: - Preview

#Preview {
    ContentView()
}
