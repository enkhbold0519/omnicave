import SwiftUI

@main
struct OmniCaveApp: App {
    @StateObject private var model = AppModel(service: AppConfig.useMock ? MockService() : BackendService(baseURL: AppConfig.backendURL))

    var body: some Scene {
        WindowGroup {
            Group {
                if model.user == nil { AuthView() } else { MainView() }
            }
            .environmentObject(model)
            .tint(.wine)
        }
    }
}

enum AppConfig {
    static let useMock = true
    static let backendURL = URL(string: "https://api.example.com")!
}

extension Color {
    static let wine = Color(red: 0.43, green: 0.10, blue: 0.20)
    static let cream = Color(red: 0.97, green: 0.95, blue: 0.91)
}
