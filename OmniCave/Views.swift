import SwiftUI
import Charts
import UIKit

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
            VStack(spacing: 20) {
                Image(systemName: "wineglass.fill").font(.system(size: 42)).foregroundStyle(Color.wine)
                Text("OmniCave").font(.largeTitle.bold())
                Text(registering ? "Create your account" : "Your cellar, in one place").foregroundStyle(.secondary)
                VStack(spacing: 12) {
                    TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
                    SecureField("Password", text: $password).textContentType(registering ? .newPassword : .password).textFieldStyle(.roundedBorder)
                    if registering {
                        SecureField("Confirm password", text: $confirmation).textContentType(.newPassword).textFieldStyle(.roundedBorder)
                        Text("At least 8 characters with uppercase, lowercase, number and symbol.").font(.caption).foregroundStyle(.secondary)
                    } else {
                        Text("Password must have at least 8 characters, including uppercase, lowercase, a number and a symbol.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let error = model.error { Text(error).font(.footnote).foregroundStyle(.red) }
                if let notice = model.notice { Text(notice).font(.footnote).foregroundStyle(.green) }
                Button(registering ? "Create account" : "Log in") {
                    Task {
                        if registering {
                            await model.signUp(email: email, password: password)
                            if model.error == nil { registering = false; password = ""; confirmation = "" }
                        } else {
                            await model.signIn(email: email, password: password)
                        }
                    }
                }
                .buttonStyle(.borderedProminent).disabled(!canSubmit || model.busy).frame(maxWidth: .infinity)
                Button(registering ? "Already registered? Log in" : "Create account") { registering.toggle(); model.error = nil }
                    .font(.footnote)
                if !registering {
                    Button("Use demo account") { Task { await model.signIn(email: MockService.demoEmail, password: MockService.demoPassword) } }
                        .font(.footnote.bold()).disabled(model.busy)
                    Text("Demo login: \(MockService.demoEmail) · \(MockService.demoPassword)").font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                }
                if AppConfig.useMock { Text("Demo mode · data stays on this device").font(.caption).foregroundStyle(.secondary) }
            }
            .padding(28)
            .background(Color.cream.ignoresSafeArea())
        }
    }
}

struct MainView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        TabView {
            CellarView().tabItem { Label("Cellars", systemImage: "cabinet") }
            InventoryView().tabItem { Label("Wines", systemImage: "wineglass") }
            EnvironmentView().tabItem { Label("Climate", systemImage: "thermometer.medium") }
            AIView().tabItem { Label("Sommelier", systemImage: "sparkles") }
            BriefingView().tabItem { Label("Briefing", systemImage: "newspaper") }
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Label(model.user?.email ?? "", systemImage: "person.crop.circle").lineLimit(1)
                Spacer()
                Circle().fill(model.networkAvailable ? .green : .red).frame(width: 8, height: 8)
                Text("\(model.networkAvailable ? "Connected" : "Offline")\(AppConfig.useMock ? " · Demo" : "")").font(.caption).foregroundStyle(.secondary)
            }.font(.caption).padding(.horizontal).padding(.top, 6).background(.background)
        }
    }
}

