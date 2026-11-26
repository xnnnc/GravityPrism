import Foundation
#if canImport(Darwin)
import Darwin
#endif

struct FrameContextMeta {
    let frameId: String
    let isDefault: Bool
    let contextType: String
}

final class AttachedEntry {
    let session: CdpSession
    var scriptId: String?
    var omniScriptId: String?
    var thoughtScriptId: String?
    var inlineDiffScriptId: String?
    let title: String
    private let ctxLock = NSLock()
    var mainFrameId: String = ""
    var hasFrameTree: Bool = false
    var contextFrames: [Int: FrameContextMeta] = [:]

    init(session: CdpSession, scriptId: String? = nil, omniScriptId: String? = nil, thoughtScriptId: String? = nil, inlineDiffScriptId: String? = nil, title: String) {
        self.session = session
        self.scriptId = scriptId
        self.omniScriptId = omniScriptId
        self.thoughtScriptId = thoughtScriptId
        self.inlineDiffScriptId = inlineDiffScriptId
        self.title = title
    }

    func setMainFrame(_ id: String) {
        guard !id.isEmpty else { return }
        ctxLock.lock()
        mainFrameId = id
        hasFrameTree = true
        ctxLock.unlock()
    }

    func recordContext(id: Int, meta: FrameContextMeta) {
        ctxLock.lock()
        contextFrames[id] = meta
        ctxLock.unlock()
    }

    func removeContext(id: Int) {
        ctxLock.lock()
        contextFrames.removeValue(forKey: id)
        ctxLock.unlock()
    }

    func clearContexts() {
        ctxLock.lock()
        contextFrames.removeAll()
        ctxLock.unlock()
    }

    func isTrustedMainFrameBinding(_ params: [String: JsonValue]) -> Bool {
        ctxLock.lock()
        defer { ctxLock.unlock() }
        if let ctxId = params["executionContextId"]?.intValue,
           let meta = contextFrames[ctxId] {
            if !meta.isDefault { return false }
            if !meta.contextType.isEmpty && meta.contextType != "default" { return false }
            if !mainFrameId.isEmpty && !meta.frameId.isEmpty && meta.frameId != mainFrameId {
                return false
            }
            return true
        }
        if hasFrameTree {
            if params["executionContextId"]?.intValue == nil { return false }
            if !contextFrames.isEmpty { return false }
        }
        return true
    }
}

final class WatcherApp {
    private let baseDir: String
    private let pluginDir: String
    private let logFile: String
    private let pidFile: String
    private let lockFile: String
    private let isWatch: Bool
    private let noNativeDaemon: Bool
    private let noRelaunchPrompt: Bool
    private let logLock = NSLock()
    private let promptedHostsLock = NSLock()
    private var promptedHostKeys: Set<String> = []

    init(baseDir: String, pluginDir: String, isWatch: Bool, noNativeDaemon: Bool = false, noRelaunchPrompt: Bool = false) {
        self.baseDir = baseDir
        self.pluginDir = pluginDir
        self.logFile = (baseDir as NSString).appendingPathComponent("watch.log")
        self.pidFile = (baseDir as NSString).appendingPathComponent(".watch.pid")
        self.lockFile = (baseDir as NSString).appendingPathComponent(".watch.lock")
        self.isWatch = isWatch
        self.noNativeDaemon = noNativeDaemon || (ProcessInfo.processInfo.environment["AG_PRISM_NO_NATIVE_DAEMON"] == "1")
        self.noRelaunchPrompt = noRelaunchPrompt
    }

