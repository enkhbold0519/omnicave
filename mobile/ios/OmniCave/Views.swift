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

private enum AuthPage { case login, signUp, verify, forgotPassword }

struct AuthView: View {
    @EnvironmentObject private var model: AppModel
    @State private var page: AuthPage = .login
    @State private var identifier = ""
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var birthDate: Date?
    @State private var code = ""
    @State private var consents: [String: Bool] = [:]
    @State private var selectingDate = false
    @State private var pickerDate = Calendar.current.date(byAdding: .year, value: -30, to: .now) ?? .now
    @State private var policyKey: String?
    @State private var resetCodeSent = false

    private var emailValid: Bool { email.range(of: #"^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$"#, options: .regularExpression) != nil }
    private var usernameValid: Bool { username.range(of: #"^[A-Za-z0-9_.-]{3,32}$"#, options: .regularExpression) != nil }
    private var passwordRules: [(String, Bool)] {
        [("At least 8 characters", password.count >= 8),
         ("A lowercase letter", password.range(of: "[a-z]", options: .regularExpression) != nil),
         ("An uppercase letter", password.range(of: "[A-Z]", options: .regularExpression) != nil),
         ("A number", password.range(of: "[0-9]", options: .regularExpression) != nil),
         ("A special character", password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil)]
    }
    private var eligibleByAge: Bool {
        guard let birthDate else { return false }
        return Calendar.current.component(.year, from: .now) - Calendar.current.component(.year, from: birthDate) >= 19
    }
    private var requiredConsentsAccepted: Bool {
        (model.legalInfo?.consents ?? []).allSatisfy { $0.required != true || consents[$0.key ?? ""] == true }
    }
    private var canSignUp: Bool {
        usernameValid && emailValid && passwordRules.allSatisfy(\.1) && password == confirmation &&
            eligibleByAge && model.legalInfo != nil && requiredConsentsAccepted
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    Image(systemName: "wineglass.fill").font(.system(size: 34)).foregroundStyle(.forestAccent)
                        .frame(width: 104, height: 104).background(.forestMutedSurface, in: RoundedRectangle(cornerRadius: 28))
                    Text("O M N I C A V E").font(.forest(13, weight: .semibold)).tracking(3).foregroundStyle(.forestSecondary)
                    Text(title).font(.forest(36)).foregroundStyle(.forestPrimary)

                    switch page {
                    case .login: loginForm
                    case .signUp: signUpForm
                    case .verify: verificationForm
                    case .forgotPassword: forgotPasswordForm
                    }

                    if let error = model.error { Text(error).font(.forest(14)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading) }
                    if let notice = model.notice { Text(notice).font(.forest(14)).foregroundStyle(.forestSuccess).frame(maxWidth: .infinity, alignment: .leading) }
                }.padding(.horizontal, 24).padding(.top, 40).padding(.bottom, 32)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .task {
                    if model.legalInfo == nil { await model.loadLegalInfo() }
                    if consents.isEmpty {
                        consents = Dictionary(uniqueKeysWithValues: (model.legalInfo?.consents ?? []).compactMap { item in item.key.map { ($0, false) } })
                    }
                }
                .sheet(isPresented: $selectingDate) {
                    NavigationStack {
                        DatePicker("Date of birth", selection: $pickerDate, in: ...Date.now, displayedComponents: .date)
                            .datePickerStyle(.graphical).padding()
                            .navigationTitle("Date of birth")
                            .toolbar {
                                ToolbarItem(placement: .confirmationAction) { Button("Done") { birthDate = pickerDate; selectingDate = false } }
                                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { selectingDate = false } }
                            }
                    }.presentationDetents([.medium, .large])
                }
                .sheet(isPresented: Binding(get: { policyKey != nil }, set: { if !$0 { policyKey = nil } })) {
                    let key = policyKey ?? "terms"
                    PolicyViewer(title: key == "terms" ? "Terms of Service" : "Privacy Policy", markdown: model.legalInfo?.documents?[key] ?? "")
                }
        }
    }

    private var title: String {
        switch page {
        case .login: "Welcome back"
        case .signUp: "Create account"
        case .verify: "Check your email"
        case .forgotPassword: resetCodeSent ? "Reset password" : "Forgot password"
        }
    }

    private var loginForm: some View {
        VStack(spacing: 12) {
            TextField("Username or email", text: $identifier).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().forestField()
            SecureField("Password", text: $password).textContentType(.password).forestField()
            Button("Forgot password?") { email = identifier; resetCodeSent = false; model.error = nil; model.notice = nil; page = .forgotPassword }
                .font(.forest(14)).foregroundStyle(.forestAccent).frame(maxWidth: .infinity, alignment: .trailing)
            Button("Log in") {
                Task {
                    if !(await model.signIn(identifier: identifier, password: password)), let email = model.verificationEmail {
                        self.email = email; code = ""; page = .verify
                    }
                }
            }.buttonStyle(ForestPrimaryButton()).disabled(identifier.isEmpty || password.isEmpty || model.busy)
            Button("Create an account") { model.error = nil; model.notice = nil; page = .signUp }
                .font(.forest(16, weight: .medium)).foregroundStyle(.forestAccent)
            if AppConfig.useMock {
                Button {
                    identifier = MockService.demoEmail
                    Task { _ = await model.signIn(identifier: MockService.demoEmail, password: MockService.demoPassword) }
                } label: {
                    VStack(spacing: 6) {
                        Text("Use demo account").font(.forest(15, weight: .semibold))
                        Text("\(MockService.demoEmail) · \(MockService.demoPassword)").font(.forest(12))
                    }.frame(maxWidth: .infinity).padding(14).background(.forestSurface, in: RoundedRectangle(cornerRadius: 12))
                }.foregroundStyle(.forestAccent).disabled(model.busy)
                Text("DEMO BUILD · DATA STAYS ON THIS DEVICE").overline()
            }
        }
    }

    private var signUpForm: some View {
        VStack(spacing: 12) {
            TextField("Username", text: $username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().forestField()
            if !username.isEmpty && !usernameValid { HintLine("3–32 letters, numbers, . _ or -", valid: false) }
            TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().forestField()
            if !email.isEmpty && !emailValid { HintLine("Enter an email like name@example.com", valid: false) }
            SecureField("Password", text: $password).textContentType(.newPassword).forestField()
            VStack(alignment: .leading, spacing: 4) { ForEach(passwordRules, id: \.0) { HintLine($0.0, valid: $0.1) } }
                .frame(maxWidth: .infinity, alignment: .leading)
            SecureField("Confirm password", text: $confirmation).textContentType(.newPassword).forestField()
            if !confirmation.isEmpty { HintLine(password == confirmation ? "Passwords match" : "Passwords don't match", valid: password == confirmation) }
            Button { pickerDate = birthDate ?? pickerDate; selectingDate = true } label: {
                HStack { Text(birthDate.map(Self.dateLabel) ?? "Date of birth · Choose a date"); Spacer(); Image(systemName: "calendar") }
                    .forestField()
            }.foregroundStyle(birthDate == nil ? Color.forestMuted : Color.forestPrimary)
            if birthDate != nil && !eligibleByAge { HintLine("You must be 19 or older to use OmniCave", valid: false) }
            consentList
            if let legalError = model.legalError { Text("Couldn't load the terms: \(legalError)").font(.forest(13)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading) }
            Button("Sign up") {
                guard let birthDate else { return }
                Task {
                    let date = Self.birthDateString(birthDate)
                    if let result = await model.signUp(username: username.trimmingCharacters(in: .whitespacesAndNewlines), email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password, birthDate: date, consents: consents) {
                        switch result {
                        case .created:
                            identifier = username; password = ""; confirmation = ""; page = .login
                        case .verificationRequired(let address):
                            email = address; code = ""; page = .verify
                        }
                    }
                }
            }.buttonStyle(ForestPrimaryButton()).disabled(!canSignUp || model.busy).opacity(canSignUp && !model.busy ? 1 : 0.55)
            Button("I already have an account") { model.error = nil; model.notice = nil; page = .login }
                .font(.forest(16, weight: .medium)).foregroundStyle(.forestAccent)
        }
    }

    private var consentList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                let items = model.legalInfo?.consents ?? []
                let allChecked = !items.isEmpty && items.allSatisfy { consents[$0.key ?? ""] == true }
                consents = Dictionary(uniqueKeysWithValues: items.compactMap { item in item.key.map { ($0, !allChecked) } })
            } label: {
                let items = model.legalInfo?.consents ?? []
                consentCheckbox(!items.isEmpty && items.allSatisfy { consents[$0.key ?? ""] == true }, title: "Agree to all", subtitle: nil)
            }
            Divider().overlay(.forestHairline)
            ForEach(Array((model.legalInfo?.consents ?? []).enumerated()), id: \.offset) { _, item in
                let key = item.key ?? ""
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .top, spacing: 8) {
                        Button { consents[key] = !(consents[key] ?? false) } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: consents[key] == true ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 21)).foregroundStyle(consents[key] == true ? Color.forestAccent : Color.forestMuted)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.required == true ? "REQUIRED" : "OPTIONAL").font(.forest(10, weight: .semibold)).tracking(1.2).foregroundStyle(item.required == true ? Color.forestAccent : Color.forestMuted)
                                    Text(item.title ?? key).font(.forest(14, weight: .medium)).foregroundStyle(.forestPrimary)
                                    if key == "privacy" || key == "overseas" { Text(item.summary ?? "").font(.forest(12)).foregroundStyle(.forestMuted).fixedSize(horizontal: false, vertical: true) }
                                }.frame(maxWidth: .infinity, alignment: .leading)
                            }.contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        if item.document != nil { Button("View ›") { policyKey = item.document }.font(.forest(12)).foregroundStyle(.forestMuted) }
                    }
                }.padding(.vertical, 10)
            }
        }.padding(14).background(.forestSurface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(.forestHairline))
    }

    private func consentCheckbox(_ checked: Bool, title: String, subtitle: String?) -> some View {
        HStack(spacing: 10) {
            Image(systemName: checked ? "checkmark.square.fill" : "square").font(.system(size: 21)).foregroundStyle(checked ? Color.forestAccent : Color.forestMuted)
            VStack(alignment: .leading) { Text(title).font(.forest(15, weight: .semibold)).foregroundStyle(.forestPrimary); if let subtitle { Text(subtitle).font(.forest(12)).foregroundStyle(.forestMuted) } }
            Spacer()
        }.padding(.vertical, 10).contentShape(Rectangle())
    }

    private var verificationForm: some View {
        VStack(spacing: 14) {
            Text("Enter the 6-digit code sent to \(email). You can also use your username if you signed up with email verification.")
                .font(.forest(14)).foregroundStyle(.forestSecondary).frame(maxWidth: .infinity, alignment: .leading)
            TextField("6-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).textFieldStyle(.plain)
                .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(6)) }.forestField()
            Button("Verify") { Task { _ = await model.verifyEmail(email: email, code: code) } }
                .buttonStyle(ForestPrimaryButton()).disabled(code.count != 6 || model.busy)
            Button("Send a new code") { Task { await model.resendVerification(email: email) } }.font(.forest(14)).foregroundStyle(.forestAccent)
            Button("Back to log in") { code = ""; model.error = nil; model.notice = nil; page = .login }.font(.forest(14)).foregroundStyle(.forestAccent)
        }
    }

    private var forgotPasswordForm: some View {
        VStack(spacing: 12) {
            if !resetCodeSent {
                Text("Enter your account's email address. We'll send you a 6-digit code.").font(.forest(14)).foregroundStyle(.forestSecondary).frame(maxWidth: .infinity, alignment: .leading)
                TextField("Email", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled().forestField()
                Button("Send code") {
                    Task { await model.requestPasswordReset(email: email); if model.error == nil { resetCodeSent = true } }
                }.buttonStyle(ForestPrimaryButton()).disabled(!emailValid || model.busy)
            } else {
                Text("If \(email) has an account, a code is on its way.").font(.forest(14)).foregroundStyle(.forestSecondary).frame(maxWidth: .infinity, alignment: .leading)
                TextField("6-digit code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                    .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(6)) }.forestField()
                SecureField("New password", text: $password).textContentType(.newPassword).forestField()
                VStack(alignment: .leading, spacing: 4) { ForEach(passwordRules, id: \.0) { HintLine($0.0, valid: $0.1) } }.frame(maxWidth: .infinity, alignment: .leading)
                SecureField("Confirm password", text: $confirmation).textContentType(.newPassword).forestField()
                if !confirmation.isEmpty { HintLine(password == confirmation ? "Passwords match" : "Passwords don't match", valid: password == confirmation) }
                Button("Set new password") {
                    Task {
                        await model.resetPassword(email: email, code: code, password: password)
                        if model.error == nil { page = .login; resetCodeSent = false; code = ""; password = ""; confirmation = "" }
                    }
                }.buttonStyle(ForestPrimaryButton()).disabled(code.count != 6 || !passwordRules.allSatisfy(\.1) || password != confirmation || model.busy)
                Button("Use another email") { resetCodeSent = false; code = "" }.font(.forest(14)).foregroundStyle(.forestAccent)
            }
            Button("Back to log in") { page = .login; model.error = nil; model.notice = nil }.font(.forest(14)).foregroundStyle(.forestAccent)
        }
    }

    private static func birthDateString(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    private static func dateLabel(_ date: Date) -> String {
        date.formatted(date: .long, time: .omitted)
    }
}

private struct HintLine: View {
    let text: String
    let valid: Bool
    init(_ text: String, valid: Bool) { self.text = text; self.valid = valid }
    var body: some View { Label(text, systemImage: valid ? "checkmark.circle.fill" : "circle").font(.forest(13)).foregroundStyle(valid ? Color.forestSuccess : Color.forestMuted) }
}

private struct PolicyViewer: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let markdown: String
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(markdown.components(separatedBy: "\n\n").enumerated()), id: \.offset) { entry in
                        let block = entry.element
                        let trimmed = block.trimmingCharacters(in: .whitespacesAndNewlines)
                        if trimmed.hasPrefix("# ") { EmptyView() }
                        else if trimmed.hasPrefix("## ") { Text(String(trimmed.dropFirst(3))).font(.forest(19, weight: .semibold)).foregroundStyle(.forestPrimary) }
                        else if trimmed.hasPrefix("|") { Text(trimmed.replacingOccurrences(of: "|", with: "  ·  ")).font(.forest(13)).foregroundStyle(.forestSecondary) }
                        else if trimmed.hasPrefix("- ") || trimmed.range(of: #"^\d+\. "#, options: .regularExpression) != nil { Text(markdownText(trimmed)).font(.forest(14)).foregroundStyle(.forestSecondary) }
                        else { Text(markdownText(trimmed.replacingOccurrences(of: "\n", with: " "))).font(.forest(14)).foregroundStyle(.forestSecondary) }
                    }
                }.padding(22)
            }.background(.forestBackground).navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func markdownText(_ value: String) -> AttributedString {
        (try? AttributedString(markdown: value)) ?? AttributedString(value.replacingOccurrences(of: "**", with: ""))
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
    private var cellar: BackendModels.CellarSummary? { model.inventoryCellars.first { $0.id == model.selectedBottleCellarID } }
    private var climateZone: BackendModels.EnvZone? { model.climate?.zones?.first }
    private var featured: BackendModels.Bottle? { model.inventoryBottles.first }
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
                                ForEach(model.inventoryCellars) { item in Button(item.name) { model.selectedBottleCellarID = item.id } }
                            } label: {
                                HStack { Text(cellar.name).font(.forest(21, weight: .medium)); Spacer(); Text("Change").font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) }
                            }.foregroundStyle(.forestPrimary)
                        }.padding(.bottom, 14).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
                        Button { showClimate = true } label: {
                            VStack(alignment: .leading, spacing: 16) {
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Text("\(cellar.bottleCount ?? 0)").font(.forest(48)).foregroundStyle(.forestPrimary)
                                    Text("BOTTLES").font(.forest(12, weight: .medium)).tracking(2).foregroundStyle(.forestMuted)
                                    Spacer(); Image(systemName: "arrow.right").foregroundStyle(.forestSecondary)
                                }
                                Rectangle().fill(.forestHairline).frame(height: 1)
                                HStack(alignment: .top, spacing: 24) {
                                    metric("TEMPERATURE", climateZone?.latest?.temp.map { String(format: "%.1f°C", $0) } ?? "—")
                                    metric("HUMIDITY", climateZone?.latest?.hum.map { String(format: "%.0f%%", $0) } ?? "—")
                                    Spacer(); Image(systemName: "arrow.right").foregroundStyle(.forestSecondary).padding(.top, 10)
                                }
                                Label(climateZone?.sensorOnline == true ? "Sensor online" : "Sensor offline", systemImage: "circle.fill").font(.forest(13)).foregroundStyle(climateZone?.sensorOnline == true ? .forestSuccess : .forestWarning)
                                Text(climateZone?.inRange == true ? "Readings within limits" : "Check cellar conditions").font(.forest(13)).foregroundStyle(.forestSecondary)
                            }.forestCard()
                        }.buttonStyle(.plain).accessibilityLabel("Open temperature, humidity and cellar alerts")
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("TODAY").overline()
                        if let wine = featured {
                            Button { selectedTab = "inventory" } label: {
                                VStack(alignment: .leading, spacing: 8) {
                                    Label("IN YOUR CELLAR · \(wine.wine.vintage ?? 0)", systemImage: "circle.fill").font(.forest(11, weight: .medium)).tracking(1.3).foregroundStyle(.forestAccent)
                                    Text(wine.wine.name).font(.forest(27)).foregroundStyle(.forestPrimary)
                                    Text("\(wine.wine.producer ?? "") · \(wine.wine.region ?? wine.wine.country ?? "")").font(.forest(15)).foregroundStyle(.forestSecondary)
                                    HStack { Text(wine.location ?? "Location unavailable").font(.forest(13)).foregroundStyle(.forestMuted); Spacer(); Text("Details →").font(.forest(14, weight: .medium)).foregroundStyle(.forestAccent) }
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
                .task { await model.loadInventoryCellars(); await model.loadEnvironment(); await model.loadBottles() }
                .onChange(of: model.selectedBottleCellarID) { _, _ in Task { await model.loadEnvironment(); await model.loadBottles() } }
                .refreshable { await model.loadInventoryCellars(); await model.loadEnvironment(); await model.loadBottles() }
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
    @State private var showingAdd = false
    @State private var editingName: String?
    @State private var selectedBottle: BackendModels.Bottle?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Cellar").font(.forest(32)).foregroundStyle(.forestPrimary)
                    if !model.inventoryCellars.isEmpty {
                        Menu {
                            ForEach(model.inventoryCellars) { cellar in
                                Button("\(cellar.name) · \(cellar.bottleCount ?? 0)") { model.selectedBottleCellarID = cellar.id }
                            }
                            Button("Add a cellar") { showingAdd = true }
                            if let cellar = currentSummary { Button("Rename \(cellar.name)") { editingName = cellar.name } }
                        } label: {
                            HStack { VStack(alignment: .leading, spacing: 5) { Text("CELLAR").overline(); Text(currentSummary?.name ?? "Select a cellar").font(.forest(20, weight: .medium)) }; Spacer(); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) }
                        }.foregroundStyle(.forestPrimary).padding(.vertical, 12)
                        if let cellar = model.backendCellar {
                            Text("\(cellar.bottles?.count ?? 0) bottles · \(Int(cellar.widthCm ?? 120)) × \(Int(cellar.heightCm ?? 200)) × \(Int(cellar.depthCm ?? 60)) cm")
                                .font(.forest(14)).foregroundStyle(.forestSecondary)
                            CellarMapView(cellar: cellar) { selectedBottle = $0 }
                                .padding(18).background(.forestCabinet, in: RoundedRectangle(cornerRadius: 20))
                                .overlay(RoundedRectangle(cornerRadius: 20).stroke(.forestCabinetRail, lineWidth: 8))
                            Text("Tap a bottle to see its details.").font(.forest(13)).foregroundStyle(.forestMuted)
                        } else if model.busy { ProgressView().tint(.forestAccent) }
                    } else {
                        ContentUnavailableView("No cellars yet", systemImage: "square.grid.2x2", description: Text("Add a cellar to start placing bottles."))
                    }
                    if let error = model.error { Text(error).font(.forest(14)).foregroundStyle(.forestWarning) }
                }.padding(24)
            }
            .background { Color.forestBackground.ignoresSafeArea() }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { showingAdd = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add a cellar") } }
            .sheet(isPresented: $showingAdd) { BackendCellarNameForm(title: "Add a cellar") { name in await model.createBackendCellar(name: name) } }
            .sheet(item: Binding(get: { editingName.map(CellarNameEdit.init(name:)) }, set: { editingName = $0?.name })) { edit in
                BackendCellarNameForm(title: "Rename cellar", initialName: edit.name) { name in
                    guard let id = model.selectedBottleCellarID else { return false }
                    return await model.renameBackendCellar(id: id, name: name)
                }
            }
            .sheet(item: $selectedBottle) { bottle in WineDetail(bottle: bottle) }
            .task { await model.loadInventoryCellars(); await model.loadBackendCellar() }
            .onChange(of: model.selectedBottleCellarID) { _, _ in Task { await model.loadBackendCellar() } }
            .refreshable { await model.loadInventoryCellars(); await model.loadBackendCellar() }
        }
    }

    private var currentSummary: BackendModels.CellarSummary? {
        model.inventoryCellars.first { $0.id == model.selectedBottleCellarID }
    }
}