struct CellarView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showProfile = false
    @State private var showAdd = false
    @State private var editingCellar: Cellar?
    var activeCellar: Cellar? { model.cellars.first { $0.id == model.selectedCellar } }
    var cellarWines: [Wine] { model.wines.filter { $0.cellarID == model.selectedCellar } }

    var body: some View {
        NavigationStack {
            List {
                Section("Your cellars") {
                    ForEach(model.cellars) { cellar in
                        Button { model.selectedCellar = cellar.id } label: {
                            HStack { Image(systemName: "cabinet"); Text(cellar.name); Spacer(); if model.selectedCellar == cellar.id { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.wine) } }
                        }.foregroundStyle(.primary).contextMenu { Button("Rename cellar", systemImage: "pencil") { editingCellar = cellar } }
                    }
                    Button { showAdd = true } label: { Label("Add cellar", systemImage: "plus") }
                }
                if let cellar = activeCellar {
                    Section("Cellar overview") {
                        HStack { metric("Temperature", String(format: "%.1f°C", cellar.temperature), "thermometer.medium"); Spacer(); metric("Humidity", String(format: "%.0f%%", cellar.humidity), "humidity.fill") }
                        Label(cellar.online ? "Connected · updated now" : "Sensor offline", systemImage: cellar.online ? "wifi" : "wifi.slash").font(.caption).foregroundStyle(cellar.online ? .green : .orange)
                    }
                    Section("Bottle map · \(cellarWines.count) bottles") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 80))], spacing: 10) {
                            ForEach(cellarWines) { wine in VStack { Image(systemName: "wineglass.fill").foregroundStyle(Color.wine); Text(wine.location).font(.caption2); Text(wine.name).font(.caption).lineLimit(1) }.frame(maxWidth: .infinity).padding(10).background(Color.cream, in: RoundedRectangle(cornerRadius: 10)) }
                        }.padding(.vertical, 4)
                    }
                    Section("Collection value") { Label("$\(cellarWines.reduce(0) { $0 + $1.value }, specifier: "%.0f") estimated", systemImage: "chart.line.uptrend.xyaxis") }
                }
            }
            .navigationTitle("My Cellar")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showProfile = true } label: { Image(systemName: "person.crop.circle") } } }
            .sheet(isPresented: $showProfile) { ProfileView() }
            .sheet(isPresented: $showAdd) { CellarForm { newCellar in Task { await model.save(newCellar) } } }
            .sheet(item: $editingCellar) { cellar in CellarForm(cellar: cellar) { changedCellar in Task { await model.save(changedCellar) } } }
            .refreshable { await model.refresh() }
        }
    }
    private func metric(_ title: String, _ value: String, _ icon: String) -> some View { VStack(alignment: .leading) { Label(title, systemImage: icon).font(.caption).foregroundStyle(.secondary); Text(value).font(.title3.bold()) } }
}

struct InventoryView: View {
    @EnvironmentObject private var model: AppModel
    @State private var query = ""
    @State private var editing: Wine?
    @State private var adding = false
    @State private var selected: Wine?
    @State private var allCellars = false
    private var results: [Wine] {
        model.wines.filter { wine in
            (query.isEmpty || [wine.name, wine.winery, wine.region, String(wine.vintage), wine.grape].contains { $0.localizedCaseInsensitiveContains(query) }) && (allCellars || model.selectedCellar == nil || wine.cellarID == model.selectedCellar)
        }
    }
    var body: some View {
        NavigationStack {
            List {
                ForEach(results) { wine in
                    Button { selected = wine } label: {
                        HStack { Image(systemName: "wineglass.fill").foregroundStyle(Color.wine); VStack(alignment: .leading) { Text(wine.name).font(.headline); Text("\(wine.winery) · \(wine.vintage) · \(wine.region)").font(.caption).foregroundStyle(.secondary); Text("\(wine.grape) · \(wine.location)").font(.caption2).foregroundStyle(.secondary) }; Spacer(); Text("$\(wine.value, specifier: "%.0f")").font(.caption) }
                }.foregroundStyle(.primary)
                }
            }
            .searchable(text: $query, prompt: "Wine, winery, region, vintage, grape")
            .navigationTitle("Inventory")
            .toolbar { ToolbarItem(placement: .topBarLeading) { Toggle("All cellars", isOn: $allCellars).labelsHidden() }; ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") } } }
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
                Section(wine.name) { detail("Winery", wine.winery); detail("Region", wine.region); detail("Vintage", String(wine.vintage)); detail("Grape", wine.grape); detail("Location", wine.location); detail("Drinking window", wine.drinkingWindow); detail("Estimated value", String(format: "$%.0f", wine.value)) }
                Section { Button("Edit bottle") { editing = true }; Button("Remove bottle", role: .destructive) { confirmingRemoval = true } }
            }.navigationTitle("Bottle").navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented: $editing) { WineForm(wine: wine) { updatedWine in Task { await model.save(updatedWine); wine = updatedWine } } }
                .confirmationDialog("Remove this bottle from your inventory?", isPresented: $confirmingRemoval, titleVisibility: .visible) { Button("Remove bottle", role: .destructive) { Task { await model.remove(wine); dismiss() } } }
        }
    }
    private func detail(_ title: String, _ value: String) -> some View { LabeledContent(title, value: value) }
}

