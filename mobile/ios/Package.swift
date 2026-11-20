// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "OmniCaveIOS",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "OmniCaveBackend", targets: ["OmniCaveBackend"])],
    targets: [
        .target(
            name: "OmniCaveBackend",
            path: "OmniCave",
            exclude: ["AppModel.swift", "Info.plist", "Models.swift", "OmniCaveApp.swift", "README.md", "Services.swift", "Views.swift"],
            sources: ["BackendModels.swift"]
        ),
        .testTarget(
            name: "OmniCaveBackendTests",
            dependencies: ["OmniCaveBackend"],
            path: "OmniCaveTests"
        )
    ],
    swiftLanguageVersions: [.v5]
)
