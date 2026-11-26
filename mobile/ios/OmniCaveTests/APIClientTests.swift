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

    func testRequestEncodesBodyAndAddsContentTypeOnlyWhenPresent() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "PATCH")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "application/json")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body: Data
            if let directBody = request.httpBody {
                body = directBody
            } else if let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                var bytes = Data()
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    bytes.append(buffer, count: count)
                }
                body = bytes
            } else {
                throw XCTError.missingRequestBody
            }
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
            XCTAssertEqual(object["display_name"], "Alex")
            return StubURLProtocol.response(status: 200, body: #"{"id":3,"username":"alex"}"#)
        }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        let body = try client.encode(BackendModels.ProfileUpdate(displayName: "Alex"))
        let user: BackendModels.User = try await client.request("PATCH", path: "api/me", body: body)
        XCTAssertEqual(user.username, "alex")
    }

    func testHTTPErrorUsesFallbackWhenBodyIsNotAnErrorObject() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 502, body: #"{"message":"upstream"}"#) }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        do {
            let _: BackendModels.User = try await client.get("api/me")
            XCTFail("Expected an HTTP error")
        } catch let error as APIClientError {
            XCTAssertEqual(error.localizedDescription, "Request failed (502).")
            XCTAssertEqual(error.statusCode, 502)
        }
    }

    func testMalformedSuccessPayloadReportsPathAndDecodingReason() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 200, body: #"{"id":"not-an-int","name":"Home"}"#) }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        do {
            let _: BackendModels.CellarSummary = try await client.get("api/cellars/1")
            XCTFail("Expected a decoding error")
        } catch let error as APIClientError {
            guard case let .decoding(path, details) = error else { return XCTFail("Unexpected error: \(error)") }
            XCTAssertEqual(path, "api/cellars/1")
            XCTAssertTrue(details.contains("Expected Int"))
            XCTAssertNil(error.statusCode)
        }
    }

    func testMissingRequiredFieldAndNullRequiredFieldHaveDistinctDecodingErrors() async throws {
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 200, body: #"{"id":7}"#) }
        do {
            let _: BackendModels.CellarSummary = try await client.get("api/cellars/7")
            XCTFail("Expected missing-field decoding failure")
        } catch let error as APIClientError {
            guard case let .decoding(_, details) = error else { return XCTFail("Unexpected error: \(error)") }
            XCTAssertTrue(details.contains("Missing field name"))
        }

        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 200, body: #"{"speaker":null,"text":"hello"}"#) }
        do {
            let _: BackendModels.TableMessage = try await client.get("api/message")
            XCTFail("Expected null-field decoding failure")
        } catch let error as APIClientError {
            guard case let .decoding(_, details) = error else { return XCTFail("Unexpected error: \(error)") }
            XCTAssertTrue(details.contains("Missing String"))
        }
    }

    func testNonHTTPResponseIsRejected() async throws {
        StubURLProtocol.handler = { request in
            (URLResponse(url: try XCTUnwrap(request.url), mimeType: "text/plain", expectedContentLength: 0, textEncodingName: nil), Data())
        }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        do {
            let _: BackendModels.User = try await client.get("api/me")
            XCTFail("Expected invalid response")
        } catch let error as APIClientError {
            XCTAssertEqual(error.localizedDescription, "The server returned an invalid response.")
        }
    }

    func testStreamsValidDataEventsAndIgnoresOtherLinesAndMalformedEvents() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            return StubURLProtocol.response(status: 200, body: "event: message\ndata: {\"type\":\"delta\",\"text\":\"hello\"}\ndata: not-json\ndata: {\"type\":\"done\"}\n")
        }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        let stream = client.stream("api/ai/table", body: Data("{}".utf8))
        var events: [BackendModels.TastingEvent] = []
        for try await event in stream { events.append(event) }
        XCTAssertEqual(events.map(\.type), ["delta", "done"])
        XCTAssertEqual(events.first?.text, "hello")
    }

    func testGetDataReturnsRawResponseAndIncludesToken() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer data-token")
            return StubURLProtocol.response(status: 200, body: #"{"export":"ok"}"#)
        }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        client.token = "data-token"
        let data = try await client.getData("api/me/export")
        XCTAssertEqual(String(data: data, encoding: .utf8), #"{"export":"ok"}"#)
    }

    func testGetDataMapsUnauthorizedAndCallsHandler() async throws {
        StubURLProtocol.handler = { _ in StubURLProtocol.response(status: 401, body: #"{"detail":"expired"}"#) }
        let client = APIClient(baseURL: URL(string: "https://example.test")!, session: Self.stubSession)
        client.token = "expired"
        var wasCalled = false
        client.onUnauthorized = { wasCalled = true }
        do {
            _ = try await client.getData("api/me/export")
            XCTFail("Expected an unauthorized error")
        } catch let error as APIClientError {
            XCTAssertEqual(error.localizedDescription, "expired")
        }
        XCTAssertTrue(wasCalled)
    }

    private static var stubSession: URLSession { StubURLProtocol.session }
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

final class StubURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (URLResponse, Data))?

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

    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }()

    static func response(status: Int, body: String) -> (URLResponse, Data) {
        let response = HTTPURLResponse(url: URL(string: "https://example.test/api")!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        return (response, Data(body.utf8))
    }
}

private enum XCTError: Error { case missingRequestBody }