struct WineForm: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @State var wine: Wine
    let isNew: Bool
    let onSave: (Wine) -> Void
    init(wine: Wine?, onSave: @escaping (Wine) -> Void) {
        self.isNew = wine == nil; self.onSave = onSave
        _wine = State(initialValue: wine ?? Wine(name: "", winery: "", region: "", vintage: Calendar.current.component(.year, from: .now), grape: "", location: "", cellarID: UUID()))
    }
    var body: some View {
        NavigationStack { Form {
            TextField("Wine name", text: $wine.name); TextField("Winery", text: $wine.winery); TextField("Region", text: $wine.region); TextField("Vintage", value: $wine.vintage, format: .number).keyboardType(.numberPad); TextField("Grape variety", text: $wine.grape); TextField("Location", text: $wine.location); TextField("Value", value: $wine.value, format: .number).keyboardType(.decimalPad)
            Picker("Cellar", selection: $wine.cellarID) { ForEach(model.cellars) { Text($0.name).tag($0.id) } }
        }.navigationTitle(isNew ? "Add wine" : "Edit wine").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { if isNew, let id = model.selectedCellar { wine.cellarID = id }; onSave(wine); dismiss() }.disabled(wine.name.isEmpty) } } }
    }
}

struct CellarForm: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    let onSave: (Cellar) -> Void
    private let cellar: Cellar?
    init(cellar: Cellar? = nil, onSave: @escaping (Cellar) -> Void) { self.cellar = cellar; self.onSave = onSave; _name = State(initialValue: cellar?.name ?? "") }
    var body: some View { NavigationStack { Form { TextField("Cellar name", text: $name) }.navigationTitle(cellar == nil ? "Add cellar" : "Rename cellar").toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Save") { var value = cellar ?? Cellar(name: name); value.name = name; onSave(value); dismiss() }.disabled(name.isEmpty) } } } }
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
                Section("Current conditions") { LabeledContent("Temperature", value: String(format: "%.1f °C", cellar.temperature)); LabeledContent("Humidity", value: String(format: "%.0f %%", cellar.humidity)); Label("Sensor status: \(cellar.online ? "Connected" : "Offline")", systemImage: cellar.online ? "checkmark.circle.fill" : "exclamationmark.triangle.fill").foregroundStyle(cellar.online ? .green : .orange) }
                Section("12 hour history · demo data") {
                    Chart(history) { reading in LineMark(x: .value("Time", reading.date), y: .value("Temperature", reading.temperature)).foregroundStyle(Color.wine) }
                        .frame(height: 130)
                    Chart(history) { reading in LineMark(x: .value("Time", reading.date), y: .value("Humidity", reading.humidity)).foregroundStyle(.blue) }
                        .frame(height: 130)
                }
                Section("Alert thresholds") { LabeledContent("Temperature (°C)") { HStack { TextField("Min", value: $minTemp, format: .number).keyboardType(.decimalPad); Text("–"); TextField("Max", value: $maxTemp, format: .number).keyboardType(.decimalPad) } }; LabeledContent("Humidity (%)") { HStack { TextField("Min", value: $minHumidity, format: .number).keyboardType(.decimalPad); Text("–"); TextField("Max", value: $maxHumidity, format: .number).keyboardType(.decimalPad) } }; Text("Alerts are simulated in demo mode; sensor notifications require backend and push setup.").font(.caption).foregroundStyle(.secondary) }
                Section("Zone controls") { HStack { Text("Set temperature"); Spacer(); Button("−") { Task { var value = cellar; value.temperature -= 0.5; await model.save(value) } }; Text("\(cellar.temperature, specifier: "%.1f")°"); Button("+") { Task { var value = cellar; value.temperature += 0.5; await model.save(value) } } } }
                Section("Humidity control") {
                    HStack { Button("−") { Task { var value = cellar; value.humidity -= 1; await model.save(value) } }; Text("Humidity \(cellar.humidity, specifier: "%.0f")%"); Button("+") { Task { var value = cellar; value.humidity += 1; await model.save(value) } } }
                }
            } else { ContentUnavailableView("Choose a cellar", systemImage: "cabinet") }
        }.navigationTitle("Climate") }
    }
}