private struct CellarNameEdit: Identifiable { var name: String; var id: String { name } }

private struct BackendCellarNameForm: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    var initialName = ""
    let save: (String) async -> Bool
    @State private var name: String
    @State private var saving = false

    init(title: String, initialName: String = "", save: @escaping (String) async -> Bool) {
        self.title = title; self.initialName = initialName; self.save = save
        _name = State(initialValue: initialName)
    }
    var body: some View {
        NavigationStack {
            Form { TextField("Cellar name", text: $name).textInputAutocapitalization(.words) }
                .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { saving = true; if await save(name.trimmingCharacters(in: .whitespacesAndNewlines)) { dismiss() }; saving = false } }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving) }
                }
                .overlay { if saving { ProgressView().tint(.forestAccent) } }
        }.presentationDetents([.medium])
    }
}

private struct CellarMapView: View {
    let cellar: BackendModels.Cellar
    let openBottle: (BackendModels.Bottle) -> Void
    private var width: Double { max(cellar.widthCm ?? 120, 1) }
    private var height: Double { max(cellar.heightCm ?? 200, 1) }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 8).fill(Color.forestCabinetInset)
                ForEach((cellar.racks ?? []).filter { $0.kind == "shelf" }, id: \.id) { rack in
                    let y = size.height * (1 - min(max((rack.yCm ?? 0) / height, 0), 1))
                    Rectangle().fill(Color.forestCabinetRail).frame(height: 3).position(x: size.width / 2, y: y)
                }
                ForEach(cellar.bottles ?? []) { bottle in
                    if let x = bottle.x, let y = bottle.y {
                        Button { openBottle(bottle) } label: {
                            Circle().fill(wineColor(bottle.wine.color)).overlay(Circle().fill(.black.opacity(0.22)).padding(5))
                                .overlay(Circle().stroke(.white.opacity(0.3), lineWidth: 1))
                                .frame(width: 28, height: 28)
                        }.buttonStyle(.plain).accessibilityLabel(bottle.wine.name)
                            .position(x: size.width * min(max(x / width, 0), 1), y: size.height * (1 - min(max(y / height, 0), 1)))
                    }
                }
            }
        }.aspectRatio(width / height, contentMode: .fit)
    }

    private func wineColor(_ color: String?) -> Color {
        switch color?.lowercased() {
        case "white": .forestWarning
        case "rose", "rosé": .pink
        case "sparkling": .forestAccent
        default: .forestDanger
        }
    }
}

