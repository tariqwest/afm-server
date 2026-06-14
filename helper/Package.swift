// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "afm-fm-helper",
    platforms: [.macOS(.v26)],
    products: [
        .executable(name: "afm-fm-helper", targets: ["AfmFmHelper"]),
    ],
    targets: [
        .executableTarget(
            name: "AfmFmHelper",
            path: "Sources/AfmFmHelper"
        ),
    ]
)
