import SwiftUI
import Charts
import UIKit
import SceneKit

private enum CellarMapMode: String, CaseIterable, Identifiable {
    case door = "Door"
    case threeD = "3D"
    var id: String { rawValue }
}

private enum CellarCamera: String, CaseIterable, Identifiable {
    case front = "Front", angle = "Angle", side = "Side", top = "Top"
    var id: String { rawValue }
}

private enum WebOSIconName { case cellar, inventory, sommelier, briefing, value, bell }

private enum WebOSIconRaster {
    static func image(for name: WebOSIconName) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { renderer in
            let context = renderer.cgContext
            context.setStrokeColor(UIColor.white.cgColor)
            context.setLineWidth(1.5)
            context.setLineCap(.round)
            context.setLineJoin(.round)
            let path = UIBezierPath()
            switch name {
            case .cellar:
                path.append(UIBezierPath(roundedRect: CGRect(x: 4, y: 3, width: 16, height: 18), cornerRadius: 2))
                path.move(to: CGPoint(x: 4, y: 9)); path.addLine(to: CGPoint(x: 20, y: 9))
                path.move(to: CGPoint(x: 4, y: 15)); path.addLine(to: CGPoint(x: 20, y: 15))
                [CGPoint(x: 8.5, y: 6), CGPoint(x: 12, y: 6), CGPoint(x: 8.5, y: 12), CGPoint(x: 15.5, y: 18)].forEach {
                    path.append(UIBezierPath(ovalIn: CGRect(x: $0.x - 0.9, y: $0.y - 0.9, width: 1.8, height: 1.8)))
                }
            case .inventory:
                path.move(to: CGPoint(x: 7.5, y: 3)); path.addLine(to: CGPoint(x: 16.5, y: 3)); path.addLine(to: CGPoint(x: 17, y: 7.5))
                path.addArc(withCenter: CGPoint(x: 12, y: 7.5), radius: 5, startAngle: 0, endAngle: .pi, clockwise: true)
                path.move(to: CGPoint(x: 12, y: 12.5)); path.addLine(to: CGPoint(x: 12, y: 20))
                path.move(to: CGPoint(x: 8.5, y: 20.5)); path.addLine(to: CGPoint(x: 15.5, y: 20.5))
            case .sommelier:
                appendStar(path, center: CGPoint(x: 10, y: 9.5), outer: 6, inner: 1.6, points: 4)
                appendStar(path, center: CGPoint(x: 17.5, y: 16.5), outer: 3, inner: 0.8, points: 4)
            case .briefing:
                path.append(UIBezierPath(ovalIn: CGRect(x: 8, y: 8, width: 8, height: 8)))
                let rays: [(CGPoint, CGPoint)] = [
                    (CGPoint(x: 12, y: 2.5), CGPoint(x: 12, y: 4.5)), (CGPoint(x: 12, y: 19.5), CGPoint(x: 12, y: 21.5)),
                    (CGPoint(x: 2.5, y: 12), CGPoint(x: 4.5, y: 12)), (CGPoint(x: 19.5, y: 12), CGPoint(x: 21.5, y: 12)),
                    (CGPoint(x: 5.3, y: 5.3), CGPoint(x: 6.7, y: 6.7)), (CGPoint(x: 17.3, y: 17.3), CGPoint(x: 18.7, y: 18.7)),
                    (CGPoint(x: 5.3, y: 18.7), CGPoint(x: 6.7, y: 17.3)), (CGPoint(x: 17.3, y: 6.7), CGPoint(x: 18.7, y: 5.3))
                ]
                rays.forEach { path.move(to: $0.0); path.addLine(to: $0.1) }
            case .value:
                path.move(to: CGPoint(x: 3, y: 17)); path.addLine(to: CGPoint(x: 9, y: 11)); path.addLine(to: CGPoint(x: 13, y: 15)); path.addLine(to: CGPoint(x: 21, y: 7))
                path.move(to: CGPoint(x: 15, y: 7)); path.addLine(to: CGPoint(x: 21, y: 7)); path.addLine(to: CGPoint(x: 21, y: 13))
            case .bell:
                path.move(to: CGPoint(x: 6, y: 16.5)); path.addLine(to: CGPoint(x: 6, y: 11))
                path.addArc(withCenter: CGPoint(x: 12, y: 11), radius: 6, startAngle: .pi, endAngle: 0, clockwise: false)
                path.addLine(to: CGPoint(x: 18, y: 16.5)); path.addLine(to: CGPoint(x: 19.5, y: 18)); path.addLine(to: CGPoint(x: 4.5, y: 18)); path.close()
                path.move(to: CGPoint(x: 10, y: 20.5)); path.addQuadCurve(to: CGPoint(x: 14, y: 20.5), controlPoint: CGPoint(x: 12, y: 23))
            }
            context.addPath(path.cgPath)
            context.strokePath()
        }.withRenderingMode(.alwaysTemplate)
    }

    private static func appendStar(_ path: UIBezierPath, center: CGPoint, outer: CGFloat, inner: CGFloat, points: Int) {
        for index in 0..<(points * 2) {
            let angle = -CGFloat.pi / 2 + CGFloat(index) * .pi / CGFloat(points)
            let radius = index.isMultiple(of: 2) ? outer : inner
            let point = CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.close()
    }
}