    func log(_ line: String) {
        guard isWatch else { return }
        logLock.lock()
        defer { logLock.unlock() }
        let fm = FileManager.default
        if let attrs = try? fm.attributesOfItem(atPath: logFile),
           let size = attrs[.size] as? NSNumber,
           size.int64Value > 1024 * 1024 {
            try? "".write(toFile: logFile, atomically: false, encoding: .utf8)
        }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let entry = "[\(fmt.string(from: Date()))] \(line)\n"
        guard let data = entry.data(using: .utf8) else { return }
        if !fm.fileExists(atPath: logFile) {
            fm.createFile(atPath: logFile, contents: data, attributes: nil)
            return
        }
        if let handle = FileHandle(forWritingAtPath: logFile) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        }
    }

    static func writeResult(outFile: String?, ok: Bool, message: String, pages: [String]?) {
        guard let outFile = outFile, !outFile.isEmpty else { return }
        var obj: [String: JsonValue] = [
            "ok": .bool(ok),
            "message": .string(message)
        ]
        if let pages = pages {
            obj["pages"] = .array(pages.map { .string($0) })
        }
        let text = MiniJson.stringify(.object(obj), pretty: true) + "\n"
        try? text.write(toFile: outFile, atomically: true, encoding: .utf8)
    }

    private func readPidFile() -> Int32? {
        guard let text = try? String(contentsOfFile: pidFile, encoding: .utf8) else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let pid = Int32(trimmed), pid > 0 { return pid }
        return nil
    }

    private func releasePidFile(selfPid: Int32) {
        if let current = readPidFile(), current == selfPid {
            try? FileManager.default.removeItem(atPath: pidFile)
        }
    }

    func runOnce(overridePort: Int?, outFile: String?) -> Int32 {
        do {
            let manifest = try PluginManifest.load(baseDir: baseDir)
            guard let port = CdpHelper.readPort(overridePort: overridePort) else {
                Self.writeResult(
                    outFile: outFile,
                    ok: false,
                    message: InstallerI18n.tr(
                        "未找到调试端口文件，Antigravity 可能未运行",
                        "Debug port file not found; Antigravity may not be running"
                    ),
                    pages: nil
                )
                return 1
            }
            let pages = try CdpHelper.listPages(port: port)
            if pages.isEmpty {
                Self.writeResult(
                    outFile: outFile,
                    ok: false,
                    message: InstallerI18n.tr(
                        "未找到 Antigravity 窗口页面",
                        "No Antigravity window pages found"
                    ),
                    pages: nil
                )
                return 1
            }
            let onceCfg = CdpHelper.readConfig(baseDir: baseDir, manifest: manifest)
            let expr = try CdpHelper.buildInjectExpression(baseDir: baseDir, manifest: manifest)
            let omniExpr = CdpHelper.buildOmniClientExpression(baseDir: baseDir, manifest: manifest)
            let thoughtExpr = CdpHelper.shouldEnableThought(onceCfg)
                ? CdpHelper.buildThoughtExpression(baseDir: baseDir, cfg: onceCfg)
                : ""
            let inlineDiffExpr = CdpHelper.buildInlineDiffExpression(baseDir: baseDir, cfg: onceCfg)
            var injectedTitles: [String] = []
            for page in pages {
                let session = try CdpSession.connect(wsUrl: page.webSocketDebuggerUrl, timeoutMs: 4000)
                defer { session.close() }
                _ = try session.evaluate(expr, awaitPromise: false)
                if !omniExpr.isEmpty {
                    _ = try? session.evaluate(omniExpr, awaitPromise: false)
                }
                if !thoughtExpr.isEmpty {
                    _ = try? session.evaluate(thoughtExpr, awaitPromise: false)
                }
                if !inlineDiffExpr.isEmpty {
                    _ = try? session.evaluate(inlineDiffExpr, awaitPromise: false)
                }
                injectedTitles.append(CdpHelper.shortTitle(page))
            }
            Self.writeResult(outFile: outFile, ok: true, message: "injected \(injectedTitles.count) page(s)", pages: injectedTitles)
            return 0
        } catch {
            Self.writeResult(outFile: outFile, ok: false, message: error.localizedDescription, pages: nil)
            return 1
        }
    }

    func runRemove(overridePort: Int?, outFile: String?) -> Int32 {
        let manifest = try? PluginManifest.load(baseDir: baseDir)
        stopRunningWatcherInDir()
        var cleaned: [String] = []
        if let port = CdpHelper.readPort(overridePort: overridePort),
           let removeExpr = manifest?.removeExpression,
           !removeExpr.isEmpty,
           let pages = try? CdpHelper.listPages(port: port) {
            for page in pages {
                if let session = try? CdpSession.connect(wsUrl: page.webSocketDebuggerUrl, timeoutMs: 3000) {
                    defer { session.close() }
                    if (try? session.evaluate(removeExpr, awaitPromise: false)) != nil {
                        cleaned.append(CdpHelper.shortTitle(page))
                    }
                }
            }
        }
        Self.writeResult(outFile: outFile, ok: true, message: "removed from \(cleaned.count) page(s)", pages: cleaned)
        return 0
    }

    private func stopRunningWatcherInDir() {
        let selfPid = getpid()
        if let pid = readPidFile(), pid != selfPid {
            if kill(pid, 0) == 0 && CdpHelper.isExpectedDaemonProcess(pid: pid) {
                _ = kill(pid, SIGTERM)
                let deadline = Date().addingTimeInterval(2.0)
                while Date() < deadline {
                    if kill(pid, 0) != 0 { break }
                    Thread.sleep(forTimeInterval: 0.05)
                }
                if kill(pid, 0) == 0 {
                    _ = kill(pid, SIGKILL)
                    Thread.sleep(forTimeInterval: 0.1)
                }
            }
        }
        try? FileManager.default.removeItem(atPath: pidFile)
    }

    private func computeDirStamp() -> [String: String] {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: baseDir) else { return [:] }
        var stamp: [String: String] = [:]
        for name in names {
            if name.hasPrefix(".") { continue }
            let lower = name.lowercased()
            if !lower.hasSuffix(".css") && !lower.hasSuffix(".js") && !lower.hasSuffix(".json") {
                continue
            }
            let full = (baseDir as NSString).appendingPathComponent(name)
            if let attrs = try? fm.attributesOfItem(atPath: full) {
                let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
                let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
                stamp[name] = "\(mtime):\(size)"
            }
        }
        for vendorRel in [
            "vendor/omni-viewer/omni-client.js",
            "vendor/thought-translator/thought-client.js",
            "vendor/thought-translator/thought-settings-ui.js",
            "vendor/inline-diff/inline-diff-client.js",
        ] {
            let vendorFull = (baseDir as NSString).appendingPathComponent(vendorRel)
            if let attrs = try? fm.attributesOfItem(atPath: vendorFull) {
                let mtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
                let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
                stamp[vendorRel] = "\(mtime):\(size)"
            }
        }
        return stamp
    }

    private func firstChangedFile(oldStamp: [String: String], newStamp: [String: String]) -> String? {
        for (k, v) in newStamp {
            if oldStamp[k] != v { return k }
        }
        for k in oldStamp.keys where newStamp[k] == nil {
            return k
        }
        return nil
    }

    func runWatch(overridePort: Int?) -> Int32 {
        try? FileManager.default.createDirectory(atPath: baseDir, withIntermediateDirectories: true, attributes: nil)
        let lockFd = open(lockFile, O_CREAT | O_RDWR, 0o644)
        if lockFd < 0 {
            return 1
        }
        if flock(lockFd, LOCK_EX | LOCK_NB) != 0 {
            close(lockFd)
            return 0
        }

        let selfPid = getpid()
        try? String(selfPid).write(toFile: pidFile, atomically: true, encoding: .utf8)
        try? "".write(toFile: logFile, atomically: false, encoding: .utf8)

        var manifest: PluginManifest
        var currentExpr: String
        var currentOmniExpr: String
        var currentThoughtExpr: String
        var currentInlineDiffExpr: String
        do {
            manifest = try PluginManifest.load(baseDir: baseDir)
            let initCfg = CdpHelper.readConfig(baseDir: baseDir, manifest: manifest)
            currentExpr = try CdpHelper.buildInjectExpression(baseDir: baseDir, manifest: manifest)
            currentOmniExpr = CdpHelper.buildOmniClientExpression(baseDir: baseDir, manifest: manifest)
            currentThoughtExpr = CdpHelper.shouldEnableThought(initCfg)
                ? CdpHelper.buildThoughtExpression(baseDir: baseDir, cfg: initCfg)
                : ""
            currentInlineDiffExpr = CdpHelper.buildInlineDiffExpression(baseDir: baseDir, cfg: initCfg)
        } catch {
            log(InstallerI18n.tr(
                "[!] 初始化加载失败: \(error.localizedDescription)",
                "[!] Failed to initialize: \(error.localizedDescription)"
            ))
            releasePidFile(selfPid: selfPid)
            flock(lockFd, LOCK_UN)
            close(lockFd)
            return 1
        }

        log(InstallerI18n.tr(
            "[*] Obsidian Prism (obsidian-prism) 守护模式启动 (PID \(selfPid))，每 2 秒检查一次窗口",
            "[*] Obsidian Prism (obsidian-prism) watcher started (PID \(selfPid)), polling windows every 2s"
        ))

        let stateLock = NSLock()
        var attached: [String: AttachedEntry] = [:]
        var attaching: Set<String> = []
        var lastDirStamp = computeDirStamp()

        let exitSem = DispatchSemaphore(value: 0)
        var shouldExit = false
        let exitLock = NSLock()
        let requestExit = {
            exitLock.lock()
            let already = shouldExit
            shouldExit = true
            exitLock.unlock()
            if !already {
                exitSem.signal()
            }
        }
        let isExiting: () -> Bool = {
            exitLock.lock()
            let v = shouldExit
            exitLock.unlock()
            return v
        }

        signal(SIGTERM, SIG_IGN)
        signal(SIGINT, SIG_IGN)
        let sigQueue = DispatchQueue(label: "io.github.rmvdesi.obsidian-prism.signals")
        let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: sigQueue)
        termSource.setEventHandler(handler: requestExit)
        termSource.resume()
        let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: sigQueue)
        intSource.setEventHandler(handler: requestExit)
        intSource.resume()

        let applyToEntry: (AttachedEntry, String, String, String, String) throws -> JsonValue = { entry, exprToUse, omniExprToUse, thoughtExprToUse, inlineDiffExprToUse in
            if let oldId = entry.scriptId, !oldId.isEmpty {
                _ = try? entry.session.send(
                    "Page.removeScriptToEvaluateOnNewDocument",
                    params: ["identifier": .string(oldId)],
                    timeoutMs: 5000
                )
            }
            let addRes = try entry.session.send(
                "Page.addScriptToEvaluateOnNewDocument",
                params: ["source": .string(exprToUse)],
                timeoutMs: 15000
            )
            if let newId = addRes["identifier"]?.stringValue {
                entry.scriptId = newId
            }
            let mainVal = try entry.session.evaluate(exprToUse, awaitPromise: false)
            if mainVal.objectValue?["status"]?.stringValue == "skipped-non-host" {
                if let revId = entry.scriptId, !revId.isEmpty {
                    _ = try? entry.session.send(
                        "Page.removeScriptToEvaluateOnNewDocument",
                        params: ["identifier": .string(revId)],
                        timeoutMs: 5000
                    )
                    entry.scriptId = nil
                }
                if let oldOmniId = entry.omniScriptId, !oldOmniId.isEmpty {
                    _ = try? entry.session.send(
                        "Page.removeScriptToEvaluateOnNewDocument",
                        params: ["identifier": .string(oldOmniId)],
                        timeoutMs: 5000
                    )
                    entry.omniScriptId = nil
                }
                if let oldThoughtId = entry.thoughtScriptId, !oldThoughtId.isEmpty {
                    _ = try? entry.session.send(
                        "Page.removeScriptToEvaluateOnNewDocument",
                        params: ["identifier": .string(oldThoughtId)],
                        timeoutMs: 5000
                    )
                    entry.thoughtScriptId = nil
                }
                if let oldInlineId = entry.inlineDiffScriptId, !oldInlineId.isEmpty {
                    _ = try? entry.session.send(
                        "Page.removeScriptToEvaluateOnNewDocument",
                        params: ["identifier": .string(oldInlineId)],
                        timeoutMs: 5000
                    )
                    entry.inlineDiffScriptId = nil
                }
                return mainVal
            }

            if let oldOmniId = entry.omniScriptId, !oldOmniId.isEmpty {
                _ = try? entry.session.send(
                    "Page.removeScriptToEvaluateOnNewDocument",
                    params: ["identifier": .string(oldOmniId)],
                    timeoutMs: 5000
                )
                entry.omniScriptId = nil
            }
            if !omniExprToUse.isEmpty {
                if let omniRes = try? entry.session.send(
                    "Page.addScriptToEvaluateOnNewDocument",
                    params: ["source": .string(omniExprToUse)],
                    timeoutMs: 15000
                ), let omniId = omniRes["identifier"]?.stringValue {
                    entry.omniScriptId = omniId
                }
                _ = try? entry.session.evaluate(omniExprToUse, awaitPromise: false)
            }

            let hadThought = (entry.thoughtScriptId?.isEmpty == false)
            if let oldThoughtId = entry.thoughtScriptId, !oldThoughtId.isEmpty {
                _ = try? entry.session.send(
                    "Page.removeScriptToEvaluateOnNewDocument",
                    params: ["identifier": .string(oldThoughtId)],
                    timeoutMs: 5000
                )
                entry.thoughtScriptId = nil
            }
            if !thoughtExprToUse.isEmpty {
                if let thoughtRes = try? entry.session.send(
                    "Page.addScriptToEvaluateOnNewDocument",
                    params: ["source": .string(thoughtExprToUse)],
                    timeoutMs: 15000
                ), let thoughtId = thoughtRes["identifier"]?.stringValue {
                    entry.thoughtScriptId = thoughtId
                }
                _ = try? entry.session.evaluate(thoughtExprToUse, awaitPromise: false)
            } else if hadThought {
                _ = try? entry.session.evaluate(CdpHelper.thoughtRemoveExpression, awaitPromise: false)
            }

            let hadInlineDiff = (entry.inlineDiffScriptId?.isEmpty == false)
            if let oldInlineId = entry.inlineDiffScriptId, !oldInlineId.isEmpty {
                _ = try? entry.session.send(
                    "Page.removeScriptToEvaluateOnNewDocument",
                    params: ["identifier": .string(oldInlineId)],
                    timeoutMs: 5000
                )
                entry.inlineDiffScriptId = nil
            }
            if !inlineDiffExprToUse.isEmpty {
                if let inlineRes = try? entry.session.send(
                    "Page.addScriptToEvaluateOnNewDocument",
                    params: ["source": .string(inlineDiffExprToUse)],
                    timeoutMs: 15000
                ), let inlineId = inlineRes["identifier"]?.stringValue {
                    entry.inlineDiffScriptId = inlineId
                }
                _ = try? entry.session.evaluate(inlineDiffExprToUse, awaitPromise: false)
            } else if hadInlineDiff {
                _ = try? entry.session.evaluate(CdpHelper.inlineDiffRemoveExpression, awaitPromise: false)
            }
            return mainVal
        }

        let attachPage: (CdpPageInfo) -> Void = { page in
            stateLock.lock()
            if attached[page.id] != nil || attaching.contains(page.id) {
                stateLock.unlock()
                return
            }
            attaching.insert(page.id)
            stateLock.unlock()

            var session: CdpSession?
            do {
                let s = try CdpSession.connect(wsUrl: page.webSocketDebuggerUrl, timeoutMs: 4000)
                session = s
                let title = CdpHelper.shortTitle(page)
                let entry = AttachedEntry(session: s, scriptId: nil, title: title)

                s.onClose = {
                    stateLock.lock()
                    let removed = attached.removeValue(forKey: page.id)
                    stateLock.unlock()
                    if let removed = removed {
                        self.log(InstallerI18n.tr(
                            "[-] 窗口已关闭: \(removed.title)",
                            "[-] Window closed: \(removed.title)"
                        ))
                    }
                }

                s.on("Runtime.executionContextCreated") { cp in
                    guard let ctx = cp["context"]?.objectValue,
                          let cid = ctx["id"]?.intValue else { return }
                    let aux = ctx["auxData"]?.objectValue ?? [:]
                    let fid = aux["frameId"]?.stringValue ?? ""
                    let isDef = aux["isDefault"]?.boolValue ?? true
                    let cType = aux["type"]?.stringValue ?? "default"
                    entry.recordContext(id: cid, meta: FrameContextMeta(frameId: fid, isDefault: isDef, contextType: cType))
                }
                s.on("Runtime.executionContextDestroyed") { dp in
                    if let cid = dp["executionContextId"]?.intValue {
                        entry.removeContext(id: cid)
                    }
                }
                s.on("Runtime.executionContextsCleared") { _ in
                    entry.clearContexts()
                }
                s.on("Page.frameNavigated") { fp in
                    if let frame = fp["frame"]?.objectValue {
                        let parentId = frame["parentId"]?.stringValue ?? ""
                        if parentId.isEmpty, let fid = frame["id"]?.stringValue, !fid.isEmpty {
                            entry.setMainFrame(fid)
                        }
                    }
                }

                _ = try s.send("Page.enable", params: nil, timeoutMs: 5000)
                if let ftRes = try? s.send("Page.getFrameTree", params: nil, timeoutMs: 3000),
                   let topId = ftRes["frameTree"]?.objectValue?["frame"]?.objectValue?["id"]?.stringValue,
                   !topId.isEmpty {
                    entry.setMainFrame(topId)
                }
                s.on("Runtime.bindingCalled") { params in
                    guard entry.isTrustedMainFrameBinding(params) else { return }
                    guard let name = params["name"]?.stringValue,
                          let payloadStr = params["payload"]?.stringValue else { return }
                    stateLock.lock()
                    let manifestSnap = manifest
                    stateLock.unlock()
                    guard name == manifestSnap.settingBinding || name == "__agClaudeStyleSetting" else { return }
                    guard let kv = try? MiniJson.parseObject(payloadStr) else { return }

                    if kv["action"]?.stringValue == "patch-batch",
                       let entriesObj = kv["entries"]?.objectValue {
                        if CdpHelper.updateConfigBatch(baseDir: self.baseDir, manifest: manifestSnap, entries: entriesObj) {
                            if !self.pluginDir.isEmpty && FileManager.default.fileExists(atPath: self.pluginDir) {
                                _ = CdpHelper.updateConfigBatch(baseDir: self.pluginDir, manifest: manifestSnap, entries: entriesObj)
                            }
                            self.log(InstallerI18n.tr(
                                "[⚙] 批量设置已保存 (\(entriesObj.count) 项)",
                                "[⚙] Batch settings saved (\(entriesObj.count) items)"
                            ))
                        }
                        return
                    }

                    if let key = kv["key"]?.stringValue,
                       let value = kv["value"] {
                        if CdpHelper.updateConfigSetting(baseDir: self.baseDir, manifest: manifestSnap, key: key, value: value) {
                            if !self.pluginDir.isEmpty && FileManager.default.fileExists(atPath: self.pluginDir) {
                                _ = CdpHelper.updateConfigSetting(baseDir: self.pluginDir, manifest: manifestSnap, key: key, value: value)
                            }
                            let valStr = MiniJson.stringify(value, pretty: false)
                            self.log(InstallerI18n.tr(
                                "[⚙] 设置已保存: \(key) = \(valStr)",
                                "[⚙] Setting saved: \(key) = \(valStr)"
                            ))
                        }
                    }
                }

                _ = try s.send("Runtime.enable", params: nil, timeoutMs: 5000)
                stateLock.lock()
                let bindingName = manifest.settingBinding
                let exprSnap = currentExpr
                let omniSnap = currentOmniExpr
                let thoughtSnap = currentThoughtExpr
                let inlineDiffSnap = currentInlineDiffExpr
                stateLock.unlock()

                _ = try s.send("Runtime.addBinding", params: ["name": .string(bindingName)], timeoutMs: 5000)
                if bindingName != "__agClaudeStyleSetting" {
                    _ = try? s.send("Runtime.addBinding", params: ["name": .string("__agClaudeStyleSetting")], timeoutMs: 5000)
                }

                stateLock.lock()
                attached[page.id] = entry
                attaching.remove(page.id)
                stateLock.unlock()

                let evalVal = try applyToEntry(entry, exprSnap, omniSnap, thoughtSnap, inlineDiffSnap)
                let status = evalVal.objectValue?["status"]?.stringValue ?? "ok"
                self.log(InstallerI18n.tr(
                    "[✓] 已注入 obsidian-prism: \(title) (\(status))",
                    "[✓] Injected obsidian-prism: \(title) (\(status))"
                ))
            } catch {
                stateLock.lock()
                attaching.remove(page.id)
                let removed = attached.removeValue(forKey: page.id)
                stateLock.unlock()
                removed?.session.close()
                session?.close()
                let pageTitle = CdpHelper.shortTitle(page)
                self.log(InstallerI18n.tr(
                    "[!] 注入失败，稍后重试: \(pageTitle) — \(error.localizedDescription)",
                    "[!] Injection failed, will retry: \(pageTitle) — \(error.localizedDescription)"
                ))
            }
        }

        let reloadQueue = DispatchQueue(label: "io.github.rmvdesi.obsidian-prism.reload")
        var pendingReloadWork: DispatchWorkItem?
        var pendingChangedHint: String?

        let performReload: (String?) -> Void = { hintName in
            pendingReloadWork?.cancel()
            pendingReloadWork = nil
            pendingChangedHint = nil

            let currentStamp = self.computeDirStamp()
            stateLock.lock()
            let detectedChange = self.firstChangedFile(oldStamp: lastDirStamp, newStamp: currentStamp)
            if detectedChange == nil {
                stateLock.unlock()
                return
            }
            lastDirStamp = currentStamp
            stateLock.unlock()

            let changedName = detectedChange ?? hintName ?? "config.json"
            do {
                let nextManifest = try PluginManifest.load(baseDir: self.baseDir)
                let nextCfg = CdpHelper.readConfig(baseDir: self.baseDir, manifest: nextManifest)
                let nextExpr = try CdpHelper.buildInjectExpression(baseDir: self.baseDir, manifest: nextManifest)
                let nextOmniExpr = CdpHelper.buildOmniClientExpression(baseDir: self.baseDir, manifest: nextManifest)
                let nextThoughtExpr = CdpHelper.shouldEnableThought(nextCfg)
                    ? CdpHelper.buildThoughtExpression(baseDir: self.baseDir, cfg: nextCfg)
                    : ""
                let nextInlineDiffExpr = CdpHelper.buildInlineDiffExpression(baseDir: self.baseDir, cfg: nextCfg)
                let fastCfgExpr: String? = ((changedName as NSString).lastPathComponent.caseInsensitiveCompare("config.json") == .orderedSame)
                    ? CdpHelper.buildConfigRefreshExpression(baseDir: self.baseDir, manifest: nextManifest)
                    : nil
                stateLock.lock()
                let prevThoughtExpr = currentThoughtExpr
                let prevInlineDiffExpr = currentInlineDiffExpr
                manifest = nextManifest
                currentExpr = nextExpr
                currentOmniExpr = nextOmniExpr
                currentThoughtExpr = nextThoughtExpr
                currentInlineDiffExpr = nextInlineDiffExpr
                let entries = Array(attached.values)
                stateLock.unlock()

                var n = 0
                for entry in entries {
                    if let fastExpr = fastCfgExpr {
                        if let oldId = entry.scriptId, !oldId.isEmpty {
                            _ = try? entry.session.send("Page.removeScriptToEvaluateOnNewDocument", params: ["identifier": .string(oldId)], timeoutMs: 5000)
                            entry.scriptId = nil
                        }
                        if let addRes = try? entry.session.send("Page.addScriptToEvaluateOnNewDocument", params: ["source": .string(nextExpr)], timeoutMs: 15000),
                           let newId = addRes["identifier"]?.stringValue {
                            entry.scriptId = newId
                        }
                        if let oldOmniId = entry.omniScriptId, !oldOmniId.isEmpty {
                            _ = try? entry.session.send("Page.removeScriptToEvaluateOnNewDocument", params: ["identifier": .string(oldOmniId)], timeoutMs: 5000)
                            entry.omniScriptId = nil
                        }
                        if !nextOmniExpr.isEmpty,
                           let omniAdd = try? entry.session.send("Page.addScriptToEvaluateOnNewDocument", params: ["source": .string(nextOmniExpr)], timeoutMs: 15000),
                           let omniId = omniAdd["identifier"]?.stringValue {
                            entry.omniScriptId = omniId
                        }
                        let hadThought = (entry.thoughtScriptId?.isEmpty == false) || !prevThoughtExpr.isEmpty
                        if let oldThoughtId = entry.thoughtScriptId, !oldThoughtId.isEmpty {
                            _ = try? entry.session.send("Page.removeScriptToEvaluateOnNewDocument", params: ["identifier": .string(oldThoughtId)], timeoutMs: 5000)
                            entry.thoughtScriptId = nil
                        }
                        if !nextThoughtExpr.isEmpty,
                           let thoughtAdd = try? entry.session.send("Page.addScriptToEvaluateOnNewDocument", params: ["source": .string(nextThoughtExpr)], timeoutMs: 15000),
                           let thoughtId = thoughtAdd["identifier"]?.stringValue {
                            entry.thoughtScriptId = thoughtId
                        }
                        let hadInlineDiff = (entry.inlineDiffScriptId?.isEmpty == false) || !prevInlineDiffExpr.isEmpty
                        if let oldInlineId = entry.inlineDiffScriptId, !oldInlineId.isEmpty {
                            _ = try? entry.session.send("Page.removeScriptToEvaluateOnNewDocument", params: ["identifier": .string(oldInlineId)], timeoutMs: 5000)
                            entry.inlineDiffScriptId = nil
                        }
                        if !nextInlineDiffExpr.isEmpty,
                           let inlineAdd = try? entry.session.send("Page.addScriptToEvaluateOnNewDocument", params: ["source": .string(nextInlineDiffExpr)], timeoutMs: 15000),
                           let inlineId = inlineAdd["identifier"]?.stringValue {
                            entry.inlineDiffScriptId = inlineId
                        }
                        if let fastRes = try? entry.session.evaluate(fastExpr, awaitPromise: false),
                           fastRes.objectValue?["refreshed"]?.boolValue == true {
                            if !nextOmniExpr.isEmpty {
                                _ = try? entry.session.evaluate(nextOmniExpr, awaitPromise: false)
                            }
                            if !nextThoughtExpr.isEmpty {
                                _ = try? entry.session.evaluate(nextThoughtExpr, awaitPromise: false)
                            } else if hadThought {
                                _ = try? entry.session.evaluate(CdpHelper.thoughtRemoveExpression, awaitPromise: false)
                            }
                            if !nextInlineDiffExpr.isEmpty {
                                _ = try? entry.session.evaluate(nextInlineDiffExpr, awaitPromise: false)
                            } else if hadInlineDiff {
                                _ = try? entry.session.evaluate(CdpHelper.inlineDiffRemoveExpression, awaitPromise: false)
                            }
                            n += 1
                            continue
                        }
                        if (try? entry.session.evaluate(nextExpr, awaitPromise: false)) != nil {
                            if !nextOmniExpr.isEmpty {
                                _ = try? entry.session.evaluate(nextOmniExpr, awaitPromise: false)
                            }
                            if !nextThoughtExpr.isEmpty {
                                _ = try? entry.session.evaluate(nextThoughtExpr, awaitPromise: false)
                            } else if hadThought {
                                _ = try? entry.session.evaluate(CdpHelper.thoughtRemoveExpression, awaitPromise: false)
                            }
                            if !nextInlineDiffExpr.isEmpty {
                                _ = try? entry.session.evaluate(nextInlineDiffExpr, awaitPromise: false)
                            } else if hadInlineDiff {
                                _ = try? entry.session.evaluate(CdpHelper.inlineDiffRemoveExpression, awaitPromise: false)
                            }
                            n += 1
                        }
                    } else {
                        if (try? applyToEntry(entry, nextExpr, nextOmniExpr, nextThoughtExpr, nextInlineDiffExpr)) != nil {
                            n += 1
                        }
                    }
                }
                self.log(InstallerI18n.tr(
                    "[↻] \(changedName) 已变更，已热更新 \(n) 个窗口",
                    "[↻] \(changedName) changed, hot-reloaded \(n) window(s)"
                ))
            } catch {
                self.log(InstallerI18n.tr(
                    "[!] 读取文件失败: \(error.localizedDescription)",
                    "[!] Failed to read file: \(error.localizedDescription)"
                ))
            }
        }

        let scheduleReload: (String?) -> Void = { hintName in
            reloadQueue.async {
                if let hint = hintName { pendingChangedHint = hint }
                pendingReloadWork?.cancel()
                let work = DispatchWorkItem {
                    let hint = pendingChangedHint
                    pendingChangedHint = nil
                    performReload(hint)
                }
                pendingReloadWork = work
                reloadQueue.asyncAfter(deadline: .now() + .milliseconds(180), execute: work)
            }
        }

        var dirSource: DispatchSourceFileSystemObject?
        let dirFd = open(baseDir, O_EVTONLY)
        if dirFd >= 0 {
            let src = DispatchSource.makeFileSystemObjectSource(fileDescriptor: dirFd, eventMask: [.write, .rename, .extend, .delete], queue: reloadQueue)
            src.setEventHandler {
                let currentStamp = self.computeDirStamp()
                stateLock.lock()
                let changed = self.firstChangedFile(oldStamp: lastDirStamp, newStamp: currentStamp)
                stateLock.unlock()
                if let changed = changed {
                    scheduleReload(changed)
                }
            }
            src.setCancelHandler {
                close(dirFd)
            }
            src.resume()
            dirSource = src
        }

        let syncNewerPluginConfigToBase = {
            guard !self.pluginDir.isEmpty else { return }
            let pluginCfg = (self.pluginDir as NSString).appendingPathComponent("config.json")
            let baseCfg = (self.baseDir as NSString).appendingPathComponent("config.json")
            let fm = FileManager.default
            guard fm.fileExists(atPath: pluginCfg) else { return }
            if !fm.fileExists(atPath: baseCfg) {
                try? fm.copyItem(atPath: pluginCfg, toPath: baseCfg)
                return
            }
            if let pAttrs = try? fm.attributesOfItem(atPath: pluginCfg),
               let bAttrs = try? fm.attributesOfItem(atPath: baseCfg),
               let pMtime = pAttrs[.modificationDate] as? Date,
               let bMtime = bAttrs[.modificationDate] as? Date,
               pMtime.timeIntervalSince(bMtime) > 0.25 {
                try? fm.removeItem(atPath: baseCfg)
                try? fm.copyItem(atPath: pluginCfg, toPath: baseCfg)
            }
        }

        let defaultMacInstallDir = URL(
            fileURLWithPath: (FileManager.default.homeDirectoryForCurrentUser.path as NSString)
                .appendingPathComponent("Library/Application Support/obsidian-prism")
        ).standardizedFileURL.path
        let isDefaultDir = (self.baseDir == defaultMacInstallDir)

        var lastPort: Int?
        var lastLoggedStalePort: Int?
        var yieldingToDaemon = false
        var hadLiveHost = false
        var exitArchiveInFlight = false
        var lastDaemonSpawnAttempt = Date.distantPast
        while !isExiting() {
            var nativeAlive = !pluginDir.isEmpty && CdpHelper.isNativeDaemonAlive(pluginDir: pluginDir)
            var rawPort: Int? = nil
            var livePort: Int? = nil
            var livePages: [CdpPageInfo]? = nil
            if !nativeAlive {
                rawPort = CdpHelper.readPort(overridePort: overridePort)
                if let rp = rawPort {
                    if let probed = try? CdpHelper.listPages(port: rp) {
                        livePort = rp
                        livePages = probed
                    }
                }
                if !noNativeDaemon && !pluginDir.isEmpty {
                    if let activeLivePort = livePort,
                       Date().timeIntervalSince(lastDaemonSpawnAttempt) >= 6.0 {
                        lastDaemonSpawnAttempt = Date()
                        if CdpHelper.ensureNativeDaemonRunning(pluginDir: pluginDir, cdpPort: activeLivePort, log: { msg in
                            self.log("[+] \(msg)")
                        }) {
                            nativeAlive = true
                        }
                    }
                }
            }
            if nativeAlive {
                if !hadLiveHost,
                   let rp = CdpHelper.readPort(overridePort: overridePort),
                   (try? CdpHelper.listPages(port: rp)) != nil {
                    hadLiveHost = true
                }
                syncNewerPluginConfigToBase()
                stateLock.lock()
                let hasAttached = !attached.isEmpty
                let oldEntries = Array(attached.values)
                attached.removeAll()
                stateLock.unlock()
                if !yieldingToDaemon || hasAttached {
                    for oldEntry in oldEntries {
                        oldEntry.session.close()
                    }
                    lastPort = nil
                    lastLoggedStalePort = nil
                    if !yieldingToDaemon {
                        yieldingToDaemon = true
                        log(InstallerI18n.tr(
                            "[~] 检测到原生 Sidecar Daemon 运行中，Watcher 进入热备避让态",
                            "[~] Native Sidecar Daemon is active; Watcher entering standby mode"
                        ))
                    }
                }
                _ = exitSem.wait(timeout: .now() + .milliseconds(750))
                continue
            }
            if yieldingToDaemon {
                yieldingToDaemon = false
                log(InstallerI18n.tr(
                    "[+] 原生 Sidecar Daemon 已离线，Watcher 接管实时注入",
                    "[+] Native Sidecar Daemon went offline; Watcher taking over live injection"
                ))
            }

            // Poll fallback for in-place edits that don't fire directory vnode write events
            reloadQueue.sync {
                performReload(nil)
            }

            if let stalePort = rawPort, livePort == nil {
                if lastLoggedStalePort != stalePort {
                    lastLoggedStalePort = stalePort
                    log(InstallerI18n.tr(
                        "[!] 检测到残留无效调试端口 \(stalePort)（连接被拒绝/超时），视作无有效端口并转入裸启恢复检测",
                        "[!] Detected stale debug port \(stalePort) (connection refused/timed out); treating as inactive and checking for bare host recovery"
                    ))
                }
                stateLock.lock()
                let staleEntries = Array(attached.values)
                attached.removeAll()
                stateLock.unlock()
                for oldEntry in staleEntries {
                    oldEntry.session.close()
                }
                lastPort = nil
            } else {
                lastLoggedStalePort = nil
            }

            if livePort == nil && hadLiveHost {
                hadLiveHost = false
                if overridePort == nil && self.isAutoArchiveOnExitAllowed() && self.isAutoArchiveOnExitEnabled() {
                    stateLock.lock()
                    let shouldLaunch = !exitArchiveInFlight
                    if shouldLaunch { exitArchiveInFlight = true }
                    stateLock.unlock()
                    if shouldLaunch {
                        DispatchQueue.global(qos: .utility).async {
                            defer {
                                stateLock.lock()
                                exitArchiveInFlight = false
                                stateLock.unlock()
                            }
                            self.runAutoArchiveOnExitFallback(overridePort: overridePort, isExiting: isExiting)
                        }
                    }
                }
            }

            if livePort == nil && overridePort == nil {
                let env = ProcessInfo.processInfo.environment
                let mockDec = env["AG_PRISM_MOCK_RELAUNCH_DECISION"] ?? ""
                var allowPrompt = !self.noRelaunchPrompt &&
                    env["PRISM_NO_RELAUNCH_PROMPT"] != "1" &&
                    env["AG_PRISM_NO_RELAUNCH_PROMPT"] != "1" &&
                    (env["NODE_ENV"] ?? "").caseInsensitiveCompare("test") != .orderedSame &&
                    ((env["NODE_TEST_CONTEXT"] ?? "").isEmpty) &&
                    (isDefaultDir || !self.isTempSandboxDir(self.baseDir) || !mockDec.isEmpty)
                if allowPrompt {
                    stateLock.lock()
                    let mSnap = manifest
                    stateLock.unlock()
                    let curCfg = CdpHelper.readConfig(baseDir: self.baseDir, manifest: mSnap)
                    if let autoVal = curCfg["autoPromptCdpRelaunch"] {
                        if autoVal.boolValue == false { allowPrompt = false }
                        else if let s = autoVal.stringValue?.lowercased(), (s == "off" || s == "false") { allowPrompt = false }
                    }
                }
                if allowPrompt,
                   let bare = CdpHelper.findBareAntigravityMainProcess(),
                   bare.uptimeMs >= 8000 {
                    let hostVersion = self.readHostAppVersion(appPath: bare.appPath)
                    if !self.hasPromptedForHostWithVersion(bare: bare, hostVersion: hostVersion) {
                        self.recordPromptedForHostWithVersion(bare: bare, hostVersion: hostVersion, decision: "prompted")
                        let confirmed = CdpHelper.promptUserForCdpRelaunch()
                        self.recordPromptedForHostWithVersion(bare: bare, hostVersion: hostVersion, decision: confirmed ? "yes" : "no")
                        if confirmed {
                            let verLabel = hostVersion.isEmpty ? "unknown" : hostVersion
                            log(InstallerI18n.tr(
                                "[*] 用户确认带 --remote-debugging-port=0 重新打开 Antigravity (旧 PID \(bare.pid), ver=\(verLabel))",
                                "[*] User confirmed relaunching Antigravity with --remote-debugging-port=0 (old PID \(bare.pid), ver=\(verLabel))"
                            ))
                            _ = CdpHelper.relaunchAntigravityWithCdp(host: bare, waitExitMs: 15000) { m in self.log("[+] \(m)") }
                        }
                    }
                }
            }

            if let port = livePort,
               let pages = livePages {
                hadLiveHost = true
                if lastPort != port {
                    stateLock.lock()
                    let oldEntries = Array(attached.values)
                    attached.removeAll()
                    stateLock.unlock()
                    for oldEntry in oldEntries {
                        oldEntry.session.close()
                    }
                    log(InstallerI18n.tr(
                        "[+] 连接到调试端口 \(port)",
                        "[+] Connected to debug port \(port)"
                    ))
                    lastPort = port
                }

                let group = DispatchGroup()
                for page in pages {
                    stateLock.lock()
                    let needsAttach = (attached[page.id] == nil && !attaching.contains(page.id))
                    stateLock.unlock()
                    if needsAttach {
                        group.enter()
                        DispatchQueue.global(qos: .utility).async {
                            attachPage(page)
                            group.leave()
                        }
                    }
                }
                _ = group.wait(timeout: .now() + .seconds(10))
            }

            _ = exitSem.wait(timeout: .now() + .seconds(2))
        }

        dirSource?.cancel()
        termSource.cancel()
        intSource.cancel()

        stateLock.lock()
        let finalEntries = Array(attached.values)
        attached.removeAll()
        stateLock.unlock()
        for entry in finalEntries {
            entry.session.close()
        }

        releasePidFile(selfPid: selfPid)
        flock(lockFd, LOCK_UN)
        close(lockFd)
        return 0
    }

    private func isTempSandboxDir(_ dir: String) -> Bool {
        let std = URL(fileURLWithPath: dir).standardizedFileURL.path
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).standardizedFileURL.path
        if std == "/tmp" || std.hasPrefix("/tmp/") || std == "/private/tmp" || std.hasPrefix("/private/tmp/") {
            return true
        }
        if !tmp.isEmpty {
            let cleanTmp = tmp.hasSuffix("/") ? String(tmp.dropLast()) : tmp
            if std == cleanTmp || std.hasPrefix(cleanTmp + "/") {
                return true
            }
        }
        return false
    }

    private func sleepInterruptible(seconds: Double, isExiting: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if isExiting() { return true }
            let rem = deadline.timeIntervalSinceNow
            if rem <= 0 { break }
            Thread.sleep(forTimeInterval: min(0.25, rem))
        }
        return isExiting()
    }

    private func isAutoArchiveOnExitAllowed() -> Bool {
        let env = ProcessInfo.processInfo.environment
        if (env["NODE_ENV"] ?? "").caseInsensitiveCompare("test") == .orderedSame { return false }
        if !(env["NODE_TEST_CONTEXT"] ?? "").isEmpty { return false }
        if env["AG_PRISM_NO_AUTO_ARCHIVE_ON_EXIT"] == "1" { return false }
        if isTempSandboxDir(self.baseDir) { return false }
        return true
    }

    private func isAutoArchiveOnExitEnabled() -> Bool {
        let fm = FileManager.default
        var dirs: [String] = []
        if !self.pluginDir.isEmpty { dirs.append(self.pluginDir) }
        if !self.baseDir.isEmpty && self.baseDir != self.pluginDir { dirs.append(self.baseDir) }
        for dir in dirs {
            let cfgPath = (dir as NSString).appendingPathComponent("config.json")
            guard fm.fileExists(atPath: cfgPath),
                  !CdpHelper.isSymbolicLinkOrUnsafePath(cfgPath),
                  let raw = try? String(contentsOfFile: cfgPath, encoding: .utf8) else {
                continue
            }
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let obj = try? MiniJson.parseObject(trimmed) else { continue }
            if let val = obj["autoArchiveOnExit"] {
                if let b = val.boolValue { return b }
                if let s = val.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
                    return s == "true" || s == "on"
                }
                return false
            }
            continue
        }
        return false
    }

    private func resolveConversationArchiveScriptPath() -> String? {
        let fm = FileManager.default
        var dirs: [String] = []
        if !self.pluginDir.isEmpty { dirs.append(self.pluginDir) }
        if !self.baseDir.isEmpty && self.baseDir != self.pluginDir { dirs.append(self.baseDir) }
        for dir in dirs {
            let scriptPath = (dir as NSString).appendingPathComponent("sidecars/daemon/conversation-archive.mjs")
            if fm.fileExists(atPath: scriptPath) && !CdpHelper.isSymbolicLinkOrUnsafePath(scriptPath) {
                return scriptPath
            }
        }
        return nil
    }

    private func isAntigravityOrLanguageServerRunning() -> Bool {
        let selfPid = getpid()
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/ps")
        proc.arguments = ["-ax", "-o", "pid=,command="]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = FileHandle.nullDevice
        do {
            try proc.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            guard proc.terminationStatus == 0,
                  let out = String(data: data, encoding: .utf8) else {
                return true
            }
            var parsedRows = 0
            for rawLine in out.components(separatedBy: CharacterSet.newlines) {
                let line = rawLine.trimmingCharacters(in: .whitespaces)
                if line.isEmpty { continue }
                let cols = line.split(maxSplits: 1, omittingEmptySubsequences: true, whereSeparator: { $0.isWhitespace })
                guard cols.count == 2, let pid = Int32(cols[0]), pid > 0 else { continue }
                parsedRows += 1
                if pid == selfPid { continue }
                let lowerCmd = String(cols[1]).lowercased()
                if lowerCmd.contains("conversation-archive.mjs") { continue }
                if lowerCmd.contains("language_server") ||
                   lowerCmd.contains(".app/contents/macos/antigravity") {
                    return true
                }
            }
            return parsedRows == 0
        } catch {
            // 进程查询失败一律 fail-closed，绝不冒险移动文件
            return true
        }
    }

    private func isProcessIdAlive(_ pid: Int64) -> Bool {
        guard pid > 0, pid <= Int64(Int32.max) else { return false }
        if kill(pid_t(pid), 0) == 0 { return true }
        return errno == EPERM
    }

    private func parseIsoDate(_ str: String) -> Date? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: str) { return d }
        let isoBasic = ISO8601DateFormatter()
        return isoBasic.date(from: str)
    }

    private func hasActiveArchiveLockOrRecentRestore() -> Bool {
        let fm = FileManager.default
        let envHome = ProcessInfo.processInfo.environment["HOME"] ?? ""
        let home = envHome.isEmpty ? fm.homeDirectoryForCurrentUser.path : envHome
        let archiveDir = (home as NSString).appendingPathComponent(".gemini/antigravity/conversations_archive")
        guard fm.fileExists(atPath: archiveDir) else {
            return false
        }
        // 归档目录若为符号链接或不安全路径，一律 fail-closed 拦截
        if CdpHelper.isSymbolicLinkOrUnsafePath(archiveDir) {
            return true
        }
        let lockPath = (archiveDir as NSString).appendingPathComponent(".archive.lock")
        if fm.fileExists(atPath: lockPath) {
            if CdpHelper.isSymbolicLinkOrUnsafePath(lockPath) { return true }
            if let attrs = try? fm.attributesOfItem(atPath: lockPath),
               let mtime = attrs[.modificationDate] as? Date,
               Date().timeIntervalSince(mtime) < 300.0 {
                return true
            }
        }
        // 协调正在静置/等待退出的脱离归档或还原任务（消除 4s vs 5.5s 抢跑竞态）；
        // 若记录的 auto-exit-archive PID 已死则不让步，立即由 Watcher 接棒兜底
        let activePath = (archiveDir as NSString).appendingPathComponent(".archive-task-active.json")
        if fm.fileExists(atPath: activePath) {
            if CdpHelper.isSymbolicLinkOrUnsafePath(activePath) { return true }
            if let activeRaw = try? String(contentsOfFile: activePath, encoding: .utf8),
               let activeObj = try? MiniJson.parseObject(activeRaw) {
                let startedDate: Date?
                if let startStr = activeObj["startedAt"]?.stringValue, let parsed = parseIsoDate(startStr) {
                    startedDate = parsed
                } else if let attrs = try? fm.attributesOfItem(atPath: activePath),
                          let mtime = attrs[.modificationDate] as? Date {
                    startedDate = mtime
                } else {
                    startedDate = nil
                }
                if let sd = startedDate {
                    let ageSec = Date().timeIntervalSince(sd)
                    if ageSec >= -10.0 && ageSec < 180.0 {
                        if let taskPid = activeObj["pid"]?.int64Value, taskPid > 0, isProcessIdAlive(taskPid) {
                            return true
                        }
                        let activeAct = activeObj["action"]?.stringValue ?? ""
                        if (activeAct == "restore-and-restart" || activeAct == "restore") && ageSec < 30.0 {
                            return true
                        }
                    }
                }
            }
        }
        let resPath = (archiveDir as NSString).appendingPathComponent(".last-archive-result.json")
        if fm.fileExists(atPath: resPath) {
            if CdpHelper.isSymbolicLinkOrUnsafePath(resPath) { return true }
            if let raw = try? String(contentsOfFile: resPath, encoding: .utf8),
               let obj = try? MiniJson.parseObject(raw),
               let act = obj["action"]?.stringValue,
               let tsStr = obj["recordedAt"]?.stringValue ?? obj["updatedAt"]?.stringValue,
               let ts = parseIsoDate(tsStr),
               abs(Date().timeIntervalSince(ts)) < 90.0 {
                if act == "restore-and-restart" || act == "restore" {
                    return true
                }
                if obj["ok"]?.boolValue == true &&
                   (act == "archive-and-restart" || act == "auto-exit-archive" || act == "archive") {
                    return true
                }
            }
        }
        return false
    }

    private func runAutoArchiveOnExitFallback(overridePort: Int?, isExiting: () -> Bool) {
        // 1) 等待 Antigravity 与 language_server 彻底退出（绝不强杀宿主）
        for _ in 0..<15 {
            if !isAntigravityOrLanguageServerRunning() { break }
            if sleepInterruptible(seconds: 1.0, isExiting: isExiting) { return }
            if !self.pluginDir.isEmpty && CdpHelper.isNativeDaemonAlive(pluginDir: self.pluginDir) { return }
            if let pWait = CdpHelper.readPort(overridePort: overridePort),
               (try? CdpHelper.listPages(port: pWait)) != nil {
                return
            }
        }
        if isAntigravityOrLanguageServerRunning() { return }

        // 2) 静置 4 秒等待 SQLite WAL/SHM 完全释放
        if sleepInterruptible(seconds: 4.0, isExiting: isExiting) { return }

        // 3) 二次 fail-closed 确认：配置仍开启、无活跃 CDP 端口、原生 Daemon 未运行、宿主与 language_server 均未运行、无锁冲突/刚还原记录
        guard isAutoArchiveOnExitEnabled() else { return }
        if !self.pluginDir.isEmpty && CdpHelper.isNativeDaemonAlive(pluginDir: self.pluginDir) { return }
        if let portRecheck = CdpHelper.readPort(overridePort: overridePort),
           (try? CdpHelper.listPages(port: portRecheck)) != nil {
            return
        }
        if isAntigravityOrLanguageServerRunning() { return }
        if hasActiveArchiveLockOrRecentRestore() { return }

        guard let scriptPath = resolveConversationArchiveScriptPath() else { return }
        let runtime: (executable: String, runAsNode: Bool)?
        if let nodeBin = CdpHelper.findFallbackNodeExecutable() {
            runtime = (nodeBin, false)
        } else if let electronRt = CdpHelper.findAntigravityNodeRuntime() {
            runtime = electronRt
        } else {
            runtime = nil
        }
        guard let rt = runtime else { return }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: rt.executable)
        proc.arguments = [scriptPath, "--archive", "--subagent-hours=2"]
        proc.currentDirectoryURL = URL(fileURLWithPath: (scriptPath as NSString).deletingLastPathComponent)
        var env = ProcessInfo.processInfo.environment
        if rt.runAsNode {
            env["ELECTRON_RUN_AS_NODE"] = "1"
        } else {
            env.removeValue(forKey: "ELECTRON_RUN_AS_NODE")
        }
        proc.environment = env
        proc.standardInput = FileHandle.nullDevice
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice

        do {
            try proc.run()
            let deadline = Date().addingTimeInterval(60.0)
            while proc.isRunning && Date() < deadline {
                if isExiting() { break }
                Thread.sleep(forTimeInterval: 0.25)
            }
            if !proc.isRunning {
                log(InstallerI18n.tr(
                    "[storage-guard] Watcher 退出兜底自动归档已执行 (exitCode=\(proc.terminationStatus))",
                    "[storage-guard] Watcher auto-archive on exit finished (exitCode=\(proc.terminationStatus))"
                ))
            }
        } catch {
            log(InstallerI18n.tr(
                "[storage-guard] Watcher 退出兜底自动归档异常: \(error.localizedDescription)",
                "[storage-guard] Watcher auto-archive on exit error: \(error.localizedDescription)"
            ))
        }
    }

    private func readHostAppVersion(appPath: String) -> String {
        let env = ProcessInfo.processInfo.environment
        if let mockVer = env["AG_PRISM_MOCK_HOST_VERSION"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !mockVer.isEmpty {
            return mockVer
        }
        guard !appPath.isEmpty else { return "" }
        let plistPath = (appPath as NSString).appendingPathComponent("Contents/Info.plist")
        guard let dict = NSDictionary(contentsOfFile: plistPath) else { return "" }
        let shortVer = (dict["CFBundleShortVersionString"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let buildVer = (dict["CFBundleVersion"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !shortVer.isEmpty && !buildVer.isEmpty && shortVer != buildVer {
            return "\(shortVer)(\(buildVer))"
        }
        return !shortVer.isEmpty ? shortVer : buildVer
    }

    private func stateObjMatchesCurrentHost(_ obj: [String: JsonValue], pid: Int32, startTimeMs: Int64, hostVersion: String) -> Bool {
        // 跨版本更新自动复位：若宿主版本发生变化，旧版本的“稍后”决定不再静音新版本
        let savedVersion = (obj["hostVersion"]?.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !hostVersion.isEmpty && !savedVersion.isEmpty && savedVersion != hostVersion {
            return false
        }

        var savedPid: Int64? = obj["hostPid"]?.int64Value
        var savedStart: Int64 = obj["hostStartMs"]?.int64Value ?? obj["startTimeMs"]?.int64Value ?? 0
        if savedPid == nil {
            let rawKey = obj["hostKey"]?.stringValue ?? obj["key"]?.stringValue ?? ""
            let parts = rawKey.split(separator: ":")
            if parts.count >= 1, let parsedPid = Int64(parts[0]) {
                savedPid = parsedPid
            }
            if savedStart <= 0 && parts.count >= 2, let parsedStart = Int64(parts[1]) {
                savedStart = parsedStart
            }
        }

        guard let recordedPid = savedPid, recordedPid == Int64(pid) else {
            return false
        }
        if savedStart > 0 && startTimeMs > 0 && abs(savedStart - startTimeMs) > 15000 {
            return false
        }
        return true
    }

    private func makePromptHostKey(pid: Int32, startTimeMs: Int64, hostVersion: String) -> String {
        return hostVersion.isEmpty
            ? "\(pid):\(startTimeMs)"
            : "\(pid):\(startTimeMs):\(hostVersion)"
    }

    private func isPromptedInMemory(pid: Int32, startTimeMs: Int64, hostVersion: String) -> Bool {
        let currentKey = makePromptHostKey(pid: pid, startTimeMs: startTimeMs, hostVersion: hostVersion)
        let pidPrefix = "\(pid):"
        promptedHostsLock.lock()
        defer { promptedHostsLock.unlock() }
        if promptedHostKeys.contains(currentKey) {
            return true
        }
        for existing in promptedHostKeys where existing.hasPrefix(pidPrefix) {
            let parts = existing.split(separator: ":", maxSplits: 2, omittingEmptySubsequences: false)
            let savedStart = parts.count >= 2 ? (Int64(parts[1]) ?? 0) : 0
            let savedVer = parts.count >= 3 ? String(parts[2]) : ""
            if !hostVersion.isEmpty && !savedVer.isEmpty && savedVer != hostVersion {
                continue
            }
            if savedStart <= 0 || startTimeMs <= 0 || abs(savedStart - startTimeMs) <= 15000 {
                return true
            }
        }
        return false
    }

    private func rememberPromptedInMemory(pid: Int32, startTimeMs: Int64, hostVersion: String) {
        let hostKey = makePromptHostKey(pid: pid, startTimeMs: startTimeMs, hostVersion: hostVersion)
        promptedHostsLock.lock()
        if promptedHostKeys.count >= 256 {
            promptedHostKeys.removeAll(keepingCapacity: true)
        }
        promptedHostKeys.insert(hostKey)
        promptedHostsLock.unlock()
    }

    private func removePathIncludingDanglingSymlink(_ path: String) {
        #if canImport(Darwin)
        let stPtr = UnsafeMutablePointer<Darwin.stat>.allocate(capacity: 1)
        defer { stPtr.deallocate() }
        if lstat(path, stPtr) == 0 {
            _ = unlink(path)
        }
        #endif
        try? FileManager.default.removeItem(atPath: path)
    }

    private func hasPromptedForHostWithVersion(bare: BareHostAppInfo, hostVersion: String) -> Bool {
        guard bare.pid > 0 else { return true }
        if isPromptedInMemory(pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion) {
            return true
        }
        let fm = FileManager.default
        var dirs: [String] = []
        if !self.pluginDir.isEmpty { dirs.append(self.pluginDir) }
        if !self.baseDir.isEmpty && self.baseDir != self.pluginDir { dirs.append(self.baseDir) }

        var matched = false
        var resetLogged = false
        for dir in dirs {
            let statePath = (dir as NSString).appendingPathComponent(".relaunch-prompt-state.json")
            guard fm.fileExists(atPath: statePath),
                  let raw = try? String(contentsOfFile: statePath, encoding: .utf8) else {
                continue
            }
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let obj = try? MiniJson.parseObject(trimmed) else {
                continue
            }
            if stateObjMatchesCurrentHost(obj, pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion) {
                matched = true
                rememberPromptedInMemory(pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion)
            } else {
                // 新进程 PID 或新版本出现时自动复位旧的跳过记录，防止旧“稍后”永久静音
                try? fm.removeItem(atPath: statePath)
                if !resetLogged {
                    resetLogged = true
                    let verLabel = hostVersion.isEmpty ? "unknown" : hostVersion
                    log(InstallerI18n.tr(
                        "[~] 检测到 Antigravity 新进程或版本更新 (PID \(bare.pid), ver=\(verLabel))，已自动复位重开提示状态",
                        "[~] Detected new Antigravity process or version update (PID \(bare.pid), ver=\(verLabel)); reset relaunch prompt state"
                    ))
                }
            }
        }
        return matched
    }

    private func recordPromptedForHostWithVersion(bare: BareHostAppInfo, hostVersion: String, decision: String) {
        guard bare.pid > 0 else { return }
        // 先记入进程内 Set<String> 兜底，即使磁盘只读/满或写盘失败也绝不每 2s 无限弹窗
        rememberPromptedInMemory(pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion)
        let hostKey = makePromptHostKey(pid: bare.pid, startTimeMs: bare.startTimeMs, hostVersion: hostVersion)
        let nowMs = Int64(Date().timeIntervalSince1970 * 1000.0)
        let obj: [String: JsonValue] = [
            "hostPid": .int(Int64(bare.pid)),
            "hostStartMs": .int(bare.startTimeMs),
            "startTimeMs": .int(bare.startTimeMs),
            "hostVersion": .string(hostVersion),
            "hostKey": .string(hostKey),
            "key": .string(hostKey),
            "decision": .string(decision.isEmpty ? "prompted" : decision),
            "updatedAt": .int(nowMs),
        ]
        let payload = MiniJson.stringify(.object(obj), pretty: true) + "\n"
        let fm = FileManager.default
        var targetDirs: [String] = []
        if !self.pluginDir.isEmpty { targetDirs.append(self.pluginDir) }
        if !self.baseDir.isEmpty && self.baseDir != self.pluginDir { targetDirs.append(self.baseDir) }
        for dir in targetDirs {
            let statePath = (dir as NSString).appendingPathComponent(".relaunch-prompt-state.json")
            let tmpPath = statePath + ".tmp.\(getpid())"
            do {
                try fm.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: nil)
                try payload.write(toFile: tmpPath, atomically: true, encoding: .utf8)
                // 写盘前无条件移除旧路径（含 lstat 存在但目标失效的悬空软链，避免 fileExists 为 false 导致 moveItem 报 EEXIST）
                removePathIncludingDanglingSymlink(statePath)
                try? fm.removeItem(atPath: statePath)
                #if canImport(Darwin)
                if rename(tmpPath, statePath) != 0 {
                    try fm.moveItem(atPath: tmpPath, toPath: statePath)
                }
                #else
                try fm.moveItem(atPath: tmpPath, toPath: statePath)
                #endif
            } catch {
                try? fm.removeItem(atPath: tmpPath)
            }
        }
    }
}

func runWatcherMain() -> Int32 {
    var mode = "watch"
    var customDir: String?
    var customPluginDir: String?
    var overridePort: Int?
    var outFile: String?
    var noNativeDaemon = false
    var noRelaunchPrompt = false

    let args = CommandLine.arguments
    var i = 1
    while i < args.count {
        let a = args[i]
        if a == "--watch" { mode = "watch" }
        else if a == "--once" { mode = "once" }
        else if a == "--remove" { mode = "remove" }
        else if a == "--no-native-daemon" { noNativeDaemon = true }
        else if a == "--no-relaunch-prompt" { noRelaunchPrompt = true }
        else if a == "--dir" && i + 1 < args.count { i += 1; customDir = args[i] }
        else if a == "--plugin-dir" && i + 1 < args.count { i += 1; customPluginDir = args[i] }
        else if a == "--cdp-port" && i + 1 < args.count {
            i += 1
            if let p = Int(args[i]), p > 0 { overridePort = p }
        }
        else if a == "--out" && i + 1 < args.count { i += 1; outFile = args[i] }
        else if a == "--lang" && i + 1 < args.count {
            i += 1
            InstallerI18n.setExplicitLanguage(args[i])
        }
        else if a.hasPrefix("--lang=") {
            InstallerI18n.setExplicitLanguage(String(a.dropFirst("--lang=".count)))
        }
        i += 1
    }

    let rawBase = (customDir?.isEmpty == false)
        ? customDir!
        : ((args[0] as NSString).deletingLastPathComponent)
    let baseDir = URL(fileURLWithPath: rawBase.isEmpty ? "." : rawBase).standardizedFileURL.path

    let defaultInstallDir = URL(
        fileURLWithPath: (FileManager.default.homeDirectoryForCurrentUser.path as NSString)
            .appendingPathComponent("Library/Application Support/obsidian-prism")
    ).standardizedFileURL.path

    let pluginDir: String
    if let explicitPlugin = customPluginDir, !explicitPlugin.isEmpty {
        pluginDir = URL(fileURLWithPath: explicitPlugin).standardizedFileURL.path
    } else if let envOverride = ProcessInfo.processInfo.environment["AG_PRISM_PLUGIN_DIR"], !envOverride.isEmpty {
        pluginDir = CdpHelper.getDefaultNativePluginDir()
    } else if customDir == nil || baseDir == defaultInstallDir {
        pluginDir = CdpHelper.getDefaultNativePluginDir()
    } else {
        let parentDir = (baseDir as NSString).deletingLastPathComponent
        let baseName = (baseDir as NSString).lastPathComponent
        pluginDir = (parentDir as NSString).appendingPathComponent("\(baseName)-native-plugin")
    }

    let app = WatcherApp(baseDir: baseDir, pluginDir: pluginDir, isWatch: mode == "watch", noNativeDaemon: noNativeDaemon, noRelaunchPrompt: noRelaunchPrompt)

    if mode == "once" {
        return app.runOnce(overridePort: overridePort, outFile: outFile)
    }
    if mode == "remove" {
        return app.runRemove(overridePort: overridePort, outFile: outFile)
    }
    return app.runWatch(overridePort: overridePort)
}

exit(runWatcherMain())
