import XCTest
@testable import OmniCaveBackend

final class BackendServiceIntegrationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        StubURLProtocol.handler = nil
    }

    func testSignupSendsBackendContractAndReturnsVerificationOutcome() async throws {
        StubURLProtocol.handler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/api/auth/register")
            let body = try Self.bodyData(from: request)
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(object["username"] as? String, "alex")
            XCTAssertEqual(object["birth_date"] as? String, "1990-01-01")
            XCTAssertEqual(object["seed_demo"] as? Bool, false)
            XCTAssertEqual((object["consents"] as? [String: Bool])?["terms"], true)
            return StubURLProtocol.response(status: 201, body: #"{"verification_required":true,"email":"alex@example.test"}"#)
        }
        let service = BackendService(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session, useKeychain: false)
        let result = try await service.signUp(username: "alex", email: "alex@example.test", password: "StrongPass1!", birthDate: "1990-01-01", consents: ["terms": true])
        guard case let .verificationRequired(email) = result else { return XCTFail("Expected verification-required outcome") }
        XCTAssertEqual(email, "alex@example.test")
    }

    func testCellarAndBottleRequestsMapRoutesQueryAndResponses() async throws {
        StubURLProtocol.handler = { request in
            switch request.url?.path {
            case "/api/cellars":
                XCTAssertEqual(request.httpMethod, "GET")
                return StubURLProtocol.response(status: 200, body: #"[{"id":7,"name":"Home","bottle_count":2}]"#)
            case "/api/cellars/7":
                XCTAssertEqual(request.httpMethod, "GET")
                return StubURLProtocol.response(status: 200, body: #"{"id":7,"name":"Home","width_cm":120,"height_cm":200,"depth_cm":60,"racks":[],"bottles":[]}"#)
            case "/api/bottles":
                XCTAssertEqual(request.httpMethod, "GET")
                let components = try XCTUnwrap(request.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) })
                XCTAssertEqual(components.queryItems?.first(where: { $0.name == "q" })?.value, "barolo")
                XCTAssertEqual(components.queryItems?.first(where: { $0.name == "cellar_id" })?.value, "7")
                return StubURLProtocol.response(status: 200, body: #"[{"id":31,"cellar_id":7,"wine":{"name":"Barolo"}}]"#)
            default:
                XCTFail("Unexpected route: \(request.url?.path ?? "nil")")
                return StubURLProtocol.response(status: 404, body: "{}")
            }
        }
        let service = BackendService(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session, useKeychain: false)
        let cellars = try await service.bottleCellars()
        let cellar = try await service.cellarDetails(id: 7)
        let bottles = try await service.bottles(query: "barolo", cellarID: 7)
        XCTAssertEqual(cellars.first?.bottleCount, 2)
        XCTAssertEqual(cellar.widthCm, 120)
        XCTAssertEqual(bottles.first?.cellarId, 7)
        XCTAssertEqual(bottles.first?.wine.name, "Barolo")
    }

    private static func bodyData(from request: URLRequest) throws -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { throw XCTError.missingRequestBody }
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 4096)
        var data = Data()
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

private enum XCTError: Error { case missingRequestBody }
