import Foundation
import CryptoKit
import Security

protocol AppService {
    func restoreSession() async -> Account?
    func legalInfo() async throws -> BackendModels.LegalInfo
    func signUp(username: String, email: String, password: String, birthDate: String, consents: [String: Bool]) async throws -> SignUpOutcome
    func signIn(identifier: String, password: String) async throws -> Account
    func verifyEmail(email: String, code: String) async throws -> Account
    func resendVerification(email: String) async throws
    func requestPasswordReset(email: String) async throws
    func resetPassword(email: String, code: String, password: String) async throws
    func bottleCellars() async throws -> [BackendModels.CellarSummary]
    func cellarDetails(id: Int) async throws -> BackendModels.Cellar
    func createCellar(name: String) async throws -> BackendModels.Cellar
    func renameCellar(id: Int, name: String) async throws -> BackendModels.Cellar
    func environment(cellarID: Int, minutes: Int) async throws -> BackendModels.Environment
    func updateZone(id: Int, update: BackendModels.ZoneUpdate) async throws -> BackendModels.EnvZone
    func bottles(query: String, cellarID: Int?) async throws -> [BackendModels.Bottle]
    func personas() async throws -> [BackendModels.Persona]
    func tastingEvents(_ request: BackendModels.TableRequest) throws -> AsyncThrowingStream<BackendModels.TastingEvent, Error>
    func briefing() async throws -> BackendModels.Briefing
    func drinkingWindows() async throws -> BackendModels.DrinkingWindows
    func marketSummary() async throws -> BackendModels.MarketSummary
    func priceHistory(bottleID: Int) async throws -> BackendModels.PriceHistory
    func notifications() async throws -> BackendModels.NotificationList
    func markNotificationRead(id: Int?) async throws
    func scanLabelPhoto(cellarID: Int, imageBase64: String, contentType: String) async throws -> BackendModels.LabelPhotoResponse
    func pendingLabelDetections() async throws -> [BackendModels.LabelDetection]
    func confirmLabelDetection(id: Int, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle?
    func rejectLabelDetection(id: Int) async throws
    func saveBottle(id: Int?, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle
    func removeBottle(id: Int, reason: String) async throws
    func profile() async throws -> BackendModels.User
    func updateProfile(_ update: BackendModels.ProfileUpdate) async throws -> BackendModels.User
    func verifyEmailChange(code: String) async throws -> BackendModels.User
    func wines() async throws -> [Wine]
    func save(_ wine: Wine) async throws
    func remove(_ wine: Wine) async throws
    func cellars() async throws -> [Cellar]
    func save(_ cellar: Cellar) async throws
    func ask(_ prompt: String) async throws -> String
    func exportData() async throws -> Data
    func deleteAccount() async throws
    func signOut() async
}

enum SignUpOutcome {
    case created
    case verificationRequired(email: String)
}

enum ServiceError: LocalizedError {
    case invalidCredentials, accountExists, invalidInput
    var errorDescription: String? {
        switch self {
        case .invalidCredentials: "Invalid email or password"
        case .accountExists: "An account with this email already exists"
        case .invalidInput: "Please check the entered information"
        }
    }
}

final class MockService: AppService {
    static let demoEmail = "test@omnicave.app"
    static let demoPassword = "Cellar123!"
    private struct SavedUser: Codable { var email: String; var salt: String; var digest: String; var username: String? = nil }
    private let defaults = UserDefaults.standard
    private var signedIn: String? { defaults.string(forKey: "mock.signedIn") }
    func restoreSession() async -> Account? { signedIn.map(Account.init(email:)) }
    private var accounts: [SavedUser] {
        get { (try? JSONDecoder().decode([SavedUser].self, from: defaults.data(forKey: "mock.accounts") ?? Data())) ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "mock.accounts") }
    }

    func legalInfo() async throws -> BackendModels.LegalInfo {
        BackendModels.LegalInfo(
            version: "demo",
            consents: [
                BackendModels.Consent(key: "terms", required: true, title: "Terms of Service", summary: "I agree to the OmniCave Terms of Service.", document: "terms"),
                BackendModels.Consent(key: "privacy", required: true, title: "Collection and use of personal information", summary: "Your account and cellar data are used to provide OmniCave and are kept until you delete your account.", document: "privacy"),
                BackendModels.Consent(key: "overseas", required: true, title: "Processing outside Korea", summary: "Some data may be processed by service providers outside Korea.", document: "privacy"),
                BackendModels.Consent(key: "marketing", required: false, title: "News and product emails", summary: "Send wine news and OmniCave updates by email.", document: nil)
            ],
            documents: [
                "terms": "# Terms of Service\n\n## Demo policy\nThis local demo does not send your information to a server.",
                "privacy": "# Privacy Policy\n\n## Demo policy\nYour demo account and cellar data stay on this device."
            ]
        )
    }

    func signUp(username: String, email: String, password: String, birthDate: String, consents: [String: Bool]) async throws -> SignUpOutcome {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard username.range(of: #"^[A-Za-z0-9_.-]{3,32}$"#, options: .regularExpression) != nil,
              Self.validEmail(email), Self.validPassword(password),
              consents["terms"] == true, consents["privacy"] == true, consents["overseas"] == true,
              let year = Int(birthDate.prefix(4)), Calendar.current.component(.year, from: .now) - year >= 19
        else { throw ServiceError.invalidInput }
        guard !accounts.contains(where: { $0.email == email || $0.username == username }) else { throw ServiceError.accountExists }
        let salt = UUID().uuidString
        var users = accounts
        users.append(SavedUser(email: email, salt: salt, digest: Self.hash(password, salt), username: username))
        accounts = users
        return .created
    }

    func signIn(identifier: String, password: String) async throws -> Account {
        let value = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let email = value.lowercased()
        ensureDemoAccount()
        guard let user = accounts.first(where: { $0.email == email || $0.username == value }), user.digest == Self.hash(password, user.salt) else { throw ServiceError.invalidCredentials }
        defaults.set(user.email, forKey: "mock.signedIn")
        return Account(email: user.email)
    }

    func verifyEmail(email: String, code: String) async throws -> Account { throw ServiceError.invalidInput }
    func resendVerification(email: String) async throws {}
    func requestPasswordReset(email: String) async throws {}
    func resetPassword(email: String, code: String, password: String) async throws { throw ServiceError.invalidInput }

    func bottleCellars() async throws -> [BackendModels.CellarSummary] {
        let bottles = try await storedBottles()
        return load([BackendModels.CellarSummary].self, key: key("backendCellars"), default: [
            BackendModels.CellarSummary(id: 1, name: "Home cellar", bottleCount: bottles.filter { $0.cellarId == 1 }.count),
            BackendModels.CellarSummary(id: 2, name: "Summer house", bottleCount: bottles.filter { $0.cellarId == 2 }.count)
        ]).map { item in
            var updated = item
            updated.bottleCount = bottles.filter { $0.cellarId == item.id }.count
            return updated
        }
    }

    func cellarDetails(id: Int) async throws -> BackendModels.Cellar {
        let cellars = try await bottleCellars()
        let summary = cellars.first(where: { $0.id == id })
        let bottles = try await self.bottles(query: "", cellarID: id)
        return BackendModels.Cellar(id: id, name: summary?.name, widthCm: 120, heightCm: 200, depthCm: 60,
                                    racks: [36.0, 72.0, 108.0, 144.0, 180.0].enumerated().map { index, y in
                                        BackendModels.Rack(id: index + 1, name: "Rack \(index + 1)", kind: "shelf", yCm: y)
                                    }, bottles: bottles)
    }

    func createCellar(name: String) async throws -> BackendModels.Cellar {
        var cellars = try await bottleCellars()
        let id = (cellars.map(\.id).max() ?? 0) + 1
        cellars.append(BackendModels.CellarSummary(id: id, name: name))
        defaults.set(try? JSONEncoder().encode(cellars), forKey: key("backendCellars"))
        return BackendModels.Cellar(id: id, name: name, widthCm: 120, heightCm: 200, depthCm: 60, racks: [], bottles: [])
    }

    func renameCellar(id: Int, name: String) async throws -> BackendModels.Cellar {
        var cellars = try await bottleCellars()
        if let index = cellars.firstIndex(where: { $0.id == id }) { cellars[index].name = name }
        defaults.set(try? JSONEncoder().encode(cellars), forKey: key("backendCellars"))
        return try await cellarDetails(id: id)
    }

    func environment(cellarID: Int, minutes: Int) async throws -> BackendModels.Environment {
        let zones = load([BackendModels.EnvZone].self, key: key("environment.\(cellarID)"), default: sampleZones(cellarID: cellarID))
        return BackendModels.Environment(cellarId: cellarID, zones: zones)
    }

    func updateZone(id: Int, update: BackendModels.ZoneUpdate) async throws -> BackendModels.EnvZone {
        for cellarID in [1, 2] {
            var zones = load([BackendModels.EnvZone].self, key: key("environment.\(cellarID)"), default: sampleZones(cellarID: cellarID))
            if let index = zones.firstIndex(where: { $0.id == id }) {
                zones[index].targetTemp = update.targetTemp; zones[index].targetHum = update.targetHum
                zones[index].tempMin = update.tempMin; zones[index].tempMax = update.tempMax
                zones[index].humMin = update.humMin; zones[index].humMax = update.humMax
                zones[index].alertMinutes = update.alertMinutes
                store(zones, key: key("environment.\(cellarID)"))
                return zones[index]
            }
        }
        throw ServiceError.invalidInput
    }

    private func sampleZones(cellarID: Int) -> [BackendModels.EnvZone] {
        let now = Date()
        let formatter = ISO8601DateFormatter()
        let history: [BackendModels.Reading] = [-24, -12, -6, -1].map { offset in
            BackendModels.Reading(temp: cellarID == 1 ? 12.4 : 11.8, hum: cellarID == 1 ? 67 : 70,
                                  ts: formatter.string(from: now.addingTimeInterval(Double(offset) * 3600)))
        }
        return [BackendModels.EnvZone(id: cellarID * 10, name: "Main zone", yFrom: 0, yTo: 200,
                                      targetTemp: 12, targetHum: 68, tempMin: 9.5, tempMax: 14.5,
                                      humMin: 56, humMax: 80, alertMinutes: 15, latest: history.last,
                                      history: history, sensorOnline: true, inRange: true)]
    }

    func bottles(query: String, cellarID: Int?) async throws -> [BackendModels.Bottle] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await storedBottles().filter { bottle in
            let cellarMatch = cellarID == nil || bottle.cellarId == cellarID
            let searchFields = [bottle.wine.name, bottle.wine.producer ?? "", bottle.wine.region ?? "", bottle.wine.grape ?? "", String(bottle.wine.vintage ?? 0)]
            return cellarMatch && (needle.isEmpty || searchFields.contains { $0.localizedCaseInsensitiveContains(needle) })
        }
    }

    func personas() async throws -> [BackendModels.Persona] { Self.samplePersonas }

    func tastingEvents(_ request: BackendModels.TableRequest) throws -> AsyncThrowingStream<BackendModels.TastingEvent, Error> {
        AsyncThrowingStream { continuation in
            for id in request.personaIds {
                let person = Self.samplePersonas.first { $0.id == id } ?? Self.samplePersonas[0]
                continuation.yield(.init(type: "turn", persona: person.id, name: person.name, title: person.title, color: person.color))
                let text = "This is a local tasting preview. In backend mode, my comments will reflect your cellar and the topic at hand."
                continuation.yield(.init(type: "delta", persona: person.id, text: text))
                continuation.yield(.init(type: "turn_end", persona: person.id))
            }
            continuation.yield(.init(type: "done"))
            continuation.finish()
        }
    }

    func briefing() async throws -> BackendModels.Briefing {
        let windows = try await drinkingWindows()
        let value = try await marketSummary()
        return BackendModels.Briefing(
            date: ISO8601DateFormatter().string(from: Date()),
            news: [
                .init(title: "Sample: How to enjoy a cellar selection", link: nil, summary: "A sample story for the offline demo.", published: nil, source: "sample", relevance: 0, matched: []),
                .init(title: "Sample: Vintage notes for classic regions", link: nil, summary: "This headline is demo content.", published: nil, source: "sample", relevance: 0, matched: [])
            ], newsIsSample: true,
            insights: ["Collection value $\(Int(value.total ?? 0)) (simulated)", "\(windows.ready?.count ?? 0) bottles are ready to drink."],
            summary: "\(windows.ready?.count ?? 0) bottles are ready to drink.", briefingTime: "08:00"
        )
    }

    func drinkingWindows() async throws -> BackendModels.DrinkingWindows {
        let bottles = try await storedBottles()
        return BackendModels.DrinkingWindows(ready: bottles.filter { $0.windowStatus == "ready" },
            approaching: bottles.filter { $0.windowStatus == "young" }, pastPeak: bottles.filter { $0.windowStatus == "past-peak" },
            year: Calendar.current.component(.year, from: .now))
    }

    func marketSummary() async throws -> BackendModels.MarketSummary {
        let bottles = try await storedBottles()
        let rows = bottles.map { bottle in
            BackendModels.ValueRow(bottleId: bottle.id, label: "\(bottle.wine.producer ?? "") \(bottle.wine.name) \(bottle.wine.vintage ?? 0)",
                price: bottle.wine.basePrice ?? 30, change12m: 4.2, cellar: bottle.cellarName ?? "Cellar")
        }
        let total = rows.reduce(0) { $0 + ($1.price ?? 0) }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM"
        let history = (0...24).compactMap { offset -> BackendModels.ValuePoint? in
            guard let date = Calendar.current.date(byAdding: .month, value: offset - 24, to: .now) else { return nil }
            return BackendModels.ValuePoint(date: formatter.string(from: date), value: total * (0.92 + Double(offset) * 0.0033))
        }
        return BackendModels.MarketSummary(total: total, change12m: 4.2, count: bottles.count, currency: "USD", source: "simulated", history: history, bottles: rows)
    }

    func priceHistory(bottleID: Int) async throws -> BackendModels.PriceHistory {
        guard let bottle = try await storedBottles().first(where: { $0.id == bottleID }) else { throw ServiceError.invalidInput }
        let current = bottle.wine.basePrice ?? 30
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM"
        let history = (0...24).compactMap { offset -> BackendModels.PricePoint? in
            guard let date = Calendar.current.date(byAdding: .month, value: offset - 24, to: .now) else { return nil }
            return BackendModels.PricePoint(date: formatter.string(from: date), price: current * (0.92 + Double(offset) * 0.0033))
        }
        return BackendModels.PriceHistory(bottleId: bottleID, history: history, source: "simulated")
    }

    func notifications() async throws -> BackendModels.NotificationList {
        let samples = [
            BackendModels.Notification(id: 2, kind: "window", level: "warning", message: "A bottle in your cellar is approaching its drinking window.", read: 0, createdAt: "2026-11-19 08:00:00"),
            BackendModels.Notification(id: 1, kind: "environment", level: "info", message: "Your cellar climate is within its target range.", read: 1, createdAt: "2026-11-18 08:00:00")
        ]
        let items = load([BackendModels.Notification].self, key: key("notifications"), default: samples)
        return BackendModels.NotificationList(unread: items.filter { $0.read == 0 }.count, items: items)
    }

    func markNotificationRead(id: Int?) async throws {
        var list = try await notifications().items ?? []
        for index in list.indices where id == nil || list[index].id == id { list[index].read = 1 }
        store(list, key: key("notifications"))
    }

    func scanLabelPhoto(cellarID: Int, imageBase64: String, contentType: String) async throws -> BackendModels.LabelPhotoResponse {
        let detection = BackendModels.LabelDetection(
            detectionId: Int(Date().timeIntervalSince1970 * 1000),
            wine: BackendModels.DetectedWine(name: "Sample Riesling", producer: "Mock Winery", color: "white", vintage: 2022, grape: "Riesling"),
            note: "Photo reading is simulated. Review this sample wine before adding it.", confidence: 0.72
        )
        var pending = try await pendingLabelDetections()
        pending.insert(detection, at: 0)
        store(pending, key: key("labelDetections"))
        return BackendModels.LabelPhotoResponse(new: [detection], provider: "mock")
    }

    func pendingLabelDetections() async throws -> [BackendModels.LabelDetection] {
        load([BackendModels.LabelDetection].self, key: key("labelDetections"), default: [])
    }

    func confirmLabelDetection(id: Int, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle? {
        guard try await pendingLabelDetections().contains(where: { $0.id == id }) else { throw ServiceError.invalidInput }
        let bottle = try await saveBottle(id: nil, cellarID: cellarID, wine: wine)
        let pending = try await pendingLabelDetections().filter { $0.id != id }
        store(pending, key: key("labelDetections"))
        return bottle
    }

    func rejectLabelDetection(id: Int) async throws {
        store(try await pendingLabelDetections().filter { $0.id != id }, key: key("labelDetections"))
    }

    func saveBottle(id: Int?, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle {
        var values = try await storedBottles()
        let existing = id.flatMap { requestedID in values.first { $0.id == requestedID } }
        let bottle = BackendModels.Bottle(
            id: existing?.id ?? ((values.map(\.id).max() ?? 100) + 1),
            cellarId: existing?.cellarId ?? cellarID,
            cellarName: existing?.cellarName ?? (cellarID == 2 ? "Summer house" : "Home cellar"),
            wine: wine,
            location: existing?.location ?? "Unassigned · front",
            windowStatus: existing?.windowStatus ?? "young",
            source: existing?.source ?? "manual"
        )
        if let index = values.firstIndex(where: { $0.id == bottle.id }) { values[index] = bottle } else { values.append(bottle) }
        store(values, key: key("bottles"))
        return bottle
    }

    func removeBottle(id: Int, reason: String) async throws {
        store(try await storedBottles().filter { $0.id != id }, key: key("bottles"))
    }

    func profile() async throws -> BackendModels.User {
        if let stored = loadOptional(BackendModels.User.self, key: key("profile")) { return stored }
        let email = signedIn ?? Self.demoEmail
        return BackendModels.User(username: accounts.first(where: { $0.email == email })?.username ?? "demo", email: email,
            displayName: accounts.first(where: { $0.email == email })?.username ?? "Demo", preferences: BackendModels.Preferences(styles: [], regions: [], grapes: [], likes: "", dislikes: ""),
            briefingTime: "08:00", emailVerified: true, consents: ["terms": true, "privacy": true, "overseas": true, "marketing": false])
    }

    func updateProfile(_ update: BackendModels.ProfileUpdate) async throws -> BackendModels.User {
        var value = try await profile()
        let changesEmail = update.email.map { $0.lowercased() != (value.email ?? "").lowercased() } ?? false
        if changesEmail || update.password != nil {
            guard let email = signedIn, let saved = accounts.first(where: { $0.email == email }),
                  Self.hash(update.currentPassword ?? "", saved.salt) == saved.digest else { throw ServiceError.invalidInput }
        }
        if let name = update.displayName { value.displayName = name }
        if let email = update.email, email != value.email {
            guard Self.validEmail(email), !accounts.contains(where: { $0.email == email.lowercased() }) else { throw ServiceError.invalidInput }
            let oldEmail = signedIn
            value.email = email.lowercased()
            if let old = oldEmail, var saved = accounts.first(where: { $0.email == old }) {
                let newEmail = value.email ?? old
                saved.email = newEmail; accounts.removeAll { $0.email == old }; accounts.append(saved)
                let oldPrefix = "mock.\(old)."
                for (storedKey, data) in defaults.dictionaryRepresentation() where storedKey.hasPrefix(oldPrefix) {
                    defaults.set(data, forKey: "mock.\(newEmail)." + storedKey.dropFirst(oldPrefix.count))
                    defaults.removeObject(forKey: storedKey)
                }
                defaults.set(newEmail, forKey: "mock.signedIn")
            }
        }
        if let password = update.password {
            guard password.count >= 8, let email = signedIn, var saved = accounts.first(where: { $0.email == email }) else { throw ServiceError.invalidInput }
            saved.salt = UUID().uuidString; saved.digest = Self.hash(password, saved.salt); accounts.removeAll { $0.email == email }; accounts.append(saved)
        }
        if let preferences = update.preferences { value.preferences = preferences }
        if let time = update.briefingTime { value.briefingTime = time }
        if let consents = update.consents {
            guard consents.keys.allSatisfy({ $0 == "marketing" }) else { throw ServiceError.invalidInput }
            value.consents = (value.consents ?? [:]).merging(consents) { _, new in new }
        }
        store(value, key: key("profile"))
        return value
    }

    func verifyEmailChange(code: String) async throws -> BackendModels.User { try await profile() }

    func wines() async throws -> [Wine] { load([Wine].self, key: key("wines"), default: Self.sampleWines) }
    func save(_ wine: Wine) async throws {
        var values = try await wines()
        if let index = values.firstIndex(where: { $0.id == wine.id }) { values[index] = wine } else { values.append(wine) }
        store(values, key: key("wines"))
    }
    func remove(_ wine: Wine) async throws { store(try await wines().filter { $0.id != wine.id }, key: key("wines")) }
    func cellars() async throws -> [Cellar] { load([Cellar].self, key: key("cellars"), default: [Cellar(id: Self.sampleCellarID, name: "Home cellar"), Cellar(name: "Summer house")]) }
    func save(_ cellar: Cellar) async throws {
        var values = try await cellars()
        if let index = values.firstIndex(where: { $0.id == cellar.id }) { values[index] = cellar } else { values.append(cellar) }
        store(values, key: key("cellars"))
    }
    func ask(_ prompt: String) async throws -> String { "Based on your cellar, consider a bottle that complements “\(prompt)”. This is a demonstration response; connect the backend for a personalized AI answer." }
    func exportData() async throws -> Data {
        try JSONEncoder().encode(Export(wines: try await wines(), cellars: try await cellars(), profile: try await profile(), bottles: try await storedBottles()))
    }
    func deleteAccount() async throws {
        guard let email = signedIn else { return }
        accounts.removeAll { $0.email == email }
        let prefix = "mock.\(email)."
        for storedKey in Array(defaults.dictionaryRepresentation().keys) where storedKey.hasPrefix(prefix) { defaults.removeObject(forKey: storedKey) }
        defaults.removeObject(forKey: "mock.signedIn")
    }
    func signOut() async { defaults.removeObject(forKey: "mock.signedIn") }

    private func ensureDemoAccount() {
        guard !accounts.contains(where: { $0.email == Self.demoEmail }) else { return }
        let salt = UUID().uuidString
        var users = accounts
        users.append(SavedUser(email: Self.demoEmail, salt: salt, digest: Self.hash(Self.demoPassword, salt), username: "demo"))
        accounts = users
    }

    private func key(_ item: String) -> String { "mock.\(signedIn ?? "guest").\(item)" }
    private func storedBottles() async throws -> [BackendModels.Bottle] {
        load([BackendModels.Bottle].self, key: key("bottles"), default: Self.sampleBottles)
    }
    private func load<T: Decodable>(_ type: T.Type, key: String, default value: T) -> T {
        guard let data = defaults.data(forKey: key), let decoded = try? JSONDecoder().decode(type, from: data) else { return value }
        return decoded
    }
    private func loadOptional<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
    private func store<T: Encodable>(_ value: T, key: String) { defaults.set(try? JSONEncoder().encode(value), forKey: key) }
    private struct Export: Encodable { var wines: [Wine]; var cellars: [Cellar]; var profile: BackendModels.User? = nil; var bottles: [BackendModels.Bottle]? = nil }
    private static func validEmail(_ email: String) -> Bool { email.range(of: #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#, options: .regularExpression) != nil }
    private static func validPassword(_ password: String) -> Bool { password.range(of: #"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$"#, options: .regularExpression) != nil }
    private static func hash(_ password: String, _ salt: String) -> String {
        let key = SymmetricKey(data: Data(salt.utf8))
        var value = Data(salt.utf8)
        value.append(contentsOf: [0, 0, 0, 1])
        var result = Data(repeating: 0, count: 32)
        for _ in 0..<100_000 {
            value = Data(HMAC<SHA256>.authenticationCode(for: value, using: key))
            for index in result.indices { result[index] ^= value[index] }
        }
        return result.map { String(format: "%02x", $0) }.joined()
    }
    private static let sampleWines = [
        Wine(name: "Barolo", winery: "G.D. Vajra", region: "Piedmont", vintage: 2019, grape: "Nebbiolo", location: "A1 · Shelf 1", cellarID: sampleCellarID, value: 62),
        Wine(name: "Château Margaux", winery: "Château Margaux", region: "Bordeaux", vintage: 2018, grape: "Cabernet Sauvignon", location: "B2 · Shelf 2", cellarID: sampleCellarID, value: 820),
        Wine(name: "Riesling Kabinett", winery: "Dr. Loosen", region: "Mosel", vintage: 2021, grape: "Riesling", location: "C1 · Shelf 3", cellarID: sampleCellarID, value: 28)
    ]
    private static let sampleBottles = [
        BackendModels.Bottle(id: 101, cellarId: 1, cellarName: "Home cellar", wine: BackendModels.WineInfo(name: "Barolo", producer: "G.D. Vajra", region: "Piedmont", country: "Italy", color: "red", vintage: 2019, grape: "Nebbiolo", drinkFrom: 2024, drinkTo: 2034, basePrice: 62), location: "Rack 3 · 12 cm from left · front", x: 12, y: 113, z: 6, orientation: "lying", windowStatus: "ready"),
        BackendModels.Bottle(id: 102, cellarId: 1, cellarName: "Home cellar", wine: BackendModels.WineInfo(name: "Château Margaux", producer: "Château Margaux", region: "Bordeaux", country: "France", color: "red", vintage: 2018, grape: "Cabernet Sauvignon", drinkFrom: 2027, drinkTo: 2045, basePrice: 820), location: "Rack 5 · 20 cm from left · front", x: 20, y: 185, z: 6, orientation: "lying", windowStatus: "young"),
        BackendModels.Bottle(id: 103, cellarId: 2, cellarName: "Summer house", wine: BackendModels.WineInfo(name: "Riesling Kabinett", producer: "Dr. Loosen", region: "Mosel", country: "Germany", color: "white", vintage: 2021, grape: "Riesling", drinkFrom: 2023, drinkTo: 2031, basePrice: 28), location: "Rack 2 · 9 cm from left · front", x: 9, y: 77, z: 6, orientation: "lying", windowStatus: "ready")
    ]
    private static let samplePersonas = [
        BackendModels.Persona(id: "demo-ada", name: "Ada Laurent", title: "The classicist", color: "#7A3340", builtIn: true),
        BackendModels.Persona(id: "demo-min", name: "Min Park", title: "The explorer", color: "#2F5D50", builtIn: true),
        BackendModels.Persona(id: "demo-jules", name: "Jules Moreau", title: "The skeptic", color: "#3E4F7A", builtIn: true),
        BackendModels.Persona(id: "demo-sana", name: "Sana Okafor", title: "The optimist", color: "#7A5A2B", builtIn: true)
    ]
    private static let sampleCellarID = UUID(uuidString: "4D198430-28FB-43B6-BE19-B86BEF376F3A")!
}

/// Backend service. Authentication uses the current /api contract; other feature routes are migrated step by step.
final class BackendService: AppService {
    private let baseURL: URL
    private let session: URLSession
    private let api: APIClient
    private var token: String? {
        didSet {
            api.token = token
            if let token { Keychain.save(token) } else { Keychain.remove() }
        }
    }
    var onUnauthorized: (() -> Void)?

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.api = APIClient(baseURL: baseURL, session: session)
        self.token = Keychain.read()
        self.api.token = self.token
        self.api.onUnauthorized = { [weak self] in
            self?.token = nil
            self?.onUnauthorized?()
        }
    }

    func restoreSession() async -> Account? {
        guard token != nil else { return nil }
        do {
            let user: BackendModels.User = try await api.get("api/me")
            guard let email = user.email else { token = nil; return nil }
            return Account(email: email)
        } catch {
            return nil
        }
    }

    func legalInfo() async throws -> BackendModels.LegalInfo {
        try await api.get("api/legal")
    }

    func signUp(username: String, email: String, password: String, birthDate: String, consents: [String: Bool]) async throws -> SignUpOutcome {
        let body = RegisterBody(username: username, email: email, password: password, birthDate: birthDate, consents: consents, seedDemo: false)
        let reply: BackendModels.AuthReply = try await api.request("POST", path: "api/auth/register", body: api.encode(body))
        if reply.verificationRequired == true {
            return .verificationRequired(email: reply.email ?? email)
        }
        // Registration returns a token on servers without email verification. Deliberately
        // do not save it: the sign-up flow returns to Log in, like Android.
        return .created
    }

    func signIn(identifier: String, password: String) async throws -> Account {
        let reply: BackendModels.AuthReply = try await api.request(
            "POST", path: "api/auth/login", body: api.encode(LoginBody(username: identifier, password: password))
        )
        guard let accessToken = reply.accessToken else { throw APIClientError.invalidResponse }
        token = accessToken
        return Account(email: reply.user?.email ?? identifier)
    }

    func verifyEmail(email: String, code: String) async throws -> Account {
        let reply: BackendModels.AuthReply = try await api.request(
            "POST", path: "api/auth/verify-email", body: api.encode(VerificationBody(email: email, code: code))
        )
        guard let accessToken = reply.accessToken else { throw APIClientError.invalidResponse }
        token = accessToken
        return Account(email: reply.user?.email ?? email)
    }

    func resendVerification(email: String) async throws {
        let _: OKReply = try await api.request("POST", path: "api/auth/resend-code", body: api.encode(EmailBody(email: email)))
    }

    func requestPasswordReset(email: String) async throws {
        let _: OKReply = try await api.request("POST", path: "api/auth/forgot-password", body: api.encode(EmailBody(email: email)))
    }

    func resetPassword(email: String, code: String, password: String) async throws {
        let _: OKReply = try await api.request("POST", path: "api/auth/reset-password", body: api.encode(ResetPasswordBody(email: email, code: code, password: password)))
    }

    func bottleCellars() async throws -> [BackendModels.CellarSummary] {
        try await api.get("api/cellars")
    }

    func cellarDetails(id: Int) async throws -> BackendModels.Cellar {
        try await api.get("api/cellars/\(id)")
    }

    func createCellar(name: String) async throws -> BackendModels.Cellar {
        try await api.request("POST", path: "api/cellars", body: api.encode(NewCellarBody(name: name)))
    }

    func renameCellar(id: Int, name: String) async throws -> BackendModels.Cellar {
        try await api.request("PATCH", path: "api/cellars/\(id)", body: api.encode(NewCellarBody(name: name)))
    }

    func environment(cellarID: Int, minutes: Int) async throws -> BackendModels.Environment {
        try await api.get("api/cellars/\(cellarID)/environment", queryItems: [URLQueryItem(name: "minutes", value: String(minutes))])
    }

    func updateZone(id: Int, update: BackendModels.ZoneUpdate) async throws -> BackendModels.EnvZone {
        try await api.request("PATCH", path: "api/zones/\(id)", body: api.encode(update))
    }

    func bottles(query: String, cellarID: Int?) async throws -> [BackendModels.Bottle] {
        var items = [URLQueryItem(name: "q", value: query)]
        if let cellarID { items.append(URLQueryItem(name: "cellar_id", value: String(cellarID))) }
        return try await api.get("api/bottles", queryItems: items)
    }

    func personas() async throws -> [BackendModels.Persona] { try await api.get("api/personas") }

    func tastingEvents(_ request: BackendModels.TableRequest) throws -> AsyncThrowingStream<BackendModels.TastingEvent, Error> {
        try api.stream("api/ai/table", body: api.encode(request))
    }

    func briefing() async throws -> BackendModels.Briefing { try await api.get("api/briefing") }
    func drinkingWindows() async throws -> BackendModels.DrinkingWindows { try await api.get("api/recommendations/windows") }
    func marketSummary() async throws -> BackendModels.MarketSummary { try await api.get("api/market/summary") }
    func priceHistory(bottleID: Int) async throws -> BackendModels.PriceHistory { try await api.get("api/bottles/\(bottleID)/price-history") }
    func notifications() async throws -> BackendModels.NotificationList { try await api.get("api/notifications") }
    func markNotificationRead(id: Int?) async throws {
        let body: Data
        if let id { body = try api.encode(["id": id]) } else { body = try api.encode([String: Int]()) }
        let _: OKReply = try await api.request("POST", path: "api/notifications/read", body: body)
    }
    func scanLabelPhoto(cellarID: Int, imageBase64: String, contentType: String) async throws -> BackendModels.LabelPhotoResponse {
        try await api.request("POST", path: "api/cellars/\(cellarID)/vision/label", body: api.encode(LabelPhotoBody(imageB64: imageBase64, contentType: contentType)))
    }
    func pendingLabelDetections() async throws -> [BackendModels.LabelDetection] {
        let records: [BackendModels.DetectionRecord] = try await api.get("api/detections")
        return records.map { BackendModels.LabelDetection(detectionId: $0.id, wine: $0.payload.wine, note: $0.payload.note, confidence: $0.payload.confidence) }
    }
    func confirmLabelDetection(id: Int, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle? {
        let reply: ConfirmDetectionReply = try await api.request("POST", path: "api/detections/\(id)/confirm", body: api.encode(ConfirmDetectionBody(wine: wine)))
        return reply.bottle
    }
    func rejectLabelDetection(id: Int) async throws {
        let _: RejectedReply = try await api.request("POST", path: "api/detections/\(id)/reject", body: api.encode([String: String]()))
    }

    func saveBottle(id: Int?, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle {
        if let id {
            return try await api.request("PATCH", path: "api/bottles/\(id)", body: api.encode(WineBody(wine: wine)))
        }
        return try await api.request("POST", path: "api/bottles", body: api.encode(NewBottleBody(cellarID: cellarID, wine: wine)))
    }

    func removeBottle(id: Int, reason: String) async throws {
        let _: OKReply = try await api.request(
            "DELETE", path: "api/bottles/\(id)", queryItems: [URLQueryItem(name: "reason", value: reason)]
        )
    }

    private struct RegisterBody: Encodable {
        var username: String; var email: String; var password: String; var birthDate: String
        var consents: [String: Bool]; var seedDemo: Bool
    }
    private struct LoginBody: Encodable { var username: String; var password: String }
    private struct VerificationBody: Encodable { var email: String; var code: String }
    private struct EmailBody: Encodable { var email: String }
    private struct ResetPasswordBody: Encodable { var email: String; var code: String; var password: String }
    private struct OKReply: Decodable { var ok: Bool? }
    private struct LabelPhotoBody: Encodable { var imageB64: String; var contentType: String }
    private struct ConfirmDetectionBody: Encodable { var wine: BackendModels.WineInfo }
    private struct ConfirmDetectionReply: Decodable { var bottle: BackendModels.Bottle? }
    private struct RejectedReply: Decodable { var rejected: Int? }
    private struct WineBody: Encodable { var wine: BackendModels.WineInfo }
    private struct NewBottleBody: Encodable { var cellarID: Int; var wine: BackendModels.WineInfo }
    private struct NewCellarBody: Encodable { var name: String }

    private func request<T: Decodable>(_ method: String, _ path: String, body: Data? = nil) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard ((response as? HTTPURLResponse)?.statusCode ?? 500) < 300 else { throw ServiceError.invalidCredentials }
        let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }
    private func send(_ method: String, _ path: String, body: Data? = nil) async throws {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method; request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (_, response) = try await session.data(for: request)
        guard ((response as? HTTPURLResponse)?.statusCode ?? 500) < 300 else { throw ServiceError.invalidCredentials }
    }
    private func json<T: Encodable>(_ value: T) throws -> Data { let encoder = JSONEncoder(); encoder.keyEncodingStrategy = .convertToSnakeCase; return try encoder.encode(value) }
    private struct Credentials: Encodable { var email: String; var password: String }
    private struct AuthResponse: Decodable { var accessToken: String; var user: Account }
    func signUp(email: String, password: String) async throws -> Account { try await request("POST", "auth/register", body: json(Credentials(email: email, password: password))) }
    func signIn(email: String, password: String) async throws -> Account { let result: AuthResponse = try await request("POST", "auth/login", body: json(Credentials(email: email, password: password))); token = result.accessToken; return result.user }
    func profile() async throws -> BackendModels.User { try await api.get("api/me") }
    func updateProfile(_ update: BackendModels.ProfileUpdate) async throws -> BackendModels.User { try await api.request("PATCH", path: "api/me", body: api.encode(update)) }
    func verifyEmailChange(code: String) async throws -> BackendModels.User { try await api.request("POST", path: "api/me/email/verify", body: api.encode(["code": code])) }
    func wines() async throws -> [Wine] { try await request("GET", "wines") }
    func save(_ wine: Wine) async throws { try await send("PUT", "wines/\(wine.id)", body: json(wine)) }
    func remove(_ wine: Wine) async throws { try await send("DELETE", "wines/\(wine.id)") }
    func cellars() async throws -> [Cellar] { try await request("GET", "cellars") }
    func save(_ cellar: Cellar) async throws { try await send("PUT", "cellars/\(cellar.id)", body: json(cellar)) }
    private struct ChatResponse: Decodable { var answer: String }
    func ask(_ prompt: String) async throws -> String { let result: ChatResponse = try await request("POST", "ai/chat", body: json(["message": prompt])); return result.answer }
    func exportData() async throws -> Data {
        try await api.getData("api/me/export")
    }
    func deleteAccount() async throws { let _: OKReply = try await api.request("DELETE", path: "api/me"); token = nil }
    func signOut() async {
        do { let _: OKReply = try await api.request("POST", path: "api/auth/logout") } catch { }
        token = nil
    }
}

private enum Keychain {
    private static let service = "com.omnicave.ios"
    static func save(_ token: String) {
        remove()
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(query as CFDictionary, nil)
    }
    static func read() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func remove() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    }
}