struct InventoryView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selectedTab: String
    @State private var adding = false
    @State private var selected: BackendModels.Bottle?
    @State private var filter = "All"
    private let filters = ["All", "Red", "White", "Rosé", "Sparkling", "Ready to drink"]
    private var requestKey: String {
        "\(model.inventoryQuery)|\(model.inventoryAllCellars)|\(model.selectedBottleCellarID ?? 0)"
    }
    private var results: [BackendModels.Bottle] {
        model.inventoryBottles.filter { bottle in
            let color = bottle.wine.color ?? "red"
            let styleMatch = filter == "All" || (filter == "Ready to drink" ? bottle.windowStatus == "ready" : color == filter.lowercased().replacingOccurrences(of: "é", with: "e"))
            return styleMatch
        }
    }
    private var wineCount: Int {
        Set(results.map { bottle in
            bottle.wine.id.map { String($0) } ?? "\(bottle.wine.producer ?? "")|\(bottle.wine.name)|\(bottle.wine.vintage ?? 0)"
        }).count
    }
    private var currentCellarName: String {
        model.inventoryCellars.first(where: { $0.id == model.selectedBottleCellarID })?.name ?? "This cellar"
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
                    Picker("Cellars", selection: $model.inventoryAllCellars) {
                        Text(currentCellarName).tag(false)
                        Text("All cellars").tag(true)
                    }.pickerStyle(.segmented)
                    HStack(spacing: 10) { Image(systemName: "magnifyingglass").foregroundStyle(.forestMuted); TextField("Wine, producer, region, vintage, grape", text: $model.inventoryQuery).font(.forest(14)) }
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
                    HStack { Text("\(results.count) bottles · \(wineCount) wines").font(.forest(14)).foregroundStyle(.forestSecondary); Spacer() }
                    if let error = model.error {
                        Text(error).font(.forest(13)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if results.isEmpty {
                        VStack(spacing: 8) {
                            Text(model.error ?? (model.inventoryQuery.isEmpty ? "No bottles yet" : "No wines match"))
                                .font(.forest(18, weight: .medium)).foregroundStyle(.forestPrimary)
                            if model.error != nil {
                                Button("Try again") { Task { await model.loadBottles() } }.font(.forest(14)).foregroundStyle(.forestAccent)
                            } else if !model.inventoryQuery.isEmpty || filter != "All" {
                                Button("Clear search and filters") { model.inventoryQuery = ""; filter = "All" }
                                    .font(.forest(14)).foregroundStyle(.forestAccent)
                            } else {
                                Text("Tap Add bottle to start your cellar.").font(.forest(14)).foregroundStyle(.forestMuted)
                            }
                        }.frame(maxWidth: .infinity).padding(.vertical, 42)
                    } else {
                        LazyVStack(spacing: 0) {
                            ForEach(results) { bottle in
                                Button { selected = bottle } label: {
                                    HStack(spacing: 14) {
                                        Capsule().fill(style(for: bottle.wine.color).tint).frame(width: 4, height: 74)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text("\(vintageLabel(bottle.wine.vintage)) · \(style(for: bottle.wine.color).rawValue.uppercased())").font(.forest(11, weight: .medium)).tracking(1.2).foregroundStyle(.forestMuted)
                                            Text(bottle.wine.name).font(.forest(19, weight: .medium)).foregroundStyle(.forestPrimary)
                                            Text("\(bottle.wine.producer ?? "") · \(bottle.wine.region ?? bottle.wine.country ?? "")").font(.forest(14)).foregroundStyle(.forestSecondary)
                                            Text("\(bottle.cellarName ?? currentCellarName) · \(bottle.location ?? "Location unavailable")").font(.forest(12)).foregroundStyle(.forestMuted).lineLimit(1)
                                        }
                                        Spacer(minLength: 4)
                                        VStack(alignment: .trailing, spacing: 5) {
                                            Label(windowLabel(bottle.windowStatus), systemImage: "circle.fill")
                                                .font(.forest(11)).foregroundStyle(windowColor(bottle.windowStatus))
                                            Image(systemName: "chevron.right").font(.forest(12)).foregroundStyle(.forestMuted)
                                        }
                                    }.padding(.vertical, 14).contentShape(Rectangle())
                                }.buttonStyle(.plain)
                                Rectangle().fill(.forestHairline).frame(height: 1)
                            }
                        }
                    }
                }.padding(24)
            }.background { Color.forestBackground.ignoresSafeArea() }
                .sheet(isPresented: $adding) {
                    BottleForm(cellarID: model.selectedBottleCellarID ?? model.inventoryCellars.first?.id ?? 0, bottle: nil) { _ in }
                }
                .sheet(item: $selected) { bottle in WineDetail(bottle: bottle) }
                .task { await model.loadInventoryCellars() }
                .task(id: requestKey) {
                    try? await Task.sleep(for: .milliseconds(250))
                    guard !Task.isCancelled else { return }
                    await model.loadBottles()
                }
                .refreshable { await model.loadBottles() }
        }
    }

    private func style(for color: String?) -> WineStyle {
        switch color {
        case "white": .white
        case "rose": .rose
        case "sparkling": .sparkling
        default: .red
        }
    }
    private func vintageLabel(_ vintage: Int?) -> String { vintage.map { $0 > 0 ? String($0) : "NV" } ?? "NV" }
    private func windowLabel(_ status: String?) -> String {
        switch status { case "ready": "Ready"; case "past-peak": "Past peak"; default: "Young" }
    }
    private func windowColor(_ status: String?) -> Color {
        switch status { case "ready": .forestSuccess; case "past-peak": .forestWarning; default: .forestSecondary }
    }
}

