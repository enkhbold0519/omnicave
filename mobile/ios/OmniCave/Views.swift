import SwiftUI
import Charts
import UIKit

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
    @State private var selectedTab = "home"
    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab).tabItem { Label("Home", systemImage: "house") }.tag("home")
            InventoryView(selectedTab: $selectedTab).tabItem { Label("Inventory", systemImage: "wineglass") }.tag("inventory")
            CellarView().tabItem { Label("Cellar", systemImage: "square.grid.2x2") }.tag("cellar")
            AIView().tabItem { Label("Sommelier", systemImage: "sparkle") }.tag("sommelier")
            ProfileView(selectedTab: $selectedTab).tabItem { Label("Profile", systemImage: "person.cropcircle") }.tag("profile")
        }.tint(.forestAccent)
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
                    NavigationLink { BriefingView() } label: {
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

private struct CellarZone: Identifiable {
    var style: WineStyle
    var title: String
    var capacity: Int
    var target: String
    var id: WineStyle { style }
}

struct CellarView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showAdd = false
    @State private var editingCellar: Cellar?
    @State private var query = ""
    @State private var selectedWine: Wine?
    private let zones = [CellarZone(style: .sparkling, title: "SPARKLING ZONE", capacity: 15, target: "5–8 °C"), CellarZone(style: .white, title: "WHITE ZONE", capacity: 20, target: "5–11 °C"), CellarZone(style: .red, title: "RED ZONE", capacity: 20, target: "12–18 °C"), CellarZone(style: .dessert, title: "DESSERT ZONE", capacity: 10, target: "8–12 °C")]
    private var cellar: Cellar? { model.cellars.first { $0.id == model.selectedCellar } }
    private var wines: [Wine] { model.wines.filter { $0.cellarID == model.selectedCellar && (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Cellar").font(.forest(32)).foregroundStyle(.forestPrimary)
                    if let cellar {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("CELLAR").overline()
                            Menu {
                                ForEach(model.cellars) { item in Button(item.name) { model.selectedCellar = item.id } }
                                Button("Add a cellar") { showAdd = true }
                                Button("Edit cellar") { editingCellar = cellar }
                            } label: { HStack { Text(cellar.name).font(.forest(20, weight: .medium)); Spacer(); Text("Change").font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) } }.foregroundStyle(.forestPrimary)
                        }.padding(.vertical, 12).overlay(alignment: .top) { Rectangle().fill(.forestHairline).frame(height: 1) }.overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
                        Text("\(wines.count) of \(cellar.capacity) filled").font(.forest(16)).foregroundStyle(.forestSecondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 14) { ForEach(WineStyle.allCases) { style in Label(style.rawValue, systemImage: "circle.fill").font(.forest(12)).foregroundStyle(style.tint) }; Label("Uncertain", systemImage: "circle.dashed").font(.forest(12)).foregroundStyle(.forestWarning) }
                        }
                        HStack(spacing: 10) { Image(systemName: "magnifyingglass").foregroundStyle(.forestMuted); TextField("Find a wine in this cellar", text: $query).font(.forest(15)) }.padding(14).background(.forestSurface, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(.forestHairline))
                        VStack(spacing: 18) { ForEach(zones) { zone in zoneView(zone, cellar: cellar) } }
                            .padding(18).background(.forestCabinet, in: RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(.forestCabinetRail, lineWidth: 8))
                    }
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .toolbar { ToolbarItem(placement: .topBarTrailing) { Menu { Button("Add a cellar") { showAdd = true }; if let cellar { Button("Edit cellar") { editingCellar = cellar } } } label: { Image(systemName: "ellipsis") } } }
                .sheet(isPresented: $showAdd) { CellarForm { newCellar in Task { await model.save(newCellar) } } }
                .sheet(item: $editingCellar) { item in CellarForm(cellar: item) { updated in Task { await model.save(updated) } } }
                .sheet(item: $selectedWine) { wine in WineDetail(wine: wine) }
                .refreshable { await model.refresh() }
        }
    }

    private func zoneView(_ zone: CellarZone, cellar: Cellar) -> some View {
        let bottles = wines.filter { $0.style == zone.style }
        let filled = min(bottles.count, zone.capacity)
        return VStack(alignment: .leading, spacing: 13) {
            HStack { Text(zone.title).font(.forest(12, weight: .semibold)).tracking(1.4).foregroundStyle(.forestCabinetText); Spacer(); Text("\(filled) / \(zone.capacity)").font(.forest(12)).foregroundStyle(.forestCabinetMuted) }
            Text("Target \(zone.target)   ·   Now \(cellar.temperature, specifier: "%.1f") °C").font(.forest(13)).foregroundStyle(.forestCabinetMuted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 14) {
                ForEach(0..<zone.capacity, id: \.self) { index in
                    if index < filled {
                        Button { selectedWine = bottles[index] } label: {
                            Circle().fill(LinearGradient(colors: [zone.style.tint.opacity(0.82), zone.style.tint], startPoint: .topLeading, endPoint: .bottomTrailing))
                                .overlay(Circle().fill(.black.opacity(0.18)).padding(8).frame(width: 20, height: 20))
                                .frame(width: 36, height: 36).overlay(Circle().stroke(.forestCabinetGlow.opacity(0.25), lineWidth: 1))
                        }.buttonStyle(.plain).accessibilityLabel(bottles[index].name)
                    } else { Circle().fill(.forestCabinetInset).frame(width: 36, height: 36).overlay(Circle().stroke(.forestCabinetRail, lineWidth: 1)) }
                }
            }
            Rectangle().fill(.forestCabinetRail).frame(height: 4).clipShape(Capsule())
        }.padding(14).background(.forestCabinetInset.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct InventoryView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @State private var query = ""
    @State private var adding = false
    @State private var selected: Wine?
    @State private var allCellars = false
    @State private var filter = "All"
    private let filters = ["All", "Red", "White", "Rosé", "Ready to drink"]
    private var results: [Wine] {
        model.wines.filter { wine in
            let textMatch = query.isEmpty || [wine.name, wine.winery, wine.region, String(wine.vintage), wine.grape].contains { $0.localizedCaseInsensitiveContains(query) }
            let cellarMatch = allCellars || model.selectedCellar == nil || wine.cellarID == model.selectedCellar
            let filterMatch = filter == "All" || filter == "Ready to drink" || filter == wine.style.rawValue
            return textMatch && cellarMatch && filterMatch
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text("Inventory").font(.forest(32)).foregroundStyle(.forestPrimary)
                        Spacer()
                        Button { adding = true } label: { Image(systemName: "plus").font(.system(size: 20)).foregroundStyle(.forestPrimary).frame(width: 44, height: 44) }.accessibilityLabel("Add bottle")
                        Button { selectedTab = "cellar" } label: { Image(systemName: "square.grid.2x2").font(.system(size: 20)).foregroundStyle(.forestPrimary).frame(width: 44, height: 44) }.accessibilityLabel("Open cellar map")
                    }
                    Picker("Cellars", selection: $allCellars) {
                        Text(model.cellars.first(where: { $0.id == model.selectedCellar })?.name ?? "My cellar").tag(false)
                        Text("All cellars").tag(true)
                    }.pickerStyle(.segmented)
                    HStack(spacing: 10) { Image(systemName: "magnifyingglass").foregroundStyle(.forestMuted); TextField("Wine, winery, region, vintage, grape", text: $query).font(.forest(14)) }
                        .padding(14).background(.forestSurface, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(.forestHairline))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) { ForEach(filters, id: \.self) { item in
                            Button(item) { filter = item }.font(.forest(14, weight: filter == item ? .medium : .regular))
                                .padding(.horizontal, 16).frame(height: 40)
                                .background(filter == item ? Color.forestAccent : .clear, in: Capsule())
                                .foregroundStyle(filter == item ? Color.forestBackground : Color.forestSecondary)
                                .overlay(Capsule().stroke(filter == item ? .clear : .forestHairline))
                        } }
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
                                    VStack(alignment: .trailing, spacing: 5) { Text("1").font(.forest(22)).foregroundStyle(.forestPrimary); Label("Ready", systemImage: "circle.fill").font(.forest(12)).foregroundStyle(.forestSuccess) }
                                }.padding(.vertical, 14).contentShape(Rectangle())
                            }.buttonStyle(.plain)
                            Rectangle().fill(.forestHairline).frame(height: 1)
                        }
                    }
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .sheet(isPresented: $adding) { WineForm(wine: nil) { newWine in Task { await model.save(newWine) } } }
                .sheet(item: $selected) { wine in WineDetail(wine: wine) }
                .refreshable { await model.refresh() }
        }
    }
}

