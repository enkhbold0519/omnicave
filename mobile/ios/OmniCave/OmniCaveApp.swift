import SwiftUI
import UIKit

@main
struct OmniCaveApp: App {
    @StateObject private var model = AppModel(service: AppConfig.useMock ? MockService() : BackendService(baseURL: AppConfig.backendURL))
    @AppStorage("appearance") private var appearance = "dark"

    var body: some Scene {
        WindowGroup {
            Group {
                if model.user == nil { AuthView() } else { MainView() }
            }
            .environmentObject(model)
            .tint(.forestAccent)
            .preferredColorScheme(appearance == "light" ? .light : .dark)
            .task {
                if appearance != "light" && appearance != "dark" { appearance = "dark" }
            }
        }
    }
}

enum AppConfig {
    static let useMock = true
    static let backendURL = URL(string: "https://api.example.com")!
}

extension ShapeStyle where Self == Color {
    static var forestBackground: Color { adaptive("F6F3EC", "111513") }
    static var forestSurface: Color { adaptive("FBFAF6", "181D1A") }
    static var forestMutedSurface: Color { adaptive("EFEBE1", "212723") }
    static var forestHairline: Color { adaptive("E2DDD1", "2A312D") }
    static var forestPrimary: Color { adaptive("1C2420", "ECE7DC") }
    static var forestSecondary: Color { adaptive("474F4A", "C9CBC4") }
    static var forestMuted: Color { adaptive("636863", "A3A79F") }
    static var forestAccent: Color { adaptive("23443A", "9DC2AD") }
    static var forestAccentSoft: Color { adaptive("E7EDE8", "1E2A24") }
    static var forestSuccess: Color { adaptive("3D6B52", "83B79A") }
    static var forestWarning: Color { adaptive("7D550F", "D9AA5E") }
    static var forestDanger: Color { adaptive("9C3B33", "E38E84") }
    static var forestRed: Color { hex("7A3340") }
    static var forestWhite: Color { hex("C7B57A") }
    static var forestRose: Color { hex("CE998F") }
    static var forestSparkling: Color { hex("B4A57A") }
    static var forestDessert: Color { hex("B98A3E") }
    static var wine: Color { forestAccent }
    static var cream: Color { forestBackground }
    static var forestCabinet: Color { hex("1B1D1F") }
    static var forestCabinetInset: Color { hex("0D0F10") }
    static var forestCabinetRail: Color { hex("26292B") }
    static var forestCabinetText: Color { hex("D8D2C6") }
    static var forestCabinetMuted: Color { hex("9A958B") }
    static var forestCabinetGlow: Color { hex("E9D8B0") }

    private static func adaptive(_ light: String, _ dark: String) -> Color {
        Color(uiColor: UIColor { trait in UIColor(hex: trait.userInterfaceStyle == .dark ? dark : light) })
    }

    private static func hex(_ value: String) -> Color {
        let number = UInt(value, radix: 16) ?? 0
        return Color(.sRGB, red: Double((number >> 16) & 0xFF) / 255, green: Double((number >> 8) & 0xFF) / 255, blue: Double(number & 0xFF) / 255, opacity: 1)
    }
}

extension Font {
    static func forest(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .medium, .semibold, .bold, .heavy, .black: name = "AvenirNext-DemiBold"
        default: name = "AvenirNext-Regular"
        }
        return .custom(name, size: size, relativeTo: .body)
    }
}

private extension UIColor {
    convenience init(hex: String) {
        let value = UInt(hex, radix: 16) ?? 0
        self.init(red: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255, blue: CGFloat(value & 0xFF) / 255, alpha: 1)
    }
}