struct WineDetail: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var bottle: BackendModels.Bottle
    @State private var editing = false
    @State private var confirmingRemoval = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(vintageLabel(bottle.wine.vintage)) · \(style(for: bottle.wine.color).rawValue.uppercased())").overline()
                        Text(bottle.wine.name).font(.forest(29)).foregroundStyle(.forestPrimary)
                        Text("\(bottle.wine.producer ?? "") · \(bottle.wine.region ?? bottle.wine.country ?? "")").font(.forest(16)).foregroundStyle(.forestSecondary)
                        Text(windowLabel(bottle.windowStatus)).font(.forest(14)).foregroundStyle(windowColor(bottle.windowStatus)).padding(.top, 4)
                    }.padding(.vertical, 8)
                }
                Section("In your cellar") {
                    LabeledContent("Location", value: bottle.location ?? "Location unavailable")
                    LabeledContent("Cellar", value: bottle.cellarName ?? "Cellar")
                    Button("Ask the sommeliers") { Task { _ = await model.ask("Discuss \(bottle.wine.name) \(vintageLabel(bottle.wine.vintage))") } }
                }
                Section("About this wine") {
                    LabeledContent("Producer", value: bottle.wine.producer ?? "—")
                    LabeledContent("Region", value: bottle.wine.region ?? "—")
                    LabeledContent("Country", value: bottle.wine.country ?? "—")
                    LabeledContent("Grape", value: bottle.wine.grape ?? "—")
                    LabeledContent("Vintage", value: vintageLabel(bottle.wine.vintage))
                    if let price = bottle.wine.basePrice { LabeledContent("Base price", value: String(format: "$%.0f", price)) }
                    if let from = bottle.wine.drinkFrom, let to = bottle.wine.drinkTo { LabeledContent("Drinking window", value: "\(from)–\(to)") }
                }
                Section { Button("Edit bottle") { editing = true }; Button("Remove bottle", role: .destructive) { confirmingRemoval = true } }
            }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Bottle").navigationBarTitleDisplayMode(.inline)
                .sheet(isPresented: $editing) {
                    BottleForm(cellarID: bottle.cellarId, bottle: bottle) { updated in bottle = updated }
                }
                .confirmationDialog("How should this bottle be removed?", isPresented: $confirmingRemoval, titleVisibility: .visible) {
                    Button("Mark as consumed", role: .destructive) { Task { if await model.removeBottle(id: bottle.id, reason: "consumed") { dismiss() } } }
                    Button("Remove without consuming", role: .destructive) { Task { if await model.removeBottle(id: bottle.id, reason: "removed") { dismiss() } } }
                }
        }
    }

    private func style(for color: String?) -> WineStyle {
        switch color { case "white": .white; case "rose": .rose; case "sparkling": .sparkling; default: .red }
    }
    private func vintageLabel(_ vintage: Int?) -> String { vintage.map { $0 > 0 ? String($0) : "NV" } ?? "NV" }
    private func windowLabel(_ status: String?) -> String {
        switch status { case "ready": "Ready to drink"; case "past-peak": "Past peak"; default: "Young" }
    }
    private func windowColor(_ status: String?) -> Color {
        switch status { case "ready": .forestSuccess; case "past-peak": .forestWarning; default: .forestSecondary }
    }
}

