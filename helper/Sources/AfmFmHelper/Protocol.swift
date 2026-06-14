// ============================================================================
// Protocol.swift — Wire types for afm-fm-helper <-> Node.js IPC.
// One JSON object per line, framed by `\n`. Stdin = requests, stdout = replies.
// Stderr is reserved for free-form debug logging.
// ============================================================================

import Foundation

enum Backend: String, Codable {
    case onDevice = "on_device"
    case pcc
}

struct Request: Decodable {
    let id: String
    let op: Op
    let backend: Backend?
    let session: String?
    let prompt: String?
    let instructions: String?
    let options: GenerationOptionsWire?

    enum Op: String, Codable {
        case availability
        case openSession = "openSession"
        case respond
        case stream
        case closeSession = "closeSession"
        case shutdown
    }
}

struct GenerationOptionsWire: Decodable {
    let temperature: Double?
    let maxTokens: Int?
    let seed: UInt64?
    // Future: sampling: SamplingWire?
}

// MARK: - Responses

struct OkAvailability: Encodable {
    let id: String
    let ok: Bool
    let status: String
}

struct OkOpenSession: Encodable {
    let id: String
    let ok: Bool
    let session: String
}

struct OkRespond: Encodable {
    let id: String
    let ok: Bool
    let content: String
    let finishReason: String
    let usage: UsageWire
}

struct OkSimple: Encodable {
    let id: String
    let ok: Bool
}

struct UsageWire: Encodable {
    let promptTokens: Int
    let completionTokens: Int
    let totalTokens: Int
}

struct ErrorEnvelope: Encodable {
    let id: String
    let ok: Bool
    let error: ErrorPayload

    struct ErrorPayload: Encodable {
        let kind: String
        let reason: String?
        let message: String
    }
}

// MARK: - Stream events
// Streaming is id-correlated like one-shot ops, but each response line is an
// "event" envelope rather than a single ok-reply. Node sees a sequence of
// {id, event: "delta", text} followed by exactly one {id, event: "done",
// finishReason, usage} or {id, ok: false, error}.

struct StreamDelta: Encodable {
    let id: String
    let event: String   // "delta"
    let text: String
}

struct StreamDone: Encodable {
    let id: String
    let event: String   // "done"
    let finishReason: String
    let usage: UsageWire
}
