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
        var present: Bool?
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

    struct PricePoint: Codable {
        var date: String?
        var price: Double?
    }

    struct PriceHistory: Codable {
        var history: [PricePoint]?
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

    struct Notification: Codable {
        var id: Int?
        var kind: String?
        var level: String?
        var message: String?
        var read: Int?
        var createdAt: String?
    }
}

enum APIClientError: LocalizedError {
    case http(status: Int, message: String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case let .http(_, message): message
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
        return try decoder.decode(Response.self, from: data)
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

    private struct ErrorBody: Decodable {
        var detail: String?
    }
}
