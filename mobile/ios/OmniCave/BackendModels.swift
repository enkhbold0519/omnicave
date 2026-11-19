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

    struct Preferences: Codable {
        var styles: [String]?
        var regions: [String]?
        var grapes: [String]?
        var likes: String?
        var dislikes: String?
    }

    struct CellarSummary: Codable {
        var id: Int?
        var name: String?
        var bottleCount: Int?
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

    struct Bottle: Codable {
        var id: Int?
        var cellarId: Int?
        var cellarName: String?
        var wine: WineInfo?
        var location: String?
        var x: Double?
        var y: Double?
        var z: Double?
        var orientation: String?
        var level: Int?
        var windowStatus: String?
        var source: String?
        var confidence: Double?
    }

    struct WineInfo: Codable {
        var id: Int?
        var name: String?
        var producer: String?
        var region: String?
        var country: String?
        var color: String?
        var vintage: Int?
        var grape: String?
        var drinkFrom: Int?
        var drinkTo: Int?
        var basePrice: Double?
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

    func get<Response: Decodable>(_ path: String) async throws -> Response {
        try await request("GET", path: path)
    }

    func request<Response: Decodable>(
        _ method: String,
        path: String,
        body: Data? = nil
    ) async throws -> Response {
        var urlRequest = URLRequest(url: baseURL.appending(path: path))
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

    private struct ErrorBody: Decodable {
        var detail: String?
    }
}