private struct WebOSIcon: View {
    var name: WebOSIconName
    var size: CGFloat = 24
    var body: some View {
        Canvas { context, canvasSize in
            context.scaleBy(x: canvasSize.width / 24, y: canvasSize.height / 24)
            var path = Path()
            switch name {
            case .cellar:
                path.addRoundedRect(in: CGRect(x: 4, y: 3, width: 16, height: 18), cornerSize: CGSize(width: 2, height: 2))
                path.move(to: CGPoint(x: 4, y: 9)); path.addLine(to: CGPoint(x: 20, y: 9))
                path.move(to: CGPoint(x: 4, y: 15)); path.addLine(to: CGPoint(x: 20, y: 15))
                [CGPoint(x: 8.5, y: 6), CGPoint(x: 12, y: 6), CGPoint(x: 8.5, y: 12), CGPoint(x: 15.5, y: 18)].forEach { path.addEllipse(in: CGRect(x: $0.x - 0.9, y: $0.y - 0.9, width: 1.8, height: 1.8)) }
            case .inventory:
                path.move(to: CGPoint(x: 7.5, y: 3)); path.addLine(to: CGPoint(x: 16.5, y: 3)); path.addLine(to: CGPoint(x: 17, y: 7.5))
                path.addArc(center: CGPoint(x: 12, y: 7.5), radius: 5, startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
                path.move(to: CGPoint(x: 12, y: 12.5)); path.addLine(to: CGPoint(x: 12, y: 20))
                path.move(to: CGPoint(x: 8.5, y: 20.5)); path.addLine(to: CGPoint(x: 15.5, y: 20.5))
            case .sommelier:
                path.move(to: CGPoint(x: 10, y: 3.5)); path.addLine(to: CGPoint(x: 11.6, y: 7.9)); path.addLine(to: CGPoint(x: 16, y: 9.5)); path.addLine(to: CGPoint(x: 11.6, y: 11.1)); path.addLine(to: CGPoint(x: 10, y: 15.5)); path.addLine(to: CGPoint(x: 8.4, y: 11.1)); path.addLine(to: CGPoint(x: 4, y: 9.5)); path.addLine(to: CGPoint(x: 8.4, y: 7.9)); path.closeSubpath()
                path.move(to: CGPoint(x: 17.5, y: 13.5)); path.addLine(to: CGPoint(x: 18.3, y: 15.7)); path.addLine(to: CGPoint(x: 20.5, y: 16.5)); path.addLine(to: CGPoint(x: 18.3, y: 17.3)); path.addLine(to: CGPoint(x: 17.5, y: 19.5)); path.addLine(to: CGPoint(x: 16.7, y: 17.3)); path.addLine(to: CGPoint(x: 14.5, y: 16.5)); path.addLine(to: CGPoint(x: 16.7, y: 15.7)); path.closeSubpath()
            case .briefing:
                path.addEllipse(in: CGRect(x: 8, y: 8, width: 8, height: 8))
                let rays: [(CGPoint, CGPoint)] = [
                    (CGPoint(x: 12, y: 2.5), CGPoint(x: 12, y: 4.5)), (CGPoint(x: 12, y: 19.5), CGPoint(x: 12, y: 21.5)),
                    (CGPoint(x: 2.5, y: 12), CGPoint(x: 4.5, y: 12)), (CGPoint(x: 19.5, y: 12), CGPoint(x: 21.5, y: 12)),
                    (CGPoint(x: 5.3, y: 5.3), CGPoint(x: 6.7, y: 6.7)), (CGPoint(x: 17.3, y: 17.3), CGPoint(x: 18.7, y: 18.7)),
                    (CGPoint(x: 5.3, y: 18.7), CGPoint(x: 6.7, y: 17.3)), (CGPoint(x: 17.3, y: 6.7), CGPoint(x: 18.7, y: 5.3))
                ]
                rays.forEach { path.move(to: $0.0); path.addLine(to: $0.1) }
            case .value:
                path.move(to: CGPoint(x: 3, y: 17)); path.addLine(to: CGPoint(x: 9, y: 11)); path.addLine(to: CGPoint(x: 13, y: 15)); path.addLine(to: CGPoint(x: 21, y: 7))
                path.move(to: CGPoint(x: 15, y: 7)); path.addLine(to: CGPoint(x: 21, y: 7)); path.addLine(to: CGPoint(x: 21, y: 13))
            case .bell:
                path.move(to: CGPoint(x: 6, y: 16.5)); path.addLine(to: CGPoint(x: 6, y: 11)); path.addArc(center: CGPoint(x: 12, y: 11), radius: 6, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false); path.addLine(to: CGPoint(x: 18, y: 16.5)); path.addLine(to: CGPoint(x: 19.5, y: 18)); path.addLine(to: CGPoint(x: 4.5, y: 18)); path.closeSubpath()
                path.move(to: CGPoint(x: 10, y: 20.5)); path.addQuadCurve(to: CGPoint(x: 14, y: 20.5), control: CGPoint(x: 12, y: 23))
            }
            context.stroke(path, with: .foreground, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }.frame(width: size, height: size).accessibilityHidden(true)
    }
}

private struct ProfileAvatar: View {
    @EnvironmentObject private var model: AppModel
    private var initials: String { String(model.user?.email.split(separator: "@").first?.prefix(1).uppercased() ?? "?") }
    var body: some View {
        Text(initials).font(.forest(14, weight: .semibold)).foregroundStyle(.forestAccent)
            .frame(width: 34, height: 34).background(.forestAccentSoft, in: Circle())
            .overlay(Circle().stroke(.forestHairline, lineWidth: 1))
    }
}

private struct WineCellar3DMap: UIViewRepresentable {
    var wines: [Wine]
    var highlightedID: UUID?
    @Binding var selectedWine: Wine?
    @Binding var camera: CellarCamera

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.scene = makeScene(wines, highlightedID: highlightedID)
        view.backgroundColor = UIColor(red: 0.012, green: 0.014, blue: 0.013, alpha: 1)
        view.autoenablesDefaultLighting = true
        view.allowsCameraControl = true
        view.cameraControlConfiguration.allowsTranslation = false
        view.cameraControlConfiguration.rotationSensitivity = 0.45
        view.antialiasingMode = .multisampling4X
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.selectWine(_:)))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        context.coordinator.view = view
        context.coordinator.winesByID = Dictionary(uniqueKeysWithValues: wines.map { ($0.id, $0) })
        context.coordinator.highlightedID = highlightedID
        context.coordinator.selectedWine = { wine in self.selectedWine = wine }
        context.coordinator.setCamera(camera)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        let coordinator = context.coordinator
        coordinator.selectedWine = { wine in self.selectedWine = wine }
        let next = Dictionary(uniqueKeysWithValues: wines.map { ($0.id, $0) })
        if coordinator.winesByID != next || coordinator.highlightedID != highlightedID {
            coordinator.winesByID = next
            coordinator.highlightedID = highlightedID
            view.scene = makeScene(wines, highlightedID: highlightedID)
            coordinator.setCamera(camera)
        }
        if coordinator.camera != camera { coordinator.setCamera(camera) }
    }

    private func makeScene(_ wines: [Wine], highlightedID: UUID?) -> SCNScene {
        let scene = SCNScene()
        scene.background.contents = UIColor(red: 0.012, green: 0.014, blue: 0.013, alpha: 1)
        let root = scene.rootNode
        let width: Float = 78, height: Float = 116, depth: Float = 38
        let wood = material(UIColor(red: 0.32, green: 0.27, blue: 0.22, alpha: 1), roughness: 0.46, transparency: 0.28)
        let wall = material(UIColor(red: 0.025, green: 0.028, blue: 0.027, alpha: 1), roughness: 0.68)
        let shell = material(UIColor(red: 0.46, green: 0.40, blue: 0.34, alpha: 1), roughness: 0.24, metallic: 0.18, transparency: 0.07)
        let steel = material(UIColor(red: 0.42, green: 0.36, blue: 0.31, alpha: 1), roughness: 0.28, metallic: 0.72)

        func box(_ name: String, _ size: SCNVector3, _ position: SCNVector3, _ surface: SCNMaterial, bevel: CGFloat = 0) {
            let geometry = SCNBox(width: CGFloat(size.x), height: CGFloat(size.y), length: CGFloat(size.z), chamferRadius: bevel)
            geometry.materials = [surface]
            let node = SCNNode(geometry: geometry); node.name = name; node.position = position; root.addChildNode(node)
        }

        // Open glass cabinet: the transparent faces tint the scene lightly; there is no opaque door panel.
        box("back", SCNVector3(width, height, 1), SCNVector3(0, 0, depth / 2), wall, bevel: 1)
        box("left-wall", SCNVector3(1.5, height, depth), SCNVector3(-width / 2, 0, 0), shell, bevel: 0.6)
        box("right-wall", SCNVector3(1.5, height, depth), SCNVector3(width / 2, 0, 0), shell, bevel: 0.6)
        box("base", SCNVector3(width, 2, depth), SCNVector3(0, -height / 2, 0), shell, bevel: 0.6)
        box("top", SCNVector3(width, 2, depth), SCNVector3(0, height / 2, 0), shell, bevel: 0.6)
        let frameZ = -depth / 2 - 0.35
        box("frame-left", SCNVector3(1.2, height, 1), SCNVector3(-width / 2, 0, frameZ), steel, bevel: 0.45)
        box("frame-right", SCNVector3(1.2, height, 1), SCNVector3(width / 2, 0, frameZ), steel, bevel: 0.45)
        box("frame-top", SCNVector3(width, 1.2, 1), SCNVector3(0, height / 2, frameZ), steel, bevel: 0.45)
        box("frame-bottom", SCNVector3(width, 1.2, 1), SCNVector3(0, -height / 2, frameZ), steel, bevel: 0.45)

        let shelfY: [Float] = [-45, -24, -3, 18, 39]
        for (index, y) in shelfY.enumerated() {
            box("shelf-\(index)", SCNVector3(width - 5, 1.5, depth - 5), SCNVector3(0, y, 0), wood, bevel: 0.35)
            box("shelf-lip-\(index)", SCNVector3(width - 5, 1, 1.8), SCNVector3(0, y + 1, -depth / 2 + 4), material(UIColor(red: 0.20, green: 0.16, blue: 0.095, alpha: 1), roughness: 0.32, metallic: 0.24, transparency: 0.7), bevel: 0.25)
        }

        // Arrange wines by style across five climate zones and place front/back rows in cabinet depth.
        let zoneFor: (WineStyle) -> Int = { style in
            switch style { case .sparkling: 0; case .white: 1; case .rose: 2; case .red: 3; case .dessert: 4 }
        }
        var zoneCounts: [Int: Int] = [:]
        for wine in wines {
            let zone = zoneFor(wine.style)
            let slot = zoneCounts[zone, default: 0]
            zoneCounts[zone] = slot + 1
            let columns = 7
            let defaultX = -31 + Float(slot % columns) * 10
            let row = slot / columns
            let defaultZ: Float = row.isMultiple(of: 2) ? -10 : 9
            let defaultY = shelfY[zone] + 4 + Float(row / 2) * 6
            let position = wine.mapPosition
            let x = Float(position?.x ?? Double(defaultX))
            let y = Float(position?.y ?? Double(defaultY))
            let z = Float(position?.z ?? Double(defaultZ))
            addBottle(wine, at: SCNVector3(x, y, z), highlighted: wine.id == highlightedID, to: root)
        }

        let ambient = SCNNode(); ambient.light = SCNLight(); ambient.light?.type = .ambient
        ambient.light?.color = UIColor(white: 0.38, alpha: 1); root.addChildNode(ambient)
        let key = SCNNode(); key.light = SCNLight(); key.light?.type = .omni; key.light?.intensity = 650
        key.light?.color = UIColor(red: 0.88, green: 0.78, blue: 0.60, alpha: 1)
        key.position = SCNVector3(-30, 45, -70); root.addChildNode(key)

        for preset in CellarCamera.allCases {
            let camera = SCNCamera(); camera.fieldOfView = 42; camera.zNear = 1; camera.zFar = 600
            let node = SCNNode(); node.camera = camera; node.name = "camera-\(preset.rawValue)"
            switch preset {
            case .front: node.position = SCNVector3(0, 8, -165)
            case .angle: node.position = SCNVector3(-90, 48, -150)
            case .side: node.position = SCNVector3(-165, 18, -12)
            case .top: node.position = SCNVector3(0, 175, -25)
            }
            node.look(at: SCNVector3(0, 0, 0)); root.addChildNode(node)
        }
        return scene
    }

    private func addBottle(_ wine: Wine, at position: SCNVector3, highlighted: Bool, to root: SCNNode) {
        let bottle = SCNNode(); bottle.name = "wine-\(wine.id.uuidString)"; bottle.position = position
        let tint = UIColor(wine.style.tint)
        let bodyMaterial = material(tint, roughness: 0.22, metallic: 0.12)
        let darkGlass = material(tint.withAlphaComponent(0.9), roughness: 0.2, metallic: 0.18)

        let body = SCNCapsule(capRadius: 3.3, height: 18)
        body.materials = [bodyMaterial]
        let bodyNode = SCNNode(geometry: body); bodyNode.eulerAngles.x = .pi / 2; bottle.addChildNode(bodyNode)
        let shoulder = SCNSphere(radius: 3.2); shoulder.materials = [bodyMaterial]
        let shoulderNode = SCNNode(geometry: shoulder); shoulderNode.scale = SCNVector3(1, 0.72, 1); shoulderNode.position.z = -7; bottle.addChildNode(shoulderNode)
        let neck = SCNCylinder(radius: 1.25, height: 4.8); neck.materials = [darkGlass]
        let neckNode = SCNNode(geometry: neck); neckNode.eulerAngles.x = .pi / 2; neckNode.position.z = -10; bottle.addChildNode(neckNode)
        let foil = SCNCylinder(radius: 1.3, height: 1.25); foil.materials = [material(UIColor(red: 0.73, green: 0.63, blue: 0.39, alpha: 1), roughness: 0.3, metallic: 0.55)]
        let foilNode = SCNNode(geometry: foil); foilNode.eulerAngles.x = .pi / 2; foilNode.position.z = -12.7; bottle.addChildNode(foilNode)
        let label = SCNPlane(width: 3.8, height: 4.6); label.materials = [material(UIColor(red: 0.84, green: 0.81, blue: 0.72, alpha: 1), roughness: 0.8)]
        let labelNode = SCNNode(geometry: label); labelNode.position.z = -2.7; labelNode.eulerAngles.y = .pi; bottle.addChildNode(labelNode)
        if highlighted {
            let ring = SCNTorus(ringRadius: 5.2, pipeRadius: 0.42)
            ring.materials = [material(UIColor(red: 0.62, green: 0.82, blue: 0.69, alpha: 1), roughness: 0.25, metallic: 0.3)]
            let ringNode = SCNNode(geometry: ring); ringNode.position.z = -0.4; bottle.addChildNode(ringNode)
        }
        root.addChildNode(bottle)
    }

    private func material(_ color: UIColor, roughness: CGFloat, metallic: CGFloat = 0, transparency: CGFloat = 1) -> SCNMaterial {
        let material = SCNMaterial(); material.diffuse.contents = color; material.roughness.contents = roughness
        material.metalness.contents = metallic; material.transparency = transparency; material.lightingModel = .physicallyBased
        if transparency < 1 {
            material.transparencyMode = .dualLayer
            material.blendMode = .alpha
            material.writesToDepthBuffer = false
        }
        material.isDoubleSided = true
        return material
    }

    final class Coordinator: NSObject {
        weak var view: SCNView?
        var winesByID: [UUID: Wine] = [:]
        var highlightedID: UUID?
        var selectedWine: ((Wine) -> Void)?
        var camera: CellarCamera = .angle
        func setCamera(_ preset: CellarCamera) {
            camera = preset
            view?.pointOfView = view?.scene?.rootNode.childNode(withName: "camera-\(preset.rawValue)", recursively: true)
        }
        @objc func selectWine(_ recognizer: UITapGestureRecognizer) {
            guard let view, recognizer.state == .ended else { return }
            let point = recognizer.location(in: view)
            for hit in view.hitTest(point) {
                var node: SCNNode? = hit.node
                while let current = node {
                    if let name = current.name, name.hasPrefix("wine-"),
                       let id = UUID(uuidString: String(name.dropFirst(5))), let wine = winesByID[id] {
                        selectedWine?(wine); return
                    }
                    node = current.parent
                }
            }
        }
    }
}

