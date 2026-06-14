// ============================================================================
// main.swift — afm-fm-helper entry point.
//
// Reads one JSON request per line from stdin, dispatches it, writes one JSON
// reply per line to stdout. Stderr is reserved for debug logging.
//
// The Node-side HelperProcess holds a single instance of this binary for the
// process lifetime and multiplexes requests over it.
// ============================================================================

import Foundation
import FoundationModels

guard #available(macOS 26.0, *) else {
    // SystemLanguageModel itself is macOS 26+; refuse to start on older OSes.
    FileHandle.standardError.write(Data("afm-fm-helper: requires macOS 26 or later\n".utf8))
    exit(1)
}

let registry = SessionRegistry()
let encoder = JSONEncoder()
let decoder = JSONDecoder()

// Map any error into the wire envelope. Typed PCC errors get their canonical
// `kind`; everything else falls back to `unknown` so the Node side can run
// its own classify() and surface a stable shape.
func writeError(id: String, _ error: Error) {
    let payload: ErrorEnvelope.ErrorPayload
    if let helperError = error as? HelperError {
        switch helperError {
        case .pccUnavailable(let reason):
            payload = .init(kind: "pccUnavailable", reason: reason, message: "PCC unavailable: \(reason)")
        case .pccQuotaExceeded:
            payload = .init(kind: "pccQuotaExceeded", reason: nil, message: "PCC quota exceeded")
        case .pccNetworkFailure(let message):
            payload = .init(kind: "pccNetworkFailure", reason: nil, message: message)
        case .sessionNotFound(let s):
            payload = .init(kind: "unknown", reason: nil, message: "session not found: \(s)")
        case .decodingFailure(let m):
            payload = .init(kind: "decodingFailure", reason: nil, message: m)
        case .generic(let m):
            payload = .init(kind: "unknown", reason: nil, message: m)
        }
    } else {
        // Detect PCC framework errors via type-name reflection so we don't
        // need to import the macOS 27 types in the macOS 26 build path.
        let mirror = String(reflecting: error)
        if mirror.contains("PrivateCloudCompute") {
            if mirror.contains("quotaLimitReached") {
                payload = .init(kind: "pccQuotaExceeded", reason: nil, message: error.localizedDescription)
            } else if mirror.contains("networkFailure") {
                payload = .init(kind: "pccNetworkFailure", reason: nil, message: error.localizedDescription)
            } else {
                payload = .init(kind: "pccUnavailable", reason: nil, message: error.localizedDescription)
            }
        } else {
            payload = .init(kind: "unknown", reason: nil, message: error.localizedDescription)
        }
    }
    let envelope = ErrorEnvelope(id: id, ok: false, error: payload)
    writeLine(envelope)
}

func writeLine<E: Encodable>(_ value: E) {
    do {
        let data = try encoder.encode(value)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    } catch {
        FileHandle.standardError.write(Data("afm-fm-helper: encode failed - \(error)\n".utf8))
    }
}

