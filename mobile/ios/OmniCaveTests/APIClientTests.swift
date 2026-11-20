import Foundation
import XCTest
@testable import OmniCaveBackend

final class APIClientTests: XCTestCase {
    override func setUp() {
        super.setUp()
        StubURLProtocol.handler = nil
    }

    func testDecodesBackendCellarAndBottleWithSnakeCaseKeys() throws {
        let json = #"{"id":7,"name":"Home","width_cm":120,"racks":[{"id":2,"y_cm":45,"present":1}],"bottles":[{"id":31,"cellar_id":7,"window_status":"ready","wine":{"name":"Barolo","base_price":85.5,"drink_from":2020}}]}"#
        let cellar = try JSONDecoder.snakeCase.decode(BackendModels.Cellar.self, from: Data(json.utf8))

        XCTAssertEqual(cellar.id, 7)
        XCTAssertEqual(cellar.widthCm, 120)
        XCTAssertEqual(cellar.racks?.first?.yCm, 45)
        XCTAssertEqual(cellar.racks?.first?.present, 1)
        XCTAssertEqual(cellar.bottles?.first?.cellarId, 7)
        XCTAssertEqual(cellar.bottles?.first?.windowStatus, "ready")
        XCTAssertEqual(cellar.bottles?.first?.wine.basePrice, 85.5)
        XCTAssertEqual(cellar.bottles?.first?.wine.drinkFrom, 2020)
    }

    func testEncodesTableRequestWithBackendKeys() throws {
        let request = BackendModels.TableRequest(
            topic: BackendModels.TableTopic(kind: "question", bottleId: nil, intent: "open", text: "Dinner"),
            personaIds: ["classic"],
            history: [BackendModels.TableMessage(speaker: "user", text: "Hello")]
        )

        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder.snakeCase.encode(request)) as? [String: Any])
        let topic = try XCTUnwrap(object["topic"] as? [String: Any])
        XCTAssertEqual(topic["kind"] as? String, "question")
        XCTAssertEqual(topic["intent"] as? String, "open")
        XCTAssertEqual(topic["text"] as? String, "Dinner")
        XCTAssertEqual(object["persona_ids"] as? [String], ["classic"])
        XCTAssertEqual((object["history"] as? [[String: String]])?.first?["speaker"], "user")
    }

    func testSendsBearerTokenAndDecodesResponse() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer session-token")
            XCTAssertEqual(URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "7")
            return StubURLProtocol.response(status: 200, body: #"{"id":7,"name":"Home","bottle_count":3}"#)
        }

        let client = APIClient(baseURL: URL(string: "https://example.test/api")!, session: Self.stubSession)
        client.token = "session-token"
        let cellar: BackendModels.CellarSummary = try await client.get("cellars", queryItems: [URLQueryItem(name: "id", value: "7")])

        XCTAssertEqual(cellar.name, "Home")
        XCTAssertEqual(cellar.bottleCount, 3)
    }

    func testSurfacesBackendErrorDetail() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 403, body: #"{"detail":"Email is not verified"}"#) }
        let client = APIClient(baseURL: URL(string: "https://example.test/api")!, session: Self.stubSession)

        do {
            let _: BackendModels.User = try await client.get("me")
            XCTFail("Expected the server error")
        } catch let error as APIClientError {
            XCTAssertEqual(error.statusCode, 403)
            XCTAssertEqual(error.localizedDescription, "Email is not verified")
        }
    }

    func testUnauthorizedResponseCallsSessionHandler() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 401, body: #"{"detail":"Expired"}"#) }
        let client = APIClient(baseURL: URL(string: "https://example.test/api")!, session: Self.stubSession)
        client.token = "expired-token"
        var wasCalled = false
        client.onUnauthorized = { wasCalled = true }

        do {
            let _: BackendModels.User = try await client.get("me")
            XCTFail("Expected an unauthorized response")
        } catch let error as APIClientError {
            XCTAssertEqual(error.statusCode, 401)
        }
        XCTAssertTrue(wasCalled)
    }

    private static var stubSession: URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }
}

private extension JSONDecoder {
    static var snakeCase: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}

private extension JSONEncoder {
    static var snakeCase: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }
}

private final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let (response, data) = try XCTUnwrap(Self.handler)(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    static func response(status: Int, body: String) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(url: URL(string: "https://example.test/api")!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        return (response, Data(body.utf8))
    }
}