struct WineDetail: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var wine: Wine
    @State private var editing = false
    @State private var confirmingRemoval = false
    var body: some View {
        NavigationStack {
            List {
                Section { VStack(alignment: .leading, spacing: 8) { Text("\(wine.vintage) · \(wine.style.rawValue.uppercased())").overline(); Text(wine.name).font(.forest(29)).foregroundStyle(.forestPrimary); Text("\(wine.winery) · \(wine.region)").font(.forest(16)).foregroundStyle(.forestSecondary); Text("Ready · \(wine.drinkingWindow)").font(.forest(14)).foregroundStyle(.forestSuccess).padding(.top, 4) }.padding(.vertical, 8) }
                Section("In your cellars") { LabeledContent("Location", value: wine.location); LabeledContent("Cellar", value: model.cellars.first(where: { $0.id == wine.cellarID })?.name ?? "Cellar"); Button("Ask the sommeliers") { Task { _ = await model.ask("Discuss \(wine.name) \(wine.vintage)") } } }
                Section("About this wine") { LabeledContent("Producer", value: wine.winery); LabeledContent("Region", value: wine.region); LabeledContent("Grape", value: wine.grape); LabeledContent("Vintage", value: String(wine.vintage)); LabeledContent("Estimated value", value: String(format: "$%.0f", wine.value)) }
                Section { Button("Edit bottle") { editing = true }; Button("Remove bottle", role: .destructive) { confirmingRemoval = true } }
            }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Bottle").navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented: $editing) { WineForm(wine: wine) { updated in Task { await model.save(updated); wine = updated } } }
                .confirmationDialog("Remove this bottle from your inventory?", isPresented: $confirmingRemoval, titleVisibility: .visible) { Button("Remove bottle", role: .destructive) { Task { await model.remove(wine); dismiss() } } }
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
            Section("VALUE") { TextField("Estimated value", value: $wine.value, format: .number).keyboardType(.decimalPad) }
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

struct AIView: View {
    @EnvironmentObject private var model: AppModel
    @State private var prompt = ""
    @State private var answer = ""
    @State private var selectedWine: Wine?
    @State private var criticAnswer = ""
    @State private var messages: [ChatMessage] = []
    private let personas: [(String, String, Color)] = [("VH", "Victor Hale", .forestRed), ("LM", "Lucia Moretti", .forestAccent), ("SO", "Sam Okafor", Color(red: 0.25, green: 0.32, blue: 0.52))]
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Sommelier").font(.forest(32)).foregroundStyle(.forestPrimary)
                HStack {
                    HStack(spacing: -10) { ForEach(personas, id: \.0) { item in Text(item.0).font(.forest(14, weight: .semibold)).foregroundStyle(.white).frame(width: 52, height: 52).background(item.2, in: Circle()).overlay(Circle().stroke(.forestBackground, lineWidth: 3)) } }
                    Spacer(); Text("Manage ›").font(.forest(15)).foregroundStyle(.forestAccent)
                }.padding(.vertical, 8)
                Text("YOUR SOMMELIERS · 3").overline()
                Text("START A TASTING").overline()
                VStack(spacing: 0) {
                    sommelierAction("Discuss a wine", icon: "wineglass", promptText: "Discuss a wine from my cellar")
                    sommelierAction("What to open tonight", icon: "moon", promptText: "What should I open tonight?")
                    sommelierAction("Pair with my dinner", icon: "fork.knife", promptText: "Recommend a wine pairing for my dinner")
                    sommelierAction("Ask anything", icon: "bubble.left", promptText: "")
                }
                if !answer.isEmpty { Text(answer).font(.forest(15)).foregroundStyle(.forestPrimary).frame(maxWidth: .infinity, alignment: .leading).forestCard() }
                if !messages.isEmpty { VStack(alignment: .leading, spacing: 8) { ForEach(messages) { Text("\($0.author)  \($0.text)").font(.forest(14)).foregroundStyle(.forestSecondary) } }.frame(maxWidth: .infinity, alignment: .leading) }
                VStack(alignment: .leading, spacing: 12) {
                    Text("DISCUSS A WINE").overline()
                    Picker("Select wine", selection: $selectedWine) { Text("Choose a wine").tag(nil as Wine?); ForEach(model.wines) { Text($0.name).tag($0 as Wine?) } }.tint(.forestAccent)
                    Button("Generate critic dialogue") { Task { if let selectedWine { criticAnswer = await model.ask("Generate a multi-critic discussion of \(selectedWine.name), \(selectedWine.winery), vintage \(selectedWine.vintage), from \(selectedWine.region). Give tasting notes and aging outlook.") } } }.buttonStyle(ForestPrimaryButton()).disabled(selectedWine == nil || model.busy)
                    if !criticAnswer.isEmpty { Text(criticAnswer).font(.forest(14)).foregroundStyle(.forestSecondary) }
                }.forestCard()
                VStack(alignment: .leading, spacing: 10) { Text("RECENT CONVERSATIONS").overline(); Text("Your recent tastings will appear here.").font(.forest(14)).foregroundStyle(.forestMuted) }
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
    }

    private func sommelierAction(_ title: String, icon: String, promptText: String) -> some View {
        Button {
            if promptText.isEmpty { prompt = ""; return }
            Task { let text = await model.ask(promptText); answer = text; messages.append(ChatMessage(author: "OmniCave", text: text)) }
        } label: {
            HStack(spacing: 16) { Image(systemName: icon).font(.system(size: 18)).foregroundStyle(.forestAccent).frame(width: 44, height: 44).background(.forestMutedSurface, in: Circle()); Text(title).font(.forest(17, weight: .medium)).foregroundStyle(.forestPrimary); Spacer(); Image(systemName: "chevron.right").font(.system(size: 13)).foregroundStyle(.forestMuted) }
                .padding(.vertical, 12).contentShape(Rectangle()).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
        }.buttonStyle(.plain)
    }
}

struct BriefingView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Daily Wine Briefing").font(.forest(30)).foregroundStyle(.forestPrimary)
                Text(Date.now.formatted(date: .complete, time: .omitted).uppercased()).overline()
                VStack(alignment: .leading, spacing: 8) { Text("YOUR COLLECTION").overline(); Text("\(model.wines.count) bottles across \(model.cellars.count) cellars").font(.forest(19, weight: .medium)).foregroundStyle(.forestPrimary); Text("Estimated collection value $\(model.wines.reduce(0) { $0 + $1.value }, specifier: "%.0f")").font(.forest(14)).foregroundStyle(.forestSecondary) }.forestCard()
                Text("COLLECTION INSIGHTS").overline()
                ForEach(model.wines.prefix(3)) { wine in HStack(alignment: .top, spacing: 12) { Circle().fill(wine.style.tint).frame(width: 10, height: 10).padding(.top, 5); VStack(alignment: .leading, spacing: 4) { Text(wine.name).font(.forest(17, weight: .medium)).foregroundStyle(.forestPrimary); Text("\(wine.vintage) · Drink \(wine.drinkingWindow)").font(.forest(14)).foregroundStyle(.forestSecondary) } }.frame(maxWidth: .infinity, alignment: .leading).forestCard() }
                VStack(alignment: .leading, spacing: 8) { Text("WINE NEWS").overline(); Text("Vintage reports and market headlines will appear here when the backend feed is connected.").font(.forest(14)).foregroundStyle(.forestSecondary) }.forestCard()
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
    }
}