struct BottleForm: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    let cellarID: Int
    let bottle: BackendModels.Bottle?
    let onSaved: (BackendModels.Bottle) -> Void
    @State private var name: String
    @State private var producer: String
    @State private var region: String
    @State private var country: String
    @State private var grape: String
    @State private var color: String
    @State private var vintage: String
    @State private var price: String
    @State private var drinkFrom: String
    @State private var drinkTo: String

    init(cellarID: Int, bottle: BackendModels.Bottle?, onSaved: @escaping (BackendModels.Bottle) -> Void) {
        self.cellarID = cellarID
        self.bottle = bottle
        self.onSaved = onSaved
        let wine = bottle?.wine
        _name = State(initialValue: wine?.name ?? "")
        _producer = State(initialValue: wine?.producer ?? "")
        _region = State(initialValue: wine?.region ?? "")
        _country = State(initialValue: wine?.country ?? "")
        _grape = State(initialValue: wine?.grape ?? "")
        _color = State(initialValue: wine?.color ?? "red")
        _vintage = State(initialValue: wine?.vintage.map(String.init) ?? String(Calendar.current.component(.year, from: .now) - 3))
        _price = State(initialValue: wine?.basePrice.map { String($0) } ?? "")
        _drinkFrom = State(initialValue: wine?.drinkFrom.map(String.init) ?? "")
        _drinkTo = State(initialValue: wine?.drinkTo.map(String.init) ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("WINE") {
                    TextField("Wine name *", text: $name)
                    TextField("Producer / winery *", text: $producer)
                    TextField("Region", text: $region)
                    TextField("Country", text: $country)
                    TextField("Grape(s)", text: $grape)
                }
                Section("TYPE") {
                    Picker("Color", selection: $color) {
                        Text("Red").tag("red")
                        Text("White").tag("white")
                        Text("Rosé").tag("rose")
                        Text("Sparkling").tag("sparkling")
                    }
                }
                Section("VINTAGE & DRINKING WINDOW") {
                    TextField("Vintage (0 = NV)", text: $vintage).keyboardType(.numberPad)
                    TextField("Drink from", text: $drinkFrom).keyboardType(.numberPad)
                    TextField("Drink to", text: $drinkTo).keyboardType(.numberPad)
                }
                Section("BASE PRICE") { TextField("Price (USD)", text: $price).keyboardType(.decimalPad) }
                if bottle == nil { Text("The backend will place this bottle in the best free spot for its type.") }
                if let error = model.error { Text(error).foregroundStyle(.forestDanger) }
            }
            .scrollContentBackground(.hidden).background(.forestBackground)
            .navigationTitle(bottle == nil ? "Add bottle" : "Edit bottle")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.busy ? "Saving…" : "Save") {
                        Task {
                            let wine = BackendModels.WineInfo(
                                id: bottle?.wine.id,
                                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                producer: nonEmpty(producer), region: nonEmpty(region), country: nonEmpty(country),
                                color: color, vintage: Int(vintage), grape: nonEmpty(grape),
                                drinkFrom: Int(drinkFrom), drinkTo: Int(drinkTo), basePrice: Double(price)
                            )
                            if let saved = await model.saveBottle(id: bottle?.id, cellarID: bottle?.cellarId ?? cellarID, wine: wine) {
                                onSaved(saved)
                                dismiss()
                            }
                        }
                    }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || producer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || cellarID == 0 || model.busy)
                }
            }
        }
    }

    private func nonEmpty(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct LegacyWineDetail: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var wine: Wine
    @State private var editing = false
    @State private var confirmingRemoval = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(wine.vintage) · \(wine.style.rawValue.uppercased())").overline()
                        Text(wine.name).font(.forest(29)).foregroundStyle(.forestPrimary)
                        Text("\(wine.winery) · \(wine.region)").font(.forest(16)).foregroundStyle(.forestSecondary)
                        Text("\(wine.drinkingWindow)").font(.forest(14)).foregroundStyle(.forestSuccess).padding(.top, 4)
                    }.padding(.vertical, 8)
                }
                Section("In your cellars") {
                    LabeledContent("Location", value: wine.location)
                    Button("Ask the sommeliers") { Task { _ = await model.ask("Discuss \(wine.name) \(wine.vintage)") } }
                }
                Section { Button("Edit bottle") { editing = true }; Button("Remove bottle", role: .destructive) { confirmingRemoval = true } }
            }
            .scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Bottle").navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $editing) { LegacyWineForm(wine: wine) { updated in Task { await model.save(updated); wine = updated } } }
            .confirmationDialog("Remove this bottle from your inventory?", isPresented: $confirmingRemoval, titleVisibility: .visible) {
                Button("Remove bottle", role: .destructive) { Task { await model.remove(wine); dismiss() } }
            }
        }
    }
}

private struct LegacyWineForm: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var model: AppModel
    @State var wine: Wine
    let isNew: Bool
    let onSave: (Wine) -> Void

    init(wine: Wine?, onSave: @escaping (Wine) -> Void) {
        isNew = wine == nil
        self.onSave = onSave
        _wine = State(initialValue: wine ?? Wine(name: "", winery: "", region: "", vintage: Calendar.current.component(.year, from: .now), grape: "", location: "", cellarID: UUID()))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("WINE") {
                    TextField("Wine name", text: $wine.name)
                    TextField("Winery", text: $wine.winery)
                    TextField("Region", text: $wine.region)
                    TextField("Vintage", value: $wine.vintage, format: .number).keyboardType(.numberPad)
                    TextField("Grape variety", text: $wine.grape)
                }
                Section("STORAGE LOCATION") {
                    Picker("Cellar", selection: $wine.cellarID) { ForEach(model.cellars) { Text($0.name).tag($0.id) } }
                    TextField("Shelf and position", text: $wine.location)
                }
                Section("VALUE") { TextField("Estimated value", value: $wine.value, format: .number).keyboardType(.decimalPad) }
            }
            .scrollContentBackground(.hidden).background(.forestBackground).navigationTitle(isNew ? "Add bottle" : "Edit bottle")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save Changes") {
                        if isNew, let id = model.selectedCellar { wine.cellarID = id }
                        onSave(wine); dismiss()
                    }.disabled(wine.name.isEmpty)
                }
            }
        }
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
    private var zones: [BackendModels.EnvZone] { model.climate?.zones ?? [] }
    var body: some View {
        NavigationStack {
            List {
                if zones.isEmpty {
                    Text(model.error ?? "No climate zones are available for this cellar.").font(.forest(14)).foregroundStyle(.forestSecondary)
                }
                ForEach(zones, id: \.id) { zone in ClimateZoneCard(zone: zone) }
            }
            .scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Climate & alerts")
            .task { await model.loadEnvironment(minutes: 1440) }
            .onChange(of: model.selectedBottleCellarID) { _, _ in Task { await model.loadEnvironment(minutes: 1440) } }
            .refreshable { await model.loadEnvironment(minutes: 1440) }
        }
    }
}

private struct ClimateZoneCard: View {
    @EnvironmentObject private var model: AppModel
    let zone: BackendModels.EnvZone
    @State private var draft: BackendModels.ZoneUpdate
    @State private var saving = false

    init(zone: BackendModels.EnvZone) {
        self.zone = zone
        _draft = State(initialValue: BackendModels.ZoneUpdate(targetTemp: zone.targetTemp ?? 12, targetHum: zone.targetHum ?? 68,
            tempMin: zone.tempMin ?? 9.5, tempMax: zone.tempMax ?? 14.5, humMin: zone.humMin ?? 56,
            humMax: zone.humMax ?? 80, alertMinutes: zone.alertMinutes ?? 15))
    }
    private var history: [ClimatePoint] {
        (zone.history ?? []).compactMap { reading in
            guard let timestamp = reading.ts, let date = Self.parseDate(timestamp), let temp = reading.temp, let hum = reading.hum else { return nil }
            return ClimatePoint(date: date, temperature: temp, humidity: hum)
        }.sorted { $0.date < $1.date }
    }

