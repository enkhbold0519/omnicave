import Foundation
import SwiftUI

struct Account: Codable, Equatable {
    var email: String
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
