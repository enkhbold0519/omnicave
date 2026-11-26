import XCTest

final class CellarJourneyUITests: XCTestCase {
    func testDemoLoginShowsCellarAndSwitchesBetween3DAndMap() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--ui-testing-reset"]
        app.launch()

        let demoLogin = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Use demo account")).firstMatch
        XCTAssertTrue(demoLogin.waitForExistence(timeout: 10), "Mock-mode login should be available in UI tests")
        demoLogin.tap()

        XCTAssertTrue(app.staticTexts["Cellar"].waitForExistence(timeout: 10))
        let cellarPicker = app.segmentedControls.firstMatch
        XCTAssertTrue(cellarPicker.waitForExistence(timeout: 10), "The cellar view selector should load")
        XCTAssertTrue(cellarPicker.buttons["3D view"].isSelected, "3D is the default cellar view")

        cellarPicker.buttons["Map"].tap()
        XCTAssertTrue(cellarPicker.buttons["Map"].isSelected, "The 2D map should become selected")
        cellarPicker.buttons["3D view"].tap()
        XCTAssertTrue(cellarPicker.buttons["3D view"].isSelected, "The 3D view should be selectable again")
    }
}
