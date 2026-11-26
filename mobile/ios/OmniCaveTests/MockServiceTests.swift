import XCTest
@testable import OmniCaveBackend

final class MockServiceTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName = ""
    private var service: MockService!

    override func setUp() {
        super.setUp()
        suiteName = "OmniCaveMockServiceTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)!
        service = MockService(defaults: defaults)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        service = nil
        super.tearDown()
    }

    func testRegistrationValidationDuplicateAndLoginSession() async throws {
        do {
            _ = try await service.signUp(username: "ab", email: "bad", password: "short", birthDate: "2000-01-01", consents: [:])
            XCTFail("Expected invalid input")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.invalidInput.localizedDescription) }

        let consents = ["terms": true, "privacy": true, "overseas": true]
        _ = try await service.signUp(username: "tester", email: " Test@Example.test ", password: "StrongPass1!", birthDate: "1990-01-01", consents: consents)
        do {
            _ = try await service.signUp(username: "tester", email: "other@example.test", password: "StrongPass1!", birthDate: "1990-01-01", consents: consents)
            XCTFail("Expected duplicate-account error")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.accountExists.localizedDescription) }

        let account = try await service.signIn(identifier: "tester", password: "StrongPass1!")
        let restored = await service.restoreSession()
        XCTAssertEqual(account.email, "test@example.test")
        XCTAssertEqual(restored?.email, "test@example.test")
        await service.signOut()
        let signedOut = await service.restoreSession()
        XCTAssertNil(signedOut)
    }

    func testCellarAndBottleLifecycleSearchAndFilter() async throws {
        let created = try await service.createCellar(name: "Test cellar")
        let cellarID = try XCTUnwrap(created.id)
        let renamed = try await service.renameCellar(id: cellarID, name: "Updated cellar")
        XCTAssertEqual(renamed.name, "Updated cellar")
        let matching = try await service.bottles(query: "barolo", cellarID: 1)
        let nonmatchingCellar = try await service.bottles(query: "barolo", cellarID: 2)
        let details = try await service.cellarDetails(id: 1)
        XCTAssertTrue(matching.contains { $0.id == 101 })
        XCTAssertTrue(nonmatchingCellar.isEmpty)
        XCTAssertEqual(details.racks?.count, 5)

        let wine = BackendModels.WineInfo(name: "Test Pinot", producer: "Maker", region: "Oregon", color: "red", vintage: 2020, basePrice: 40)
        let added = try await service.saveBottle(id: nil, cellarID: 1, wine: wine)
        let updated = try await service.saveBottle(id: added.id, cellarID: 2, wine: BackendModels.WineInfo(name: "Updated Pinot"))
        let updatedMatches = try await service.bottles(query: "Updated", cellarID: 1)
        XCTAssertEqual(updated.id, added.id)
        XCTAssertEqual(updated.cellarId, 1)
        XCTAssertEqual(updatedMatches.count, 1)
        try await service.removeBottle(id: added.id, reason: "consumed")
        let removedMatches = try await service.bottles(query: "Updated", cellarID: 1)
        XCTAssertTrue(removedMatches.isEmpty)
    }

    func testClimateUpdateAndUnknownZoneFailure() async throws {
        let environment = try await service.environment(cellarID: 1, minutes: 1440)
        XCTAssertEqual(environment.zones?.first?.history?.count, 4)
        let update = BackendModels.ZoneUpdate(targetTemp: 13, targetHum: 66, tempMin: 10, tempMax: 16, humMin: 50, humMax: 80, alertMinutes: 20)
        let updated = try await service.updateZone(id: 10, update: update)
        XCTAssertEqual(updated.targetTemp, 13)
        XCTAssertEqual(updated.alertMinutes, 20)
        do {
            _ = try await service.updateZone(id: -1, update: update)
            XCTFail("Expected unknown zone error")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.invalidInput.localizedDescription) }
    }

    func testPersonaValidationAndMutation() async throws {
        let traits = BackendModels.PersonaTraits(focus: "aroma", strictness: 3)
        let created = try await service.savePersona(id: nil, name: "New voice", title: "The guide", color: "green", traits: traits)
        do {
            _ = try await service.savePersona(id: nil, name: "  ", title: "", color: "", traits: traits)
            XCTFail("Expected blank persona name to fail")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.invalidInput.localizedDescription) }
        let edited = try await service.savePersona(id: created.id, name: "Edited", title: "Guide", color: "blue", traits: traits)
        XCTAssertEqual(edited.id, created.id)
        try await service.clearPersonaMemory(id: created.id)
        let afterClear = try await service.personas().first { $0.id == created.id }
        XCTAssertEqual(afterClear?.memory, [])
        try await service.deletePersona(id: created.id)
        let afterDelete = try await service.personas().first { $0.id == created.id }
        XCTAssertNil(afterDelete)
    }

    func testLabelScanConfirmAndRejectLifecycle() async throws {
        let scan = try await service.scanLabelPhoto(cellarID: 1, imageBase64: "aW1hZ2U=", contentType: "image/jpeg")
        let detection = try XCTUnwrap(scan.new?.first)
        let pending = try await service.pendingLabelDetections()
        XCTAssertEqual(scan.provider, "mock")
        XCTAssertEqual(pending.first?.id, detection.id)
        let bottle = try await service.confirmLabelDetection(id: detection.id, cellarID: 1, wine: BackendModels.WineInfo(name: "Confirmed wine"))
        let afterConfirm = try await service.pendingLabelDetections()
        XCTAssertEqual(bottle?.wine.name, "Confirmed wine")
        XCTAssertTrue(afterConfirm.isEmpty)

        let secondScan = try await service.scanLabelPhoto(cellarID: 1, imageBase64: "eA==", contentType: "image/jpeg")
        let second = try XCTUnwrap(secondScan.new?.first)
        try await service.rejectLabelDetection(id: second.id)
        let afterReject = try await service.pendingLabelDetections()
        XCTAssertTrue(afterReject.isEmpty)
    }

    func testDrinkingWindowsMarketHistoryNotificationsAndExport() async throws {
        let windows = try await service.drinkingWindows()
        let market = try await service.marketSummary()
        let priceHistory = try await service.priceHistory(bottleID: 101)
        XCTAssertEqual(windows.ready?.count, 2)
        XCTAssertEqual(windows.approaching?.count, 1)
        XCTAssertEqual(market.total, 910)
        XCTAssertEqual(market.bottles?.count, 3)
        XCTAssertEqual(market.history?.count, 25)
        XCTAssertEqual(priceHistory.history?.count, 25)
        do {
            _ = try await service.priceHistory(bottleID: -1)
            XCTFail("Expected missing bottle error")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.invalidInput.localizedDescription) }

        let initialNotifications = try await service.notifications()
        try await service.markNotificationRead(id: 2)
        let allRead = try await service.notifications()
        let briefing = try await service.briefing()
        XCTAssertEqual(initialNotifications.unread, 1)
        XCTAssertEqual(allRead.unread, 0)
        XCTAssertEqual(briefing.newsIsSample, true)
        let exportedData = try await service.exportData()
        let export = try XCTUnwrap(JSONSerialization.jsonObject(with: exportedData) as? [String: Any])
        XCTAssertNotNil(export["profile"])
        XCTAssertNotNil(export["bottles"])
        XCTAssertNotNil(export["cellars"])
    }

    func testProfileSafeUpdatesAndSensitiveValidation() async throws {
        let update = BackendModels.ProfileUpdate(displayName: "New Name", preferences: BackendModels.Preferences(styles: ["white"]), briefingTime: "09:30")
        let changed = try await service.updateProfile(update)
        XCTAssertEqual(changed.displayName, "New Name")
        XCTAssertEqual(changed.briefingTime, "09:30")
        XCTAssertEqual(changed.preferences?.styles, ["white"])
        do {
            _ = try await service.updateProfile(BackendModels.ProfileUpdate(email: "new@example.test"))
            XCTFail("Expected current-password validation")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.invalidInput.localizedDescription) }
        do {
            _ = try await service.updateProfile(BackendModels.ProfileUpdate(consents: ["terms": false]))
            XCTFail("Expected consent-key validation")
        } catch { XCTAssertEqual((error as? ServiceError)?.localizedDescription, ServiceError.invalidInput.localizedDescription) }
    }
}
