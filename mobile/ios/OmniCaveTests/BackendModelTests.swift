import XCTest
@testable import OmniCaveBackend

final class BackendModelTests: XCTestCase {
    func testLocalizedAPIClientErrorsAndStatusCodes() {
        let http = APIClientError.http(status: 409, message: "Conflict")
        XCTAssertEqual(http.localizedDescription, "Conflict")
        XCTAssertEqual(http.statusCode, 409)

        let decoding = APIClientError.decoding(path: "api/me", details: "bad payload")
        XCTAssertEqual(decoding.localizedDescription, "Could not read api/me: bad payload")
        XCTAssertNil(decoding.statusCode)

        let invalid = APIClientError.invalidResponse
        XCTAssertEqual(invalid.localizedDescription, "The server returned an invalid response.")
        XCTAssertNil(invalid.statusCode)
    }

    func testIdentifiableModelIDsUseDocumentedFallbacks() throws {
        let news = try JSONDecoder().decode(BackendModels.NewsItem.self, from: Data(#"{"title":"Harvest report"}"#.utf8))
        XCTAssertEqual(news.id, "Harvest report")

        let linkedNews = try JSONDecoder().decode(BackendModels.NewsItem.self, from: Data(#"{"title":"Harvest report","link":"https://example.test/story"}"#.utf8))
        XCTAssertEqual(linkedNews.id, "https://example.test/story")

        let point = BackendModels.ValuePoint(date: "2025-01", value: 12)
        let row = BackendModels.ValueRow(bottleId: 8)
        let pricePoint = BackendModels.PricePoint(date: "2025-01", price: 22)
        XCTAssertEqual(point.id, "2025-01")
        XCTAssertEqual(row.id, 8)
        XCTAssertEqual(pricePoint.id, "2025-01")
    }

    func testDecodesOptionalProfileAndPreferencesFields() throws {
        let json = #"{"id":3,"username":"cellarer","display_name":"Alex","email_verified":true,"preferences":{"styles":["red"],"regions":["Burgundy"],"grapes":["Pinot Noir"],"likes":"earthy","dislikes":"oak"},"consents":{"terms":true}}"#
        let user = try JSONDecoder.snakeCase.decode(BackendModels.User.self, from: Data(json.utf8))
        XCTAssertEqual(user.username, "cellarer")
        XCTAssertEqual(user.displayName, "Alex")
        XCTAssertEqual(user.emailVerified, true)
        XCTAssertEqual(user.preferences?.styles, ["red"])
        XCTAssertEqual(user.preferences?.regions, ["Burgundy"])
        XCTAssertEqual(user.preferences?.grapes, ["Pinot Noir"])
        XCTAssertEqual(user.preferences?.likes, "earthy")
        XCTAssertEqual(user.preferences?.dislikes, "oak")
        XCTAssertEqual(user.consents?["terms"], true)
    }

    func testDecodesAuthLegalAndPersonaPayloads() throws {
        let auth = #"{"access_token":"token","token_type":"bearer","verification_required":true,"email":"a@example.test","user":{"id":1}}"#
        let reply = try JSONDecoder.snakeCase.decode(BackendModels.AuthReply.self, from: Data(auth.utf8))
        XCTAssertEqual(reply.accessToken, "token")
        XCTAssertEqual(reply.tokenType, "bearer")
        XCTAssertEqual(reply.verificationRequired, true)
        XCTAssertEqual(reply.email, "a@example.test")
        XCTAssertEqual(reply.user?.id, 1)

        let legal = ##"{"version":"v1","consents":[{"key":"terms","required":true,"title":"Terms","summary":"Read","document":"terms"}],"documents":{"terms":"# Terms"}}"##
        let info = try JSONDecoder.snakeCase.decode(BackendModels.LegalInfo.self, from: Data(legal.utf8))
        XCTAssertEqual(info.version, "v1")
        XCTAssertEqual(info.consents?.first?.document, "terms")
        XCTAssertEqual(info.documents?["terms"], "# Terms")

        let persona = #"{"id":"classic","name":"Classicist","built_in":true,"traits":{"scoring":"strict","focus":"balance","loves":["acid"],"strictness":4,"tone":"calm","description":"Traditional"},"philosophy":"Balance","memory":["Barolo"]}"#
        let decoded = try JSONDecoder.snakeCase.decode(BackendModels.Persona.self, from: Data(persona.utf8))
        XCTAssertEqual(decoded.id, "classic")
        XCTAssertEqual(decoded.traits?.strictness, 4)
        XCTAssertEqual(decoded.traits?.loves, ["acid"])
        XCTAssertEqual(decoded.philosophy, "Balance")
        XCTAssertEqual(decoded.memory, ["Barolo"])
    }

    func testDecodesBriefingMarketAndPriceHistoryPayloads() throws {
        let briefing = #"{"date":"2025-01-01","news":[{"title":"News","relevance":4,"matched":["Barolo"]}],"news_is_sample":true,"insights":["Drink now"],"summary":"Daily note","briefing_time":"08:00"}"#
        let decodedBriefing = try JSONDecoder.snakeCase.decode(BackendModels.Briefing.self, from: Data(briefing.utf8))
        XCTAssertEqual(decodedBriefing.news?.first?.relevance, 4)
        XCTAssertEqual(decodedBriefing.news?.first?.matched, ["Barolo"])
        XCTAssertEqual(decodedBriefing.newsIsSample, true)
        XCTAssertEqual(decodedBriefing.insights, ["Drink now"])

        let market = #"{"total":105.5,"change12m":-2.5,"count":1,"currency":"EUR","source":"sample","history":[{"date":"2025-01","value":105.5}],"bottles":[{"bottle_id":8,"label":"Barolo","price":105.5,"change12m":2,"cellar":"Home"}]}"#
        let summary = try JSONDecoder.snakeCase.decode(BackendModels.MarketSummary.self, from: Data(market.utf8))
        XCTAssertEqual(summary.total, 105.5)
        XCTAssertEqual(summary.change12m, -2.5)
        XCTAssertEqual(summary.currency, "EUR")
        XCTAssertEqual(summary.history?.first?.id, "2025-01")
        XCTAssertEqual(summary.bottles?.first?.id, 8)

        let prices = #"{"bottle_id":8,"history":[{"date":"2025-01","price":105.5}],"source":"sample"}"#
        let history = try JSONDecoder.snakeCase.decode(BackendModels.PriceHistory.self, from: Data(prices.utf8))
        XCTAssertEqual(history.bottleId, 8)
        XCTAssertEqual(history.history?.first?.id, "2025-01")
    }

    func testDecodesCellarZonesNotificationsAndLabelDetection() throws {
        let cellarJSON = #"{"id":7,"height_cm":200,"depth_cm":60,"zones":[{"id":4,"name":"Upper","y_from":10,"y_to":80,"target_temp":13,"target_hum":65,"temp_min":11,"temp_max":15,"hum_min":55,"hum_max":75,"alert_minutes":30,"latest":{"temp":13,"hum":65,"ts":"now"},"history":[{"temp":12,"hum":64}],"sensor_online":true,"in_range":true}],"racks":[{"kind":"shelf","depth_cm":30,"capacity":10,"present":1}]}"#
        let cellar = try JSONDecoder.snakeCase.decode(BackendModels.Cellar.self, from: Data(cellarJSON.utf8))
        XCTAssertEqual(cellar.heightCm, 200)
        XCTAssertEqual(cellar.zones?.first?.targetTemp, 13)
        XCTAssertEqual(cellar.zones?.first?.latest?.hum, 65)
        XCTAssertEqual(cellar.zones?.first?.sensorOnline, true)
        XCTAssertEqual(cellar.racks?.first?.capacity, 10)
        XCTAssertEqual(cellar.racks?.first?.present, 1)

        let notices = #"{"unread":1,"items":[{"id":5,"kind":"environment","level":"warning","message":"Warm","read":0,"created_at":"now"}]}"#
        let list = try JSONDecoder.snakeCase.decode(BackendModels.NotificationList.self, from: Data(notices.utf8))
        XCTAssertEqual(list.unread, 1)
        XCTAssertEqual(list.items?.first?.createdAt, "now")

        let detection = #"{"detection_id":9,"wine":{"name":"Wine","country":"Italy","color":"red","vintage":2019,"grape":"Nebbiolo","drink_from":2023,"drink_to":2032,"base_price":80},"note":"Check label","confidence":0.8}"#
        let record = try JSONDecoder.snakeCase.decode(BackendModels.LabelDetection.self, from: Data(detection.utf8))
        XCTAssertEqual(record.id, 9)
        XCTAssertEqual(record.wine.editableWine.name, "Wine")
        XCTAssertEqual(record.wine.editableWine.drinkTo, 2032)
        XCTAssertEqual(record.confidence, 0.8)
    }

    func testEncodesProfileAndZoneUpdatesInSnakeCase() throws {
        let update = BackendModels.ProfileUpdate(displayName: "Alex", currentPassword: "old", briefingTime: "08:00", consents: ["terms": true])
        let profileObject = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder.snakeCase.encode(update)) as? [String: Any])
        XCTAssertEqual(profileObject["display_name"] as? String, "Alex")
        XCTAssertEqual(profileObject["current_password"] as? String, "old")
        XCTAssertEqual(profileObject["briefing_time"] as? String, "08:00")

        let zone = BackendModels.ZoneUpdate(targetTemp: 13, targetHum: 65, tempMin: 11, tempMax: 15, humMin: 55, humMax: 75, alertMinutes: 30)
        let zoneObject = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder.snakeCase.encode(zone)) as? [String: Any])
        XCTAssertEqual(zoneObject["target_temp"] as? Double, 13)
        XCTAssertEqual(zoneObject["alert_minutes"] as? Double, 30)
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
