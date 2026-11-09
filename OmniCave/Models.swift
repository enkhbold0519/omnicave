import Foundation

struct Account: Codable, Equatable {
    var email: String
}

struct Wine: Identifiable, Codable, Equatable, Hashable {
    var id: UUID = UUID()
    var name: String
    var winery: String
    var region: String
    var vintage: Int
    var grape: String
    var location: String
    var cellarID: UUID
    var drinkingWindow: String = "2024–2032"
    var value: Double = 45
}

struct Cellar: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var temperature: Double = 12.5
    var humidity: Double = 68
    var online = true
}

struct Reading: Identifiable, Codable {
    var id = UUID()
    var date: Date
    var temperature: Double
    var humidity: Double
}

struct ChatMessage: Identifiable {
    var id = UUID()
    var author: String
    var text: String
}
