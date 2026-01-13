/**
 * TeleprompterService - API Client
 *
 * Handles communication with the teleprompter server's remote control API.
 */

import Foundation
import Combine

// MARK: - API Response Types

struct SessionInfo: Codable, Identifiable {
    let userId: String
    let currentLine: Int
    let totalLines: Int
    let isAtEnd: Bool
    let speechScrollEnabled: Bool

    var id: String { userId }

    var progressPercentage: Double {
        guard totalLines > 0 else { return 0 }
        return Double(currentLine) / Double(totalLines) * 100
    }
}

struct SessionsResponse: Codable {
    let sessions: [SessionInfo]
}

struct ControlResponse: Codable {
    let success: Bool
    let message: String?
    let position: Int?
}

// MARK: - Service Errors

enum TeleprompterError: LocalizedError {
    case invalidURL
    case networkError(Error)
    case serverError(String)
    case noActiveSession

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .noActiveSession:
            return "No active teleprompter session"
        }
    }
}

// MARK: - Service

@MainActor
class TeleprompterService: ObservableObject {
    @Published var serverURL: String {
        didSet {
            // Strip trailing slashes to prevent double-slash URLs
            var sanitized = serverURL
            while sanitized.hasSuffix("/") {
                sanitized.removeLast()
            }
            if sanitized != serverURL {
                serverURL = sanitized
                return
            }
            UserDefaults.standard.set(serverURL, forKey: "serverURL")
        }
    }
    @Published var apiKey: String {
        didSet { UserDefaults.standard.set(apiKey, forKey: "apiKey") }
    }
    @Published var selectedUserId: String?
    @Published var sessions: [SessionInfo] = []
    @Published var isConnected: Bool = false
    @Published var lastError: String?
    @Published var lastAction: String?

    private var refreshTimer: Timer?

    init() {
        var storedURL = UserDefaults.standard.string(forKey: "serverURL") ?? "http://localhost:3000"
        // Strip trailing slashes from stored URL
        while storedURL.hasSuffix("/") {
            storedURL.removeLast()
        }
        self.serverURL = storedURL
        self.apiKey = UserDefaults.standard.string(forKey: "apiKey") ?? ""
    }

    // MARK: - Session Management

    func startPolling() {
        stopPolling()
        refreshSessions()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor [weak self] in
                self?.refreshSessions()
            }
        }
    }

    func stopPolling() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    func refreshSessions() {
        Task {
            do {
                sessions = try await fetchSessions()
                isConnected = true
                lastError = nil

                // Auto-select if only one session
                if sessions.count == 1 && selectedUserId == nil {
                    selectedUserId = sessions.first?.userId
                }

                // Clear selection if selected user no longer exists
                if let selected = selectedUserId, !sessions.contains(where: { $0.userId == selected }) {
                    selectedUserId = nil
                }
            } catch {
                isConnected = false
                lastError = error.localizedDescription
            }
        }
    }

    private func fetchSessions() async throws -> [SessionInfo] {
        guard let url = URL(string: "\(serverURL)/api/remote/sessions") else {
            throw TeleprompterError.invalidURL
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        if !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw TeleprompterError.serverError("Invalid response")
            }

            if httpResponse.statusCode != 200 {
                if let errorResponse = try? JSONDecoder().decode(ControlResponse.self, from: data) {
                    throw TeleprompterError.serverError(errorResponse.message ?? "Unknown error")
                }
                throw TeleprompterError.serverError("HTTP \(httpResponse.statusCode)")
            }

            let sessionsResponse = try JSONDecoder().decode(SessionsResponse.self, from: data)
            return sessionsResponse.sessions
        } catch let error as TeleprompterError {
            throw error
        } catch {
            throw TeleprompterError.networkError(error)
        }
    }

    // MARK: - Control Commands

    func scrollForward(lines: Int = 1) async {
        await sendScrollCommand(direction: "forward", lines: lines)
    }

    func scrollBack(lines: Int = 1) async {
        await sendScrollCommand(direction: "back", lines: lines)
    }

    func reset() async {
        guard let userId = selectedUserId else {
            lastError = "No session selected"
            return
        }

        guard let url = URL(string: "\(serverURL)/api/remote/control/\(userId)/reset") else {
            lastError = "Invalid URL"
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 5
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if !apiKey.isEmpty {
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            }

            let (data, _) = try await URLSession.shared.data(for: request)
            let response = try JSONDecoder().decode(ControlResponse.self, from: data)

            if response.success {
                lastAction = "Reset to beginning"
                lastError = nil
            } else {
                lastError = response.message
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    func goToLine(_ line: Int) async {
        guard let userId = selectedUserId else {
            lastError = "No session selected"
            return
        }

        guard let url = URL(string: "\(serverURL)/api/remote/control/\(userId)/goto") else {
            lastError = "Invalid URL"
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 5
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if !apiKey.isEmpty {
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
            }
            request.httpBody = try JSONEncoder().encode(["position": line])

            let (data, _) = try await URLSession.shared.data(for: request)
            let response = try JSONDecoder().decode(ControlResponse.self, from: data)

            if response.success {
                lastAction = "Jumped to line \(line)"
                lastError = nil
            } else {
                lastError = response.message
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func sendScrollCommand(direction: String, lines: Int) async {
        guard let userId = selectedUserId else {
            lastError = "No session selected"
            return
        }

        let urlString = "\(serverURL)/api/remote/control/\(userId)/scroll"
        print("[DEBUG] Scroll URL: \(urlString)")

        guard let url = URL(string: urlString) else {
            lastError = "Invalid URL: \(urlString)"
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 5
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if !apiKey.isEmpty {
                request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
                print("[DEBUG] Auth header set")
            } else {
                print("[DEBUG] No API key configured!")
            }
            // Manual JSON encoding for mixed types
            let body: [String: Any] = ["direction": direction, "lines": lines]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            print("[DEBUG] Sending scroll request...")
            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                print("[DEBUG] HTTP status: \(httpResponse.statusCode)")
            }

            let controlResponse = try JSONDecoder().decode(ControlResponse.self, from: data)

            if controlResponse.success {
                let directionText = direction == "forward" ? "Forward" : "Back"
                lastAction = "\(directionText) \(lines) line\(lines == 1 ? "" : "s")"
                lastError = nil
                print("[DEBUG] Scroll success, position: \(controlResponse.position ?? -1)")
            } else {
                lastError = controlResponse.message
                print("[DEBUG] Scroll failed: \(controlResponse.message ?? "unknown")")
            }
        } catch {
            lastError = error.localizedDescription
            print("[DEBUG] Scroll error: \(error)")
        }
    }

    // MARK: - Current Session

    var currentSession: SessionInfo? {
        guard let userId = selectedUserId else { return nil }
        return sessions.first { $0.userId == userId }
    }
}
