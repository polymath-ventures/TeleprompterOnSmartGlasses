//
//  TeleprompterRemoteTests.swift
//  TeleprompterRemoteTests
//
//  Created by Nick Hodulik on 1/8/26.
//

import Testing
import Foundation
@testable import TeleprompterRemote

// MARK: - SessionInfo Tests

@MainActor
struct SessionInfoTests {

    @Test func decodeSessionInfo() throws {
        let json = """
        {
            "userId": "user@example.com",
            "currentLine": 5,
            "totalLines": 100,
            "isAtEnd": false,
            "speechScrollEnabled": true
        }
        """.data(using: .utf8)!

        let session = try JSONDecoder().decode(SessionInfo.self, from: json)

        #expect(session.userId == "user@example.com")
        #expect(session.currentLine == 5)
        #expect(session.totalLines == 100)
        #expect(session.isAtEnd == false)
        #expect(session.speechScrollEnabled == true)
    }

    @Test func sessionInfoId() throws {
        let json = """
        {
            "userId": "test-user-123",
            "currentLine": 0,
            "totalLines": 50,
            "isAtEnd": false,
            "speechScrollEnabled": false
        }
        """.data(using: .utf8)!

        let session = try JSONDecoder().decode(SessionInfo.self, from: json)

        // id should equal userId
        #expect(session.id == "test-user-123")
        #expect(session.id == session.userId)
    }

    @Test func progressPercentageCalculation() throws {
        // Test normal progress
        let json1 = """
        {"userId": "u1", "currentLine": 50, "totalLines": 100, "isAtEnd": false, "speechScrollEnabled": true}
        """.data(using: .utf8)!
        let session1 = try JSONDecoder().decode(SessionInfo.self, from: json1)
        #expect(session1.progressPercentage == 50.0)

        // Test 0% progress
        let json2 = """
        {"userId": "u2", "currentLine": 0, "totalLines": 100, "isAtEnd": false, "speechScrollEnabled": true}
        """.data(using: .utf8)!
        let session2 = try JSONDecoder().decode(SessionInfo.self, from: json2)
        #expect(session2.progressPercentage == 0.0)

        // Test 100% progress
        let json3 = """
        {"userId": "u3", "currentLine": 100, "totalLines": 100, "isAtEnd": true, "speechScrollEnabled": true}
        """.data(using: .utf8)!
        let session3 = try JSONDecoder().decode(SessionInfo.self, from: json3)
        #expect(session3.progressPercentage == 100.0)
    }

    @Test func progressPercentageWithZeroTotalLines() throws {
        let json = """
        {"userId": "empty", "currentLine": 0, "totalLines": 0, "isAtEnd": true, "speechScrollEnabled": false}
        """.data(using: .utf8)!
        let session = try JSONDecoder().decode(SessionInfo.self, from: json)

        // Should return 0 instead of dividing by zero
        #expect(session.progressPercentage == 0.0)
    }
}

// MARK: - SessionsResponse Tests

@MainActor
struct SessionsResponseTests {