    var body: some View {
        Section(zone.name ?? "Climate zone") {
            LabeledContent("Temperature", value: zone.latest?.temp.map { String(format: "%.1f °C", $0) } ?? "—")
            LabeledContent("Humidity", value: zone.latest?.hum.map { String(format: "%.0f %%", $0) } ?? "—")
            Label(zone.sensorOnline == true ? "Sensor online" : "Sensor offline", systemImage: zone.sensorOnline == true ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(zone.sensorOnline == true ? .forestSuccess : .forestWarning)
            if let latest = zone.latest?.ts { Text("Last reading · \(latest)").font(.forest(12)).foregroundStyle(.forestMuted) }
            if history.isEmpty {
                Text("No readings in the last 24 hours.").font(.forest(13)).foregroundStyle(.forestMuted)
            } else {
                Text("Temperature · 24 hours").font(.forest(13, weight: .medium))
                Chart(history) { point in LineMark(x: .value("Time", point.date), y: .value("°C", point.temperature)).foregroundStyle(Color.forestAccent) }.frame(height: 120)
                Text("Humidity · 24 hours").font(.forest(13, weight: .medium))
                Chart(history) { point in LineMark(x: .value("Time", point.date), y: .value("%", point.humidity)).foregroundStyle(Color.forestWhite) }.frame(height: 120)
            }
            Text("Alert limits").font(.forest(15, weight: .medium)).padding(.top, 5)
            climateStepper("Target temperature", value: draft.targetTemp, format: "%.1f °C", step: 0.5) { draft.targetTemp += $0; keepTempRangeValid() }
            climateStepper("Target humidity", value: draft.targetHum, format: "%.0f %%", step: 1) { draft.targetHum += $0; keepHumidityRangeValid() }
            climateStepper("Minimum temperature", value: draft.tempMin, format: "%.1f °C", step: 0.5) { draft.tempMin += $0 }
            climateStepper("Maximum temperature", value: draft.tempMax, format: "%.1f °C", step: 0.5) { draft.tempMax += $0 }
            climateStepper("Minimum humidity", value: draft.humMin, format: "%.0f %%", step: 1) { draft.humMin += $0 }
            climateStepper("Maximum humidity", value: draft.humMax, format: "%.0f %%", step: 1) { draft.humMax += $0 }
            climateStepper("Alert after", value: draft.alertMinutes, format: "%.0f min", step: 5) { draft.alertMinutes = min(max(draft.alertMinutes + $0, 5), 120) }
            Button(saving ? "Saving…" : "Save alert limits") {
                guard let id = zone.id else { return }
                Task { saving = true; if await model.saveZone(id: id, update: draft) { await model.loadEnvironment(minutes: 1440) }; saving = false }
            }.disabled(saving || draft.tempMin >= draft.targetTemp || draft.tempMax <= draft.targetTemp || draft.humMin >= draft.targetHum || draft.humMax <= draft.targetHum)
        }
    }

    private func climateStepper(_ title: String, value: Double, format: String, step: Double, change: @escaping (Double) -> Void) -> some View {
        HStack {
            Text(title).font(.forest(13)).foregroundStyle(.forestSecondary)
            Spacer()
            Button { change(-step) } label: { Image(systemName: "minus.circle") }.buttonStyle(.plain)
            Text(String(format: format, value)).font(.forest(13, weight: .medium)).frame(minWidth: 70)
            Button { change(step) } label: { Image(systemName: "plus.circle") }.buttonStyle(.plain)
        }
    }

    private func keepTempRangeValid() {
        if draft.tempMin >= draft.targetTemp { draft.tempMin = draft.targetTemp - 0.5 }
        if draft.tempMax <= draft.targetTemp { draft.tempMax = draft.targetTemp + 0.5 }
    }
    private func keepHumidityRangeValid() {
        if draft.humMin >= draft.targetHum { draft.humMin = draft.targetHum - 1 }
        if draft.humMax <= draft.targetHum { draft.humMax = draft.targetHum + 1 }
    }
    private static func parseDate(_ text: String) -> Date? {
        let iso = ISO8601DateFormatter()
        if let value = iso.date(from: text) { return value }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter.date(from: text)
    }
}

private struct ClimatePoint: Identifiable {
    var date: Date
    var temperature: Double
    var humidity: Double
    var id: Date { date }
}

struct AIView: View {
    @EnvironmentObject private var model: AppModel
    @State private var composingKind: String?
    @State private var tasting: BackendModels.TableRequest?
    var body: some View {
        NavigationStack {
            Group {
                if let tasting { TastingTableView(request: tasting) { self.tasting = nil } }
                else if let kind = composingKind {
                    SommelierComposer(kind: kind, personas: model.personas, onBack: { composingKind = nil }, onStart: { request in composingKind = nil; tasting = request })
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            Text("Sommelier").font(.forest(32)).foregroundStyle(.forestPrimary)
                            Text("A table of sommeliers who taste with you").font(.forest(15)).foregroundStyle(.forestSecondary)
                            Text("YOUR SOMMELIERS · \(model.personas.count)").overline()
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(model.personas) { persona in
                                        VStack(spacing: 6) {
                                            Text(initials(persona.name)).font(.forest(16, weight: .semibold)).foregroundStyle(.white).frame(width: 54, height: 54).background(Color(hex: persona.color ?? "#4A4F55"), in: Circle())
                                            Text(persona.name.split(separator: " ").first.map(String.init) ?? persona.name).font(.forest(13, weight: .medium)).foregroundStyle(.forestPrimary)
                                            Text(persona.title ?? "Sommelier").font(.forest(11)).foregroundStyle(.forestMuted).lineLimit(1)
                                        }.frame(width: 92)
                                    }
                                }
                            }
                            Text("START A TASTING").overline()
                            VStack(spacing: 0) {
                                tastingAction("Discuss a wine", subtitle: "Scores, tasting notes and when to open it", icon: "wineglass", kind: "wine")
                                tastingAction("What to open tonight", subtitle: "Each sommelier picks a bottle", icon: "moon", kind: "tonight")
                                tastingAction("Pair with a meal", subtitle: "Tell them what you are eating", icon: "fork.knife", kind: "pairing")
                                tastingAction("Ask anything", subtitle: "Ask a question about your cellar", icon: "bubble.left", kind: "open")
                            }
                            if let error = model.error { Text(error).font(.forest(14)).foregroundStyle(.forestDanger) }
                            if model.personas.count < 2 { Text("At least two sommeliers are needed to start a tasting.").font(.forest(13)).foregroundStyle(.forestMuted) }
                        }.padding(24)
                    }.background { Color.forestBackground.ignoresSafeArea() }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .task { await model.loadPersonas(); await model.loadSommelierBottles() }
        }
    }

    private func tastingAction(_ title: String, subtitle: String, icon: String, kind: String) -> some View {
        Button { composingKind = kind } label: {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 18)).foregroundStyle(.forestAccent).frame(width: 42, height: 42).background(.forestMutedSurface, in: Circle())
                VStack(alignment: .leading, spacing: 4) { Text(title).font(.forest(16, weight: .medium)).foregroundStyle(.forestPrimary); Text(subtitle).font(.forest(13)).foregroundStyle(.forestSecondary) }
                Spacer(); Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(.forestMuted)
            }.padding(.vertical, 12).overlay(alignment: .bottom) { Rectangle().fill(.forestHairline).frame(height: 1) }
        }.buttonStyle(.plain).disabled(model.personas.count < 2)
    }
}

private struct SommelierComposer: View {
    @EnvironmentObject private var model: AppModel
    let kind: String
    let personas: [BackendModels.Persona]
    let onBack: () -> Void
    let onStart: (BackendModels.TableRequest) -> Void
    @State private var seats: Set<String>
    @State private var selectedBottleID: Int?
    @State private var text = ""

    init(kind: String, personas: [BackendModels.Persona], onBack: @escaping () -> Void, onStart: @escaping (BackendModels.TableRequest) -> Void) {
        self.kind = kind; self.personas = personas; self.onBack = onBack; self.onStart = onStart
        _seats = State(initialValue: Set(personas.prefix(3).map(\.id)))
    }
    private var selectedBottle: BackendModels.Bottle? { model.sommelierBottles.first { $0.id == selectedBottleID } }
    private var ready: Bool { seats.count >= 2 && (kind != "wine" || selectedBottle != nil) && (!(kind == "pairing" || kind == "open") || text.trimmingCharacters(in: .whitespacesAndNewlines).count > 1) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Button(action: onBack) { Label("Back", systemImage: "chevron.left").foregroundStyle(.forestAccent) }
                Text(title).font(.forest(28)).foregroundStyle(.forestPrimary)
                if kind == "wine" {
                    Picker("Wine", selection: $selectedBottleID) {
                        Text("Choose a wine").tag(nil as Int?)
                        ForEach(model.sommelierBottles) { bottle in Text("\(bottle.wine.name) · \(bottle.wine.vintage.map { String($0) } ?? "NV")").tag(Optional(bottle.id)) }
                    }.tint(.forestAccent)
                }
                if kind == "pairing" || kind == "open" {
                    TextField(kind == "pairing" ? "What are you eating?" : "Your question", text: $text, axis: .vertical).lineLimit(2...5).forestField()
                }
                Text("AT THE TABLE · \(seats.count) OF 5").overline()
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(personas) { persona in
                            let selected = seats.contains(persona.id)
                            Button {
                                if selected { seats.remove(persona.id) } else if seats.count < 5 { seats.insert(persona.id) }
                            } label: {
                                VStack(spacing: 6) {
                                    Text(initials(persona.name)).font(.forest(16, weight: .semibold)).foregroundStyle(.white).frame(width: 52, height: 52).background(Color(hex: persona.color ?? "#4A4F55"), in: Circle()).overlay(Circle().stroke(selected ? Color.forestAccent : .clear, lineWidth: 3).padding(-4))
                                    Text(persona.name.split(separator: " ").first.map(String.init) ?? persona.name).font(.forest(13, weight: .medium)).foregroundStyle(selected ? .forestPrimary : .forestMuted)
                                }.frame(width: 84).padding(.vertical, 8)
                            }.buttonStyle(.plain)
                        }
                    }
                }
                Button("Start the tasting") {
                    let topic: BackendModels.TableTopic
                    if kind == "wine", let bottle = selectedBottle { topic = .init(kind: "wine", bottleId: bottle.id) }
                    else { topic = .init(kind: "question", intent: kind, text: text.trimmingCharacters(in: .whitespacesAndNewlines)) }
                    onStart(.init(topic: topic, personaIds: personas.filter { seats.contains($0.id) }.map(\.id), history: []))
                }.buttonStyle(ForestPrimaryButton()).disabled(!ready)
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() }
    }

    private var title: String {
        switch kind { case "wine": "Discuss a wine"; case "tonight": "What to open tonight"; case "pairing": "Pair with a meal"; default: "Ask anything" }
    }
}