private struct ForestPrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.forest(16, weight: .semibold)).foregroundStyle(.forestBackground)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(.forestAccent, in: RoundedRectangle(cornerRadius: 6))
            .opacity(configuration.isPressed ? 0.78 : 1)
    }
}

private extension View {
    func forestField() -> some View {
        padding(15).font(.forest(16)).foregroundStyle(.forestPrimary)
            .background(.forestSurface, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(.forestHairline, lineWidth: 1))
    }
    func forestCard() -> some View {
        padding(18).background(.forestSurface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.forestHairline, lineWidth: 1))
    }
    func overline() -> some View {
        font(.forest(11, weight: .semibold)).tracking(2).foregroundStyle(.forestMuted)
    }
}

private enum CellarWindowStatus {
    case ready, approaching, pastPeak, young, unknown
    var title: String {
        switch self {
        case .ready: "Ready"
        case .approaching: "Ready soon"
        case .pastPeak: "Past peak"
        case .young: "Young"
        case .unknown: "Unknown"
        }
    }
    var color: Color {
        switch self {
        case .ready: .forestSuccess
        case .approaching, .pastPeak: .forestWarning
        case .young, .unknown: .forestMuted
        }
    }
}

private func cellarWindowStatus(_ wine: Wine, year: Int = Calendar.current.component(.year, from: .now)) -> CellarWindowStatus {
    let years = wine.drinkingWindow.components(separatedBy: CharacterSet.decimalDigits.inverted).compactMap(Int.init)
    guard let first = years.first, let last = years.last else { return .unknown }
    if year > last { return .pastPeak }
    if year >= first { return .ready }
    if year == first - 1 { return .approaching }
    return .young
}

struct AuthView: View {
    @EnvironmentObject private var model: AppModel
    @State private var registering = false
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""

    private var emailValid: Bool { email.range(of: #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#, options: .regularExpression) != nil }
    private var passwordValid: Bool { password.range(of: #"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$"#, options: .regularExpression) != nil }
    private var canSubmit: Bool { emailValid && passwordValid && (!registering || password == confirmation) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    Image(systemName: "wineglass.fill").font(.system(size: 34)).foregroundStyle(.forestAccent)
                        .frame(width: 104, height: 104).background(.forestMutedSurface, in: RoundedRectangle(cornerRadius: 28))
                    Text("O M N I C A V E").font(.forest(13, weight: .semibold)).tracking(3).foregroundStyle(.forestSecondary)
                    Text(registering ? "Create account" : "Welcome back").font(.forest(36)).foregroundStyle(.forestPrimary)
                    VStack(spacing: 12) {
                        TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().forestField()
                        SecureField("Password", text: $password).textContentType(registering ? .newPassword : .password).forestField()
                        if registering {
                            SecureField("Confirm password", text: $confirmation).textContentType(.newPassword).forestField()
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(["8 or more characters", "A lowercase letter", "An uppercase letter", "A number", "A special character"], id: \.self) { rule in
                                    Label(rule, systemImage: passwordMeets(rule) ? "checkmark.circle.fill" : "circle")
                                        .font(.forest(13)).foregroundStyle(passwordMeets(rule) ? .forestSuccess : .forestMuted)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if let error = model.error { Text(error).font(.forest(14)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading) }
                    if let notice = model.notice { Text(notice).font(.forest(14)).foregroundStyle(.forestSuccess).frame(maxWidth: .infinity, alignment: .leading) }
                    Button(registering ? "Sign up" : "Log in") {
                        Task {
                            if registering {
                                await model.signUp(email: email, password: password)
                                if model.error == nil { registering = false; password = ""; confirmation = "" }
                            } else { await model.signIn(email: email, password: password) }
                        }
                    }.buttonStyle(ForestPrimaryButton()).disabled(!canSubmit || model.busy).opacity(canSubmit && !model.busy ? 1 : 0.55)
                    Button(registering ? "I already have an account" : "Create an account") {
                        registering.toggle(); model.error = nil; model.notice = nil
                    }.font(.forest(16, weight: .medium)).foregroundStyle(.forestAccent)
                    if !registering {
                        Button { Task { await model.signIn(email: MockService.demoEmail, password: MockService.demoPassword) } } label: {
                            VStack(spacing: 6) {
                                Text("Use demo account").font(.forest(15, weight: .semibold))
                                Text("\(MockService.demoEmail) · \(MockService.demoPassword)").font(.forest(12))
                            }.frame(maxWidth: .infinity).padding(14).background(.forestSurface, in: RoundedRectangle(cornerRadius: 12))
                        }.foregroundStyle(.forestAccent).disabled(model.busy)
                        if AppConfig.useMock { Text("DEMO BUILD · DATA STAYS ON THIS DEVICE").overline() }
                    }
                }.padding(.horizontal, 24).padding(.top, 48).padding(.bottom, 32)
            }.background { Color.forestBackground.ignoresSafeArea() }
        }
    }

    private func passwordMeets(_ rule: String) -> Bool {
        switch rule {
        case "8 or more characters": password.count >= 8
        case "A lowercase letter": password.range(of: "[a-z]", options: .regularExpression) != nil
        case "An uppercase letter": password.range(of: "[A-Z]", options: .regularExpression) != nil
        case "A number": password.range(of: "[0-9]", options: .regularExpression) != nil
        default: password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil
        }
    }
}

struct MainView: View {
    @State private var selectedTab = "cellar"
    @State private var showProfile = false
    @State private var showNotifications = false
    var body: some View {
        TabView(selection: $selectedTab) {
            CellarView(selectedTab: $selectedTab, showProfile: $showProfile, showNotifications: $showNotifications).tabItem { Label { Text("Cellar") } icon: { Image(uiImage: WebOSIconRaster.image(for: .cellar)) } }.tag("cellar")
            InventoryView(selectedTab: $selectedTab, showProfile: $showProfile, showNotifications: $showNotifications).tabItem { Label { Text("Inventory") } icon: { Image(uiImage: WebOSIconRaster.image(for: .inventory)) } }.tag("inventory")
            AIView(showProfile: $showProfile, showNotifications: $showNotifications).tabItem { Label { Text("Sommelier") } icon: { Image(uiImage: WebOSIconRaster.image(for: .sommelier)) } }.tag("sommelier")
            BriefingView(selectedTab: $selectedTab, showProfile: $showProfile, showNotifications: $showNotifications).tabItem { Label { Text("Briefing") } icon: { Image(uiImage: WebOSIconRaster.image(for: .briefing)) } }.tag("briefing")
            ValueView(showProfile: $showProfile, showNotifications: $showNotifications).tabItem { Label { Text("Value") } icon: { Image(uiImage: WebOSIconRaster.image(for: .value)) } }.tag("value")
        }.tint(.forestAccent)
            .sheet(isPresented: $showProfile) { ProfileView(selectedTab: $selectedTab) }
            .sheet(isPresented: $showNotifications) { NotificationCenterView() }
    }
}

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @State private var showClimate = false
    private var cellar: Cellar? { model.cellars.first { $0.id == model.selectedCellar } }
    private var featured: Wine? { model.wines.first { $0.cellarID == model.selectedCellar } ?? model.wines.first }
    private var firstName: String { model.user?.email.split(separator: "@").first?.capitalized ?? "Wine lover" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack {
                        Text("OmniCave").font(.forest(22, weight: .semibold)).foregroundStyle(.forestPrimary)
                        Spacer()
                        Circle().fill(model.networkAvailable ? .forestSuccess : .forestWarning).frame(width: 9, height: 9)
                        Text("\(model.networkAvailable ? "Connected" : "Offline")\(AppConfig.useMock ? " · Demo" : "")").font(.forest(11)).foregroundStyle(.forestSecondary)
                        Image(systemName: "bell.badge").font(.system(size: 20)).foregroundStyle(.forestPrimary).padding(.leading, 8)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Good evening, \(firstName).").font(.forest(32)).foregroundStyle(.forestPrimary)
                        Text("Your collection is resting well.").font(.forest(17)).foregroundStyle(.forestSecondary)
                    }
                    if let cellar {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("CELLAR").overline()
                            Menu {
                                ForEach(model.cellars) { item in Button(item.name) { model.selectedCellar = item.id } }
                            } label: {
                                HStack { Text(cellar.name).font(.forest(21, weight: .medium)); Spacer(); Text("Change").font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) }
                            }.foregroundStyle(.forestPrimary)
                        }.padding(.bottom, 14).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
                        Button { showClimate = true } label: {
                            VStack(alignment: .leading, spacing: 16) {
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Text("\(model.wines.filter { $0.cellarID == cellar.id }.count)").font(.forest(48)).foregroundStyle(.forestPrimary)
                                    Text("BOTTLES").font(.forest(12, weight: .medium)).tracking(2).foregroundStyle(.forestMuted)
                                    Spacer(); Image(systemName: "arrow.right").foregroundStyle(.forestSecondary)
                                }
                                Rectangle().fill(.forestHairline).frame(height: 1)
                                HStack(alignment: .top, spacing: 24) {
                                    metric("TEMPERATURE", String(format: "%.1f°C", cellar.temperature))
                                    metric("HUMIDITY", String(format: "%.0f%%", cellar.humidity))
                                    Spacer(); Image(systemName: "arrow.right").foregroundStyle(.forestSecondary).padding(.top, 10)
                                }
                                Label(cellar.online ? "Live · updated just now" : "Sensor offline", systemImage: "circle.fill").font(.forest(13)).foregroundStyle(cellar.online ? .forestSuccess : .forestWarning)
                                Text("Sensor \(cellar.online ? "OK · Connected" : "disconnected")").font(.forest(13)).foregroundStyle(.forestSecondary)
                            }.forestCard()
                        }.buttonStyle(.plain).accessibilityLabel("Open temperature, humidity and cellar alerts")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("TODAY").overline()
                        if let wine = featured {
                            Button { selectedTab = "inventory" } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label("FEATURED WINE · \(wine.vintage)", systemImage: "circle.fill").font(.forest(11, weight: .medium)).tracking(1.3).foregroundStyle(wine.style.tint)
                                    Text(wine.name).font(.forest(27)).foregroundStyle(.forestPrimary)
                                    Text("\(wine.winery) · \(wine.region)").font(.forest(15)).foregroundStyle(.forestSecondary)
                                    Text("Open an hour ahead; pairs well with seasonal dishes.").font(.forest(15)).foregroundStyle(.forestSecondary).padding(.top, 6)
                                    HStack { Text("\(wine.location)").font(.forest(13)).foregroundStyle(.forestMuted); Spacer(); Text("Details →").font(.forest(14, weight: .medium)).foregroundStyle(.forestAccent) }
                                }.frame(maxWidth: .infinity, alignment: .leading).forestCard()
                            }.buttonStyle(.plain)
                        }
                    }
                    NavigationLink { BriefingView(selectedTab: $selectedTab, showProfile: .constant(false), showNotifications: .constant(false)) } label: {
                        HStack { VStack(alignment: .leading, spacing: 6) { Text("DAILY WINE BRIEFING").overline(); Text("Collection news and drinking-window notes").font(.forest(15)).foregroundStyle(.forestPrimary) }; Spacer(); Image(systemName: "arrow.right").foregroundStyle(.forestAccent) }.forestCard()
                    }.buttonStyle(.plain)
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .sheet(isPresented: $showClimate) { EnvironmentView() }
                .refreshable { await model.refresh() }
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) { Text(title).font(.forest(11, weight: .medium)).tracking(1.4).foregroundStyle(.forestMuted); Text(value).font(.forest(25)).foregroundStyle(.forestPrimary) }
    }
}