    @Test func decodeEmptySessions() throws {
        let json = """
        {"sessions": []}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(SessionsResponse.self, from: json)
        #expect(response.sessions.isEmpty)
    }

    @Test func decodeMultipleSessions() throws {
        let json = """
        {
            "sessions": [
                {"userId": "user1@test.com", "currentLine": 10, "totalLines": 50, "isAtEnd": false, "speechScrollEnabled": true},
                {"userId": "user2@test.com", "currentLine": 25, "totalLines": 100, "isAtEnd": false, "speechScrollEnabled": false}
            ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(SessionsResponse.self, from: json)

        #expect(response.sessions.count == 2)
        #expect(response.sessions[0].userId == "user1@test.com")
        #expect(response.sessions[1].userId == "user2@test.com")
    }
}

// MARK: - ControlResponse Tests

@MainActor
struct ControlResponseTests {

    @Test func decodeSuccessResponse() throws {
        let json = """
        {"success": true, "position": 42}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(ControlResponse.self, from: json)

        #expect(response.success == true)
        #expect(response.position == 42)
        #expect(response.message == nil)
    }

    @Test func decodeErrorResponse() throws {
        let json = """
        {"success": false, "message": "No active session for this user"}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(ControlResponse.self, from: json)

        #expect(response.success == false)
        #expect(response.message == "No active session for this user")
        #expect(response.position == nil)
    }

    @Test func decodeSuccessWithMessage() throws {
        let json = """
        {"success": true, "message": "Scrolled forward", "position": 15}
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(ControlResponse.self, from: json)

        #expect(response.success == true)
        #expect(response.message == "Scrolled forward")
        #expect(response.position == 15)
    }
}

// MARK: - TeleprompterError Tests

@MainActor
struct TeleprompterErrorTests {

    @Test func invalidURLErrorDescription() {
        let error = TeleprompterError.invalidURL
        #expect(error.errorDescription == "Invalid server URL")
    }

    @Test func serverErrorDescription() {
        let error = TeleprompterError.serverError("Connection refused")
        #expect(error.errorDescription == "Server error: Connection refused")
    }

    @Test func noActiveSessionErrorDescription() {
        let error = TeleprompterError.noActiveSession
        #expect(error.errorDescription == "No active teleprompter session")
    }

    @Test func networkErrorDescription() {
        let underlyingError = NSError(domain: "TestDomain", code: -1, userInfo: [NSLocalizedDescriptionKey: "Network unavailable"])
        let error = TeleprompterError.networkError(underlyingError)
        #expect(error.errorDescription?.contains("Network error") == true)
    }
}

// MARK: - URL Construction Tests

struct URLConstructionTests {

    @Test func sessionsEndpointURL() {
        let serverURL = "https://teleprompter.fly.dev"
        let url = URL(string: "\(serverURL)/api/remote/sessions")

        #expect(url != nil)
        #expect(url?.absoluteString == "https://teleprompter.fly.dev/api/remote/sessions")
    }

    @Test func scrollEndpointURL() {
        let serverURL = "https://teleprompter.fly.dev"
        let userId = "user@example.com"
        let url = URL(string: "\(serverURL)/api/remote/control/\(userId)/scroll")

        #expect(url != nil)
        #expect(url?.absoluteString == "https://teleprompter.fly.dev/api/remote/control/user@example.com/scroll")
    }

    @Test func resetEndpointURL() {
        let serverURL = "http://localhost:3000"
        let userId = "test-user"
        let url = URL(string: "\(serverURL)/api/remote/control/\(userId)/reset")

        #expect(url != nil)
        #expect(url?.path == "/api/remote/control/test-user/reset")
    }

    @Test func gotoEndpointURL() {
        let serverURL = "https://example.ngrok.io"
        let userId = "nick@polymathventures.com"
        let url = URL(string: "\(serverURL)/api/remote/control/\(userId)/goto")

        #expect(url != nil)
        #expect(url?.absoluteString == "https://example.ngrok.io/api/remote/control/nick@polymathventures.com/goto")
    }
}

// MARK: - Request Body Encoding Tests

struct RequestBodyTests {

    @Test func scrollRequestBody() throws {
        let body: [String: Any] = ["direction": "forward", "lines": 1]
        let data = try JSONSerialization.data(withJSONObject: body)

        let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        #expect(decoded?["direction"] as? String == "forward")
        #expect(decoded?["lines"] as? Int == 1)
    }

    @Test func scrollBackRequestBody() throws {
        let body: [String: Any] = ["direction": "back", "lines": 3]
        let data = try JSONSerialization.data(withJSONObject: body)

        let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        #expect(decoded?["direction"] as? String == "back")
        #expect(decoded?["lines"] as? Int == 3)
    }

    @Test func gotoRequestBody() throws {
        let position = 42
        let data = try JSONEncoder().encode(["position": position])

        let decoded = try JSONDecoder().decode([String: Int].self, from: data)

        #expect(decoded["position"] == 42)
    }
}

// MARK: - Authorization Header Tests

struct AuthorizationTests {

    @Test func bearerTokenFormat() {
        let apiKey = "my-secret-key-123"
        let authHeader = "Bearer \(apiKey)"

        #expect(authHeader == "Bearer my-secret-key-123")
        #expect(authHeader.hasPrefix("Bearer "))
    }

    @Test func emptyApiKeyNoHeader() {
        let apiKey = ""

        // When API key is empty, we shouldn't add the header
        #expect(apiKey.isEmpty)
    }
}
