import Foundation

// The Swift Package test target excludes the SwiftUI app model and UI. Keep the
// app's small authentication value available when compiling the real services
// in that target; the iOS project uses the equivalent declaration in Models.swift.
struct Account: Codable, Equatable {
    var email: String
}