struct CellarView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @Binding var showProfile: Bool
    @Binding var showNotifications: Bool
    @State private var showAdd = false
    @State private var addingBottle = false
    @State private var editingCellar: Cellar?
    @State private var selectedWine: Wine?
    @State private var showClimate = false
    @State private var mapMode: CellarMapMode = .threeD
    @State private var camera: CellarCamera = .angle
    private var cellar: Cellar? { model.cellars.first { $0.id == model.selectedCellar } }
    private var wines: [Wine] { model.wines.filter { $0.cellarID == model.selectedCellar } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(greeting).font(.forest(29)).foregroundStyle(.forestPrimary)
                        Text(cellarSummary).font(.forest(15)).foregroundStyle(.forestSecondary)
                    }
                    if let cellar {
                        HStack(alignment: .top, spacing: 12) {
                            Button { selectedTab = "inventory" } label: {
                                VStack(alignment: .leading, spacing: 7) {
                                    Text("\(wines.count)").font(.forest(38)).foregroundStyle(.forestPrimary)
                                    Text(wines.count == 1 ? "BOTTLE →" : "BOTTLES →").overline()
                                }.frame(maxWidth: .infinity, minHeight: 96, alignment: .leading).forestCard()
                            }.buttonStyle(.plain)
                            Button { showClimate = true } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("CELLAR CLIMATE").overline()
                                    HStack(spacing: 12) {
                                        Label(String(format: "%.1f°", cellar.temperature), systemImage: "thermometer.medium")
                                        Label(String(format: "%.0f%%", cellar.humidity), systemImage: "humidity")
                                    }.font(.forest(14, weight: .medium)).foregroundStyle(.forestPrimary)
                                    Label(cellar.online ? "Normal · just now" : "Sensor offline", systemImage: "circle.fill")
                                        .font(.forest(12)).foregroundStyle(cellar.online ? .forestSuccess : .forestWarning)
                                }.frame(maxWidth: .infinity, minHeight: 96, alignment: .leading).forestCard()
                            }.buttonStyle(.plain)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("CELLAR").overline()
                            Menu {
                                ForEach(model.cellars) { item in Button(item.name) { model.selectedCellar = item.id } }
                                Button("Add a cellar") { showAdd = true }
                                Button("Edit cellar") { editingCellar = cellar }
                            } label: { HStack { Text(cellar.name).font(.forest(20, weight: .medium)); Spacer(); Text("Change").font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) } }.foregroundStyle(.forestPrimary)
                        }.padding(.vertical, 12).overlay(alignment: .top) { Rectangle().fill(.forestHairline).frame(height: 1) }.overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
                        Text("\(wines.count) of \(cellar.capacity) filled").font(.forest(16)).foregroundStyle(.forestSecondary)
                        HStack {
                            Text("CELLAR MAP").overline()
                            Spacer()
                            Button { addingBottle = true } label: {
                                Label("Add bottle", systemImage: "plus").font(.forest(14, weight: .medium)).foregroundStyle(.forestAccent)
                            }
                        }
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 14) { ForEach(WineStyle.allCases) { style in Label(style.rawValue, systemImage: "circle.fill").font(.forest(12)).foregroundStyle(style.tint) }; Label("Uncertain", systemImage: "circle.dashed").font(.forest(12)).foregroundStyle(.forestWarning) }
                        }
                        Picker("Map view", selection: $mapMode) {
                            ForEach(CellarMapMode.allCases) { mode in Text(mode.rawValue).tag(mode) }
                        }.pickerStyle(.segmented)
                        if mapMode == .threeD {
                            VStack(spacing: 10) {
                                WineCellar3DMap(wines: wines, highlightedID: model.mapTargetWine, selectedWine: $selectedWine, camera: $camera)
                                    .frame(height: 360).clipShape(RoundedRectangle(cornerRadius: 16))
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        ForEach(CellarCamera.allCases) { preset in
                                            Button(preset.rawValue) { camera = preset }
                                                .font(.forest(13, weight: camera == preset ? .semibold : .regular))
                                                .padding(.horizontal, 14).frame(height: 36)
                                                .background(camera == preset ? Color.forestAccent : Color.forestSurface, in: Capsule())
                                                .foregroundStyle(camera == preset ? Color.forestBackground : Color.forestSecondary)
                                        }
                                    }
                                }
                                Text("Drag to rotate · tap a bottle for details")
                                    .font(.forest(12)).foregroundStyle(.forestMuted)
                            }
                            .padding(12).background(.forestCabinet, in: RoundedRectangle(cornerRadius: 20))
                            .overlay(RoundedRectangle(cornerRadius: 20).stroke(.forestCabinetRail, lineWidth: 6))
                        } else {
                            VStack(alignment: .leading, spacing: 14) {
                                HStack { Text("CELLAR DOOR").overline(); Spacer(); Text("\(wines.count) bottles").font(.forest(12)).foregroundStyle(.forestCabinetMuted) }
                                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 7), spacing: 12) {
                                    ForEach(wines) { wine in
                                        Button { selectedWine = wine } label: {
                                            Circle().fill(LinearGradient(colors: [wine.style.tint.opacity(0.7), wine.style.tint], startPoint: .topLeading, endPoint: .bottomTrailing))
                                                .overlay(Circle().stroke(.white.opacity(0.22), lineWidth: 1))
                                                .overlay(Circle().fill(.black.opacity(0.23)).padding(7))
                                                .frame(width: 35, height: 35)
                                        }.buttonStyle(.plain).accessibilityLabel("\(wine.name), \(wine.vintage)")
                                    }
                                    ForEach(0..<max(0, min(28, cellar.capacity - wines.count)), id: \.self) { _ in
                                        Circle().fill(.forestCabinetInset).frame(width: 35, height: 35)
                                            .overlay(Circle().stroke(.forestCabinetRail, lineWidth: 1))
                                    }
                                }
                            }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                                .background(.forestCabinet, in: RoundedRectangle(cornerRadius: 20))
                                .overlay(RoundedRectangle(cornerRadius: 20).stroke(.forestCabinetRail, lineWidth: 6))
                        }
                    }
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) { Button { showNotifications = true } label: { WebOSIcon(name: .bell) }.accessibilityLabel("Notifications") }
                    ToolbarItem(placement: .topBarTrailing) { Button { showProfile = true } label: { ProfileAvatar() }.accessibilityLabel("Profile") }
                    ToolbarItem(placement: .topBarTrailing) { Menu { Button("Add a cellar") { showAdd = true }; if let cellar { Button("Edit cellar") { editingCellar = cellar } } } label: { Image(systemName: "ellipsis") } }
                }
                .sheet(isPresented: $showAdd) { CellarForm { newCellar in Task { await model.save(newCellar) } } }
                .sheet(item: $editingCellar) { item in CellarForm(cellar: item) { updated in Task { await model.save(updated) } } }
                .sheet(item: $selectedWine) { wine in WineDetail(wine: wine) }
                .sheet(isPresented: $showClimate) { EnvironmentView() }
                .sheet(isPresented: $addingBottle) {
                    WineForm(wine: nil) { newWine in
                        var bottle = newWine
                        if let cellarID = model.selectedCellar { bottle.cellarID = cellarID }
                        Task { await model.save(bottle) }
                    }
                }
                .refreshable { await model.refresh() }
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        let firstName = model.user?.email.split(separator: "@").first?.capitalized ?? "Wine lover"
        return "\(salutation), \(firstName)."
    }
    private var cellarSummary: String {
        guard let cellar else { return "Your cellar is ready for its first bottle." }
        if !cellar.online { return "Some sensors are offline. Readings may be out of date." }
        return wines.isEmpty ? "Your cellar is ready for its first bottle." : "Your collection is resting well."
    }

}