func handleRequest(_ raw: String) async {
    guard let data = raw.data(using: .utf8) else { return }
    let req: Request
    do {
        req = try decoder.decode(Request.self, from: data)
    } catch {
        // Without a parsed id we can't id-correlate the error; best effort.
        writeError(id: "?", error)
        return
    }

    do {
        switch req.op {
        case .availability:
            let backend = req.backend ?? .onDevice
            let status = Backends.availability(backend: backend)
            writeLine(OkAvailability(id: req.id, ok: true, status: status))

        case .openSession:
            let backend = req.backend ?? .onDevice
            let session = try Backends.openSession(backend: backend, instructions: req.instructions)
            let sid = registry.register(session)
            writeLine(OkOpenSession(id: req.id, ok: true, session: sid))

        case .respond:
            guard let sid = req.session, let session = registry.get(sid) else {
                throw HelperError.sessionNotFound(req.session ?? "<nil>")
            }
            guard let prompt = req.prompt else {
                throw HelperError.decodingFailure("respond: missing 'prompt'")
            }
            let options = makeGenerationOptions(req.options)
            let response = try await session.respond(to: prompt, options: options)
            let content = response.content
            // Token counts: SDK exposes tokenCount on Transcript entries; for the
            // M1 stub we approximate with character-based heuristics. The full
            // port will switch to `Transcript.tokenCount` after the helper grows
            // a `countTokens` op.
            let promptApprox = max(1, prompt.utf8.count / 4)
            let completionApprox = max(1, content.utf8.count / 4)
            writeLine(OkRespond(
                id: req.id,
                ok: true,
                content: content,
                finishReason: "stop",
                usage: UsageWire(
                    promptTokens: promptApprox,
                    completionTokens: completionApprox,
                    totalTokens: promptApprox + completionApprox
                )
            ))

        case .stream:
            guard let sid = req.session, let session = registry.get(sid) else {
                throw HelperError.sessionNotFound(req.session ?? "<nil>")
            }
            guard let prompt = req.prompt else {
                throw HelperError.decodingFailure("stream: missing 'prompt'")
            }
            let options = makeGenerationOptions(req.options)
            // Apple FoundationModels emits cumulative snapshots. We diff each
            // snapshot against the previous one and emit only the new suffix
            // so Node receives true delta tokens (matches OpenAI semantics).
            var prev = ""
            let snapshots = session.streamResponse(to: prompt, options: options)
            do {
                for try await snapshot in snapshots {
                    let content = snapshot.content
                    if content.count > prev.count, content.hasPrefix(prev) {
                        let delta = String(content.dropFirst(prev.count))
                        if !delta.isEmpty {
                            writeLine(StreamDelta(id: req.id, event: "delta", text: delta))
                        }
                    } else if content != prev {
                        // Non-prefix replacement: emit the whole new content. Rare
                        // edge case (e.g. the framework rewrites a partial token)
                        // but we don't want to drop it silently.
                        writeLine(StreamDelta(id: req.id, event: "delta", text: content))
                    }
                    prev = content
                }
                let promptApprox = max(1, prompt.utf8.count / 4)
                let completionApprox = max(1, prev.utf8.count / 4)
                writeLine(StreamDone(
                    id: req.id,
                    event: "done",
                    finishReason: "stop",
                    usage: UsageWire(
                        promptTokens: promptApprox,
                        completionTokens: completionApprox,
                        totalTokens: promptApprox + completionApprox
                    )
                ))
            } catch {
                writeError(id: req.id, error)
            }

        case .closeSession:
            guard let sid = req.session else {
                throw HelperError.decodingFailure("closeSession: missing 'session'")
            }
            registry.remove(sid)
            writeLine(OkSimple(id: req.id, ok: true))

        case .shutdown:
            writeLine(OkSimple(id: req.id, ok: true))
            exit(0)
        }
    } catch {
        writeError(id: req.id, error)
    }
}

func makeGenerationOptions(_ wire: GenerationOptionsWire?) -> GenerationOptions {
    var opts = GenerationOptions()
    if let w = wire {
        if let t = w.temperature {
            opts = GenerationOptions(temperature: t, maximumResponseTokens: w.maxTokens)
        } else {
            opts = GenerationOptions(maximumResponseTokens: w.maxTokens)
        }
    }
    return opts
}

// MARK: - stdin pump

let input = FileHandle.standardInput
var buffer = Data()

await withTaskGroup(of: Void.self) { group in
    // Async stdin reader. Lines are newline-delimited JSON; each becomes a
    // task so a slow respond doesn't block subsequent ops (e.g. closeSession).
    while true {
        let chunk = input.availableData
        if chunk.isEmpty {
            break
        }
        buffer.append(chunk)
        while let nl = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer[..<nl]
            buffer.removeSubrange(...nl)
            guard let line = String(data: lineData, encoding: .utf8) else { continue }
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            group.addTask {
                await handleRequest(trimmed)
            }
        }
    }
    await group.waitForAll()
}
