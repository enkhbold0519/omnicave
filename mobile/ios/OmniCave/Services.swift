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
    func bottles(query: String, cellarID: Int?) async throws -> [BackendModels.Bottle]
    func saveBottle(id: Int?, cellarID: Int, wine: BackendModels.WineInfo) async throws -> BackendModels.Bottle
    func removeBottle(id: Int, reason: String) async throws
    func updateEmail(_ email: String) async throws -> Account
    func updatePassword(_ password: String) async throws
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
        return [
            BackendModels.CellarSummary(id: 1, name: "Home cellar", bottleCount: bottles.filter { $0.cellarId == 1 }.count),
            BackendModels.CellarSummary(id: 2, name: "Summer house", bottleCount: bottles.filter { $0.cellarId == 2 }.count)
        ]
    }

    func bottles(query: String, cellarID: Int?) async throws -> [BackendModels.Bottle] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await storedBottles().filter { bottle in
            let cellarMatch = cellarID == nil || bottle.cellarId == cellarID
            let searchFields = [bottle.wine.name, bottle.wine.producer ?? "", bottle.wine.region ?? "", bottle.wine.grape ?? "", String(bottle.wine.vintage ?? 0)]
            return cellarMatch && (needle.isEmpty || searchFields.contains { $0.localizedCaseInsensitiveContains(needle) })
        }
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

    func updateEmail(_ email: String) async throws -> Account {
        guard Self.validEmail(email), let old = signedIn, var user = accounts.first(where: { $0.email == old }) else { throw ServiceError.invalidInput }
        guard !accounts.contains(where: { $0.email == email.lowercased() && $0.email != old }) else { throw ServiceError.accountExists }
        user.email = email.lowercased()
        accounts.removeAll { $0.email == old }; accounts.append(user)
        defaults.set(user.email, forKey: "mock.signedIn")
        for item in ["wines", "cellars"] {
            if let data = defaults.data(forKey: "mock.\(old).\(item)") { defaults.set(data, forKey: "mock.\(user.email).\(item)"); defaults.removeObject(forKey: "mock.\(old).\(item)") }
        }
        return Account(email: user.email)
    }

    func updatePassword(_ password: String) async throws {
        guard Self.validPassword(password), let email = signedIn, var user = accounts.first(where: { $0.email == email }) else { throw ServiceError.invalidInput }
        user.salt = UUID().uuidString; user.digest = Self.hash(password, user.salt)
        accounts.removeAll { $0.email == email }; accounts.append(user)
    }

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
    func exportData() async throws -> Data { try JSONEncoder().encode(Export(wines: try await wines(), cellars: try await cellars())) }
    func deleteAccount() async throws {
        guard let email = signedIn else { return }
        accounts.removeAll { $0.email == email }
        defaults.removeObject(forKey: "mock.signedIn")
        defaults.removeObject(forKey: key("wines")); defaults.removeObject(forKey: key("cellars"))
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
    private func store<T: Encodable>(_ value: T, key: String) { defaults.set(try? JSONEncoder().encode(value), forKey: key) }
    private struct Export: Encodable { var wines: [Wine]; var cellars: [Cellar] }
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
        BackendModels.Bottle(id: 101, cellarId: 1, cellarName: "Home cellar", wine: BackendModels.WineInfo(name: "Barolo", producer: "G.D. Vajra", region: "Piedmont", country: "Italy", color: "red", vintage: 2019, grape: "Nebbiolo", drinkFrom: 2024, drinkTo: 2034, basePrice: 62), location: "Rack 3 · 12 cm from left · front", windowStatus: "ready"),
        BackendModels.Bottle(id: 102, cellarId: 1, cellarName: "Home cellar", wine: BackendModels.WineInfo(name: "Château Margaux", producer: "Château Margaux", region: "Bordeaux", country: "France", color: "red", vintage: 2018, grape: "Cabernet Sauvignon", drinkFrom: 2027, drinkTo: 2045, basePrice: 820), location: "Rack 5 · 20 cm from left · front", windowStatus: "young"),
        BackendModels.Bottle(id: 103, cellarId: 2, cellarName: "Summer house", wine: BackendModels.WineInfo(name: "Riesling Kabinett", producer: "Dr. Loosen", region: "Mosel", country: "Germany", color: "white", vintage: 2021, grape: "Riesling", drinkFrom: 2023, drinkTo: 2031, basePrice: 28), location: "Rack 2 · 9 cm from left · front", windowStatus: "ready")
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

    func bottles(query: String, cellarID: Int?) async throws -> [BackendModels.Bottle] {
        var items = [URLQueryItem(name: "q", value: query)]
        if let cellarID { items.append(URLQueryItem(name: "cellar_id", value: String(cellarID))) }
        return try await api.get("api/bottles", queryItems: items)
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
    private struct WineBody: Encodable { var wine: BackendModels.WineInfo }
    private struct NewBottleBody: Encodable { var cellarID: Int; var wine: BackendModels.WineInfo }

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
    func updateEmail(_ email: String) async throws -> Account { try await request("PATCH", "users/me", body: json(Account(email: email))) }
    func updatePassword(_ password: String) async throws { try await send("PATCH", "users/me/password", body: json(["password": password])) }
    func wines() async throws -> [Wine] { try await request("GET", "wines") }
    func save(_ wine: Wine) async throws { try await send("PUT", "wines/\(wine.id)", body: json(wine)) }
    func remove(_ wine: Wine) async throws { try await send("DELETE", "wines/\(wine.id)") }
    func cellars() async throws -> [Cellar] { try await request("GET", "cellars") }
    func save(_ cellar: Cellar) async throws { try await send("PUT", "cellars/\(cellar.id)", body: json(cellar)) }
    private struct ChatResponse: Decodable { var answer: String }
    func ask(_ prompt: String) async throws -> String { let result: ChatResponse = try await request("POST", "ai/chat", body: json(["message": prompt])); return result.answer }
    func exportData() async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: "users/me/export")); request.httpMethod = "GET"
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard ((response as? HTTPURLResponse)?.statusCode ?? 500) < 300 else { throw ServiceError.invalidCredentials }
        return data
    }
    func deleteAccount() async throws { try await send("DELETE", "users/me"); token = nil }
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