struct InventoryView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @Binding var showProfile: Bool
    @Binding var showNotifications: Bool
    @State private var query = ""
    @State private var adding = false
    @State private var selected: Wine?
    @State private var allCellars = false
    @State private var filter = "All"
    @State private var sortBy = "Name"
    private let filters = ["All", "Red", "White", "Rosé", "Sparkling", "Dessert", "Ready to drink"]
    private var results: [Wine] {
        let matches = model.wines.filter { wine in
            let textMatch = query.isEmpty || [wine.name, wine.winery, wine.region, String(wine.vintage), wine.grape].contains { $0.localizedCaseInsensitiveContains(query) }
            let cellarMatch = allCellars || model.selectedCellar == nil || wine.cellarID == model.selectedCellar
            let filterMatch = filter == "All" || (filter == "Ready to drink" ? cellarWindowStatus(wine) == .ready : filter == wine.style.rawValue)
            return textMatch && cellarMatch && filterMatch
        }
        return matches.sorted { lhs, rhs in
            switch sortBy {
            case "Vintage": return lhs.vintage > rhs.vintage
            case "Recently added": return (model.wines.firstIndex(of: lhs) ?? 0) > (model.wines.firstIndex(of: rhs) ?? 0)
            default: return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text("Inventory").font(.forest(32)).foregroundStyle(.forestPrimary)
                        Spacer()
                        Button { showNotifications = true } label: { WebOSIcon(name: .bell).frame(width: 34, height: 38).foregroundStyle(.forestPrimary) }.accessibilityLabel("Notifications")
                        Button { showProfile = true } label: { ProfileAvatar() }.accessibilityLabel("Profile")
                        Button { adding = true } label: { Image(systemName: "plus").font(.system(size: 20)).foregroundStyle(.forestPrimary).frame(width: 44, height: 44) }.accessibilityLabel("Add bottle")
                        Button { selectedTab = "cellar" } label: { Image(systemName: "square.grid.2x2").font(.system(size: 20)).foregroundStyle(.forestPrimary).frame(width: 44, height: 44) }.accessibilityLabel("Open cellar map")
                    }
                    Picker("Cellars", selection: $allCellars) {
                        Text(model.cellars.first(where: { $0.id == model.selectedCellar })?.name ?? "My cellar").tag(false)
                        Text("All cellars").tag(true)
                    }.pickerStyle(.segmented)
                    HStack(spacing: 10) { Image(systemName: "magnifyingglass").foregroundStyle(.forestMuted); TextField("Wine, winery, region, vintage, grape", text: $query).font(.forest(14)) }
                        .padding(14).background(.forestSurface, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(.forestHairline))
                    HStack(spacing: 8) {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) { ForEach(filters, id: \.self) { item in
                                Button(item) { filter = item }.font(.forest(14, weight: filter == item ? .medium : .regular))
                                    .padding(.horizontal, 16).frame(height: 40)
                                    .background(filter == item ? Color.forestAccent : .clear, in: Capsule())
                                    .foregroundStyle(filter == item ? Color.forestBackground : Color.forestSecondary)
                                    .overlay(Capsule().stroke(filter == item ? .clear : .forestHairline))
                            } }
                        }
                        .frame(maxWidth: .infinity)
                        Menu {
                            ForEach(["Name", "Vintage", "Recently added"], id: \.self) { item in Button(item) { sortBy = item } }
                        } label: {
                            Label("Sort", systemImage: "arrow.up.arrow.down").font(.forest(12, weight: .medium)).foregroundStyle(.forestAccent).padding(.horizontal, 10).frame(height: 38).background(.forestAccentSoft, in: Capsule())
                        }
                    }
                    HStack { Text("\(results.count) bottles · \(results.count) wines · \(max(0, 65 - results.count)) of 65 slots").font(.forest(14)).foregroundStyle(.forestSecondary); Spacer() }
                    LazyVStack(spacing: 0) {
                        ForEach(results) { wine in
                            Button { selected = wine } label: {
                                HStack(spacing: 14) {
                                    Capsule().fill(wine.style.tint).frame(width: 4, height: 68)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("\(wine.vintage) · \(wine.style.rawValue.uppercased())").font(.forest(11, weight: .medium)).tracking(1.2).foregroundStyle(.forestMuted)
                                        Text(wine.name).font(.forest(19, weight: .medium)).foregroundStyle(.forestPrimary)
                                        Text("\(wine.winery) · \(wine.region)").font(.forest(14)).foregroundStyle(.forestSecondary)
                                    }
                                    Spacer(minLength: 4)
                                    let status = cellarWindowStatus(wine)
                                    VStack(alignment: .trailing, spacing: 5) { Text("1").font(.forest(22)).foregroundStyle(.forestPrimary); Label(status.title, systemImage: "circle.fill").font(.forest(12)).foregroundStyle(status.color) }
                                }.padding(.vertical, 14).contentShape(Rectangle())
                            }.buttonStyle(.plain)
                            Rectangle().fill(.forestHairline).frame(height: 1)
                        }
                    }
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .sheet(isPresented: $adding) { WineForm(wine: nil) { newWine in Task { await model.save(newWine) } } }
                .sheet(item: $selected) {
                    wine in WineDetail(wine: wine) {
                        model.selectedCellar = wine.cellarID
                        model.mapTargetWine = wine.id
                        selectedTab = "cellar"
                    }
                }
                .refreshable { await model.refresh() }
        }
    }

}

struct WineDetail: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var wine: Wine
    var onFind: (() -> Void)? = nil
    @State private var editing = false
    @State private var confirmingRemoval = false
    @State private var moving = false
    var body: some View {
        NavigationStack {
            List {
                Section { VStack(alignment: .leading, spacing: 8) { Text("\(wine.vintage) · \(wine.style.rawValue.uppercased())").overline(); Text(wine.name).font(.forest(29)).foregroundStyle(.forestPrimary); Text("\(wine.winery) · \(wine.region)").font(.forest(16)).foregroundStyle(.forestSecondary); Text("Ready · \(wine.drinkingWindow)").font(.forest(14)).foregroundStyle(.forestSuccess).padding(.top, 4) }.padding(.vertical, 8) }
                Section("In your cellars") {
                    LabeledContent("Location", value: wine.location)
                    LabeledContent("Cellar", value: model.cellars.first(where: { $0.id == wine.cellarID })?.name ?? "Cellar")
                    if let onFind { Button("Find in cellar map") { onFind(); dismiss() } }
                    Button("Move in 3D cellar map") { moving = true }
                    Button("Ask the sommeliers") { Task { _ = await model.ask("Discuss \(wine.name) \(wine.vintage)") } }
                }
                Section("About this wine") { LabeledContent("Producer", value: wine.winery); LabeledContent("Region", value: wine.region); LabeledContent("Grape", value: wine.grape); LabeledContent("Vintage", value: String(wine.vintage)); LabeledContent("Estimated value", value: String(format: "$%.0f", wine.value)) }
                Section { Button("Edit bottle") { editing = true }; Button("Remove bottle", role: .destructive) { confirmingRemoval = true } }
            }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Bottle").navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented: $editing) { WineForm(wine: wine) { updated in Task { await model.save(updated); wine = updated } } }
                .sheet(isPresented: $moving) { WinePositionForm(wine: wine) { updated in Task { await model.save(updated); wine = updated } } }
                .confirmationDialog("Remove this bottle from your inventory?", isPresented: $confirmingRemoval, titleVisibility: .visible) { Button("Remove bottle", role: .destructive) { Task { await model.remove(wine); dismiss() } } }
        }
    }
}

private struct WinePositionForm: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var shelf = 1
    @State private var column = 4
    @State private var backRow = false
    let wine: Wine
    let onSave: (Wine) -> Void
    private let shelfHeights = [-45.0, -24.0, -3.0, 18.0, 39.0]

    var body: some View {
        NavigationStack {
            Form {
                Section("3D MAP POSITION") {
                    Picker("Shelf", selection: $shelf) { ForEach(1...5, id: \.self) { Text("Shelf \($0)").tag($0) } }
                    Picker("Column", selection: $column) { ForEach(1...7, id: \.self) { Text("Position \($0)").tag($0) } }
                    Picker("Depth row", selection: $backRow) { Text("Front row").tag(false); Text("Back row").tag(true) }
                }
                Section {
                    Text("The selected position is saved with this bottle and shown in the 3D cellar map.")
                        .font(.forest(13)).foregroundStyle(.forestSecondary)
                }
            }
            .scrollContentBackground(.hidden).background(.forestBackground)
            .navigationTitle("Move bottle").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        var updated = wine
                        let x = -31.0 + Double(column - 1) * 10
                        let y = shelfHeights[shelf - 1] + 4
                        let z = backRow ? 9.0 : -10.0
                        updated.mapPosition = WinePosition(x: x, y: y, z: z)
                        updated.location = "Shelf \(shelf) · \(backRow ? "Back" : "Front") row"
                        onSave(updated); dismiss()
                    }
                }
            }
        }
    }
}

struct WineForm: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @State var wine: Wine
    let isNew: Bool
    let onSave: (Wine) -> Void
    init(wine: Wine?, onSave: @escaping (Wine) -> Void) {
        isNew = wine == nil; self.onSave = onSave
        _wine = State(initialValue: wine ?? Wine(name: "", winery: "", region: "", vintage: Calendar.current.component(.year, from: .now), grape: "", location: "", cellarID: UUID()))
    }
    var body: some View {
        NavigationStack { Form {
            Section("WINE") { TextField("Wine name", text: $wine.name); TextField("Winery", text: $wine.winery); TextField("Region", text: $wine.region); TextField("Vintage", value: $wine.vintage, format: .number).keyboardType(.numberPad); TextField("Grape variety", text: $wine.grape) }
            Section("STORAGE LOCATION") { Picker("Cellar", selection: $wine.cellarID) { ForEach(model.cellars) { Text($0.name).tag($0.id) } }; TextField("Shelf and position", text: $wine.location) }
            Section("VALUE") { TextField("Estimated value (USD)", value: $wine.value, format: .number).keyboardType(.decimalPad) }
        }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle(isNew ? "Add bottle" : "Edit bottle").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save Changes") { if isNew, let id = model.selectedCellar { wine.cellarID = id }; onSave(wine); dismiss() }.disabled(wine.name.isEmpty) } } }
    }
}

struct CellarForm: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    let onSave: (Cellar) -> Void
    private let cellar: Cellar?
    init(cellar: Cellar? = nil, onSave: @escaping (Cellar) -> Void) { self.cellar = cellar; self.onSave = onSave; _name = State(initialValue: cellar?.name ?? "") }
    var body: some View {
        NavigationStack { Form { Section("CELLAR") { TextField("Cellar name", text: $name) } }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle(cellar == nil ? "Add a cellar" : "Edit cellar").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save Changes") { var value = cellar ?? Cellar(name: name); value.name = name; onSave(value); dismiss() }.disabled(name.isEmpty) } } }
    }
}

