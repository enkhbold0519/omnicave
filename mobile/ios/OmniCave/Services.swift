import Foundation
import CryptoKit
import Security

protocol AppService {
    func restoreSession() async -> Account?
    func signUp(email: String, password: String) async throws -> Account
    func signIn(email: String, password: String) async throws -> Account
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
    private struct SavedUser: Codable { var email: String; var salt: String; var digest: String }
    private let defaults = UserDefaults.standard
    private var signedIn: String? { defaults.string(forKey: "mock.signedIn") }
    func restoreSession() async -> Account? { signedIn.map(Account.init(email:)) }
    private var accounts: [SavedUser] {
        get { (try? JSONDecoder().decode([SavedUser].self, from: defaults.data(forKey: "mock.accounts") ?? Data())) ?? [] }
        set { defaults.set(try? JSONEncoder().encode(newValue), forKey: "mock.accounts") }
    }

    func signUp(email: String, password: String) async throws -> Account {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard Self.validEmail(email), Self.validPassword(password) else { throw ServiceError.invalidInput }
        guard !accounts.contains(where: { $0.email == email }) else { throw ServiceError.accountExists }
        let salt = UUID().uuidString
        var users = accounts
        users.append(SavedUser(email: email, salt: salt, digest: Self.hash(password, salt)))
        accounts = users
        return Account(email: email)
    }

    func signIn(email: String, password: String) async throws -> Account {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        ensureDemoAccount()
        guard let user = accounts.first(where: { $0.email == email }), user.digest == Self.hash(password, user.salt) else { throw ServiceError.invalidCredentials }
        defaults.set(email, forKey: "mock.signedIn")
        return Account(email: email)
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
        users.append(SavedUser(email: Self.demoEmail, salt: salt, digest: Self.hash(Self.demoPassword, salt)))
        accounts = users
    }

    private func key(_ item: String) -> String { "mock.\(signedIn ?? "guest").\(item)" }
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
    private static let sampleCellarID = UUID(uuidString: "4D198430-28FB-43B6-BE19-B86BEF376F3A")!
}

/// REST boundary for the FastAPI backend. The route names are a proposed contract until the backend is ready.
final class BackendService: AppService {
    private let baseURL: URL
    private let session: URLSession
    private var token: String? { didSet { if let token { Keychain.save(token) } else { Keychain.remove() } } }
    init(baseURL: URL, session: URLSession = .shared) { self.baseURL = baseURL; self.session = session; self.token = Keychain.read() }
    func restoreSession() async -> Account? { guard token != nil else { return nil }; return try? await request("GET", "users/me") }

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
    func signOut() async { try? await send("POST", "auth/logout"); token = nil }
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
