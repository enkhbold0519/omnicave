import Foundation
import SwiftUI
import Network

@MainActor
final class AppModel: ObservableObject {
    @Published var user: Account?
    @Published var backendUser: BackendModels.User?
    @Published var personas: [BackendModels.Persona] = []
    @Published var sommelierBottles: [BackendModels.Bottle] = []
    @Published var wines: [Wine] = []
    @Published var cellars: [Cellar] = []
    @Published var selectedCellar: UUID?
    @Published var inventoryBottles: [BackendModels.Bottle] = []
    @Published var inventoryCellars: [BackendModels.CellarSummary] = []
    @Published var selectedBottleCellarID: Int?
    @Published var backendCellar: BackendModels.Cellar?
    @Published var climate: BackendModels.Environment?
    @Published var briefing: BackendModels.Briefing?
    @Published var drinkingWindows: BackendModels.DrinkingWindows?
    @Published var marketSummary: BackendModels.MarketSummary?
    @Published var bottlePriceHistory: [Int: BackendModels.PriceHistory] = [:]
    @Published var notifications = BackendModels.NotificationList(unread: 0, items: [])
    @Published var notificationError: String?
    @Published var pendingLabelDetections: [BackendModels.LabelDetection] = []
    @Published var liveUpdateSequence = 0
    @Published var lastLiveUpdate = ""
    @Published var inventoryQuery = ""
    @Published var inventoryAllCellars = false
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
                    self?.backendUser = nil
                    self?.wines = []
                    self?.cellars = []
                    self?.inventoryBottles = []
                    self?.inventoryCellars = []
                    self?.notifications = BackendModels.NotificationList(unread: 0, items: [])
                    self?.notificationError = nil
                }
            }
        }
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.networkAvailable = path.status == .satisfied }
        }
        pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
        Task {
            user = await service.restoreSession()
            if user != nil {
                await loadProfile()
                if !(service is BackendService) { await refresh() }
            }
        }
    }
    @Published var networkAvailable = true

    func setLiveUpdatesActive(_ active: Bool) {
        guard let backend = service as? BackendService, active, user != nil else {
            (service as? BackendService)?.stopLiveUpdates()
            return
        }
        backend.startLiveUpdates { [weak self] what in
            Task { @MainActor in
                self?.lastLiveUpdate = what
                self?.liveUpdateSequence += 1
            }
        }
    }

    func reloadVisibleData(for tab: String, change: String) async {
        if change.contains("notifications") { await loadNotifications() }
        switch tab {
        case "cellar": await loadInventoryCellars(); await loadBackendCellar()
        case "inventory": await loadBottles()
        case "sommelier": await loadPersonas(); await loadSommelierBottles()
        case "briefing": await loadBriefing()
        case "value": await loadMarketSummary()
        default: break
        }
    }

    func loadLegalInfo() async {
        do {
            legalInfo = try await service.legalInfo()
            legalError = nil
        } catch {
            legalInfo = nil
            legalError = error.localizedDescription
        }
    }

    func loadProfile() async {
        do { backendUser = try await service.profile(); error = nil }
        catch { self.error = error.localizedDescription }
    }

    func loadPersonas() async {
        do { personas = try await service.personas(); error = nil }
        catch { self.error = error.localizedDescription }
    }

    func savePersona(id: String?, name: String, title: String, color: String, traits: BackendModels.PersonaTraits) async -> Bool {
        do {
            _ = try await service.savePersona(id: id, name: name, title: title, color: color, traits: traits)
            await loadPersonas()
            return error == nil
        } catch let caught { self.error = caught.localizedDescription; return false }
    }

    func deletePersona(id: String) async -> Bool {
        do { try await service.deletePersona(id: id); await loadPersonas(); return error == nil }
        catch { self.error = error.localizedDescription; return false }
    }

    func clearPersonaMemory(id: String) async -> Bool {
        do { try await service.clearPersonaMemory(id: id); await loadPersonas(); return error == nil }
        catch { self.error = error.localizedDescription; return false }
    }

    func winePairing(bottleID: Int) throws -> AsyncThrowingStream<BackendModels.TastingEvent, Error> {
        try service.winePairing(bottleID: bottleID)
    }

    func loadSommelierBottles() async {
        do { sommelierBottles = try await service.bottles(query: "", cellarID: nil); error = nil }
        catch { self.error = error.localizedDescription }
    }

    func loadBriefing() async {
        do {
            async let brief = service.briefing()
            async let windows = service.drinkingWindows()
            briefing = try await brief
            drinkingWindows = try await windows
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    func loadMarketSummary() async {
        do { marketSummary = try await service.marketSummary(); error = nil }
        catch { self.error = error.localizedDescription }
    }

    func loadPriceHistory(bottleID: Int) async {
        do { bottlePriceHistory[bottleID] = try await service.priceHistory(bottleID: bottleID) }
        catch { self.error = error.localizedDescription }
    }

    func loadNotifications() async {
        do { notifications = try await service.notifications(); notificationError = nil }
        catch { notificationError = error.localizedDescription }
    }

    func markNotificationRead(id: Int?) async {
        do {
            try await service.markNotificationRead(id: id)
            await loadNotifications()
        } catch { notificationError = error.localizedDescription }
    }

    func loadPendingLabelDetections() async {
        do { pendingLabelDetections = try await service.pendingLabelDetections() }
        catch { self.error = error.localizedDescription }
    }

    func scanLabelPhoto(cellarID: Int, imageBase64: String, contentType: String) async -> Bool {
        busy = true; error = nil; notice = nil
        do {
            let response = try await service.scanLabelPhoto(cellarID: cellarID, imageBase64: imageBase64, contentType: contentType)
            pendingLabelDetections = (response.new ?? []) + pendingLabelDetections
            if response.new?.isEmpty != false { notice = "No label was detected." }
            busy = false
            return !(response.new ?? []).isEmpty
        } catch {
            self.error = error.localizedDescription
            busy = false
            return false
        }
    }

    func confirmLabelDetection(_ detection: BackendModels.LabelDetection, cellarID: Int, wine: BackendModels.WineInfo) async -> Bool {
        busy = true; error = nil
        do {
            let bottle = try await service.confirmLabelDetection(id: detection.id, cellarID: cellarID, wine: wine)
            pendingLabelDetections.removeAll { $0.id == detection.id }
            await loadInventoryCellars()
            await loadBackendCellar()
            await loadBottles()
            if bottle == nil { notice = "This wine is already in your cellar." }
            busy = false
            return true
        } catch {
            self.error = error.localizedDescription
            busy = false
            return false
        }
    }

    func rejectLabelDetection(_ detection: BackendModels.LabelDetection) async -> Bool {
        do {
            try await service.rejectLabelDetection(id: detection.id)
            pendingLabelDetections.removeAll { $0.id == detection.id }
            error = nil
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func tastingEvents(_ request: BackendModels.TableRequest) throws -> AsyncThrowingStream<BackendModels.TastingEvent, Error> {
        try service.tastingEvents(request)
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
            await loadProfile()
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

    func loadInventoryCellars() async {
        do {
            inventoryCellars = try await service.bottleCellars()
            if !inventoryCellars.contains(where: { $0.id == selectedBottleCellarID }) {
                selectedBottleCellarID = inventoryCellars.first?.id
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadBottles() async {
        do {
            let cellarID = inventoryAllCellars ? nil : selectedBottleCellarID
            inventoryBottles = try await service.bottles(query: inventoryQuery, cellarID: cellarID)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func loadBackendCellar() async {
        guard let id = selectedBottleCellarID else { backendCellar = nil; return }
        do {
            backendCellar = try await service.cellarDetails(id: id)
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    func loadEnvironment(minutes: Int = 1440) async {
        guard let cellarID = selectedBottleCellarID else { climate = nil; return }
        do { climate = try await service.environment(cellarID: cellarID, minutes: minutes); error = nil }
        catch { self.error = error.localizedDescription }
    }

    func saveZone(id: Int, update: BackendModels.ZoneUpdate) async -> Bool {
        do {
            let saved = try await service.updateZone(id: id, update: update)
            climate?.zones = (climate?.zones ?? []).map { $0.id == id ? saved : $0 }
            return true
        } catch { self.error = error.localizedDescription; return false }
    }

    func createBackendCellar(name: String) async -> Bool {
        var success = false
        await perform {
            let cellar = try await service.createCellar(name: name)
            await loadInventoryCellars()
            selectedBottleCellarID = cellar.id
            backendCellar = cellar
            success = true
        }
        return success
    }

    func renameBackendCellar(id: Int, name: String) async -> Bool {
        var success = false
        await perform {
            backendCellar = try await service.renameCellar(id: id, name: name)
            await loadInventoryCellars()
            success = true
        }
        return success
    }

    func saveBottle(id: Int?, cellarID: Int, wine: BackendModels.WineInfo) async -> BackendModels.Bottle? {
        busy = true; error = nil; notice = nil
        do {
            let bottle = try await service.saveBottle(id: id, cellarID: cellarID, wine: wine)
            await loadBottles()
            busy = false
            return bottle
        } catch {
            self.error = error.localizedDescription
            busy = false
            return nil
        }
    }

    func removeBottle(id: Int, reason: String) async -> Bool {
        busy = true; error = nil; notice = nil
        do {
            try await service.removeBottle(id: id, reason: reason)
            await loadBottles()
            busy = false
            return true
        } catch {
            self.error = error.localizedDescription
            busy = false
            return false
        }
    }
    func signOut() { Task { await service.signOut(); user = nil; backendUser = nil; personas = []; sommelierBottles = []; wines = []; cellars = []; inventoryBottles = []; inventoryCellars = []; climate = nil; briefing = nil; drinkingWindows = nil; marketSummary = nil; bottlePriceHistory = [:]; notifications = BackendModels.NotificationList(unread: 0, items: []); notificationError = nil } }
    func updateProfile(_ update: BackendModels.ProfileUpdate) async -> Bool {
        var success = false
        await perform {
            backendUser = try await service.updateProfile(update)
            if let email = backendUser?.email { user = Account(email: email) }
            notice = "Profile updated."
            success = true
        }
        return success
    }
    func verifyEmailChange(code: String) async -> Bool {
        var success = false
        await perform {
            backendUser = try await service.verifyEmailChange(code: code)
            if let email = backendUser?.email { user = Account(email: email) }
            notice = "Email address confirmed."
            success = true
        }
        return success
    }
    func updateMarketingConsent(_ granted: Bool) async -> Bool {
        await updateProfile(BackendModels.ProfileUpdate(consents: ["marketing": granted]))
    }
    func deleteAccount() async { await perform { try await service.deleteAccount(); user = nil; backendUser = nil; wines = []; cellars = []; inventoryBottles = []; inventoryCellars = []; climate = nil } }
    func refresh() async {
        await perform { wines = try await service.wines(); cellars = try await service.cellars(); if selectedCellar == nil { selectedCellar = cellars.first?.id } }
    }
    func save(_ wine: Wine) async { await perform { try await service.save(wine); wines = try await service.wines() } }
    func remove(_ wine: Wine) async { await perform { try await service.remove(wine); wines = try await service.wines() } }
    func save(_ cellar: Cellar) async { await perform { try await service.save(cellar); cellars = try await service.cellars() } }
    func ask(_ prompt: String) async -> String { do { return try await service.ask(prompt) } catch { self.error = error.localizedDescription; return "" } }
    func export() async -> Data? {
        do { let data = try await service.exportData(); error = nil; return data }
        catch { self.error = error.localizedDescription; return nil }
    }

    private func perform(_ action: () async throws -> Void) async {
        busy = true; error = nil; notice = nil
        do { try await action() } catch { self.error = error.localizedDescription }
        busy = false
    }
}