struct EnvironmentView: View {
    @EnvironmentObject private var model: AppModel
    @State private var minTemp = 10.0
    @State private var maxTemp = 16.0
    @State private var minHumidity = 55.0
    @State private var maxHumidity = 75.0
    private var cellar: Cellar? { model.cellars.first { $0.id == model.selectedCellar } }
    private var history: [Reading] { (0..<12).map { i in Reading(date: Calendar.current.date(byAdding: .hour, value: -i, to: .now)!, temperature: (cellar?.temperature ?? 12.5) + sin(Double(i)) * 0.4, humidity: (cellar?.humidity ?? 68) + cos(Double(i)) * 2) }.reversed() }
    var body: some View {
        NavigationStack { List {
            if let cellar {
                Section("Current conditions") { LabeledContent("Temperature", value: String(format: "%.1f °C", cellar.temperature)); LabeledContent("Humidity", value: String(format: "%.0f %%", cellar.humidity)); Label("Sensor status: \(cellar.online ? "Connected" : "Offline")", systemImage: cellar.online ? "checkmark.circle.fill" : "exclamationmark.triangle.fill").foregroundStyle(cellar.online ? .forestSuccess : .forestWarning) }
                Section("12 hour history · demo data") { Chart(history) { reading in LineMark(x: .value("Time", reading.date), y: .value("Temperature", reading.temperature)).foregroundStyle(Color.forestAccent) }.frame(height: 130); Chart(history) { reading in LineMark(x: .value("Time", reading.date), y: .value("Humidity", reading.humidity)).foregroundStyle(Color.forestWhite) }.frame(height: 130) }
                Section("Alert thresholds") { LabeledContent("Temperature (°C)") { HStack { TextField("Min", value: $minTemp, format: .number).keyboardType(.decimalPad); Text("–"); TextField("Max", value: $maxTemp, format: .number).keyboardType(.decimalPad) } }; LabeledContent("Humidity (%)") { HStack { TextField("Min", value: $minHumidity, format: .number).keyboardType(.decimalPad); Text("–"); TextField("Max", value: $maxHumidity, format: .number).keyboardType(.decimalPad) } }; Text("Demo data · live sensor alerts require backend setup.").font(.forest(12)).foregroundStyle(.forestMuted) }
                Section("Zone controls") { stepperRow("Temperature", value: cellar.temperature, unit: "°C") { delta in Task { var updated = cellar; updated.temperature += delta; await model.save(updated) } }; stepperRow("Humidity", value: cellar.humidity, unit: "%") { delta in Task { var updated = cellar; updated.humidity += delta; await model.save(updated) } } }
            }
        }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Notifications & alerts") }
    }
    private func stepperRow(_ title: String, value: Double, unit: String, change: @escaping (Double) -> Void) -> some View {
        HStack { Text(title).font(.forest(15)); Spacer(); Button("−") { change(unit == "°C" ? -0.5 : -1) }; Text(String(format: unit == "°C" ? "%.1f %@" : "%.0f %@", value, unit)).font(.forest(15)); Button("+") { change(unit == "°C" ? 0.5 : 1) } }
    }
}

private struct CustomSommelier: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var name = ""
    var title = ""
    var colorHex = "#7A5A2B"
    var values = ["fruit"]
    var scoring = "hundred"
    var regionFocus = "everywhere"
    var strictness = 3
    var tone = "warm"
    var personality = ""
}

private let sommelierColors = ["#7A3340", "#2F5D50", "#3E4F7A", "#7A5A2B", "#5B3F6E", "#2E6070", "#6B4A3A", "#4A4F55"]
private let sommelierValues = ["Power", "Elegance", "Freshness", "Oak", "Ripe fruit", "Ageing", "Value", "Terroir"]
private func sommelierColor(_ hex: String) -> Color {
    let value = UInt(hex.dropFirst(), radix: 16) ?? 0
    return Color(.sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255, opacity: 1)
}

struct AIView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showProfile: Bool
    @Binding var showNotifications: Bool
    @State private var prompt = ""
    @State private var answer = ""
    @State private var selectedWine: Wine?
    @State private var criticAnswer = ""
    @State private var messages: [ChatMessage] = []
    @State private var selectedPersona = "Round table"
    @State private var showPersonaManager = false
    @AppStorage("customSommeliers") private var customSommelierJSON = "[]"
    @State private var showWinePicker = false
    @State private var showComposer = false
    private let standardPersonas: [(String, String, Color)] = [("VH", "Victor Hale", .forestRed), ("LM", "Lucia Moretti", .forestAccent), ("SO", "Sam Okafor", Color(red: 0.25, green: 0.32, blue: 0.52))]
    private var customSommeliers: [CustomSommelier] {
        guard let data = customSommelierJSON.data(using: .utf8) else { return [] }
        if let saved = try? JSONDecoder().decode([CustomSommelier].self, from: data) { return saved }
        return customSommelierJSON.split(separator: "\n").map { name in
            var profile = CustomSommelier()
            profile.name = String(name)
            return profile
        }
    }
    private var personas: [(String, String, Color)] {
        standardPersonas + customSommeliers.map { profile in
            (String(profile.name.split(separator: " ").compactMap(\.first).prefix(2)), profile.name, sommelierColor(profile.colorHex))
        }
    }
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Sommelier").font(.forest(32)).foregroundStyle(.forestPrimary)
                HStack {
                    HStack(spacing: -10) { ForEach(personas, id: \.0) { item in Text(item.0).font(.forest(14, weight: .semibold)).foregroundStyle(.white).frame(width: 52, height: 52).background(item.2, in: Circle()).overlay(Circle().stroke(.forestBackground, lineWidth: 3)) } }
                    Spacer()
                    Button("Manage ›") { showPersonaManager = true }.font(.forest(15)).foregroundStyle(.forestAccent)
                }.padding(.vertical, 8)
                Text("YOUR SOMMELIERS · \(personas.count)").overline()
                Text("Lead voice: \(selectedPersona)").font(.forest(13)).foregroundStyle(.forestSecondary)
                Text("START A TASTING").overline()
                VStack(spacing: 0) {
                    sommelierAction("Discuss a wine", icon: "wineglass", promptText: "Discuss a wine from my cellar")
                    sommelierAction("What to open tonight", icon: "moon", promptText: "What should I open tonight?")
                    sommelierAction("Pair with my dinner", icon: "fork.knife", promptText: "Recommend a wine pairing for my dinner")
                    sommelierAction("Ask anything", icon: "bubble.left", promptText: "")
                }
                if showComposer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("TELL THE SOMMELIERS").overline()
                        TextField("What are you eating or wondering about?", text: $prompt, axis: .vertical).lineLimit(3...6).forestField()
                        Button("Start tasting") {
                            let question = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !question.isEmpty else { return }
                            Task { await askSommeliers(question); prompt = ""; showComposer = false }
                        }.buttonStyle(ForestPrimaryButton()).disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy)
                    }.forestCard()
                }
                if !answer.isEmpty { Text(answer).font(.forest(15)).foregroundStyle(.forestPrimary).frame(maxWidth: .infinity, alignment: .leading).forestCard() }
                if !messages.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text("RECENT CONVERSATIONS").overline(); Spacer(); Button("Clear") { messages.removeAll(); answer = "" }.font(.forest(13)).foregroundStyle(.forestAccent) }
                        ForEach(messages.suffix(5)) { message in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(message.author).font(.forest(12, weight: .semibold)).foregroundStyle(.forestAccent)
                                Text(message.text).font(.forest(14)).foregroundStyle(.forestSecondary).lineLimit(3)
                            }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                                .overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).forestCard()
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text("DISCUSS A WINE").overline()
                    Picker("Select wine", selection: $selectedWine) { Text("Choose a wine").tag(nil as Wine?); ForEach(model.wines) { Text($0.name).tag($0 as Wine?) } }.tint(.forestAccent)
                    Button("Generate critic dialogue") { Task { await generateCriticDialogue() } }.buttonStyle(ForestPrimaryButton()).disabled(selectedWine == nil || model.busy)
                    if !criticAnswer.isEmpty { Text(criticAnswer).font(.forest(14)).foregroundStyle(.forestSecondary) }
                }.forestCard()
                if messages.isEmpty { Text("Your recent tastings will appear here.").font(.forest(14)).foregroundStyle(.forestMuted) }
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button { showNotifications = true } label: { WebOSIcon(name: .bell) }.accessibilityLabel("Notifications") }
                ToolbarItem(placement: .topBarTrailing) { Button { showProfile = true } label: { ProfileAvatar() }.accessibilityLabel("Profile") }
            }
            .sheet(isPresented: $showPersonaManager) {
                SommelierPersonaPicker(personas: personas, customSommeliers: customSommeliers, selected: $selectedPersona) { profile in
                    var updated = customSommeliers
                    updated.removeAll { $0.id == profile.id || $0.name.caseInsensitiveCompare(profile.name) == .orderedSame }
                    updated.append(profile)
                    if let data = try? JSONEncoder().encode(updated), let json = String(data: data, encoding: .utf8) { customSommelierJSON = json }
                }
            }
            .sheet(isPresented: $showWinePicker) {
                NavigationStack {
                    List(model.wines) { wine in
                        Button {
                            selectedWine = wine
                            showWinePicker = false
                            Task { await generateCriticDialogue(for: wine) }
                        } label: { Label("\(wine.name) · \(wine.vintage)", systemImage: "wineglass") }
                    }.navigationTitle("Choose a wine").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { showWinePicker = false } } }
                }
            }
    }

    private func sommelierAction(_ title: String, icon: String, promptText: String) -> some View {
        Button {
            switch title {
            case "Discuss a wine": showWinePicker = true
            case "Pair with my dinner", "Ask anything": prompt = ""; showComposer = true
            default: Task { await askSommeliers(promptText) }
            }
        } label: {
            HStack(spacing: 16) { Image(systemName: icon).font(.system(size: 18)).foregroundStyle(.forestAccent).frame(width: 44, height: 44).background(.forestMutedSurface, in: Circle()); Text(title).font(.forest(17, weight: .medium)).foregroundStyle(.forestPrimary); Spacer(); Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(.forestMuted) }
                .padding(.vertical, 12).contentShape(Rectangle()).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
        }.buttonStyle(.plain)
    }

    private func askSommeliers(_ question: String) async {
        let lead: String
        if let profile = customSommeliers.first(where: { $0.name == selectedPersona }) {
            lead = "Answer as \(profile.name), \(profile.title.isEmpty ? "a wine sommelier" : profile.title). Values: \(profile.values.joined(separator: ", ")). Scoring: \(profile.scoring). Region focus: \(profile.regionFocus). Strictness: \(profile.strictness)/5. Tone: \(profile.tone). Personality: \(profile.personality). "
        } else {
            lead = selectedPersona == "Round table" ? "" : "Answer as \(selectedPersona). "
        }
        let text = await model.ask(lead + question)
        answer = text
        messages.append(ChatMessage(author: selectedPersona == "Round table" ? "OmniCave" : selectedPersona, text: text))
    }

    private func generateCriticDialogue(for wine: Wine? = nil) async {
        guard let wine = wine ?? selectedWine else { return }
        let question = "Generate a multi-critic discussion of \(wine.name), \(wine.winery), vintage \(wine.vintage), from \(wine.region). Give tasting notes and aging outlook."
        criticAnswer = await model.ask(question)
        messages.append(ChatMessage(author: "Tasting · \(wine.name)", text: criticAnswer))
    }
}

