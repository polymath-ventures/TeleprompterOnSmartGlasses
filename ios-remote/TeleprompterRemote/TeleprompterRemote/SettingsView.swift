/**
 * SettingsView - Configuration Screen
 *
 * Allows users to configure:
 * - Server URL (ngrok URL or local IP)
 * - API Key for authentication
 * - Session selection
 */

import SwiftUI

struct SettingsView: View {
    @ObservedObject var service: TeleprompterService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Server URL", text: $service.serverURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    SecureField("API Key", text: $service.apiKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Connection")
                } footer: {
                    Text("Enter your teleprompter server URL (e.g., https://your-ngrok-url.ngrok.io)")
                }

                Section {
                    if service.sessions.isEmpty {
                        Text("No active sessions")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(service.sessions) { session in
                            Button {
                                service.selectedUserId = session.userId
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(session.userId)
                                            .foregroundColor(.primary)
                                        Text("Line \(session.currentLine) of \(session.totalLines)")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    Spacer()
                                    if service.selectedUserId == session.userId {
                                        Image(systemName: "checkmark")
                                            .foregroundColor(.blue)
                                    }
                                }
                            }
                        }
                    }

                    Button("Refresh Sessions") {
                        service.refreshSessions()
                    }
                } header: {
                    Text("Active Sessions")
                } footer: {
                    Text("Select which teleprompter session to control")
                }

                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        KeyMappingRow(keys: "Page Down, Down, Right, Space", action: "Scroll Forward")
                        KeyMappingRow(keys: "Page Up, Up, Left", action: "Scroll Back")
                        KeyMappingRow(keys: "Home, Escape", action: "Reset to Start")
                    }
                } header: {
                    Text("Key Mappings")
                } footer: {
                    Text("These are the keys your Bluetooth remote typically sends")
                }

                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("1. Pair your Bluetooth remote in Settings > Bluetooth")
                        Text("2. Enter your server URL above")
                        Text("3. Start the teleprompter on your glasses")
                        Text("4. Select the session to control")
                        Text("5. Keep this app in the foreground")
                        Text("6. Press buttons on your remote to scroll")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                } header: {
                    Text("How to Use")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

struct KeyMappingRow: View {
    let keys: String
    let action: String

    var body: some View {
        HStack {
            Text(keys)
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
            Text(action)
                .font(.caption)
                .fontWeight(.medium)
        }
    }
}

#Preview {
    SettingsView(service: TeleprompterService())
}
