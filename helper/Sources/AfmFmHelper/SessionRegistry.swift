// ============================================================================
// SessionRegistry.swift — Maps client-side session ids to live
// LanguageModelSession instances. One registry per helper process.
// ============================================================================

import Foundation
import FoundationModels

@available(macOS 26.0, *)
final class SessionRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private var sessions: [String: LanguageModelSession] = [:]
    private var counter: UInt64 = 0

    func register(_ session: LanguageModelSession) -> String {
        lock.withLock {
            counter += 1
            let id = "s\(counter)"
            sessions[id] = session
            return id
        }
    }

    func get(_ id: String) -> LanguageModelSession? {
        lock.withLock { sessions[id] }
    }

    @discardableResult
    func remove(_ id: String) -> Bool {
        lock.withLock { sessions.removeValue(forKey: id) != nil }
    }
}

extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock()
        defer { unlock() }
        return body()
    }
}