private struct SommelierPersonaPicker: View {
    @Environment(\.dismiss) private var dismiss
    let personas: [(String, String, Color)]
    let customSommeliers: [CustomSommelier]
    @Binding var selected: String
    let onSave: (CustomSommelier) -> Void
    @State private var editingPersona: CustomSommelier?
    var body: some View {
        NavigationStack {
            List {
                Section("Choose a lead voice") {
                    Button { selected = "Round table"; dismiss() } label: {
                        Label("Round table", systemImage: selected == "Round table" ? "checkmark.circle.fill" : "circle")
                    }
                    ForEach(personas.filter { persona in !customSommeliers.contains(where: { $0.name == persona.1 }) }, id: \.1) { persona in
                        Button { selected = persona.1; dismiss() } label: {
                            HStack(spacing: 12) {
                                Text(persona.0).font(.forest(13, weight: .semibold)).foregroundStyle(.white)
                                    .frame(width: 40, height: 40).background(persona.2, in: Circle())
                                Text(persona.1).font(.forest(15)).foregroundStyle(.forestPrimary)
                                Spacer()
                                if selected == persona.1 { Image(systemName: "checkmark").foregroundStyle(.forestAccent) }
                            }
                        }
                    }
                    ForEach(customSommeliers) { profile in
                        Button { selected = profile.name; dismiss() } label: {
                            HStack(spacing: 12) {
                                Text(String(profile.name.split(separator: " ").compactMap(\.first).prefix(2)))
                                    .font(.forest(13, weight: .semibold)).foregroundStyle(.white)
                                    .frame(width: 40, height: 40).background(sommelierColor(profile.colorHex), in: Circle())
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(profile.name).font(.forest(15)).foregroundStyle(.forestPrimary)
                                    Text(profile.title.isEmpty ? "Sommelier" : profile.title).font(.forest(12)).foregroundStyle(.forestSecondary)
                                }
                                Spacer()
                                Button { editingPersona = profile } label: { Image(systemName: "pencil").foregroundStyle(.forestAccent) }
                                    .buttonStyle(.borderless).accessibilityLabel("Edit \(profile.name)")
                            }
                        }
                    }
                }
                Section {
                    Button { editingPersona = CustomSommelier() } label: {
                        Label("Add a sommelier", systemImage: "plus.circle.fill").foregroundStyle(.forestAccent)
                    }
                }
            }.navigationTitle("Your sommeliers").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
                .sheet(item: $editingPersona) { profile in
                    SommelierProfileEditor(profile: profile) { saved in
                        onSave(saved)
                        selected = saved.name
                        editingPersona = nil
                    }
                }
        }
    }
}

private struct SommelierProfileEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var profile: CustomSommelier
    let onSave: (CustomSommelier) -> Void
    private let tones = ["Formal", "Warm", "Playful", "Blunt"]
    private let focuses = ["Old World", "New World", "Everywhere"]
    private let scales = ["100 points", "20 points", "5 stars"]
    private let strictnessLabels = ["Generous", "Kind", "Balanced", "Exacting", "Severe"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Name and role") {
                    TextField("Name", text: $profile.name).textInputAutocapitalization(.words)
                    TextField("Role, e.g. The Explorer", text: $profile.title)
                }
                Section("Avatar color") {
                    HStack(spacing: 12) {
                        ForEach(sommelierColors, id: \.self) { hex in
                            Button { profile.colorHex = hex } label: {
                                Circle().fill(sommelierColor(hex)).frame(width: 30, height: 30)
                                    .overlay(Circle().stroke(profile.colorHex == hex ? Color.primary : .clear, lineWidth: 2).padding(-4))
                            }.buttonStyle(.plain).accessibilityLabel("Choose avatar color")
                        }
                    }.padding(.vertical, 5)
                }
                Section("What they value · \(profile.values.count) of 3") {
                    ForEach(sommelierValues, id: \.self) { value in
                        Button {
                            if profile.values.contains(value) { profile.values.removeAll { $0 == value } }
                            else if profile.values.count < 3 { profile.values.append(value) }
                        } label: {
                            HStack { Text(value).foregroundStyle(.primary); Spacer(); if profile.values.contains(value) { Image(systemName: "checkmark").foregroundStyle(.tint) } }
                        }.disabled(!profile.values.contains(value) && profile.values.count >= 3)
                    }
                }
                Section("Scoring") {
                    Picker("Scale", selection: $profile.scoring) { ForEach(scales, id: \.self) { Text($0).tag($0) } }.pickerStyle(.segmented)
                }
                Section("Region focus") {
                    Picker("Focus", selection: $profile.regionFocus) { ForEach(focuses, id: \.self) { Text($0).tag($0) } }
                }
                Section("How strict") {
                    Picker("Strictness", selection: $profile.strictness) { ForEach(1...5, id: \.self) { Text(strictnessLabels[$0 - 1]).tag($0) } }
                }
                Section("Tone") {
                    Picker("Voice", selection: $profile.tone) { ForEach(tones, id: \.self) { Text($0).tag($0) } }
                }
                Section("Personality") {
                    TextField("Background, favourite regions, pet hates…", text: $profile.personality, axis: .vertical).lineLimit(4...7)
                }
            }
            .scrollContentBackground(.hidden).background(.forestBackground)
            .navigationTitle("New sommelier").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { profile.name = profile.name.trimmingCharacters(in: .whitespacesAndNewlines); onSave(profile); dismiss() }
                        .disabled(profile.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || profile.values.isEmpty)
                }
            }
        }
    }
}

struct BriefingView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @Binding var showProfile: Bool
    @Binding var showNotifications: Bool
    @State private var selectedWine: Wine?
    private var readyWines: [Wine] { model.wines.filter { cellarWindowStatus($0) == .ready } }
    private var approachingWines: [Wine] { model.wines.filter { cellarWindowStatus($0) == .approaching } }
    private var openSoon: [Wine] { Array(model.wines.filter { [.pastPeak, .ready].contains(cellarWindowStatus($0)) }.prefix(3)) }
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Briefing").font(.forest(32)).foregroundStyle(.forestPrimary)
                Text(Date.now.formatted(date: .complete, time: .omitted).uppercased()).overline()
                Text(briefingHeadline).font(.forest(19, weight: .medium)).foregroundStyle(.forestSecondary)
                HStack(spacing: 12) {
                    briefingMetric("\(readyWines.count)", "READY NOW")
                    briefingMetric("\(approachingWines.count)", "READY SOON")
                    briefingMetric("\(offlineCount)", "OFFLINE")
                }
                if !openSoon.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("OPEN SOON").overline()
                        ForEach(openSoon) { wine in
                            Button { selectedWine = wine } label: {
                                HStack(spacing: 12) {
                                    Capsule().fill(wine.style.tint).frame(width: 4, height: 46)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("\(wine.name) · \(wine.vintage)").font(.forest(15, weight: .medium)).foregroundStyle(.forestPrimary)
                                        Text("Drink \(wine.drinkingWindow)").font(.forest(12)).foregroundStyle(.forestSecondary)
                                    }
                                    Spacer()
                                    Text(cellarWindowStatus(wine).title).font(.forest(12)).foregroundStyle(cellarWindowStatus(wine).color)
                                }.contentShape(Rectangle())
                            }.buttonStyle(.plain).padding(.vertical, 4)
                        }
                    }.forestCard()
                }
                VStack(alignment: .leading, spacing: 12) {
                    Text("News for you").font(.forest(20, weight: .medium)).foregroundStyle(.forestPrimary)
                    Text("Wine news selected for your collection will appear here when the briefing feed is connected.")
                        .font(.forest(14)).foregroundStyle(.forestSecondary)
                }.frame(maxWidth: .infinity, alignment: .leading).forestCard()
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button { showNotifications = true } label: { WebOSIcon(name: .bell) }.accessibilityLabel("Notifications") }
                ToolbarItem(placement: .topBarTrailing) { Button { showProfile = true } label: { ProfileAvatar() }.accessibilityLabel("Profile") }
            }
            .sheet(item: $selectedWine) { wine in WineDetail(wine: wine) }
    }

    private var offlineCount: Int { model.cellars.filter { !$0.online }.count }
    private var briefingHeadline: String {
        if model.wines.isEmpty { return "Your cellar is ready for its first bottle." }
        if offlineCount > 0 { return "Some cellar sensors are offline. Check the latest readings." }
        if readyWines.isEmpty && approachingWines.isEmpty { return "Your collection is resting well. Nothing is in its drinking window yet." }
        if readyWines.count == 1 { return "One bottle is ready to drink now." }
        if !readyWines.isEmpty { return "\(readyWines.count) bottles are ready to drink now." }
        return "Your collection is resting well. Here is what is in your cellar."
    }
    private func briefingMetric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value).font(.forest(29)).foregroundStyle(.forestPrimary)
            Text(label).overline()
        }.frame(maxWidth: .infinity, alignment: .leading).forestCard()
    }
}

