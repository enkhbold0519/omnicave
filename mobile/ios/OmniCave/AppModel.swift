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
    private let service: AppService
    private let pathMonitor = NWPathMonitor()

    init(service: AppService) {
        self.service = service
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.networkAvailable = path.status == .satisfied }
        }
        pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
        Task { user = await service.restoreSession(); if user != nil { await refresh() } }
    }
    @Published var networkAvailable = true

    func signUp(email: String, password: String) async {
        await perform { _ = try await service.signUp(email: email, password: password); notice = "Account created. Log in to continue." }
    }
    func signIn(email: String, password: String) async {
        await perform { user = try await service.signIn(email: email, password: password); await refresh() }
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
