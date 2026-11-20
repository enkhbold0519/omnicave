import Foundation

/// Models for the backend API. They are namespaced so the existing mock UI models
/// can remain in place until each screen is migrated.
enum BackendModels {
    struct User: Codable {
        var id: Int?
        var username: String?
        var email: String?
        var displayName: String?
        var preferences: Preferences?
        var briefingTime: String?
        var birthDate: String?
        var emailVerified: Bool?
        var pendingEmail: String?
        var consents: [String: Bool]?
    }

    struct Consent: Codable {
        var key: String?
        var required: Bool?
        var title: String?
        var summary: String?
        var document: String?
    }

    struct LegalInfo: Codable {
        var version: String?
        var consents: [Consent]?
        var documents: [String: String]?
    }

    struct AuthReply: Codable {
        var accessToken: String?
        var tokenType: String?
        var verificationRequired: Bool?
        var email: String?
        var user: User?
    }

    struct Preferences: Codable {
        var styles: [String]?
        var regions: [String]?
        var grapes: [String]?
        var likes: String?
        var dislikes: String?
    }

    struct ProfileUpdate: Encodable {
        var displayName: String?
        var email: String?
        var password: String?
        var currentPassword: String?
        var preferences: Preferences?
        var briefingTime: String?
        var consents: [String: Bool]?
    }

    struct Persona: Codable, Identifiable {
        var id: String
        var name: String
        var title: String?
        var color: String?
        var builtIn: Bool?
        var traits: PersonaTraits?
        var philosophy: String?
        var memory: [String]?
    }

    struct PersonaTraits: Codable {
        var scoring: String?
        var focus: String?
        var loves: [String]?
        var strictness: Int?
        var tone: String?
        var description: String?
    }

    struct TableTopic: Encodable {
        var kind: String
        var bottleId: Int?
        var intent: String?
        var text: String?
    }

    struct TableMessage: Codable {
        var speaker: String
        var text: String
    }

    struct TableRequest: Encodable {
        var topic: TableTopic
        var personaIds: [String]
        var history: [TableMessage]
    }

    struct TastingEvent: Decodable {
        var type: String?
        var persona: String?
        var name: String?
        var title: String?
        var color: String?
        var text: String?
        var message: String?
        var bottle: Bottle?
    }

    struct Briefing: Codable {
        var date: String?
        var news: [NewsItem]?
        var newsIsSample: Bool?
        var insights: [String]?
        var summary: String?
        var briefingTime: String?
    }

    struct NewsItem: Codable, Identifiable {
        var title: String
        var link: String?
        var summary: String?
        var published: String?
        var source: String?
        var relevance: Int?
        var matched: [String]?
        var id: String { link ?? title }
    }

    struct DrinkingWindows: Codable {
        var ready: [Bottle]?
        var approaching: [Bottle]?
        var pastPeak: [Bottle]?
        var year: Int?
    }

    struct MarketSummary: Codable {
        var total: Double?
        var change12m: Double?
        var count: Int?
        var currency: String?
        var source: String?
        var history: [ValuePoint]?
        var bottles: [ValueRow]?
    }

    struct ValuePoint: Codable, Identifiable {
        var date: String
        var value: Double
        var id: String { date }
    }

    struct ValueRow: Codable, Identifiable {
        var bottleId: Int
        var label: String?
        var price: Double?
        var change12m: Double?
        var cellar: String?
        var id: Int { bottleId }
    }

    struct PriceHistory: Codable {
        var bottleId: Int?
        var history: [PricePoint]?
        var source: String?
    }

    struct PricePoint: Codable, Identifiable {
        var date: String
        var price: Double
        var id: String { date }
    }

    struct NotificationList: Codable {
        var unread: Int?
        var items: [Notification]?
    }

    struct CellarSummary: Codable, Identifiable {
        var id: Int
        var name: String
        var bottleCount: Int? = nil
    }

    struct Cellar: Codable {
        var id: Int?
        var name: String?
        var widthCm: Double?
        var heightCm: Double?
        var depthCm: Double?
        var racks: [Rack]?
        var bottles: [Bottle]?
        var zones: [EnvZone]?
    }

    struct Rack: Codable {
        var id: Int?
        var name: String?
        var kind: String?
        var yCm: Double?
        var depthCm: Double?
        var capacity: Int?
        // SQLite serializes the backend's INTEGER column as 0/1 rather than JSON true/false.
        var present: Int?
    }

    struct Bottle: Codable, Identifiable {
        var id: Int
        var cellarId: Int
        var cellarName: String? = nil
        var wine: WineInfo
        var location: String? = nil
        var x: Double? = nil
        var y: Double? = nil
        var z: Double? = nil
        var orientation: String? = nil
        var level: Int? = nil
        var windowStatus: String? = nil
        var source: String? = nil
        var confidence: Double? = nil
    }

    struct WineInfo: Codable {
        var id: Int? = nil
        var name: String
        var producer: String? = nil
        var region: String? = nil
        var country: String? = nil
        var color: String? = nil
        var vintage: Int? = nil
        var grape: String? = nil
        var drinkFrom: Int? = nil
        var drinkTo: Int? = nil
        var basePrice: Double? = nil
    }

