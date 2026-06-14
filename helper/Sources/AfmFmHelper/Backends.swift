// ============================================================================
// Backends.swift — Backend dispatch. Today: on-device (SystemLanguageModel)
// and PCC (PrivateCloudComputeLanguageModel, gated by macOS 27). The Node
// side can request either; we return a typed error envelope when PCC is
// asked for on an ineligible host.
// ============================================================================

import Foundation
import FoundationModels

@available(macOS 26.0, *)
enum Backends {

    /// Open a new `LanguageModelSession` for the requested backend. Instructions
    /// are attached as a single `Transcript.Instructions` so streaming and
    /// non-streaming paths read the same source-of-truth history.
    static func openSession(
        backend: Backend,
        instructions: String?
    ) throws -> LanguageModelSession {
        let entries = makeInstructionEntries(instructions)
        switch backend {
        case .onDevice:
            let model = SystemLanguageModel(guardrails: .default)
            if entries.isEmpty {
                return LanguageModelSession(model: model)
            }
            return LanguageModelSession(model: model, transcript: Transcript(entries: entries))
        case .pcc:
            if #available(macOS 27.0, *) {
                try ensurePCCAvailable()
                let pcc = PrivateCloudComputeLanguageModel()
                if entries.isEmpty {
                    return LanguageModelSession(model: pcc)
                }
                return LanguageModelSession(model: pcc, transcript: Transcript(entries: entries))
            } else {
                throw HelperError.pccUnavailable(reason: "requires macOS 27 or later")
            }
        }
    }

    /// Report whether the requested backend is currently reachable.
    static func availability(backend: Backend) -> String {
        switch backend {
        case .onDevice:
            switch SystemLanguageModel(guardrails: .default).availability {
            case .available: return "available"
            case .unavailable(let reason):
                switch reason {
                case .appleIntelligenceNotEnabled: return "appleIntelligenceNotEnabled"
                case .deviceNotEligible: return "deviceNotEligible"
                case .modelNotReady: return "modelNotReady"
                @unknown default: return "unknownUnavailable"
                }
            }
        case .pcc:
            if #available(macOS 27.0, *) {
                switch PrivateCloudComputeLanguageModel().availability {
                case .available: return "available"
                case .unavailable(let reason):
                    switch reason {
                    case .deviceNotEligible: return "deviceNotEligible"
                    case .systemNotReady: return "modelNotReady"
                    @unknown default: return "unknownUnavailable"
                    }
                }
            }
            return "deviceNotEligible"
        }
    }

    private static func makeInstructionEntries(_ instructions: String?) -> [Transcript.Entry] {
        guard let text = instructions, !text.isEmpty else { return [] }
        let segment = Transcript.TextSegment(content: text)
        let instr = Transcript.Instructions(segments: [.text(segment)], toolDefinitions: [])
        return [.instructions(instr)]
    }

    @available(macOS 27.0, *)
    private static func ensurePCCAvailable() throws {
        switch PrivateCloudComputeLanguageModel().availability {
        case .available:
            return
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible:
                throw HelperError.pccUnavailable(reason: "deviceNotEligible")
            case .systemNotReady:
                throw HelperError.pccUnavailable(reason: "systemNotReady")
            @unknown default:
                throw HelperError.pccUnavailable(reason: String(describing: reason))
            }
        }
    }
}

enum HelperError: Error {
    case pccUnavailable(reason: String)
    case pccQuotaExceeded
    case pccNetworkFailure(message: String)
    case sessionNotFound(String)
    case decodingFailure(String)
    case generic(String)
}