struct ProfileView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @AppStorage("appearance") private var appearance = "system"
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
                    profileRow("My cellars", detail: "\(model.cellars.count) cellars", icon: "cabinet", action: { selectedTab = "cellar" })
                    NavigationLink { EnvironmentView() } label: { profileRowLabel("Notifications & alerts", detail: "Temperature · humidity", icon: "bell") }
                    NavigationLink { TastePreferencesView() } label: { profileRowLabel("Taste preferences", detail: "Red wines · regions", icon: "slider.horizontal.3") }
                    NavigationLink { PrivacyAndDataView() } label: { profileRowLabel("Privacy & data", detail: "Export or delete your data", icon: "lock.shield") }
                }.background(.forestSurface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(.forestHairline))
                Text("APPEARANCE").overline()
                HStack { Text("Theme").font(.forest(16)).foregroundStyle(.forestPrimary); Spacer(); Menu { Button("System") { appearance = "system" }; Button("Light") { appearance = "light" }; Button("Dark") { appearance = "dark" } } label: { HStack { Text(appearance.capitalized).font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) } } }.forestCard()
                HStack { Text("Palette").font(.forest(16)).foregroundStyle(.forestPrimary); Spacer(); Text("Forest").font(.forest(15)).foregroundStyle(.forestSecondary) }.forestCard()
                Button("Log out", role: .destructive) { model.signOut() }.font(.forest(16, weight: .medium)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() } }
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