    struct EnvZone: Codable {
        var id: Int?
        var name: String?
        var yFrom: Double?
        var yTo: Double?
        var targetTemp: Double?
        var targetHum: Double?
        var tempMin: Double?
        var tempMax: Double?
        var humMin: Double?
        var humMax: Double?
        var alertMinutes: Double?
        var latest: Reading?
        var history: [Reading]?
        var sensorOnline: Bool?
        var inRange: Bool?
    }

    struct Environment: Codable { var cellarId: Int?; var zones: [EnvZone]? }

    struct ZoneUpdate: Encodable {
        var targetTemp: Double
        var targetHum: Double
        var tempMin: Double
        var tempMax: Double
        var humMin: Double
        var humMax: Double
        var alertMinutes: Double
    }

    struct Reading: Codable {
        var temp: Double?
        var hum: Double?
        var ts: String?
    }

    struct Notification: Codable, Identifiable {
        var id: Int
        var kind: String?
        var level: String?
        var message: String?
        var read: Int?
        var createdAt: String?
    }
}

enum APIClientError: LocalizedError {
    case http(status: Int, message: String)
    case decoding(path: String, details: String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case let .http(_, message): message
        case let .decoding(path, details): "Could not read \(path): \(details)"
        case .invalidResponse: "The server returned an invalid response."
        }
    }

    var statusCode: Int? {
        guard case let .http(status, _) = self else { return nil }
        return status
    }
}

/// A small JSON client shared by backend-backed features.
final class APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    var token: String?
    var onUnauthorized: (() -> Void)?

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        self.encoder = encoder
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = decoder
    }

    func get<Response: Decodable>(_ path: String, queryItems: [URLQueryItem] = []) async throws -> Response {
        try await request("GET", path: path, queryItems: queryItems)
    }

    func request<Response: Decodable>(
        _ method: String,
        path: String,
        body: Data? = nil,
        queryItems: [URLQueryItem] = []
    ) async throws -> Response {
        guard var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidResponse
        }
        if !queryItems.isEmpty { components.queryItems = queryItems }
        guard let url = components.url else { throw APIClientError.invalidResponse }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.httpBody = body
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: urlRequest)
        guard let response = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401, token != nil { onUnauthorized?() }
            let detail = (try? decoder.decode(ErrorBody.self, from: data).detail)
            throw APIClientError.http(
                status: response.statusCode,
                message: detail ?? "Request failed (\(response.statusCode))."
            )
        }
        return try decode(Response.self, from: data, path: path)
    }

    private func decode<Response: Decodable>(_ type: Response.Type, from data: Data, path: String) throws -> Response {
        do { return try decoder.decode(type, from: data) }
        catch let error as DecodingError {
            let details: String
            switch error {
            case let .typeMismatch(type, context): details = "Expected \(type) at \(context.codingPath.map(\.stringValue).joined(separator: ".")): \(context.debugDescription)"
            case let .valueNotFound(type, context): details = "Missing \(type) at \(context.codingPath.map(\.stringValue).joined(separator: ".")): \(context.debugDescription)"
            case let .keyNotFound(key, context): details = "Missing field \(key.stringValue) at \(context.codingPath.map(\.stringValue).joined(separator: ".")): \(context.debugDescription)"
            case let .dataCorrupted(context): details = "Invalid value at \(context.codingPath.map(\.stringValue).joined(separator: ".")): \(context.debugDescription)"
            @unknown default: details = error.localizedDescription
            }
            throw APIClientError.decoding(path: path, details: details)
        }
    }

    func encode<Body: Encodable>(_ body: Body) throws -> Data {
        try encoder.encode(body)
    }

    func getData(_ path: String) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            if response.statusCode == 401, token != nil { onUnauthorized?() }
            let detail = (try? decoder.decode(ErrorBody.self, from: data).detail)
            throw APIClientError.http(status: response.statusCode, message: detail ?? "Request failed (\(response.statusCode)).")
        }
        return data
    }

    func stream(_ path: String, body: Data) -> AsyncThrowingStream<BackendModels.TastingEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: baseURL.appending(path: path))
                    request.httpMethod = "POST"
                    request.httpBody = body
                    request.setValue("application/json", forHTTPHeaderField: "Accept")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let response = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
                    guard (200..<300).contains(response.statusCode) else {
                        if response.statusCode == 401, token != nil { onUnauthorized?() }
                        var text = ""
                        for try await line in bytes.lines { text += line }
                        let detail = (try? decoder.decode(ErrorBody.self, from: Data(text.utf8)).detail)
                        throw APIClientError.http(status: response.statusCode, message: detail ?? "Request failed (\(response.statusCode)).")
                    }
                    for try await line in bytes.lines where line.hasPrefix("data:") {
                        let value = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        guard let data = value.data(using: .utf8), let event = try? decoder.decode(BackendModels.TastingEvent.self, from: data) else { continue }
                        continuation.yield(event)
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private struct ErrorBody: Decodable {
        var detail: String?
    }
}