private struct TastingTableView: View {
    @EnvironmentObject private var model: AppModel
    let request: BackendModels.TableRequest
    let onBack: () -> Void
    @State private var messages: [TastingMessage] = []
    @State private var running = false
    @State private var ended = false
    @State private var reply = ""
    @State private var error: String?
    @State private var selectedBottle: BackendModels.Bottle?
    @State private var streamTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 12) {
            HStack { Button(action: onBack) { Label("Sommelier", systemImage: "chevron.left").foregroundStyle(.forestAccent) }; Spacer(); Text(request.topic.kind == "wine" ? "Wine tasting" : "Cellar question").font(.forest(16, weight: .medium)).foregroundStyle(.forestPrimary) }
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(messages) { message in tastingMessage(message) }
                        if let error { Text(error).font(.forest(14)).foregroundStyle(.forestDanger) }
                    }.padding(.vertical, 10)
                }.onChange(of: messages.count) { _, _ in if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } } }
            }
            if running {
                HStack { ProgressView().tint(.forestAccent); Text("The sommeliers are tasting…").font(.forest(14)).foregroundStyle(.forestSecondary); Spacer(); Button("Stop") { streamTask?.cancel() } }.padding(.horizontal, 4)
            } else if ended {
                Button("Back to sommeliers", action: onBack).buttonStyle(ForestPrimaryButton())
            } else {
                HStack(spacing: 8) {
                    TextField("Say something to the table…", text: $reply, axis: .vertical).lineLimit(1...3).font(.forest(14)).padding(12).background(.forestSurface, in: RoundedRectangle(cornerRadius: 10))
                    Button { let text = reply.trimmingCharacters(in: .whitespacesAndNewlines); guard !text.isEmpty else { return }; reply = ""; streamTask = Task { await runRound(userText: text) } } label: { Image(systemName: "paperplane.fill").foregroundStyle(.forestAccent).frame(width: 40, height: 40) }.disabled(reply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                HStack(spacing: 10) {
                    Button("Continue") { streamTask = Task { await runRound() } }.buttonStyle(.bordered)
                    Button("End tasting") { ended = true }.buttonStyle(.bordered).disabled(messages.isEmpty)
                }
            }
        }.padding(20).background { Color.forestBackground.ignoresSafeArea() }
            .sheet(item: $selectedBottle) { bottle in WineDetail(bottle: bottle) }
            .task { if messages.isEmpty { streamTask = Task { await runRound() }; await streamTask?.value } }
            .onDisappear { streamTask?.cancel() }
    }

    @ViewBuilder private func tastingMessage(_ message: TastingMessage) -> some View {
        if message.speaker == "user" {
            Text(message.text).font(.forest(15)).foregroundStyle(.forestPrimary).frame(maxWidth: .infinity, alignment: .trailing).padding(12).background(.forestAccentSoft, in: RoundedRectangle(cornerRadius: 12))
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(initials(message.name)).font(.forest(12, weight: .semibold)).foregroundStyle(.white).frame(width: 32, height: 32).background(Color(hex: message.color), in: Circle())
                    VStack(alignment: .leading, spacing: 1) { Text(message.name).font(.forest(14, weight: .semibold)).foregroundStyle(.forestPrimary); Text(message.title).font(.forest(11)).foregroundStyle(.forestMuted) }
                    if message.streaming { ProgressView().controlSize(.small).tint(.forestAccent) }
                }
                Text(message.text.isEmpty ? "…" : message.text + (message.streaming ? " ▍" : "")).font(.forest(15)).foregroundStyle(.forestSecondary).frame(maxWidth: .infinity, alignment: .leading)
                if let bottle = message.bottle {
                    Button { selectedBottle = bottle } label: { Label("#\(bottle.id) · \(bottle.wine.name) · \(bottle.cellarName ?? "Cellar")", systemImage: "wineglass") }.font(.forest(13, weight: .medium)).foregroundStyle(.forestAccent)
                }
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(.forestSurface, in: RoundedRectangle(cornerRadius: 14))
        }
    }

    @MainActor private func runRound(userText: String? = nil) async {
        guard !running else { return }
        if let userText { messages.append(TastingMessage(speaker: "user", text: userText, name: "You", title: "", color: "#2F5D50")) }
        running = true; error = nil
        let history = messages.map { BackendModels.TableMessage(speaker: $0.speaker, text: $0.text) }
        let roundRequest = BackendModels.TableRequest(topic: request.topic, personaIds: request.personaIds, history: history)
        do {
            for try await event in try model.tastingEvents(roundRequest) {
                switch event.type {
                case "turn":
                    let persona = model.personas.first { $0.id == event.persona }
                    messages.append(TastingMessage(speaker: event.persona ?? "", text: "", name: event.name ?? persona?.name ?? "Sommelier", title: event.title ?? persona?.title ?? "", color: event.color ?? persona?.color ?? "#4A4F55"))
                case "delta":
                    if let index = messages.lastIndex(where: { $0.speaker == (event.persona ?? "") && $0.speaker != "user" }) { messages[index].text += event.text ?? "" }
                case "pick":
                    if let index = messages.indices.last { messages[index].bottle = event.bottle }
                case "turn_end":
                    if let index = messages.lastIndex(where: { $0.speaker == (event.persona ?? "") }) { messages[index].streaming = false }
                case "error": error = event.message ?? "The tasting could not continue."
                case "done": break
                default: break
                }
            }
        } catch is CancellationError {
        } catch { self.error = error.localizedDescription }
        for index in messages.indices { messages[index].streaming = false }
        running = false
    }
}

private struct TastingMessage: Identifiable {
    let id = UUID()
    var speaker: String
    var text: String
    var name: String
    var title: String
    var color: String
    var bottle: BackendModels.Bottle? = nil
    var streaming = true
}

private func initials(_ name: String) -> String {
    name.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
}