private struct NotificationCenterView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationStack {
            List {
                Section("Current alerts") {
                    let offlineCellars = model.cellars.filter { !$0.online }
                    if offlineCellars.isEmpty {
                        Label("No active sensor alerts", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.forestSuccess)
                    } else {
                        ForEach(offlineCellars) { cellar in
                            Label {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("Sensor offline").foregroundStyle(.forestPrimary)
                                    Text(cellar.name).font(.forest(13)).foregroundStyle(.forestSecondary)
                                }
                            } icon: { WebOSIcon(name: .bell).foregroundStyle(.forestWarning) }
                        }
                    }
                }
                Section("Cellar status") {
                    ForEach(model.cellars) { cellar in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(cellar.name).font(.forest(15, weight: .medium)).foregroundStyle(.forestPrimary)
                                Text(String(format: "%.1f °C · %.0f%% humidity", cellar.temperature, cellar.humidity))
                                    .font(.forest(13)).foregroundStyle(.forestSecondary)
                            }
                            Spacer()
                            Circle().fill(cellar.online ? .forestSuccess : .forestWarning).frame(width: 9, height: 9)
                            Text(cellar.online ? "Online" : "Offline").font(.forest(12)).foregroundStyle(cellar.online ? .forestSuccess : .forestWarning)
                        }.padding(.vertical, 3)
                    }
                    NavigationLink("Climate & alert settings") { EnvironmentView() }
                }
            }
            .scrollContentBackground(.hidden).background(.forestBackground)
            .navigationTitle("Notifications").navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct ValueView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var showProfile: Bool
    @Binding var showNotifications: Bool
    @State private var selectedWine: Wine?
    private var totalValue: Double { model.wines.reduce(0) { $0 + $1.value } }
    private struct ValuePoint: Identifiable {
        var date: Date
        var value: Double
        var id: Date { date }
    }
    private var valueHistory: [ValuePoint] {
        let calendar = Calendar.current
        let now = calendar.startOfDay(for: .now)
        return (0...12).compactMap { monthOffset in
            guard let date = calendar.date(byAdding: .month, value: monthOffset - 12, to: now) else { return nil }
            let progress = Double(monthOffset) / 12
            let gentleMarketCurve = 0.94 + 0.06 * progress + 0.012 * sin(Double(monthOffset) * 0.9)
            return ValuePoint(date: date, value: totalValue * gentleMarketCurve)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Value").font(.forest(32)).foregroundStyle(.forestPrimary)
                        Text("\(model.wines.count) bottles · estimated collection value").font(.forest(14)).foregroundStyle(.forestSecondary)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("COLLECTION VALUE").overline()
                        Text(totalValue, format: .currency(code: "USD")).font(.forest(38)).foregroundStyle(.forestPrimary)
                        Text("Estimates from the bottle values in your inventory.").font(.forest(13)).foregroundStyle(.forestSecondary)
                    }.frame(maxWidth: .infinity, alignment: .leading).forestCard()
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { Text("VALUE OVER TIME").overline(); Spacer(); Text("12 MONTHS").font(.forest(10, weight: .medium)).tracking(1).foregroundStyle(.forestMuted) }
                        Chart(valueHistory) { point in
                            AreaMark(x: .value("Date", point.date), y: .value("Value", point.value))
                                .foregroundStyle(LinearGradient(colors: [.forestAccent.opacity(0.24), .forestAccent.opacity(0.01)], startPoint: .top, endPoint: .bottom))
                            LineMark(x: .value("Date", point.date), y: .value("Value", point.value))
                                .foregroundStyle(.forestAccent).lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                        }
                        .chartXAxis { AxisMarks(values: .stride(by: .month, count: 3)) { value in AxisValueLabel(format: .dateTime.month(.abbreviated)).foregroundStyle(Color.forestMuted) } }
                        .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { axis in
                            AxisValueLabel {
                                if let amount = axis.as(Double.self) { Text(amount, format: .currency(code: "USD").precision(.fractionLength(0))) }
                            }.foregroundStyle(Color.forestMuted)
                        } }
                        .chartPlotStyle { $0.background(.clear) }
                        .frame(height: 190)
                        Text("Illustrative estimate from current bottle values; live market history is not connected.")
                            .font(.forest(12)).foregroundStyle(.forestMuted)
                    }.forestCard()
                    VStack(alignment: .leading, spacing: 10) {
                        Text("MOST VALUABLE").overline()
                        ForEach(model.wines.sorted { $0.value > $1.value }.prefix(5)) { wine in
                            Button { selectedWine = wine } label: {
                                HStack(spacing: 12) {
                                    Circle().fill(wine.style.tint).frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("\(wine.name) \(wine.vintage)").font(.forest(15, weight: .medium)).foregroundStyle(.forestPrimary)
                                        Text("\(wine.winery) · \(wine.region)").font(.forest(12)).foregroundStyle(.forestSecondary)
                                    }
                                    Spacer()
                                    Text(wine.value, format: .currency(code: "USD")).font(.forest(14, weight: .medium)).foregroundStyle(.forestPrimary)
                                }.padding(.vertical, 8).contentShape(Rectangle())
                            }.buttonStyle(.plain).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
                        }
                        if model.wines.isEmpty { Text("Add bottles to your inventory to see their estimated value here.").font(.forest(14)).foregroundStyle(.forestSecondary) }
                    }.forestCard()
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
        }.toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { showNotifications = true } label: { WebOSIcon(name: .bell) }.accessibilityLabel("Notifications") }
            ToolbarItem(placement: .topBarTrailing) { Button { showProfile = true } label: { ProfileAvatar() }.accessibilityLabel("Profile") }
        }
            .sheet(item: $selectedWine) { wine in WineDetail(wine: wine) }
    }
}

struct ProfileView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Binding var selectedTab: String
    @AppStorage("appearance") private var appearance = "dark"
    @AppStorage("dailyBriefingTime") private var dailyBriefingTime = "08:00"
    private var email: String { model.user?.email ?? "" }
    private var name: String { email.split(separator: "@").first?.capitalized ?? "Wine lover" }
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Profile").font(.forest(32)).foregroundStyle(.forestPrimary)
                VStack(alignment: .leading, spacing: 6) {
                    Text(name).font(.forest(24, weight: .medium)).foregroundStyle(.forestPrimary)
                    Text("Logged in as \(email)").font(.forest(14)).foregroundStyle(.forestSecondary)
                    NavigationLink { AccountDetailsView() } label: { Text("Edit profile →").font(.forest(15)).foregroundStyle(.forestAccent).padding(.top, 6) }
                }.frame(maxWidth: .infinity, alignment: .leading).forestCard()
                Text("SETTINGS").overline()
                VStack(spacing: 0) {
                    profileRow("My cellars", detail: "\(model.cellars.count) cellars", icon: "cabinet", action: { selectedTab = "cellar"; dismiss() })
                    NavigationLink { EnvironmentView() } label: { profileRowLabel("Notifications & alerts", detail: "Temperature · humidity", icon: "bell") }
                    NavigationLink { TastePreferencesView() } label: { profileRowLabel("Taste preferences", detail: "Red wines · regions", icon: "slider.horizontal.3") }
                    NavigationLink { PrivacyAndDataView() } label: { profileRowLabel("Privacy & data", detail: "Export or delete your data", icon: "lock.shield") }
                }.background(.forestSurface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(.forestHairline))
                Text("DAILY BRIEFING").overline()
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Delivery time").font(.forest(16)).foregroundStyle(.forestPrimary)
                        Text("A short cellar and drinking-window update").font(.forest(12)).foregroundStyle(.forestSecondary)
                    }
                    Spacer()
                    Menu {
                        ForEach(["07:00", "08:00", "09:00", "18:00", "20:00"], id: \.self) { time in Button(time) { dailyBriefingTime = time } }
                    } label: { Text(dailyBriefingTime).font(.forest(15, weight: .medium)).foregroundStyle(.forestAccent) }
                }.forestCard()
                Text("APPEARANCE").overline()
                HStack { Text("Theme").font(.forest(16)).foregroundStyle(.forestPrimary); Spacer(); Menu { Button("Light") { appearance = "light" }; Button("Dark") { appearance = "dark" } } label: { HStack { Text(appearance.capitalized).font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) } } }.forestCard()
                HStack { Text("Palette").font(.forest(16)).foregroundStyle(.forestPrimary); Spacer(); Text("Forest").font(.forest(15)).foregroundStyle(.forestSecondary) }.forestCard()
                Button("Log out", role: .destructive) { model.signOut() }.font(.forest(16, weight: .medium)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() }.foregroundStyle(.forestAccent) } }
    }
    private func profileRow(_ title: String, detail: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { profileRowLabel(title, detail: detail, icon: icon) }
    }
    private func profileRowLabel(_ title: String, detail: String, icon: String) -> some View {
        HStack(spacing: 14) { Image(systemName: icon).foregroundStyle(.forestAccent).frame(width: 24); VStack(alignment: .leading, spacing: 4) { Text(title).font(.forest(16, weight: .medium)).foregroundStyle(.forestPrimary); Text(detail).font(.forest(13)).foregroundStyle(.forestSecondary) }; Spacer(); Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.forestMuted) }.padding(16).contentShape(Rectangle()).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
    }
}

struct AccountDetailsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var showingDelete = false
    var body: some View {
        NavigationStack { Form {
            Section("PROFILE") { TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress); SecureField("New password, optional", text: $password); Button("Save Changes") { Task { await model.updateEmail(email); if !password.isEmpty { await model.updatePassword(password); password = "" } } }.foregroundStyle(.forestAccent) }
            if let notice = model.notice { Text(notice).foregroundStyle(.forestSuccess) }
            if let error = model.error { Text(error).foregroundStyle(.forestDanger) }
        }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Edit profile").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }.onAppear { email = model.user?.email ?? "" } }
    }
}

struct TastePreferencesView: View {
    @State private var selected: Set<String> = ["Red", "Burgundy"]
    private let choices = ["Red", "White", "Rosé", "Sparkling", "Dessert", "Bordeaux", "Burgundy", "Champagne", "Rhône", "Piedmont", "Tuscany", "Rioja", "Mosel", "Napa"]
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Taste preferences").font(.forest(28)).foregroundStyle(.forestPrimary)
                Text("STYLES & REGIONS").overline()
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], spacing: 10) {
                    ForEach(choices, id: \.self) { item in Button(item) { if selected.contains(item) { selected.remove(item) } else { selected.insert(item) } }.font(.forest(14)).padding(12).frame(maxWidth: .infinity).background(selected.contains(item) ? Color.forestAccentSoft : .forestSurface, in: Capsule()).foregroundStyle(selected.contains(item) ? Color.forestAccent : Color.forestSecondary).overlay(Capsule().stroke(.forestHairline)) }
                }
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
    }
}

struct PrivacyAndDataView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingDelete = false
    var body: some View {
        NavigationStack { Form {
            Section("PRIVACY & DATA") {
                Button("Export my data") { Task { if let data = await model.export(), let text = String(data: data, encoding: .utf8) { UIPasteboard.general.string = text; model.notice = "Export copied to clipboard." } } }
                Button("Delete account") { showingDelete = true }.foregroundStyle(.forestDanger)
                Text("Deleting your account removes your local demo account and collection.").font(.forest(13)).foregroundStyle(.forestSecondary)
            }
            if let notice = model.notice { Text(notice).foregroundStyle(.forestSuccess) }
        }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Privacy & data").confirmationDialog("Permanently delete your account and data?", isPresented: $showingDelete, titleVisibility: .visible) { Button("Delete account", role: .destructive) { Task { await model.deleteAccount() } } } }
    }
}