struct AIView: View {
    @EnvironmentObject private var model: AppModel
    @State private var prompt = ""
    @State private var answer = ""
    @State private var selectedWine: Wine?
    @State private var criticWine: Wine?
    @State private var criticAnswer = ""
    @State private var messages: [ChatMessage] = []
    var body: some View {
        NavigationStack { List {
            Section("Ask your cellar sommelier") {
                TextField("Meal, occasion, budget or wine question", text: $prompt, axis: .vertical).lineLimit(2...4)
                Button { Task { let question = prompt; guard !question.isEmpty else { return }; messages.append(ChatMessage(author: "You", text: question)); answer = await model.ask(question); messages.append(ChatMessage(author: "OmniCave", text: answer)); prompt = "" } } label: { Label("Get recommendation", systemImage: "sparkles") }.disabled(prompt.isEmpty || model.busy)
                ForEach(messages) { message in VStack(alignment: .leading) { Text(message.author).font(.caption.bold()); Text(message.text) }.padding(.vertical, 3) }
            }
            Section("Pair food with a wine") { Picker("Select wine", selection: $selectedWine) { Text("Choose a wine").tag(nil as Wine?); ForEach(model.wines) { Text($0.name).tag($0 as Wine?) } }; if let selectedWine { Text("Try this with roasted vegetables, aged cheese, or a dish that complements the wine’s \(selectedWine.grape) character.").font(.subheadline) } }
            Section("Ready to drink") { ForEach(model.wines) { wine in Label("\(wine.name) · \(wine.drinkingWindow)", systemImage: "clock") } }
            Section("Curated list") { TextField("Budget, taste or event", text: $prompt); Button("Create wine list") { Task { answer = await model.ask("Curate a wine list: \(prompt)") } }; if !answer.isEmpty { Text(answer) } }
            Section("Critic dialogue") {
                Picker("Wine", selection: $criticWine) { Text("Choose a wine").tag(nil as Wine?); ForEach(model.wines) { Text($0.name).tag($0 as Wine?) } }
                Button("Generate critic dialogue") { Task { if let criticWine { criticAnswer = await model.ask("Generate a multi-critic evaluation for \(criticWine.name), \(criticWine.winery), vintage \(criticWine.vintage), \(criticWine.region). Include tasting notes and aging outlook.") } } }.disabled(criticWine == nil || model.busy)
                if !criticAnswer.isEmpty { Text(criticAnswer) }
            }
        }.navigationTitle("Sommelier") }
    }
}

struct BriefingView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View { NavigationStack { List {
        Section("Daily Wine Briefing") { Text(Date.now.formatted(date: .complete, time: .omitted)).font(.caption).foregroundStyle(.secondary); Text("Your collection at a glance").font(.headline); Text("\(model.wines.count) bottles across \(model.cellars.count) cellars · estimated value $\(model.wines.reduce(0) { $0 + $1.value }, specifier: "%.0f")") }
        Section("Collection insights") { ForEach(model.wines.prefix(3)) { wine in Label("\(wine.name) (\(wine.vintage)) · drink \(wine.drinkingWindow)", systemImage: "wineglass") } }
        Section("Wine news") { Text("Vintage and market headlines will appear here when the backend news feed is connected."); Text("News feed is unavailable in local demo mode.").font(.caption).foregroundStyle(.secondary) }
    }.navigationTitle("Briefing") } }
}

struct ProfileView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var showingDelete = false
    var body: some View {
        NavigationStack { Form {
            Section("Account") { TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress); Button("Save email") { Task { await model.updateEmail(email) } }; SecureField("New password", text: $password); Button("Update password") { Task { await model.updatePassword(password); password = "" } } }
            Section("Your data") { Button("Export account data") { Task { if let data = await model.export(), let text = String(data: data, encoding: .utf8) { UIPasteboard.general.string = text; model.notice = "Export copied to clipboard." } } }; Button("Log out", role: .destructive) { model.signOut(); dismiss() }; Button("Delete account and data", role: .destructive) { showingDelete = true } }
            if let notice = model.notice { Text(notice).foregroundStyle(.green) }
            if let error = model.error { Text(error).foregroundStyle(.red) }
        }.navigationTitle("Profile").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }.onAppear { email = model.user?.email ?? "" }.confirmationDialog("Permanently delete your account and local demo data?", isPresented: $showingDelete, titleVisibility: .visible) { Button("Delete account", role: .destructive) { Task { await model.deleteAccount(); dismiss() } } } } }
}