private extension Color {
    init(hex: String) {
        let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x4A4F55
        self.init(.sRGB, red: Double((value >> 16) & 0xFF) / 255, green: Double((value >> 8) & 0xFF) / 255, blue: Double(value & 0xFF) / 255, opacity: 1)
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
    private var name: String {
        if let displayName = model.backendUser?.displayName, !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return displayName }
        return model.backendUser?.username ?? email.split(separator: "@").first.map(String.init) ?? "Wine lover"
    }
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
                    profileRow("My cellars", detail: "\(model.inventoryCellars.count) cellars", icon: "cabinet", action: { selectedTab = "cellar" })
                    NavigationLink { EnvironmentView() } label: { profileRowLabel("Notifications & alerts", detail: "Temperature · humidity", icon: "bell") }
                    NavigationLink { TastePreferencesView() } label: { profileRowLabel("Taste preferences", detail: "Personalize recommendations", icon: "slider.horizontal.3") }
                    NavigationLink { PrivacyAndDataView() } label: { profileRowLabel("Privacy & data", detail: "Export or delete your data", icon: "lock.shield") }
                }.background(.forestSurface, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(.forestHairline))
                Text("APPEARANCE").overline()
                HStack { Text("Theme").font(.forest(16)).foregroundStyle(.forestPrimary); Spacer(); Menu { Button("System") { appearance = "system" }; Button("Light") { appearance = "light" }; Button("Dark") { appearance = "dark" } } label: { HStack { Text(appearance.capitalized).font(.forest(15)).foregroundStyle(.forestAccent); Image(systemName: "chevron.down").foregroundStyle(.forestAccent) } } }.forestCard()
                HStack { Text("Palette").font(.forest(16)).foregroundStyle(.forestPrimary); Spacer(); Text("Forest").font(.forest(15)).foregroundStyle(.forestSecondary) }.forestCard()
                Button("Log out", role: .destructive) { model.signOut() }.font(.forest(16, weight: .medium)).foregroundStyle(.forestDanger).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() }.task { await model.loadProfile(); await model.loadInventoryCellars() } }
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
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var repeatedPassword = ""
    @State private var currentPassword = ""
    @State private var code = ""
    @State private var briefingTime = Calendar.current.date(from: DateComponents(hour: 8)) ?? .now
    @State private var initialized = false
    private var profile: BackendModels.User? { model.backendUser }
    private var emailChanged: Bool { email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != (profile?.email ?? "").lowercased() }
    private var sensitiveChange: Bool { emailChanged || !password.isEmpty }
    private var emailValid: Bool { email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil }
    private var passwordValid: Bool { password.isEmpty || (password.count >= 8 && password == repeatedPassword) }
    var body: some View {
        NavigationStack { Form {
            Section("PROFILE") {
                TextField("Display name", text: $name)
                TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress)
                SecureField("New password", text: $password)
                if !password.isEmpty { SecureField("Repeat new password", text: $repeatedPassword) }
                if !emailValid && !email.isEmpty { Text("Enter a valid email address.").foregroundStyle(.forestDanger) }
                if !passwordValid { Text(password.count < 8 ? "Password must be at least 8 characters." : "Passwords do not match.").foregroundStyle(.forestDanger) }
                if sensitiveChange { SecureField("Current password", text: $currentPassword) }
                if let username = profile?.username { Text("Username: \(username) (cannot be changed)").font(.forest(13)).foregroundStyle(.forestSecondary) }
                DatePicker("Daily briefing", selection: $briefingTime, displayedComponents: .hourAndMinute)
                Button("Save Changes") { Task {
                    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "HH:mm"
                    let update = BackendModels.ProfileUpdate(displayName: name.trimmingCharacters(in: .whitespacesAndNewlines),
                        email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password.isEmpty ? nil : password,
                        currentPassword: sensitiveChange ? currentPassword : nil, briefingTime: formatter.string(from: briefingTime))
                    if await model.updateProfile(update) { password = ""; repeatedPassword = ""; currentPassword = "" }
                } }.foregroundStyle(.forestAccent).disabled(!emailValid || !passwordValid || (sensitiveChange && currentPassword.isEmpty))
            }
            if let pending = profile?.pendingEmail {
                Section("CONFIRM YOUR NEW EMAIL") {
                    Text("Enter the 6-digit code sent to \(pending). You can keep using \(profile?.email ?? "your current email") until it is confirmed.").font(.forest(13)).foregroundStyle(.forestSecondary)
                    TextField("6-digit code", text: $code).keyboardType(.numberPad).onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(6)) }
                    Button("Confirm email") { Task { if await model.verifyEmailChange(code: code) { code = "" } } }.disabled(code.count != 6)
                }
            }
            if let notice = model.notice { Text(notice).foregroundStyle(.forestSuccess) }
            if let error = model.error { Text(error).foregroundStyle(.forestDanger) }
        }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Edit profile").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }.task { await model.loadProfile(); if !initialized, let profile { name = profile.displayName ?? ""; email = profile.email ?? ""; if let time = profile.briefingTime { let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.dateFormat = "HH:mm"; briefingTime = parser.date(from: time) ?? briefingTime }; initialized = true } } }
    }
}

struct TastePreferencesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var preferences = BackendModels.Preferences(styles: [], regions: [], grapes: [], likes: "", dislikes: "")
    @State private var loaded = false
    private let groups: [(String, [String])] = [
        ("Styles", ["Red", "White", "Rosé", "Sparkling", "Dessert"]),
        ("Regions", ["Bordeaux", "Burgundy", "Champagne", "Rhône", "Piedmont", "Tuscany", "Rioja", "Mosel", "Napa", "Mendoza"]),
        ("Grapes", ["Cabernet Sauvignon", "Pinot Noir", "Nebbiolo", "Syrah", "Sangiovese", "Tempranillo", "Chardonnay", "Riesling", "Sauvignon Blanc", "Grenache"])
    ]
    var body: some View {
        NavigationStack { ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("Taste preferences").font(.forest(28)).foregroundStyle(.forestPrimary)
                Text("The sommeliers use these when they recommend wines for you.").font(.forest(14)).foregroundStyle(.forestSecondary)
                ForEach(groups, id: \.0) { title, choices in
                    Text(title.uppercased()).overline()
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], spacing: 10) {
                        ForEach(choices, id: \.self) { item in
                            let selected = chosen(in: title).contains(item)
                            Button(item) { Task { await toggle(item, in: title) } }.font(.forest(14))
                                .padding(12).frame(maxWidth: .infinity).background(selected ? Color.forestAccentSoft : .forestSurface, in: Capsule())
                                .foregroundStyle(selected ? Color.forestAccent : Color.forestSecondary).overlay(Capsule().stroke(.forestHairline))
                        }
                    }
                }
                Text("ANYTHING YOU AVOID").overline()
                TextField("e.g. very oaky whites", text: Binding(get: { preferences.dislikes ?? "" }, set: { preferences.dislikes = $0 })).forestField()
                Button("Save preferences") { Task { _ = await model.updateProfile(BackendModels.ProfileUpdate(preferences: preferences)) } }.buttonStyle(ForestPrimaryButton())
                if let error = model.error { Text(error).font(.forest(13)).foregroundStyle(.forestDanger) }
            }.padding(24)
        }.background { Color.forestBackground.ignoresSafeArea() }.navigationTitle("Taste preferences").task { await model.loadProfile(); if !loaded, let saved = model.backendUser?.preferences { preferences = BackendModels.Preferences(styles: saved.styles ?? [], regions: saved.regions ?? [], grapes: saved.grapes ?? [], likes: saved.likes ?? "", dislikes: saved.dislikes ?? ""); loaded = true } } }
    }

    private func chosen(in group: String) -> [String] {
        switch group { case "Styles": preferences.styles ?? []; case "Regions": preferences.regions ?? []; default: preferences.grapes ?? [] }
    }
    private func toggle(_ item: String, in group: String) async {
        var selected = chosen(in: group)
        if selected.contains(item) { selected.removeAll { $0 == item } } else { selected.append(item) }
        if group == "Styles" { preferences.styles = selected } else if group == "Regions" { preferences.regions = selected } else { preferences.grapes = selected }
        _ = await model.updateProfile(BackendModels.ProfileUpdate(preferences: preferences))
    }
}

struct PrivacyAndDataView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingDelete = false
    @State private var policyKey: String?
    var body: some View {
        NavigationStack { Form {
            Section("PRIVACY & DATA") {
                Button("Export my data") { Task { if let data = await model.export(), let text = String(data: data, encoding: .utf8) { UIPasteboard.general.string = text; model.notice = "Export copied to clipboard." } } }
                Button("Delete account") { showingDelete = true }.foregroundStyle(.forestDanger)
                Text("Deleting your account permanently removes your server account and its data.").font(.forest(13)).foregroundStyle(.forestSecondary)
            }
            Section("CONSENTS") {
                Toggle("News and product emails · Optional", isOn: Binding(get: { model.backendUser?.consents?["marketing"] == true }, set: { value in Task { _ = await model.updateMarketingConsent(value) } }))
                Text("Required consents (terms, privacy and processing outside Korea) can only be withdrawn by deleting your account.").font(.forest(13)).foregroundStyle(.forestSecondary)
            }
            Section("POLICIES") {
                Button("Terms of Service") { policyKey = "terms" }
                Button("Privacy Policy") { policyKey = "privacy" }
            }
            if let notice = model.notice { Text(notice).foregroundStyle(.forestSuccess) }
            if let error = model.error { Text(error).foregroundStyle(.forestDanger) }
        }.scrollContentBackground(.hidden).background(.forestBackground).navigationTitle("Privacy & data").confirmationDialog("Permanently delete your account and data?", isPresented: $showingDelete, titleVisibility: .visible) { Button("Delete account", role: .destructive) { Task { await model.deleteAccount() } } } }
            .task { await model.loadProfile(); if model.legalInfo == nil { await model.loadLegalInfo() } }
            .sheet(isPresented: Binding(get: { policyKey != nil }, set: { if !$0 { policyKey = nil } })) {
                let key = policyKey ?? "terms"
                PolicyViewer(title: key == "terms" ? "Terms of Service" : "Privacy Policy", markdown: model.legalInfo?.documents?[key] ?? "")
            }
    }
}
