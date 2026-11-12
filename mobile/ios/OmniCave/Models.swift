import Foundation
import SwiftUI

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
    var style: WineStyle {
        let label = "\(name) \(grape)".lowercased()
        if label.contains("rosé") || label.contains("rose") { return .rose }
        if ["brut", "champagne", "sparkling", "prosecco", "cava"].contains(where: { label.contains($0) }) { return .sparkling }
        if ["cabernet", "merlot", "pinot noir", "nebbiolo", "syrah", "shiraz", "sangiovese", "tempranillo", "malbec", "grenache"].contains(where: { label.contains($0) }) { return .red }
        if label.contains("dessert") || label.contains("port") || label.contains("sauternes") { return .dessert }
        return .white
    }
}

enum WineStyle: String, CaseIterable, Identifiable {
    case red = "Red", white = "White", rose = "Rosé", sparkling = "Sparkling", dessert = "Dessert"
    var id: String { rawValue }
    var tint: Color {
        switch self {
        case .red: .forestRed
        case .white: .forestWhite
        case .rose: .forestRose
        case .sparkling: .forestSparkling
        case .dessert: .forestDessert
        }
    }
}

struct Cellar: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var temperature: Double = 12.5
    var humidity: Double = 68
    var online = true
    var capacity: Int { 65 }
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
