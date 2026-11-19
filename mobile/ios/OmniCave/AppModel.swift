import Foundation
import SwiftUI
import Network

@MainActor
final class AppModel: ObservableObject {
    @Published var user: Account?
    @Published var wines: [Wine] = []
    @Published var cellars: [Cellar] = []
    @Published var selectedCellar: UUID?
    @Published var error: String?
    @Published var notice: String?
    @Published var busy = false
    @Published var legalInfo: BackendModels.LegalInfo?
    @Published var legalError: String?
    @Published var verificationEmail: String?
    private let service: AppService
    private let pathMonitor = NWPathMonitor()

    init(service: AppService) {
        self.service = service
        if let backend = service as? BackendService {
            backend.onUnauthorized = { [weak self] in
                Task { @MainActor in
                    self?.user = nil
                    self?.wines = []
                    self?.cellars = []
                }
            }
        }
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.networkAvailable = path.status == .satisfied }
        }
        pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
        Task {
            user = await service.restoreSession()
            if user != nil && !(service is BackendService) { await refresh() }
        }
    }
    @Published var networkAvailable = true

    func loadLegalInfo() async {
        do {
            legalInfo = try await service.legalInfo()
            legalError = nil
        } catch {
            legalInfo = nil
            legalError = error.localizedDescription
        }
    }

    func signUp(username: String, email: String, password: String, birthDate: String, consents: [String: Bool]) async -> SignUpOutcome? {
        var outcome: SignUpOutcome?
        await perform {
            outcome = try await service.signUp(username: username, email: email, password: password, birthDate: birthDate, consents: consents)
            switch outcome {
            case .some(.created): notice = "Account created. Log in to continue."
            case .some(.verificationRequired(let address)): notice = "We sent a 6-digit code to \(address)."
            case nil: break
            }
        }
        return error == nil ? outcome : nil
    }

    func signIn(identifier: String, password: String) async -> Bool {
        busy = true; error = nil; notice = nil; verificationEmail = nil
        do {
            user = try await service.signIn(identifier: identifier, password: password)
            if !(service is BackendService) { await refresh() }
            busy = false
            return true
        } catch let apiError as APIClientError where apiError.statusCode == 403 {
            verificationEmail = identifier
            notice = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
        return false
    }

    func verifyEmail(email: String, code: String) async -> Bool {
        await perform {
            user = try await service.verifyEmail(email: email, code: code)
            verificationEmail = nil
            await refresh()
        }
        return user != nil && error == nil
    }

    func resendVerification(email: String) async {
        await perform {
            try await service.resendVerification(email: email)
            notice = "If the address needs a code, a new one is on its way."
        }
    }

    func requestPasswordReset(email: String) async {
        await perform {
            try await service.requestPasswordReset(email: email)
            notice = "If the address has an account, a code is on its way."
        }
    }

    func resetPassword(email: String, code: String, password: String) async {
        await perform {
            try await service.resetPassword(email: email, code: code, password: password)
            notice = "Password changed. Log in with your new password."
        }
    }
    func signOut() { Task { await service.signOut(); user = nil; wines = []; cellars = [] } }
    func updateEmail(_ email: String) async { await perform { user = try await service.updateEmail(email); notice = "Email updated." } }
    func updatePassword(_ password: String) async { await perform { try await service.updatePassword(password); notice = "Password updated." } }
    func deleteAccount() async { await perform { try await service.deleteAccount(); user = nil; wines = []; cellars = [] } }
    func refresh() async {
        await perform { wines = try await service.wines(); cellars = try await service.cellars(); if selectedCellar == nil { selectedCellar = cellars.first?.id } }
    }
    func save(_ wine: Wine) async { await perform { try await service.save(wine); wines = try await service.wines() } }
    func remove(_ wine: Wine) async { await perform { try await service.remove(wine); wines = try await service.wines() } }
    func save(_ cellar: Cellar) async { await perform { try await service.save(cellar); cellars = try await service.cellars() } }
    func ask(_ prompt: String) async -> String { do { return try await service.ask(prompt) } catch { self.error = error.localizedDescription; return "" } }
    func export() async -> Data? { try? await service.exportData() }

    private func perform(_ action: () async throws -> Void) async {
        busy = true; error = nil; notice = nil
        do { try await action() } catch { self.error = error.localizedDescription }
        busy = false
    }
}
