import Cocoa
import Foundation
#if canImport(Darwin)
import Darwin
#endif

final class InstallerOptions {
    var uninstall = false
    var silent = false
    var popup = false
    var statusOnly = false
    var noAutostart = false
    var noKillLegacy = false
    var noNativeDaemon = false
    var noRelaunchPrompt = false
    var purgeData = false
    var createLauncher = true
    var explicitLauncherFlag = false
    var installDir: String?
    var pluginDir: String?
    var launcherDir: String?
    var lang: String?
    var cdpPort: Int?
    var outFile: String?
}

struct AntigravityDetectResult {
    var appPath: String?
    var version: String?
    var isRunning = false
}

final class OperationResult {
    var ok = false
    var mode = "install"
    var headline = ""
    var detail = ""
    var installDir = ""
    var pluginDir = ""
    var nativePluginDeployed = false
    var nativeDaemonStarted = false
    var bareHostDetected = false
    var launcherCreated = false
    var launcherRemoved = false
    var launcherPath: String?
    var antigravityApp: String?
    var antigravityVersion: String?
    var cdpPort: Int?
    var injectedPages: [String] = []
    var preservedExistingConfig = false
    var configSummary = ""
    var warnings: [String] = []
}

enum InstallerCore {
    static let launchAgentLabel = "io.github.rmvdesi.obsidian-prism"
    static let launchAgentFileName = "io.github.rmvdesi.obsidian-prism.plist"
    static let watcherExeName = "obsidian-prism-watcher"
    static let selfInstalledExeName = "obsidian-prism-installer"
    static let launcherBundleName = "Antigravity Prism.app"
    static let launcherBundleId = "io.github.rmvdesi.obsidian-prism.launcher"
    static let launcherMarkerRelPath = "Contents/Resources/.obsidian-prism-launcher"

    static func getDefaultInstallDir() -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return (home as NSString).appendingPathComponent("Library/Application Support/obsidian-prism")
    }

    static func resolveNativePluginDir(opts: InstallerOptions, resolvedInstallDir: String) -> String {
        if let explicitPlugin = opts.pluginDir, !explicitPlugin.isEmpty {
            return URL(fileURLWithPath: explicitPlugin).standardizedFileURL.path
        }
        if let envOverride = ProcessInfo.processInfo.environment["AG_PRISM_PLUGIN_DIR"], !envOverride.isEmpty {
            return CdpHelper.getDefaultNativePluginDir()
        }
        if opts.installDir == nil || opts.installDir?.isEmpty == true {
            return CdpHelper.getDefaultNativePluginDir()
        }
        let parentDir = (resolvedInstallDir as NSString).deletingLastPathComponent
        let baseName = (resolvedInstallDir as NSString).lastPathComponent
        return (parentDir as NSString).appendingPathComponent("\(baseName)-native-plugin")
    }

    static func resolveNativePluginSourceDir(payloadDir: String) -> String? {
        let fm = FileManager.default
        let nested = (payloadDir as NSString).appendingPathComponent("native-plugin")
        if fm.fileExists(atPath: (nested as NSString).appendingPathComponent("plugin.json")) {
            return nested
        }
        let resourcesDir = (payloadDir as NSString).deletingLastPathComponent
        let sibling = (resourcesDir as NSString).appendingPathComponent("native-plugin")
        if fm.fileExists(atPath: (sibling as NSString).appendingPathComponent("plugin.json")) {
            return sibling
        }
        let appBundleDir = ((resourcesDir as NSString).deletingLastPathComponent as NSString).deletingLastPathComponent
        let repoParent = (appBundleDir as NSString).deletingLastPathComponent
        if fm.fileExists(atPath: (repoParent as NSString).appendingPathComponent("plugin.json")) &&
           fm.fileExists(atPath: (repoParent as NSString).appendingPathComponent("sidecars/daemon/main.mjs")) {
            return repoParent
        }
        return nil
    }

    private static func matchesExactCommandPath(_ normalizedCmd: String, exactPath: String) -> Bool {
        guard !normalizedCmd.isEmpty, !exactPath.isEmpty else { return false }
        var searchStart = normalizedCmd.startIndex
        while searchStart < normalizedCmd.endIndex,
              let range = normalizedCmd.range(of: exactPath, range: searchStart..<normalizedCmd.endIndex) {
            let leftOk: Bool
            if range.lowerBound == normalizedCmd.startIndex {
                leftOk = true
            } else {
                let prev = normalizedCmd[normalizedCmd.index(before: range.lowerBound)]
                leftOk = prev.isWhitespace || prev == "\"" || prev == "'" || prev == "="
            }
            let rightOk: Bool
            if range.upperBound == normalizedCmd.endIndex {
                rightOk = true
            } else {
                let next = normalizedCmd[range.upperBound]
                rightOk = next.isWhitespace || next == "\"" || next == "'" || next == "," || next == ";"
            }
            if leftOk && rightOk {
                return true
            }
            searchStart = normalizedCmd.index(after: range.lowerBound)
        }
        return false
    }

    private static func extractExecutableBasename(rawCommand: String, pid: Int32) -> String {
        let psComm = runProcessSync(executable: "/bin/ps", arguments: ["-p", "\(pid)", "-o", "comm="])
        let commTrimmed = psComm.stdout
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
        if !commTrimmed.isEmpty {
            return (commTrimmed as NSString).lastPathComponent.lowercased()
        }
        let trimmed = rawCommand.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        var argv0 = ""
        if let firstChar = trimmed.first, firstChar == "\"" || firstChar == "'" {
            let rest = trimmed.dropFirst()
            if let endIdx = rest.firstIndex(of: firstChar) {
                argv0 = String(rest[..<endIdx])
            } else {
                argv0 = String(rest)
            }
        } else {
            let lower = trimmed.lowercased()
            let knownMacOsMarkers = [
                "/contents/macos/antigravity helper (plugin)",
                "/contents/macos/antigravity helper",
                "/contents/macos/antigravity",
            ]
            var matchedMarker: String? = nil
            for marker in knownMacOsMarkers {
                if let r = lower.range(of: marker),
                   r.upperBound == lower.endIndex || lower[r.upperBound].isWhitespace {
                    matchedMarker = String(lower[..<r.upperBound])
                    break
                }
            }
            if let found = matchedMarker {
                argv0 = found
            } else if let wsIdx = trimmed.firstIndex(where: { $0.isWhitespace }) {
                argv0 = String(trimmed[..<wsIdx])
            } else {
                argv0 = trimmed
            }
        }
        let cleaned = argv0.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
        return (cleaned as NSString).lastPathComponent.lowercased()
    }

    static func stopNativeDaemonInDir(_ pluginDir: String, log: ((String) -> Void)?) {
        guard !pluginDir.isEmpty, FileManager.default.fileExists(atPath: pluginDir) else { return }
        let selfPid = getpid()
        let parentPid = getppid()
        var stoppedPids = Set<Int32>()
        if let pid = CdpHelper.readNativeDaemonPid(pluginDir: pluginDir), pid > 0, pid != selfPid, pid != parentPid {
            if CdpHelper.isExpectedDaemonProcess(pid: pid, pluginDir: pluginDir) && terminatePid(pid) {
                stoppedPids.insert(pid)
                log?(InstallerI18n.tr(
                    "已停止本地守护服务 (PID \(pid))",
                    "Stopped local background daemon (PID \(pid))"
                ))
            }
        }
        // 清理命令行精确指向当前 pluginDir 入口脚本的残留孤儿 daemon（组合完整路径 + argv[0] 白名单 + 排除自身与父进程）
        let rawStdDir = URL(fileURLWithPath: pluginDir).standardizedFileURL.path
        let stdDirClean = (rawStdDir.count > 1 && rawStdDir.hasSuffix("/")) ? String(rawStdDir.dropLast()) : rawStdDir
        let sysNormDir = normalizeSystemRootPrefix(pluginDir)
        var dirCandidates: [String] = []
        if !stdDirClean.isEmpty {
            dirCandidates.append(stdDirClean.lowercased())
        }
        let sysNormLower = sysNormDir.lowercased()
        if !sysNormLower.isEmpty && !dirCandidates.contains(sysNormLower) {
            dirCandidates.append(sysNormLower)
        }
        if !dirCandidates.isEmpty {
            var exactEntries: [String] = []
            for base in dirCandidates {
                exactEntries.append(base + "/sidecars/daemon/main.mjs")
                exactEntries.append(base + "/daemon/main.mjs")
                exactEntries.append(base + "/watch.js")
            }
            let allowedBasenames: Set<String> = [
                "node",
                "antigravity",
                "antigravity helper",
                "antigravity helper (plugin)",
                "electron",
                "agy",
            ]
            let ps = runProcessSync(executable: "/bin/ps", arguments: ["-ax", "-o", "pid=,command="])
            for rawLine in ps.stdout.components(separatedBy: CharacterSet.newlines) {
                let line = rawLine.trimmingCharacters(in: .whitespaces)
                if line.isEmpty { continue }
                let parts = line.split(maxSplits: 1, omittingEmptySubsequences: true, whereSeparator: { $0.isWhitespace })
                guard parts.count == 2,
                      let pid = Int32(parts[0]),
                      pid > 0,
                      pid != selfPid,
                      pid != parentPid,
                      !stoppedPids.contains(pid) else { continue }
                let rawCmd = String(parts[1])
                let cmd = rawCmd.replacingOccurrences(of: "\\", with: "/").lowercased()
                if cmd.contains("--type=") { continue }
                let matchesExactEntry = exactEntries.contains { matchesExactCommandPath(cmd, exactPath: $0) }
                guard matchesExactEntry else { continue }
                let exeBasename = extractExecutableBasename(rawCommand: rawCmd, pid: pid)
                guard allowedBasenames.contains(exeBasename) else { continue }
                if exeBasename == "antigravity" {
                    let hasDaemonFeature = cmd.contains("--root ") || cmd.contains("sidecar_sdk") || cmd.contains("--import=")
                    if !hasDaemonFeature { continue }
                }
                if terminatePid(pid) {
                    stoppedPids.insert(pid)
                    log?(InstallerI18n.tr(
                        "已清理残留守护服务 (PID \(pid))",
                        "Cleaned up lingering background daemon (PID \(pid))"
                    ))
                }
            }
        }
        let pidFile = (pluginDir as NSString).appendingPathComponent(".daemon.pid")
        if !isSymbolicLink(pidFile) {
            clearReadOnlyPermissionsNoSymlink(pidFile)
            try? FileManager.default.removeItem(atPath: pidFile)
        }
    }

    static func shouldCleanHostLaunchAgent(installDir: String) -> Bool {
        let defaultDir = URL(fileURLWithPath: getDefaultInstallDir()).standardizedFileURL.path
        let normalizedDir = URL(fileURLWithPath: installDir).standardizedFileURL.path
        if normalizedDir == defaultDir {
            return true
        }
        let plistPath = getLaunchAgentPlistPath()
        if let content = try? String(contentsOfFile: plistPath, encoding: .utf8),
           content.contains(normalizedDir) {
            return true
        }
        return false
    }

    static func getLaunchAgentPlistPath() -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return ((home as NSString).appendingPathComponent("Library/LaunchAgents") as NSString)
            .appendingPathComponent(launchAgentFileName)
    }

    static func resolvePayloadDir() -> String? {
        let fm = FileManager.default
        if let resPath = Bundle.main.resourcePath {
            let p = (resPath as NSString).appendingPathComponent("payload")
            if fm.fileExists(atPath: (p as NSString).appendingPathComponent("manifest.json")) {
                return p
            }
        }
        let execPath = resolvedSelfExecutablePath()
        let execDir = (execPath as NSString).deletingLastPathComponent
        let contentsDir = (execDir as NSString).deletingLastPathComponent
        let relPayload = ((contentsDir as NSString).appendingPathComponent("Resources") as NSString)
            .appendingPathComponent("payload")
        if fm.fileExists(atPath: (relPayload as NSString).appendingPathComponent("manifest.json")) {
            return relPayload
        }
        return nil
    }

    static func resolveWatcherBinarySource() -> String? {
        let fm = FileManager.default
        if let execPath = Bundle.main.executablePath {
            let dir = (execPath as NSString).deletingLastPathComponent
            let candidate = (dir as NSString).appendingPathComponent(watcherExeName)
            if fm.fileExists(atPath: candidate) { return candidate }
        }
        let selfPath = resolvedSelfExecutablePath()
        let selfDir = (selfPath as NSString).deletingLastPathComponent
        let sibling = (selfDir as NSString).appendingPathComponent(watcherExeName)
        if fm.fileExists(atPath: sibling) { return sibling }
        return nil
    }

    static func resolvedSelfExecutablePath() -> String {
        if let p = Bundle.main.executablePath, !p.isEmpty {
            return URL(fileURLWithPath: p).standardizedFileURL.path
        }
        let arg0 = CommandLine.arguments.first ?? ""
        return URL(fileURLWithPath: arg0).standardizedFileURL.path
    }

    @discardableResult
    static func runProcessSync(executable: String, arguments: [String]) -> (code: Int32, stdout: String) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executable)
        proc.arguments = arguments
        let outPipe = Pipe()
        proc.standardOutput = outPipe
        proc.standardError = FileHandle.nullDevice
        proc.standardInput = FileHandle.nullDevice
        do {
            try proc.run()
            let data = outPipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            let str = String(data: data, encoding: .utf8) ?? ""
            return (proc.terminationStatus, str)
        } catch {
            return (-1, "")
        }
    }

    static func detectAntigravityDesktop() -> AntigravityDetectResult {
        var res = AntigravityDetectResult()
        let running = NSWorkspace.shared.runningApplications
        for app in running {
            let bundleName = app.bundleURL?.lastPathComponent.lowercased() ?? ""
            let locName = app.localizedName?.lowercased() ?? ""
            let exeName = app.executableURL?.lastPathComponent.lowercased() ?? ""
            if bundleName == "antigravity.app" || locName == "antigravity" || exeName == "antigravity" {
                res.isRunning = true
                if let url = app.bundleURL {
                    res.appPath = url.path
                    break
                }
            }
        }

        let fm = FileManager.default
        if res.appPath == nil {
            let home = fm.homeDirectoryForCurrentUser.path
            let candidates = [
                "/Applications/Antigravity.app",
                (home as NSString).appendingPathComponent("Applications/Antigravity.app"),
            ]
            for path in candidates {
                if fm.fileExists(atPath: path) {
                    res.appPath = path
                    break
                }
            }
        }

        if let appPath = res.appPath {
            let plistPath = ((appPath as NSString).appendingPathComponent("Contents") as NSString)
                .appendingPathComponent("Info.plist")
            if let dict = NSDictionary(contentsOfFile: plistPath) {
                if let shortVer = dict["CFBundleShortVersionString"] as? String, !shortVer.isEmpty {
                    res.version = shortVer
                } else if let ver = dict["CFBundleVersion"] as? String, !ver.isEmpty {
                    res.version = ver
                }
            }
        }
        return res
    }

    static func unloadLaunchAgent() {
        let plistPath = getLaunchAgentPlistPath()
        let uid = getuid()
        _ = runProcessSync(executable: "/bin/launchctl", arguments: ["bootout", "gui/\(uid)/\(launchAgentLabel)"])
        if FileManager.default.fileExists(atPath: plistPath) {
            _ = runProcessSync(executable: "/bin/launchctl", arguments: ["unload", "-w", plistPath])
        }
    }

    private static func terminatePid(_ pid: Int32) -> Bool {
        guard pid > 0, pid != getpid(), pid != getppid() else { return false }
        guard kill(pid, 0) == 0 else { return false }
        _ = kill(pid, SIGTERM)
        let deadline = Date().addingTimeInterval(2.0)
        while Date() < deadline {
            if kill(pid, 0) != 0 { return true }
            Thread.sleep(forTimeInterval: 0.05)
        }
        if kill(pid, 0) == 0 {
            _ = kill(pid, SIGKILL)
            Thread.sleep(forTimeInterval: 0.1)
        }
        return true
    }

    static func stopWatcherInDir(_ dir: String, noAutostart: Bool, log: ((String) -> Void)?) {
        let fm = FileManager.default
        if !noAutostart {
            unloadLaunchAgent()
        }
        guard fm.fileExists(atPath: dir) else { return }

        let pidFile = (dir as NSString).appendingPathComponent(".watch.pid")
        if !isSymbolicLink(pidFile) {
            if let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8),
               let pid = Int32(pidStr.trimmingCharacters(in: .whitespacesAndNewlines)),
               pid > 0 {
                if CdpHelper.isExpectedDaemonProcess(pid: pid) && terminatePid(pid) {
                    log?(InstallerI18n.tr(
                        "已停止运行中的守护进程 (PID \(pid))",
                        "Stopped running watcher process (PID \(pid))"
                    ))
                }
            }
            if fm.fileExists(atPath: pidFile) {
                clearReadOnlyPermissionsNoSymlink(pidFile)
                try? fm.removeItem(atPath: pidFile)
            }
        }

        let rawStdDir = URL(fileURLWithPath: dir).standardizedFileURL.path
        let stdDirClean = (rawStdDir.count > 1 && rawStdDir.hasSuffix("/")) ? String(rawStdDir.dropLast()) : rawStdDir
        let sysNormDir = normalizeSystemRootPrefix(dir)
        var dirCandidates: [String] = []
        if !stdDirClean.isEmpty {
            dirCandidates.append(stdDirClean.lowercased())
        }
        let sysNormLower = sysNormDir.lowercased()
        if !sysNormLower.isEmpty && !dirCandidates.contains(sysNormLower) {
            dirCandidates.append(sysNormLower)
        }
        let watcherNameLower = watcherExeName.lowercased()
        let ps = runProcessSync(executable: "/bin/ps", arguments: ["-ax", "-o", "pid=,command="])
        for rawLine in ps.stdout.components(separatedBy: CharacterSet.newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            let parts = line.split(maxSplits: 1, omittingEmptySubsequences: true, whereSeparator: { $0.isWhitespace })
            guard parts.count == 2, let pid = Int32(parts[0]) else { continue }
            let cmd = String(parts[1]).replacingOccurrences(of: "\\", with: "/").lowercased()
            let matchesWatcher = dirCandidates.contains { base in
                let expectedExe = (base == "/" ? "" : base) + "/" + watcherNameLower
                return matchesExactCommandPath(cmd, exactPath: expectedExe) ||
                    (cmd.contains(watcherNameLower) && cmd.contains("--dir") && matchesExactCommandPath(cmd, exactPath: base))
            }
            if matchesWatcher {
                _ = terminatePid(pid)
            }
        }
    }

    static func stopLegacyNodeWatchers(log: ((String) -> Void)?) {
        let ps = runProcessSync(executable: "/bin/ps", arguments: ["-ax", "-o", "pid=,command="])
        for rawLine in ps.stdout.components(separatedBy: CharacterSet.newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            let parts = line.split(maxSplits: 1, omittingEmptySubsequences: true, whereSeparator: { $0.isWhitespace })
            guard parts.count == 2, let pid = Int32(parts[0]) else { continue }
            let cmd = String(parts[1]).lowercased()
            if cmd.contains("node") &&
                (cmd.contains("obsidian-prism") || cmd.contains("agy-claude-style")) &&
                cmd.contains("inject.js") &&
                cmd.contains("--watch") {
                if terminatePid(pid) {
                    log?(InstallerI18n.tr(
                        "已替换旧版 Node 守护进程 (PID \(pid))",
                        "Replaced legacy Node watcher process (PID \(pid))"
                    ))
                }
            }
        }
    }

    private static func xmlEscape(_ s: String) -> String {
        return s
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }

    static func registerLaunchAgent(installDir: String, pluginDir: String, cdpPort: Int?, noNativeDaemon: Bool = false, noRelaunchPrompt: Bool = false, lang: String? = nil) throws {
        let plistPath = getLaunchAgentPlistPath()
        let launchAgentsDir = (plistPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(atPath: launchAgentsDir, withIntermediateDirectories: true, attributes: nil)

        let watcherExe = (installDir as NSString).appendingPathComponent(watcherExeName)
        var args = [watcherExe, "--watch", "--dir", installDir]
        if !pluginDir.isEmpty {
            args.append("--plugin-dir")
            args.append(pluginDir)
        }
        if let port = cdpPort, port > 0 {
            args.append("--cdp-port")
            args.append(String(port))
        }
        if noNativeDaemon {
            args.append("--no-native-daemon")
        }
        if noRelaunchPrompt {
            args.append("--no-relaunch-prompt")
        }
        if let explicitLang = InstallerI18n.normalizeLangCode(lang) {
            args.append("--lang")
            args.append(explicitLang)
        }
        let argsXml = args.map { "    <string>\(xmlEscape($0))</string>" }.joined(separator: "\n")
        let outLog = (installDir as NSString).appendingPathComponent("launchd.out.log")
        let errLog = (installDir as NSString).appendingPathComponent("launchd.err.log")

        let plistContent = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>\(xmlEscape(launchAgentLabel))</string>
          <key>ProgramArguments</key>
          <array>
        \(argsXml)
          </array>
          <key>WorkingDirectory</key>
          <string>\(xmlEscape(installDir))</string>
          <key>RunAtLoad</key>
          <true/>
          <key>KeepAlive</key>
          <true/>
          <key>StandardOutPath</key>
          <string>\(xmlEscape(outLog))</string>
          <key>StandardErrorPath</key>
          <string>\(xmlEscape(errLog))</string>
        </dict>
        </plist>
        """
        try plistContent.write(toFile: plistPath, atomically: true, encoding: .utf8)

        let uid = getuid()
        _ = runProcessSync(executable: "/bin/launchctl", arguments: ["bootout", "gui/\(uid)/\(launchAgentLabel)"])
        let bootRes = runProcessSync(executable: "/bin/launchctl", arguments: ["bootstrap", "gui/\(uid)", plistPath])
        if bootRes.code != 0 {
            _ = runProcessSync(executable: "/bin/launchctl", arguments: ["load", "-w", plistPath])
        }
    }

    private static func spawnWatcherDirectly(installDir: String, pluginDir: String, cdpPort: Int?, noNativeDaemon: Bool = false, noRelaunchPrompt: Bool = false, lang: String? = nil) throws {
        let watcherExe = (installDir as NSString).appendingPathComponent(watcherExeName)
        var args = ["--watch", "--dir", installDir]
        if !pluginDir.isEmpty {
            args.append("--plugin-dir")
            args.append(pluginDir)
        }
        if let port = cdpPort, port > 0 {
            args.append("--cdp-port")
            args.append(String(port))
        }
        if noNativeDaemon {
            args.append("--no-native-daemon")
        }
        if noRelaunchPrompt {
            args.append("--no-relaunch-prompt")
        }
        if let explicitLang = InstallerI18n.normalizeLangCode(lang) {
            args.append("--lang")
            args.append(explicitLang)
        }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: watcherExe)
        proc.arguments = args
        proc.currentDirectoryURL = URL(fileURLWithPath: installDir)
        proc.standardInput = FileHandle.nullDevice
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        try proc.run()
    }

    private static func clearReadOnlyPermissionsNoSymlink(_ path: String, depth: Int = 0) {
        guard depth <= 16, !path.isEmpty, !isSymbolicLink(path) else { return }
        let fm = FileManager.default
        guard let attrs = try? fm.attributesOfItem(atPath: path) else { return }
        let ftype = attrs[.type] as? FileAttributeType
        if ftype == .typeDirectory {
            if let perms = (attrs[.posixPermissions] as? NSNumber)?.intValue, (perms & 0o700) != 0o700 {
                try? fm.setAttributes([.posixPermissions: perms | 0o700], ofItemAtPath: path)
            }
            if let entries = try? fm.contentsOfDirectory(atPath: path) {
                for name in entries {
                    let child = (path as NSString).appendingPathComponent(name)
                    clearReadOnlyPermissionsNoSymlink(child, depth: depth + 1)
                }
            }
        } else if ftype == .typeRegular {
            if let perms = (attrs[.posixPermissions] as? NSNumber)?.intValue, (perms & 0o200) == 0 {
                try? fm.setAttributes([.posixPermissions: perms | 0o600], ofItemAtPath: path)
            }
        }
    }

    private static func copyItemSafelyWithRetry(from src: String, to dest: String) throws {
        if isSymbolicLink(src) {
            throw CdpError(InstallerI18n.tr(
                "检测到源文件为符号链接，已拒绝复制: \(src)",
                "Source path is a symbolic link; copy refused: \(src)"
            ))
        }
        let destParent = (dest as NSString).deletingLastPathComponent
        if !destParent.isEmpty && isSymbolicLink(destParent) {
            throw CdpError(InstallerI18n.tr(
                "检测到目标父目录为符号链接，已拒绝覆盖: \(destParent)",
                "Destination parent directory is a symbolic link; overwrite refused: \(destParent)"
            ))
        }
        if isSymbolicLink(dest) {
            throw CdpError(InstallerI18n.tr(
                "检测到目标路径为符号链接，已拒绝覆盖: \(dest)",
                "Destination path is a symbolic link; overwrite refused: \(dest)"
            ))
        }
        let fm = FileManager.default
        let backoffs: [TimeInterval] = [0.06, 0.12, 0.25, 0.4]
        var lastError: Error? = nil
        for attempt in 0...backoffs.count {
            let tmpPath = "\(dest).tmp.\(getpid()).\(UUID().uuidString)"
            var copiedTmp = false
            do {
                if isSymbolicLink(dest) {
                    throw CdpError(InstallerI18n.tr(
                        "检测到目标路径为符号链接，已拒绝覆盖: \(dest)",
                        "Destination path is a symbolic link; overwrite refused: \(dest)"
                    ))
                }
                if isSymbolicLink(tmpPath) {
                    throw CdpError(InstallerI18n.tr(
                        "检测到临时目标为符号链接，已拒绝写入: \(tmpPath)",
                        "Temporary destination is a symbolic link; write refused: \(tmpPath)"
                    ))
                }
                var srcIsDir: ObjCBool = false
                guard fm.fileExists(atPath: src, isDirectory: &srcIsDir) else {
                    throw CdpError(InstallerI18n.tr(
                        "源文件不存在: \(src)",
                        "Source file does not exist: \(src)"
                    ))
                }
                // 先拷贝至同目录唯一临时路径再原子替换，复制失败绝不丢失原目标
                try fm.copyItem(atPath: src, toPath: tmpPath)
                copiedTmp = true

                var destIsDir: ObjCBool = false
                let destExists = fm.fileExists(atPath: dest, isDirectory: &destIsDir)
                if !destExists {
                    if isSymbolicLink(dest) {
                        throw CdpError(InstallerI18n.tr(
                            "检测到目标路径为符号链接，已拒绝覆盖: \(dest)",
                            "Destination path is a symbolic link; overwrite refused: \(dest)"
                        ))
                    }
                    if rename(tmpPath, dest) != 0 {
                        try fm.moveItem(atPath: tmpPath, toPath: dest)
                    }
                    return
                }

                if !srcIsDir.boolValue && !destIsDir.boolValue {
                    if isSymbolicLink(dest) {
                        throw CdpError(InstallerI18n.tr(
                            "检测到目标路径为符号链接，已拒绝覆盖: \(dest)",
                            "Destination path is a symbolic link; overwrite refused: \(dest)"
                        ))
                    }
                    if rename(tmpPath, dest) == 0 {
                        return
                    }
                }

                // 目录或 rename 受阻时采用可回滚 .old 两阶段替换
                clearReadOnlyPermissionsNoSymlink(dest)
                if isSymbolicLink(dest) {
                    throw CdpError(InstallerI18n.tr(
                        "检测到目标路径为符号链接，已拒绝覆盖: \(dest)",
                        "Destination path is a symbolic link; overwrite refused: \(dest)"
                    ))
                }
                let backupPath = "\(dest).old.\(getpid()).\(UUID().uuidString)"
                var movedOld = false
                do {
                    try fm.moveItem(atPath: dest, toPath: backupPath)
                    movedOld = true
                    try fm.moveItem(atPath: tmpPath, toPath: dest)
                    try? fm.removeItem(atPath: backupPath)
                    return
                } catch {
                    if movedOld && fm.fileExists(atPath: backupPath) && !fm.fileExists(atPath: dest) {
                        try? fm.moveItem(atPath: backupPath, toPath: dest)
                    }
                    throw error
                }
            } catch {
                if copiedTmp && fm.fileExists(atPath: tmpPath) {
                    try? fm.removeItem(atPath: tmpPath)
                }
                if error is CdpError { throw error }
                lastError = error
                if attempt < backoffs.count {
                    Thread.sleep(forTimeInterval: backoffs[attempt])
                }
            }
        }
        if let err = lastError {
            throw err
        }
    }

    private static func copyNativePluginAssets(from srcRoot: String, to pluginDir: String, preserveConfig: Bool) throws {
        let fm = FileManager.default
        if isSymbolicLink(pluginDir) {
            throw CdpError(InstallerI18n.tr(
                "检测到插件目录为符号链接，已拒绝写入: \(pluginDir)",
                "Plugin directory is a symbolic link; write refused: \(pluginDir)"
            ))
        }
        if fm.fileExists(atPath: pluginDir) {
            clearReadOnlyPermissionsNoSymlink(pluginDir)
        }
        try fm.createDirectory(atPath: pluginDir, withIntermediateDirectories: true, attributes: nil)
        let entries = try fm.contentsOfDirectory(atPath: srcRoot)
        let skipNames: Set<String> = [
            ".git", ".DS_Store", "__pycache__", ".daemon.pid", ".watch.pid", ".watch.lock",
            "node_modules", "installer", "scripts", "test", "tools",
            "Obsidian Prism.app", "Obsidian-Prism-macOS-universal.dmg", "installer.exe",
        ]
        for name in entries {
            if skipNames.contains(name) || name.hasSuffix(".log") || name.hasSuffix(".tmp") { continue }
            let src = (srcRoot as NSString).appendingPathComponent(name)
            let dest = (pluginDir as NSString).appendingPathComponent(name)
            if isSymbolicLink(src) {
                throw CdpError(InstallerI18n.tr(
                    "检测到插件源条目为符号链接，已拒绝部署: \(src)",
                    "Plugin source entry is a symbolic link; deployment refused: \(src)"
                ))
            }
            if isSymbolicLink(dest) {
                throw CdpError(InstallerI18n.tr(
                    "检测到插件目标路径为符号链接，已拒绝覆盖: \(dest)",
                    "Plugin target path is a symbolic link; overwrite refused: \(dest)"
                ))
            }
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: src, isDirectory: &isDir) else { continue }
            if !isDir.boolValue && name.caseInsensitiveCompare("config.json") == .orderedSame && preserveConfig && fm.fileExists(atPath: dest) {
                continue
            }
            if isDir.boolValue {
                try copyNativePluginAssets(from: src, to: dest, preserveConfig: false)
            } else {
                try copyItemSafelyWithRetry(from: src, to: dest)
            }
        }
    }

    private static func cleanupLegacySiblingPluginDir(_ pluginDir: String, log: ((String) -> Void)?) {
        guard !pluginDir.isEmpty else { return }
        let fm = FileManager.default
        let normPlugin = URL(fileURLWithPath: pluginDir).standardizedFileURL.path
        let parent = (normPlugin as NSString).deletingLastPathComponent
        guard !parent.isEmpty else { return }
        let legacyDir = (parent as NSString).appendingPathComponent("antigravity-prism")
        guard legacyDir != normPlugin,
              fm.fileExists(atPath: legacyDir),
              !isDangerousRootPath(legacyDir),
              !isSymbolicLink(legacyDir) else {
            return
        }
        stopNativeDaemonInDir(legacyDir, log: log)
        let legacyCfg = (legacyDir as NSString).appendingPathComponent("config.json")
        let targetCfg = (normPlugin as NSString).appendingPathComponent("config.json")
        if isValidConfigJsonFile(legacyCfg) && !fm.fileExists(atPath: targetCfg) && !isSymbolicLink(targetCfg) {
            try? fm.copyItem(atPath: legacyCfg, toPath: targetCfg)
        }
        clearReadOnlyPermissionsNoSymlink(legacyDir)
        if (try? fm.removeItem(atPath: legacyDir)) != nil {
            log?(InstallerI18n.tr(
                "已清理旧临时插件目录: \(legacyDir)",
                "Cleaned up legacy temporary plugin directory: \(legacyDir)"
            ))
        }
    }

    // MARK: - Lossless macOS Wrapper Launcher (~/Applications/Antigravity Prism.app)

    static func getDefaultLauncherDir() -> String {
        if let envDir = ProcessInfo.processInfo.environment["AG_PRISM_LAUNCHER_DIR"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !envDir.isEmpty {
            return URL(fileURLWithPath: envDir).standardizedFileURL.path
        }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return (home as NSString).appendingPathComponent("Applications")
    }

    static func resolveLauncherAppPath(opts: InstallerOptions) -> String {
        let baseDir: String
        if let customDir = opts.launcherDir?.trimmingCharacters(in: .whitespacesAndNewlines), !customDir.isEmpty {
            baseDir = URL(fileURLWithPath: customDir).standardizedFileURL.path
        } else {
            baseDir = getDefaultLauncherDir()
        }
        return (baseDir as NSString).appendingPathComponent(launcherBundleName)
    }

    private static func isTempSandboxInstallDir(_ dir: String) -> Bool {
        let norm = normalizeSystemRootPrefix(dir)
        let normTmp = normalizeSystemRootPrefix(NSTemporaryDirectory())
        if norm == "/private/tmp" || norm.hasPrefix("/private/tmp/") {
            return true
        }
        if !normTmp.isEmpty && (norm == normTmp || norm.hasPrefix(normTmp + "/")) {
            return true
        }
        return false
    }

    static func shouldManageHostLauncher(opts: InstallerOptions, installDir: String) -> Bool {
        if opts.launcherDir?.isEmpty == false || opts.explicitLauncherFlag {
            return true
        }
        if let envDir = ProcessInfo.processInfo.environment["AG_PRISM_LAUNCHER_DIR"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !envDir.isEmpty {
            return true
        }
        let defaultDir = URL(fileURLWithPath: getDefaultInstallDir()).standardizedFileURL.path
        let normInstall = URL(fileURLWithPath: installDir).standardizedFileURL.path
        if normInstall == defaultDir {
            return true
        }
        return !isTempSandboxInstallDir(normInstall)
    }

    private static func isUnsafeSymlinkPath(_ path: String) -> Bool {
        return isSymbolicLink(path) || CdpHelper.isSymbolicLinkOrUnsafePath(path)
    }

    private static func shellSingleQuote(_ value: String) -> String {
        return "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private static func atomicWriteFileNoFollow(data: Data, toFile path: String, mode: mode_t) throws {
        guard !path.isEmpty else {
            throw CdpError(InstallerI18n.tr("目标文件路径为空", "Target file path is empty"))
        }
        let parentDir = (path as NSString).deletingLastPathComponent
        let stopRoot = resolveInstallChainStopRoot(parentDir)
        if hasSymbolicLinkInChain(parentDir, stopRoot: stopRoot) || isUnsafeSymlinkPath(parentDir) {
            throw CdpError(InstallerI18n.tr(
                "目标父目录链路包含符号链接或无法验证，已拒绝写入: \(parentDir)",
                "Target parent directory chain contains a symbolic link or cannot be verified; write refused: \(parentDir)"
            ))
        }
        if isUnsafeSymlinkPath(path) {
            throw CdpError(InstallerI18n.tr(
                "目标路径为符号链接或无法验证，已拒绝写入: \(path)",
                "Target path is a symbolic link or cannot be verified; write refused: \(path)"
            ))
        }
        let tmpPath = "\(path).tmp.\(getpid()).\(UUID().uuidString)"
        let fd = open(tmpPath, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode)
        if fd < 0 {
            let errCode = errno
            throw CdpError(InstallerI18n.tr(
                "无法安全创建临时文件 \(tmpPath) (errno=\(errCode))",
                "Failed to safely create temporary file \(tmpPath) (errno=\(errCode))"
            ))
        }
        var closed = false
        var committed = false
        defer {
            if !closed { _ = close(fd) }
            if !committed { _ = unlink(tmpPath) }
        }
        if !data.isEmpty {
            try data.withUnsafeBytes { rawBuf in
                guard let baseAddr = rawBuf.baseAddress else { return }
                var totalWritten = 0
                while totalWritten < data.count {
                    let remaining = data.count - totalWritten
                    let written = write(fd, baseAddr.advanced(by: totalWritten), remaining)
                    if written < 0 {
                        if errno == EINTR { continue }
                        let errCode = errno
                        throw CdpError(InstallerI18n.tr(
                            "写入临时文件失败 \(tmpPath) (errno=\(errCode))",
                            "Failed to write temporary file \(tmpPath) (errno=\(errCode))"
                        ))
                    }
                    if written == 0 {
                        throw CdpError(InstallerI18n.tr(
                            "写入临时文件提前结束: \(tmpPath)",
                            "Short write while writing temporary file: \(tmpPath)"
                        ))
                    }
                    totalWritten += written
                }
            }
        }
        _ = fchmod(fd, mode)
        _ = fsync(fd)
        let closeRc = close(fd)
        closed = true
        if closeRc != 0 {
            let errCode = errno
            throw CdpError(InstallerI18n.tr(
                "关闭临时文件失败 \(tmpPath) (errno=\(errCode))",
                "Failed to close temporary file \(tmpPath) (errno=\(errCode))"
            ))
        }
        if isUnsafeSymlinkPath(path) {
            throw CdpError(InstallerI18n.tr(
                "目标路径为符号链接或无法验证，已拒绝覆盖: \(path)",
                "Target path is a symbolic link or cannot be verified; overwrite refused: \(path)"
            ))
        }
        if rename(tmpPath, path) != 0 {
            let errCode = errno
            throw CdpError(InstallerI18n.tr(
                "原子替换目标文件失败 \(path) (errno=\(errCode))",
                "Failed to atomically replace target file \(path) (errno=\(errCode))"
            ))
        }
        committed = true
    }

    static func isManagedLauncherBundle(at appPath: String) -> Bool {
        guard !appPath.isEmpty, !isUnsafeSymlinkPath(appPath) else { return false }
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: appPath, isDirectory: &isDir), isDir.boolValue else {
            return false
        }
        let contentsDir = (appPath as NSString).appendingPathComponent("Contents")
        if isUnsafeSymlinkPath(contentsDir) { return false }
        let resourcesDir = (contentsDir as NSString).appendingPathComponent("Resources")
        if isUnsafeSymlinkPath(resourcesDir) { return false }

        let markerPath = (appPath as NSString).appendingPathComponent(launcherMarkerRelPath)
        if !isUnsafeSymlinkPath(markerPath),
           isRegularFileNoSymlink(markerPath),
           let raw = try? String(contentsOfFile: markerPath, encoding: .utf8),
           let obj = try? MiniJson.parseObject(raw.trimmingCharacters(in: .whitespacesAndNewlines)),
           obj["managedBy"]?.stringValue == "obsidian-prism" {
            return true
        }

        let plistPath = (contentsDir as NSString).appendingPathComponent("Info.plist")
        if !isUnsafeSymlinkPath(plistPath),
           isRegularFileNoSymlink(plistPath),
           let dict = NSDictionary(contentsOfFile: plistPath),
           let bundleId = dict["CFBundleIdentifier"] as? String,
           bundleId == launcherBundleId {
            return true
        }
        return false
    }

    static func generateLauncherInfoPlist(version: String) -> String {
        let safeShort = xmlEscape(version.isEmpty ? "1.0.8-beta.3" : version)
        let numericParts = version.split(separator: "-").first.map(String.init) ?? "1.0.8"
        let safeBundleVer = xmlEscape(numericParts.isEmpty ? "1.0.8" : numericParts)
        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>CFBundleDevelopmentRegion</key>
          <string>en</string>
          <key>CFBundleDisplayName</key>
          <string>Antigravity Prism</string>
          <key>CFBundleExecutable</key>
          <string>launch</string>
          <key>CFBundleIconFile</key>
          <string>AppIcon</string>
          <key>CFBundleIdentifier</key>
          <string>\(xmlEscape(launcherBundleId))</string>
          <key>CFBundleInfoDictionaryVersion</key>
          <string>6.0</string>
          <key>CFBundleName</key>
          <string>Antigravity Prism</string>
          <key>CFBundlePackageType</key>
          <string>APPL</string>
          <key>CFBundleShortVersionString</key>
          <string>\(safeShort)</string>
          <key>CFBundleSignature</key>
          <string>????</string>
          <key>CFBundleVersion</key>
          <string>\(safeBundleVer)</string>
          <key>LSMinimumSystemVersion</key>
          <string>12.0</string>
          <key>LSUIElement</key>
          <false/>
          <key>NSHighResolutionCapable</key>
          <true/>
        </dict>
        </plist>
        """ + "\n"
    }

    static func generateLauncherShellScript(targetApp: String) -> String {
        let normalizedTarget = CdpHelper.normalizeAntigravityAppPath(targetApp)
        let quotedTarget = shellSingleQuote(normalizedTarget)
        let notFoundMsg = InstallerI18n.tr(
            "未在 /Applications 或 ~/Applications 中找到 Antigravity.app。",
            "Antigravity.app was not found in /Applications or ~/Applications."
        )
        let quotedNotFoundMsg = shellSingleQuote(notFoundMsg)
        let lines: [String] = [
            "#!/bin/sh",
            "set -eu",
            "",
            "# Obsidian Prism lossless wrapper launcher (never modifies Antigravity.app)",
            "PREFERRED_APP=\(quotedTarget)",
            "",
            "resolve_target_app() {",
            "  if [ -n \"$PREFERRED_APP\" ] && [ -d \"$PREFERRED_APP\" ]; then",
            "    printf '%s\\n' \"$PREFERRED_APP\"",
            "    return 0",
            "  fi",
            "  if [ -d \"/Applications/Antigravity.app\" ]; then",
            "    printf '%s\\n' \"/Applications/Antigravity.app\"",
            "    return 0",
            "  fi",
            "  if [ -d \"$HOME/Applications/Antigravity.app\" ]; then",
            "    printf '%s\\n' \"$HOME/Applications/Antigravity.app\"",
            "    return 0",
            "  fi",
            "  return 1",
            "}",
            "",
            "TARGET_APP=\"$(resolve_target_app || true)\"",
            "if [ -z \"$TARGET_APP\" ]; then",
            "  NOT_FOUND_MSG=\(quotedNotFoundMsg)",
            "  /usr/bin/osascript - \"$NOT_FOUND_MSG\" <<'APPLESCRIPT' >/dev/null 2>&1 || true",
            "on run argv",
            "  display dialog (item 1 of argv) with title \"Antigravity Prism\" buttons {\"OK\"} default button \"OK\"",
            "end run",
            "APPLESCRIPT",
            "  exit 1",
            "fi",
            "",
            "unset ELECTRON_RUN_AS_NODE",
            "",
            "detect_host_state() {",
            "  /bin/ps -ax -o pid=,command= | /usr/bin/awk -v app=\"$TARGET_APP\" '",
            "    BEGIN {",
            "      app_low = tolower(app)",
            "      main_pfx = app_low \"/contents/macos/antigravity\"",
            "      cdp_pid = 0",
            "      bare_pid = 0",
            "    }",
            "    {",
            "      pid = $1",
            "      cmd = $0",
            "      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, \"\", cmd)",
            "      low = tolower(cmd)",
            "      if (index(low, \"--type=\") > 0 || index(low, \"sidecar_sdk\") > 0 || index(low, \"main.mjs\") > 0 || index(low, \"watch.js\") > 0) next",
            "      pos = index(low, main_pfx)",
            "      if (pos == 0) next",
            "      after = substr(low, pos + length(main_pfx), 1)",
            "      if (after != \"\" && after != \" \" && after != \"\\t\" && after != \"\\\"\") next",
            "      if (index(low, \"--remote-debugging-port\") > 0) {",
            "        if (cdp_pid == 0) cdp_pid = pid",
            "      } else {",
            "        if (bare_pid == 0) bare_pid = pid",
            "      }",
            "    }",
            "    END {",
            "      if (cdp_pid > 0) printf \"cdp %s\\n\", cdp_pid",
            "      else if (bare_pid > 0) printf \"bare %s\\n\", bare_pid",
            "      else printf \"none 0\\n\"",
            "    }",
            "  '",
            "}",
            "",
            "list_family_pids() {",
            "  /bin/ps -ax -o pid=,command= | /usr/bin/awk -v app=\"$TARGET_APP\" '",
            "    BEGIN {",
            "      app_low = tolower(app)",
            "      macos_pfx = app_low \"/contents/macos/\"",
            "      fw_pfx = app_low \"/contents/frameworks/\"",
            "    }",
            "    {",
            "      pid = $1",
            "      cmd = $0",
            "      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, \"\", cmd)",
            "      low = tolower(cmd)",
            "      if (index(low, \"sidecars/daemon/main.mjs\") > 0 || index(low, \"/daemon/main.mjs\") > 0 || index(low, \"sidecar_sdk\") > 0 || index(low, \"obsidian-prism\") > 0 || index(low, \"antigravity-prism\") > 0 || index(low, \"agy-claude-style\") > 0 || index(low, \"/watch.js\") > 0) next",
            "      if (index(low, macos_pfx) > 0 || index(low, fw_pfx) > 0) print pid",
            "    }",
            "  '",
            "}",
            "",
            "is_singleton_lock_held() {",
            "  LOCK_PATH=\"$HOME/Library/Application Support/Antigravity/SingletonLock\"",
            "  if [ -L \"$LOCK_PATH\" ]; then",
            "    LINK_DEST=\"$(/usr/bin/readlink \"$LOCK_PATH\" 2>/dev/null || true)\"",
            "    LOCK_PID=\"${LINK_DEST##*-}\"",
            "    case \"$LOCK_PID\" in",
            "      ''|*[!0-9]*) return 0 ;;",
            "      *) /bin/kill -0 \"$LOCK_PID\" 2>/dev/null && return 0 || return 1 ;;",
            "    esac",
            "  fi",
            "  [ -e \"$LOCK_PATH\" ]",
            "}",
            "",
            "STATE_LINE=\"$(detect_host_state || printf 'none 0')\"",
            "HOST_STATE=\"${STATE_LINE%% *}\"",
            "HOST_PID=\"${STATE_LINE#* }\"",
            "",
            "if [ \"$HOST_STATE\" = \"cdp\" ]; then",
            "  exec /usr/bin/open -a \"$TARGET_APP\"",
            "fi",
            "",
            "if [ \"$HOST_STATE\" = \"bare\" ]; then",
            "  LOCALE_HINT=\"${AG_PRISM_LANG:-${LC_ALL:-${LANG:-}}}\"",
            "  if [ -z \"$LOCALE_HINT\" ]; then",
            "    LOCALE_HINT=\"$(/usr/bin/defaults read -g AppleLanguages 2>/dev/null | /usr/bin/head -n 3 | /usr/bin/tr '\\n' ' ' || true)\"",
            "  fi",
            "  case \"$LOCALE_HINT\" in",
            "    *zh*|*ZH*|*cn*|*CN*)",
            "      PROMPT_BTN=\"立即重启并开启\"",
            "      KEEP_BTN=\"保持现状\"",
            "      PROMPT_TITLE=\"Antigravity Prism\"",
            "      PROMPT_MSG=\"$(printf '检测到 Antigravity 当前正在运行，但未开启光学桥接端口（--remote-debugging-port=0）。\\n\\n是否温和重启 Antigravity 以激活 Obsidian Prism？')\"",
            "      ;;",
            "    *)",
            "      PROMPT_BTN=\"Relaunch with Prism\"",
            "      KEEP_BTN=\"Keep Running\"",
            "      PROMPT_TITLE=\"Antigravity Prism\"",
            "      PROMPT_MSG=\"$(printf 'Antigravity is currently running without --remote-debugging-port=0.\\n\\nGracefully relaunch Antigravity now to enable Obsidian Prism?')\"",
            "      ;;",
            "  esac",
            "  USER_CHOICE=\"$(/usr/bin/osascript - \"$PROMPT_MSG\" \"$PROMPT_TITLE\" \"$KEEP_BTN\" \"$PROMPT_BTN\" <<'APPLESCRIPT' 2>/dev/null || true",
            "on run argv",
            "  set msgText to item 1 of argv",
            "  set titleText to item 2 of argv",
            "  set keepBtn to item 3 of argv",
            "  set relaunchBtn to item 4 of argv",
            "  set res to display dialog msgText with title titleText buttons {keepBtn, relaunchBtn} default button relaunchBtn",
            "  return button returned of res",
            "end run",
            "APPLESCRIPT",
            ")\"",
            "  if [ \"$USER_CHOICE\" != \"$PROMPT_BTN\" ]; then",
            "    exec /usr/bin/open -a \"$TARGET_APP\"",
            "  fi",
            "",
            "  APP_BASE=\"$(/usr/bin/basename \"$TARGET_APP\")\"",
            "  if [ \"$TARGET_APP\" = \"/Applications/Antigravity.app\" ] || [ \"$APP_BASE\" = \"Antigravity.app\" ]; then",
            "    /usr/bin/osascript -e 'tell application \"Antigravity\" to quit' >/dev/null 2>&1 || /bin/kill -TERM \"$HOST_PID\" 2>/dev/null || true",
            "  else",
            "    /usr/bin/osascript - \"$TARGET_APP\" <<'APPLESCRIPT' >/dev/null 2>&1 || /bin/kill -TERM \"$HOST_PID\" 2>/dev/null || true",
            "on run argv",
            "  tell application (POSIX file (item 1 of argv) as text) to quit",
            "end run",
            "APPLESCRIPT",
            "  fi",
            "",
            "  WAIT_COUNT=0",
            "  while [ \"$WAIT_COUNT\" -lt 80 ]; do",
            "    ALIVE_PIDS=\"$(list_family_pids || true)\"",
            "    if [ -z \"$ALIVE_PIDS\" ] && ! is_singleton_lock_held; then",
            "      break",
            "    fi",
            "    /bin/sleep 0.12",
            "    WAIT_COUNT=$((WAIT_COUNT + 1))",
            "  done",
            "",
            "  ALIVE_PIDS=\"$(list_family_pids || true)\"",
            "  if [ -n \"$ALIVE_PIDS\" ]; then",
            "    for P in $ALIVE_PIDS; do",
            "      /bin/kill -TERM \"$P\" 2>/dev/null || true",
            "    done",
            "    HARD_COUNT=0",
            "    while [ \"$HARD_COUNT\" -lt 40 ]; do",
            "      ALIVE_PIDS=\"$(list_family_pids || true)\"",
            "      if [ -z \"$ALIVE_PIDS\" ] && ! is_singleton_lock_held; then",
            "        break",
            "      fi",
            "      /bin/sleep 0.1",
            "      HARD_COUNT=$((HARD_COUNT + 1))",
            "    done",
            "  fi",
            "  /bin/sleep 0.5",
            "fi",
            "",
            "exec /usr/bin/open -na \"$TARGET_APP\" --args --remote-debugging-port=0",
        ]
        return lines.joined(separator: "\n") + "\n"
    }

    @discardableResult
    static func createLosslessLauncher(appPath: String, targetApp: String?, version: String, log: ((String) -> Void)?) throws -> String {
        let normAppPath = URL(fileURLWithPath: appPath).standardizedFileURL.path
        let parentDir = (normAppPath as NSString).deletingLastPathComponent
        guard !parentDir.isEmpty else {
            throw CdpError(InstallerI18n.tr("无损启动器目标路径无效", "Invalid lossless launcher path"))
        }
        let stopRoot = resolveInstallChainStopRoot(parentDir)
        if hasSymbolicLinkInChain(parentDir, stopRoot: stopRoot) || isUnsafeSymlinkPath(parentDir) {
            throw CdpError(InstallerI18n.tr(
                "启动器目录链路包含符号链接，已拒绝创建: \(parentDir)",
                "Launcher directory chain contains a symbolic link; creation refused: \(parentDir)"
            ))
        }
        if isUnsafeSymlinkPath(normAppPath) {
            throw CdpError(InstallerI18n.tr(
                "目标启动器路径为符号链接，已拒绝覆盖: \(normAppPath)",
                "Target launcher path is a symbolic link; overwrite refused: \(normAppPath)"
            ))
        }

        let fm = FileManager.default
        if fm.fileExists(atPath: normAppPath) {
            guard isManagedLauncherBundle(at: normAppPath) else {
                throw CdpError(InstallerI18n.tr(
                    "检测到同名但非 Obsidian Prism 托管的应用，已拒绝覆盖: \(normAppPath)",
                    "Refused to overwrite existing unmanaged app with the same name: \(normAppPath)"
                ))
            }
        }

        try fm.createDirectory(atPath: parentDir, withIntermediateDirectories: true, attributes: nil)
        if hasSymbolicLinkInChain(parentDir, stopRoot: stopRoot) || isUnsafeSymlinkPath(normAppPath) {
            throw CdpError(InstallerI18n.tr(
                "启动器目录校验失败，已拒绝写入: \(normAppPath)",
                "Launcher directory verification failed; write refused: \(normAppPath)"
            ))
        }

        let contentsDir = (normAppPath as NSString).appendingPathComponent("Contents")
        let macosDir = (contentsDir as NSString).appendingPathComponent("MacOS")
        let resourcesDir = (contentsDir as NSString).appendingPathComponent("Resources")
        for dir in [normAppPath, contentsDir, macosDir, resourcesDir] {
            if isUnsafeSymlinkPath(dir) {
                throw CdpError(InstallerI18n.tr(
                    "启动器子目录为符号链接，已拒绝写入: \(dir)",
                    "Launcher subdirectory is a symbolic link; write refused: \(dir)"
                ))
            }
            try fm.createDirectory(atPath: dir, withIntermediateDirectories: true, attributes: nil)
            if isUnsafeSymlinkPath(dir) {
                throw CdpError(InstallerI18n.tr(
                    "启动器子目录为符号链接，已拒绝写入: \(dir)",
                    "Launcher subdirectory is a symbolic link; write refused: \(dir)"
                ))
            }
        }

        let resolvedTargetApp = CdpHelper.normalizeAntigravityAppPath(targetApp ?? "/Applications/Antigravity.app")
        let plistContent = generateLauncherInfoPlist(version: version)
        let launchScript = generateLauncherShellScript(targetApp: resolvedTargetApp)
        let isoFmt = ISO8601DateFormatter()
        let markerObj: [String: JsonValue] = [
            "managedBy": .string("obsidian-prism"),
            "bundleIdentifier": .string(launcherBundleId),
            "version": .string(version),
            "targetApp": .string(resolvedTargetApp),
            "createdAt": .string(isoFmt.string(from: Date())),
        ]
        let markerJson = MiniJson.stringify(.object(markerObj), pretty: true) + "\n"

        let plistPath = (contentsDir as NSString).appendingPathComponent("Info.plist")
        let pkgInfoPath = (contentsDir as NSString).appendingPathComponent("PkgInfo")
        let markerPath = (normAppPath as NSString).appendingPathComponent(launcherMarkerRelPath)
        let launchPath = (macosDir as NSString).appendingPathComponent("launch")

        try atomicWriteFileNoFollow(data: Data(plistContent.utf8), toFile: plistPath, mode: mode_t(0o644))
        try atomicWriteFileNoFollow(data: Data("APPL????".utf8), toFile: pkgInfoPath, mode: mode_t(0o644))
        try atomicWriteFileNoFollow(data: Data(markerJson.utf8), toFile: markerPath, mode: mode_t(0o644))
        try atomicWriteFileNoFollow(data: Data(launchScript.utf8), toFile: launchPath, mode: mode_t(0o755))

        if let resPath = Bundle.main.resourcePath {
            let iconSrc = (resPath as NSString).appendingPathComponent("AppIcon.icns")
            if !isUnsafeSymlinkPath(iconSrc),
               isRegularFileNoSymlink(iconSrc),
               let iconData = try? Data(contentsOf: URL(fileURLWithPath: iconSrc)),
               !iconData.isEmpty {
                let iconDest = (resourcesDir as NSString).appendingPathComponent("AppIcon.icns")
                try? atomicWriteFileNoFollow(data: iconData, toFile: iconDest, mode: mode_t(0o644))
            }
        }

        log?(InstallerI18n.tr(
            "已创建无损启动器: \(normAppPath)（可拖进 Dock 一键启动）",
            "Created lossless launcher: \(normAppPath) (drag to Dock for 1-click launch)"
        ))
        return normAppPath
    }

    @discardableResult
    static func removeLosslessLauncherIfManaged(appPath: String, log: ((String) -> Void)?) -> Bool {
        let normAppPath = URL(fileURLWithPath: appPath).standardizedFileURL.path
        var st = stat()
        if lstat(normAppPath, &st) != 0 {
            return false
        }
        let parentDir = (normAppPath as NSString).deletingLastPathComponent
        let stopRoot = resolveInstallChainStopRoot(parentDir)
        if hasSymbolicLinkInChain(parentDir, stopRoot: stopRoot) || isUnsafeSymlinkPath(normAppPath) {
            log?(InstallerI18n.tr(
                "[!] 检测到无损启动器路径或父目录为符号链接，已拒绝删除: \(normAppPath)",
                "[!] Launcher path or parent directory is a symbolic link; removal refused: \(normAppPath)"
            ))
            return false
        }
        guard isManagedLauncherBundle(at: normAppPath) else {
            log?(InstallerI18n.tr(
                "[!] 跳过移除 \(normAppPath)：未检测到 Obsidian Prism 启动器托管标记",
                "[!] Skipping removal of \(normAppPath): missing Obsidian Prism launcher marker"
            ))
            return false
        }
        clearReadOnlyPermissionsNoSymlink(normAppPath)
        do {
            try FileManager.default.removeItem(atPath: normAppPath)
            log?(InstallerI18n.tr(
                "已安全移除无损启动器: \(normAppPath)",
                "Safely removed lossless launcher: \(normAppPath)"
            ))
            return true
        } catch {
            return false
        }
    }

    static func runInstall(opts: InstallerOptions, progress: ((Int, String) -> Void)?) throws -> OperationResult {
        var currentStep = "validate-paths"
        var currentTargetPath = ""
        do {
            let result = OperationResult()
            result.mode = "install"
            let rawDir = (opts.installDir?.isEmpty == false) ? opts.installDir! : getDefaultInstallDir()
            let installDir = URL(fileURLWithPath: rawDir).standardizedFileURL.path
            let pluginDir = resolveNativePluginDir(opts: opts, resolvedInstallDir: installDir)
            currentTargetPath = installDir
            if isDangerousRootPath(installDir) {
                throw CdpError(InstallerI18n.tr(
                    "已拒绝将受保护的系统或用户根目录作为安装目录: \(installDir)",
                    "Refused to use a protected system or user root directory as install directory: \(installDir)"
                ))
            }
            if !pluginDir.isEmpty && isDangerousRootPath(pluginDir) {
                currentTargetPath = pluginDir
                throw CdpError(InstallerI18n.tr(
                    "已拒绝将受保护的系统或用户根目录作为插件目录: \(pluginDir)",
                    "Refused to use a protected system or user root directory as plugin directory: \(pluginDir)"
                ))
            }
            result.installDir = installDir
            result.pluginDir = pluginDir

            let report: (Int, String) -> Void = { pct, msg in
                progress?(pct, msg)
            }

            currentStep = "detect-host"
            currentTargetPath = ""
            report(10, InstallerI18n.tr(
                "正在检测本机 Antigravity Desktop 环境...",
                "Detecting local Antigravity Desktop environment..."
            ))
            let ag = detectAntigravityDesktop()
            result.antigravityApp = ag.appPath
            result.antigravityVersion = ag.version
            if let appPath = ag.appPath {
                let verPart = (ag.version?.isEmpty == false) ? " (\(ag.version!))" : ""
                report(18, InstallerI18n.tr(
                    "已发现 Antigravity Desktop\(verPart): \(appPath)",
                    "Found Antigravity Desktop\(verPart): \(appPath)"
                ))
            } else {
                report(18, InstallerI18n.tr(
                    "未在默认目录检测到 Antigravity.app，仍将安装并启用 CDP 自动监听",
                    "Antigravity.app not found in default locations; installing anyway with automatic CDP monitoring"
                ))
            }

            currentStep = "stop-legacy"
            currentTargetPath = installDir
            report(28, InstallerI18n.tr(
                "正在停止旧版守护进程（如存在）...",
                "Stopping existing watcher/daemon processes (if any)..."
            ))
            stopWatcherInDir(installDir, noAutostart: opts.noAutostart) { msg in
                report(32, msg)
            }
            stopNativeDaemonInDir(pluginDir) { msg in
                report(34, msg)
            }
            if !opts.noKillLegacy {
                stopLegacyNodeWatchers { msg in
                    report(35, msg)
                }
            }

            currentStep = "prepare-dirs"
            report(45, InstallerI18n.tr(
                "正在部署本地插件与独立守护资源...",
                "Deploying local plugin and standalone watcher assets..."
            ))
            let fm = FileManager.default
            currentTargetPath = installDir
            let installStopRoot = resolveInstallChainStopRoot(installDir)
            if isSymbolicLink(installDir) || hasSymbolicLinkInChain(installDir, stopRoot: installStopRoot) {
                throw CdpError(InstallerI18n.tr(
                    "检测到安装目录或其父目录链路包含符号链接，已拒绝操作: \(installDir)",
                    "Install directory or its parent chain contains a symbolic link; operation refused: \(installDir)"
                ))
            }
            try fm.createDirectory(atPath: installDir, withIntermediateDirectories: true, attributes: nil)
            if !pluginDir.isEmpty {
                currentTargetPath = pluginDir
                let pluginStopRoot = resolveInstallChainStopRoot(pluginDir)
                if isSymbolicLink(pluginDir) || hasSymbolicLinkInChain(pluginDir, stopRoot: pluginStopRoot) {
                    throw CdpError(InstallerI18n.tr(
                        "检测到插件目录或其父目录链路包含符号链接，已拒绝操作: \(pluginDir)",
                        "Plugin directory or its parent chain contains a symbolic link; operation refused: \(pluginDir)"
                    ))
                }
                try fm.createDirectory(atPath: pluginDir, withIntermediateDirectories: true, attributes: nil)
                cleanupLegacySiblingPluginDir(pluginDir) { msg in report(46, msg) }
            }

            guard let payloadDir = resolvePayloadDir() else {
                throw CdpError(InstallerI18n.tr(
                    "安装包内置资源 payload 缺失",
                    "Embedded installer payload resources are missing"
                ))
            }
            guard let watcherSrc = resolveWatcherBinarySource() else {
                throw CdpError(InstallerI18n.tr(
                    "安装包内置守护程序 \(watcherExeName) 缺失",
                    "Embedded watcher binary \(watcherExeName) is missing"
                ))
            }

            let installCfgPath = (installDir as NSString).appendingPathComponent("config.json")
            let pluginCfgPath = !pluginDir.isEmpty ? (pluginDir as NSString).appendingPathComponent("config.json") : ""
            _ = restoreUserConfigBackupIfNeeded(installDir: installDir, pluginDir: pluginDir)
            var hadInstallCfg = fm.fileExists(atPath: installCfgPath)
            let hadPluginCfg = !pluginCfgPath.isEmpty && fm.fileExists(atPath: pluginCfgPath)
            if !hadInstallCfg && hadPluginCfg {
                try? copyItemSafelyWithRetry(from: pluginCfgPath, to: installCfgPath)
                hadInstallCfg = fm.fileExists(atPath: installCfgPath)
            } else if hadInstallCfg && hadPluginCfg,
                      let pAttrs = try? fm.attributesOfItem(atPath: pluginCfgPath),
                      let iAttrs = try? fm.attributesOfItem(atPath: installCfgPath),
                      let pMtime = pAttrs[.modificationDate] as? Date,
                      let iMtime = iAttrs[.modificationDate] as? Date,
                      pMtime.timeIntervalSince(iMtime) > 0.25 {
                try? copyItemSafelyWithRetry(from: pluginCfgPath, to: installCfgPath)
            }

            currentStep = "extract-payload"
            var preservedConfig = false
            let payloadEntries = try fm.contentsOfDirectory(atPath: payloadDir)
            for name in payloadEntries {
                if name.hasPrefix(".") || name == "native-plugin" { continue }
                let src = (payloadDir as NSString).appendingPathComponent(name)
                let dest = (installDir as NSString).appendingPathComponent(name)
                currentTargetPath = dest
                var isDir: ObjCBool = false
                guard fm.fileExists(atPath: src, isDirectory: &isDir) else { continue }

                if !isDir.boolValue && name.caseInsensitiveCompare("config.json") == .orderedSame && fm.fileExists(atPath: dest) {
                    preservedConfig = true
                    continue
                }
                try copyItemSafelyWithRetry(from: src, to: dest)
            }

            if !pluginDir.isEmpty {
                currentTargetPath = pluginDir
                if let nativeSrc = resolveNativePluginSourceDir(payloadDir: payloadDir) {
                    try copyNativePluginAssets(from: nativeSrc, to: pluginDir, preserveConfig: true)
                } else {
                    try copyNativePluginAssets(from: payloadDir, to: pluginDir, preserveConfig: true)
                }
                if fm.fileExists(atPath: installCfgPath) && !pluginCfgPath.isEmpty {
                    if hadInstallCfg || !fm.fileExists(atPath: pluginCfgPath) {
                        try? copyItemSafelyWithRetry(from: installCfgPath, to: pluginCfgPath)
                    }
                }
            }
            result.nativePluginDeployed = !pluginDir.isEmpty && fm.fileExists(atPath: (pluginDir as NSString).appendingPathComponent("plugin.json"))

            currentStep = "sync-registry"
            currentTargetPath = pluginDir
            if result.nativePluginDeployed {
                let regOk = CdpHelper.syncHostPluginRegistry(pluginDir: pluginDir, enable: true)
                if !regOk {
                    let warn = InstallerI18n.tr(
                        "[!] 未能自动写入 ~/.gemini/config/config.json 插件注册项（非致命），请确认目标文件可写",
                        "[!] Failed to auto-update ~/.gemini/config/config.json plugin registry (non-fatal); please verify write permissions"
                    )
                    result.warnings.append(warn)
                    report(60, warn)
                }
            }

            currentStep = "deploy-watcher"
            let watcherDest = (installDir as NSString).appendingPathComponent(watcherExeName)
            currentTargetPath = watcherDest
            try copyItemSafelyWithRetry(from: watcherSrc, to: watcherDest)
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: watcherDest)

            let selfSrc = resolvedSelfExecutablePath()
            let selfDest = (installDir as NSString).appendingPathComponent(selfInstalledExeName)
            if !selfSrc.isEmpty && fm.fileExists(atPath: selfSrc) && selfSrc != selfDest {
                try? copyItemSafelyWithRetry(from: selfSrc, to: selfDest)
                try? fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: selfDest)
            }

            result.preservedExistingConfig = preservedConfig
            report(62, preservedConfig
                ? InstallerI18n.tr(
                    "已保留本机现有 config.json 用户配置并同步部署本地插件",
                    "Preserved existing config.json and deployed local plugin"
                )
                : InstallerI18n.tr(
                    "已部署本地插件并写入默认配置 config.json",
                    "Deployed local plugin and wrote default config.json"
                )
            )

            currentStep = "load-manifest"
            currentTargetPath = (installDir as NSString).appendingPathComponent("manifest.json")
            let manifest = try PluginManifest.load(baseDir: installDir)
            let activeCfg = CdpHelper.readConfig(baseDir: installDir, manifest: manifest)
            let lang = activeCfg["language"]?.stringValue ?? "auto"
            let palette = activeCfg["palette"]?.stringValue ?? "obsidian"
            let motion = activeCfg["motionLevel"]?.stringValue ?? "standard"
            let omni = activeCfg["omniModule"]?.stringValue ?? "on"
            result.configSummary = InstallerI18n.tr(
                "语言=\(lang) | 配色=\(palette) | 动效=\(motion) | Omni=\(omni)",
                "Lang=\(lang) | Theme=\(palette) | Motion=\(motion) | Omni=\(omni)"
            )

            currentStep = "create-launcher"
            if opts.createLauncher && shouldManageHostLauncher(opts: opts, installDir: installDir) {
                let targetLauncherPath = resolveLauncherAppPath(opts: opts)
                currentTargetPath = targetLauncherPath
                do {
                    let createdPath = try createLosslessLauncher(
                        appPath: targetLauncherPath,
                        targetApp: ag.appPath,
                        version: manifest.version,
                        log: { msg in report(65, msg) }
                    )
                    result.launcherCreated = true
                    result.launcherPath = createdPath
                } catch {
                    let warn = InstallerI18n.tr(
                        "[!] 创建无损启动器失败（非致命）: \(error.localizedDescription)",
                        "[!] Failed to create lossless launcher (non-fatal): \(error.localizedDescription)"
                    )
                    result.warnings.append(warn)
                    report(65, warn)
                }
            }

            currentStep = "start-native-daemon"
            currentTargetPath = pluginDir
            if !opts.noNativeDaemon && result.nativePluginDeployed {
                report(68, InstallerI18n.tr(
                    "正在通过内置运行时启动本地守护服务...",
                    "Starting local background daemon via bundled runtime..."
                ))
                result.nativeDaemonStarted = CdpHelper.ensureNativeDaemonRunning(
                    pluginDir: pluginDir,
                    cdpPort: opts.cdpPort,
                    preferredApp: ag.appPath,
                    log: { msg in report(70, msg) }
                )
            }

            currentStep = "start-watcher"
            currentTargetPath = watcherDest
            var needDirectWatcherSpawn = opts.noAutostart
            if !opts.noAutostart {
                report(74, InstallerI18n.tr(
                    "正在配置 macOS LaunchAgent 登录自启...",
                    "Configuring macOS LaunchAgent auto-start..."
                ))
                do {
                    try registerLaunchAgent(
                        installDir: installDir,
                        pluginDir: pluginDir,
                        cdpPort: opts.cdpPort,
                        noNativeDaemon: opts.noNativeDaemon,
                        noRelaunchPrompt: opts.noRelaunchPrompt,
                        lang: opts.lang
                    )
                    Thread.sleep(forTimeInterval: 0.25)
                    let pidFile = (installDir as NSString).appendingPathComponent(".watch.pid")
                    if !fm.fileExists(atPath: pidFile) {
                        needDirectWatcherSpawn = true
                    }
                } catch {
                    let warn = InstallerI18n.tr(
                        "[!] 配置 LaunchAgent 登录自启失败（非致命，已降级直接启动后台守护）: \(error.localizedDescription)",
                        "[!] Failed to configure LaunchAgent auto-start (non-fatal; falling back to direct background watcher): \(error.localizedDescription)"
                    )
                    result.warnings.append(warn)
                    report(78, warn)
                    needDirectWatcherSpawn = true
                }
            } else {
                report(74, InstallerI18n.tr(
                    "已按参数跳过 LaunchAgent 登录自启注册",
                    "Skipped LaunchAgent auto-start registration per CLI flag"
                ))
            }

            if needDirectWatcherSpawn {
                report(82, InstallerI18n.tr(
                    "正在启动后台静默守护进程...",
                    "Starting silent background watcher process..."
                ))
                var spawnErr: Error? = nil
                var spawned = false
                let startBackoffs: [TimeInterval] = [0.15, 0.3, 0.5]
                for attempt in 0...startBackoffs.count {
                    do {
                        try spawnWatcherDirectly(
                            installDir: installDir,
                            pluginDir: pluginDir,
                            cdpPort: opts.cdpPort,
                            noNativeDaemon: opts.noNativeDaemon,
                            noRelaunchPrompt: opts.noRelaunchPrompt,
                            lang: opts.lang
                        )
                        spawned = true
                        break
                    } catch {
                        spawnErr = error
                        if attempt < startBackoffs.count {
                            Thread.sleep(forTimeInterval: startBackoffs[attempt])
                        }
                    }
                }
                if !spawned {
                    if result.nativeDaemonStarted {
                        let errDesc = spawnErr?.localizedDescription ?? InstallerI18n.tr("未知错误", "Unknown error")
                        let warn = InstallerI18n.tr(
                            "[!] 启动独立守护 obsidian-prism-watcher 失败（非致命，本地守护服务已运行）: \(errDesc)",
                            "[!] Failed to launch standalone obsidian-prism-watcher (non-fatal; local background daemon is running): \(errDesc)"
                        )
                        result.warnings.append(warn)
                        report(84, warn)
                    } else if let err = spawnErr {
                        throw err
                    }
                }
            }

            currentStep = "verify-cdp"
            currentTargetPath = ""
            report(90, InstallerI18n.tr(
                "正在检查 Antigravity Desktop 实时注入状态...",
                "Verifying live Antigravity Desktop injection status..."
            ))
            let port = CdpHelper.readPort(overridePort: opts.cdpPort)
            var cdpReachable = false
            let watchLogPath = (installDir as NSString).appendingPathComponent("watch.log")

            if let port = port {
                for attempt in 0..<25 {
                    if let pages = try? CdpHelper.listPages(port: port) {
                        cdpReachable = true
                        let logContent = (try? String(contentsOfFile: watchLogPath, encoding: .utf8)) ?? ""
                        let watcherInjected = logContent.contains("[✓] 已注入 obsidian-prism:") ||
                            logContent.contains("[✓] Injected obsidian-prism:") ||
                            (!pluginDir.isEmpty && CdpHelper.isNativeDaemonAlive(pluginDir: pluginDir))
                        if !pages.isEmpty && watcherInjected {
                            var allReady = true
                            var titles: [String] = []
                            for page in pages {
                                titles.append(redactSensitiveUrl(CdpHelper.shortTitle(page)))
                                do {
                                    let session = try CdpSession.connect(wsUrl: page.webSocketDebuggerUrl, timeoutMs: 2000)
                                    defer { session.close() }
                                    let okVal = try session.evaluate("Boolean(window.__agPrism || window.__agClaudeStyle)", awaitPromise: false)
                                    if okVal.boolValue != true {
                                        allReady = false
                                    }
                                } catch {
                                    allReady = false
                                }
                            }
                            if allReady {
                                result.injectedPages = titles
                                break
                            }
                        }
                    } else {
                        if !ag.isRunning && opts.cdpPort == nil && attempt >= 1 {
                            break
                        }
                    }
                    Thread.sleep(forTimeInterval: 0.35)
                }
            }
            result.cdpPort = cdpReachable ? port : nil

            result.ok = true
            if !result.injectedPages.isEmpty {
                result.headline = InstallerI18n.tr(
                    "安装成功！已实时激活 \(result.injectedPages.count) 个 Antigravity 窗口",
                    "Installed! Activated \(result.injectedPages.count) Antigravity window(s)"
                )
                result.detail = InstallerI18n.tr(
                    "已部署本地插件与后台守护服务，并配置登录自启。后续打开新窗口或更新 Antigravity 后也会自动生效。",
                    "Deployed the local plugin, standby watcher, and auto-start. New windows and future Antigravity updates will apply automatically."
                )
                for title in result.injectedPages {
                    report(98, InstallerI18n.tr(
                        "已注入窗口: \(title)",
                        "Injected window: \(title)"
                    ))
                }
            } else if cdpReachable, let port = port {
                result.headline = InstallerI18n.tr(
                    "已安装本地插件并启动守护！等待 Antigravity 窗口就绪",
                    "Local plugin installed & watcher running! Waiting for Antigravity window"
                )
                result.detail = InstallerI18n.tr(
                    "已部署本地插件并启动后台守护。检测到调试端口 \(port)，窗口就绪后将自动完成激活。",
                    "Deployed local plugin and background watcher. Debug port \(port) is reachable; activation will complete automatically once a window is ready."
                )
            } else if opts.cdpPort == nil, CdpHelper.findBareAntigravityMainProcess() != nil {
                result.bareHostDetected = true
                result.headline = InstallerI18n.tr(
                    "安装完成！重新打开一次 Antigravity 即可激活界面",
                    "Installed! Relaunch Antigravity once to activate Obsidian Prism"
                )
                result.detail = InstallerI18n.tr(
                    "检测到当前 Antigravity (v2.33.0+) 未开启本地光学桥接端口（--remote-debugging-port=0），带参重新打开即可立即生效。",
                    "Antigravity (v2.33.0+) is currently running without the local optical bridge flag (--remote-debugging-port=0). Relaunch with the flag to activate immediately."
                )
            } else {
                result.headline = InstallerI18n.tr(
                    "安装成功！本地插件与后台守护已就绪",
                    "Installed! Local plugin & background watcher ready"
                )
                result.detail = InstallerI18n.tr(
                    "当前未检测到运行中的 Antigravity Desktop；原生插件与守护进程已就绪，打开 Antigravity Desktop 后会自动立即生效。",
                    "No running Antigravity Desktop detected. The native plugin and watcher are ready and will activate as soon as Antigravity opens."
                )
            }
            report(100, result.headline)
            return result
        } catch {
            let pathPart = currentTargetPath.isEmpty
                ? ""
                : InstallerI18n.tr(" | 路径: \(currentTargetPath)", " | Path: \(currentTargetPath)")
            throw CdpError("[\(currentStep)] \(error.localizedDescription)\(pathPart)")
        }
    }

    private static func normalizeSystemRootPrefix(_ rawPath: String) -> String {
        let trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        let std = URL(fileURLWithPath: trimmed).standardizedFileURL.path
        let clean = (std.count > 1 && std.hasSuffix("/")) ? String(std.dropLast()) : std
        if clean == "/tmp" { return "/private/tmp" }
        if clean.hasPrefix("/tmp/") { return "/private" + clean }
        if clean == "/var" { return "/private/var" }
        if clean.hasPrefix("/var/") { return "/private" + clean }
        return clean
    }

    private static func isNoSuchFileError(_ error: Error) -> Bool {
        let nsErr = error as NSError
        if nsErr.domain == NSCocoaErrorDomain &&
           (nsErr.code == NSFileReadNoSuchFileError || nsErr.code == NSFileNoSuchFileError) {
            return true
        }
        if nsErr.domain == NSPOSIXErrorDomain && nsErr.code == Int(ENOENT) {
            return true
        }
        if let underlying = nsErr.userInfo[NSUnderlyingErrorKey] as? NSError,
           underlying.domain == NSPOSIXErrorDomain && underlying.code == Int(ENOENT) {
            return true
        }
        return false
    }

    /// 检查路径是否为符号链接；除明确 ENOENT（目标不存在）外，所有 attributesOfItem 异常均 Fail-Closed 返回 true（视为不安全）。
    private static func isSymbolicLink(_ path: String) -> Bool {
        guard !path.isEmpty else { return true }
        do {
            let attrs = try FileManager.default.attributesOfItem(atPath: path)
            guard let ftype = attrs[.type] as? FileAttributeType else {
                return true
            }
            return ftype == .typeSymbolicLink
        } catch {
            return !isNoSuchFileError(error)
        }
    }

    private static func isRegularFileNoSymlink(_ path: String) -> Bool {
        guard !path.isEmpty else { return false }
        do {
            let attrs = try FileManager.default.attributesOfItem(atPath: path)
            guard let ftype = attrs[.type] as? FileAttributeType else {
                return false
            }
            return ftype == .typeRegular
        } catch {
            return false
        }
    }

    private static func isDangerousRootPath(_ dirPath: String) -> Bool {
        let trimmed = dirPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        let norm = normalizeSystemRootPrefix(trimmed)
        if norm == "/" || norm == "/Users" || norm == "/Applications" || norm == "/System" || norm == "/Library" || norm == "/tmp" || norm == "/private/tmp" || norm == "/var" || norm == "/private/var" {
            return true
        }
        let home = normalizeSystemRootPrefix(FileManager.default.homeDirectoryForCurrentUser.path)
        let protected = [
            home,
            (home as NSString).appendingPathComponent("Library"),
            (home as NSString).appendingPathComponent("Library/Application Support"),
            (home as NSString).appendingPathComponent("Documents"),
            (home as NSString).appendingPathComponent(".gemini"),
            (home as NSString).appendingPathComponent(".gemini/config"),
            (home as NSString).appendingPathComponent(".gemini/config/plugins"),
            (home as NSString).appendingPathComponent(".gemini/antigravity"),
        ]
        for p in protected {
            if norm == p || p.hasPrefix(norm + "/") { return true }
        }
        let redlineDirs = [
            (home as NSString).appendingPathComponent(".gemini/antigravity/conversations_archive"),
            (home as NSString).appendingPathComponent(".gemini/antigravity/prism-knowledge-space"),
            (home as NSString).appendingPathComponent("Documents/Antigravity-Spark"),
        ]
        for p in redlineDirs {
            if norm == p || norm.hasPrefix(p + "/") || p.hasPrefix(norm + "/") { return true }
        }
        return false
    }

    private static func isAllowedTelemetryOverrideDir(_ candidate: String, geminiRoot: String) -> Bool {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }
        let norm = normalizeSystemRootPrefix(trimmed)
        if isDangerousRootPath(norm) { return false }
        let home = normalizeSystemRootPrefix(FileManager.default.homeDirectoryForCurrentUser.path)
        var allowedRoots = [
            (home as NSString).appendingPathComponent(".gemini"),
            normalizeSystemRootPrefix(NSTemporaryDirectory()),
            "/private/tmp",
        ]
        if !geminiRoot.isEmpty {
            allowedRoots.append(normalizeSystemRootPrefix(geminiRoot))
        }
        let underAllowed = allowedRoots.contains { base in
            let b = (base.count > 1 && base.hasSuffix("/")) ? String(base.dropLast()) : base
            return !b.isEmpty && norm.hasPrefix(b + "/")
        }
        if !underAllowed { return false }
        let segments = norm.split(separator: "/").map { $0.lowercased() }
        return segments.contains("telemetry") || segments.contains("obsidian-prism")
    }

    private static func resolveAllowedAddonsOverrideDir(_ candidate: String, geminiRoot: String) -> (path: String, stopRoot: String)? {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        let norm = normalizeSystemRootPrefix(trimmed)
        if isDangerousRootPath(norm) { return nil }
        let segments = norm.split(separator: "/").map { $0.lowercased() }
        if segments.contains("conversations_archive") ||
           segments.contains("prism-knowledge-space") ||
           segments.contains("antigravity-spark") {
            return nil
        }
        guard segments.contains("addons") || segments.contains("obsidian-prism") else {
            return nil
        }
        let home = normalizeSystemRootPrefix(FileManager.default.homeDirectoryForCurrentUser.path)
        var allowedRoots = [
            (home as NSString).appendingPathComponent(".gemini"),
            normalizeSystemRootPrefix(NSTemporaryDirectory()),
            "/private/tmp",
        ]
        if !geminiRoot.isEmpty {
            allowedRoots.append(normalizeSystemRootPrefix(geminiRoot))
        }
        for base in allowedRoots {
            let b = (base.count > 1 && base.hasSuffix("/")) ? String(base.dropLast()) : base
            if !b.isEmpty && norm.hasPrefix(b + "/") {
                return (norm, b)
            }
        }
        return nil
    }

    private static func isAllowedAddonsOverrideDir(_ candidate: String, geminiRoot: String) -> Bool {
        return resolveAllowedAddonsOverrideDir(candidate, geminiRoot: geminiRoot) != nil
    }

    private static func resolveAllowedUsageCacheOverrideFile(_ candidate: String, hostCfgDir: String?, geminiRoot: String?) -> (path: String, stopRoot: String)? {
        let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        let normFile = normalizeSystemRootPrefix(trimmed)
        if normFile.isEmpty || (normFile as NSString).lastPathComponent.lowercased() != "obsidian-prism-usage-rollup-cache.json" {
            return nil
        }
        let parentDir = (normFile as NSString).deletingLastPathComponent
        if parentDir.isEmpty { return nil }
        let segments = parentDir.split(separator: "/").map { $0.lowercased() }
        if segments.contains("conversations_archive") ||
           segments.contains("prism-knowledge-space") ||
           segments.contains("antigravity-spark") {
            return nil
        }
        let home = normalizeSystemRootPrefix(FileManager.default.homeDirectoryForCurrentUser.path)
        var allowedRoots = [
            (home as NSString).appendingPathComponent(".gemini"),
            normalizeSystemRootPrefix(NSTemporaryDirectory()),
            "/private/tmp",
        ]
        if let hc = hostCfgDir, !hc.isEmpty {
            allowedRoots.append(normalizeSystemRootPrefix(hc))
        }
        if let gr = geminiRoot, !gr.isEmpty {
            allowedRoots.append(normalizeSystemRootPrefix(gr))
        }
        for base in allowedRoots {
            let b = (base.count > 1 && base.hasSuffix("/")) ? String(base.dropLast()) : base
            if !b.isEmpty && (parentDir == b || parentDir.hasPrefix(b + "/")) {
                return (normFile, b)
            }
        }
        return nil
    }

    private static func resolveInstallChainStopRoot(_ dirPath: String) -> String {
        let norm = normalizeSystemRootPrefix(dirPath)
        let home = normalizeSystemRootPrefix(FileManager.default.homeDirectoryForCurrentUser.path)
        if !home.isEmpty && (norm == home || norm.hasPrefix(home + "/")) {
            return home
        }
        if norm == "/private/tmp" || norm.hasPrefix("/private/tmp/") {
            return "/private/tmp"
        }
        if norm == "/private/var" || norm.hasPrefix("/private/var/") {
            return "/private/var"
        }
        if norm == "/Applications" || norm.hasPrefix("/Applications/") {
            return "/Applications"
        }
        return "/"
    }

    private static func hasSymbolicLinkInChain(_ targetDir: String, stopRoot: String) -> Bool {
        var cur = normalizeSystemRootPrefix(targetDir)
        let stop = normalizeSystemRootPrefix(stopRoot)
        if cur.isEmpty || stop.isEmpty { return true }
        var reachedStop = false
        for _ in 0..<64 {
            if isSymbolicLink(cur) { return true }
            if cur == stop {
                reachedStop = true
                break
            }
            let parent = (cur as NSString).deletingLastPathComponent
            if parent.isEmpty || parent == cur { break }
            cur = parent
        }
        return !reachedStop
    }

    private static func isValidConfigJsonFile(_ path: String) -> Bool {
        let fm = FileManager.default
        guard !path.isEmpty, fm.fileExists(atPath: path), !isSymbolicLink(path) else { return false }
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { return false }
        let clean = raw.replacingOccurrences(of: "\u{FEFF}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, let _ = try? MiniJson.parseObject(clean) else { return false }
        return true
    }

    private static func backupUserConfigBeforeUninstall(installDir: String, pluginDir: String) {
        guard let hostCfgDir = CdpHelper.resolveHostGeminiConfigDir(pluginDir: pluginDir),
              !hostCfgDir.isEmpty, !isSymbolicLink(hostCfgDir) else {
            return
        }
        let fm = FileManager.default
        let installCfg = (installDir as NSString).appendingPathComponent("config.json")
        let pluginCfg = !pluginDir.isEmpty ? (pluginDir as NSString).appendingPathComponent("config.json") : ""
        let installValid = isValidConfigJsonFile(installCfg)
        let pluginValid = !pluginCfg.isEmpty && isValidConfigJsonFile(pluginCfg)
        var chosen: String?
        if installValid && pluginValid,
           let pMtime = (try? fm.attributesOfItem(atPath: pluginCfg)[.modificationDate]) as? Date,
           let iMtime = (try? fm.attributesOfItem(atPath: installCfg)[.modificationDate]) as? Date {
            chosen = pMtime > iMtime ? pluginCfg : installCfg
        } else if pluginValid {
            chosen = pluginCfg
        } else if installValid {
            chosen = installCfg
        }
        guard let srcPath = chosen else { return }
        do {
            try fm.createDirectory(atPath: hostCfgDir, withIntermediateDirectories: true, attributes: nil)
            guard !isSymbolicLink(hostCfgDir) else { return }
            let backupPath = (hostCfgDir as NSString).appendingPathComponent("obsidian-prism-config.backup.json")
            guard !isSymbolicLink(backupPath) else { return }
            let tmpPath = backupPath + ".tmp.\(getpid())"
            if fm.fileExists(atPath: tmpPath) { try? fm.removeItem(atPath: tmpPath) }
            try fm.copyItem(atPath: srcPath, toPath: tmpPath)
            if fm.fileExists(atPath: backupPath) { try? fm.removeItem(atPath: backupPath) }
            try fm.moveItem(atPath: tmpPath, toPath: backupPath)
        } catch {}
    }

    @discardableResult
    private static func restoreUserConfigBackupIfNeeded(installDir: String, pluginDir: String) -> Bool {
        let fm = FileManager.default
        let installCfg = (installDir as NSString).appendingPathComponent("config.json")
        let pluginCfg = !pluginDir.isEmpty ? (pluginDir as NSString).appendingPathComponent("config.json") : ""
        if fm.fileExists(atPath: installCfg) || (!pluginCfg.isEmpty && fm.fileExists(atPath: pluginCfg)) {
            return false
        }
        guard let hostCfgDir = CdpHelper.resolveHostGeminiConfigDir(pluginDir: pluginDir),
              !hostCfgDir.isEmpty, !isSymbolicLink(hostCfgDir) else {
            return false
        }
        let backupPath = (hostCfgDir as NSString).appendingPathComponent("obsidian-prism-config.backup.json")
        guard isValidConfigJsonFile(backupPath), !isSymbolicLink(installCfg) else { return false }
        do {
            try fm.copyItem(atPath: backupPath, toPath: installCfg)
            return true
        } catch {
            return false
        }
    }

    private static func purgeUserPluginData(pluginDir: String) {
        // 绝对红线：严禁触碰 conversations_archive、Antigravity-Spark、prism-knowledge-space
        let fm = FileManager.default
        let hostCfgDir: String? = CdpHelper.resolveHostGeminiConfigDir(pluginDir: pluginDir)
        let geminiRoot: String? = {
            if let hc = hostCfgDir, !hc.isEmpty {
                return (hc as NSString).deletingLastPathComponent
            }
            return nil
        }()

        if let cfgDir = hostCfgDir, !cfgDir.isEmpty, fm.fileExists(atPath: cfgDir), !isSymbolicLink(cfgDir) {
            let exactFiles = [
                "obsidian-prism-config.backup.json",
                "obsidian-prism-thought.json",
                "obsidian-prism-thought-cache.json",
                "obsidian-prism-usage-rollup-cache.json",
                "obsidian-prism-storage-guard-state.json",
                "obsidian-prism-sidebar.json",
                "obsidian-prism-sidebar.json.lock",
                "obsidian-prism-wallpaper.json",
                "obsidian-prism-suggester.json",
            ]
            for name in exactFiles {
                let fp = (cfgDir as NSString).appendingPathComponent(name)
                if fm.fileExists(atPath: fp) && !isSymbolicLink(fp) {
                    try? fm.removeItem(atPath: fp)
                }
            }
            if let entries = try? fm.contentsOfDirectory(atPath: cfgDir) {
                for name in entries {
                    if name.hasPrefix("obsidian-prism-sidebar.json.v1") && name.hasSuffix(".bak") {
                        let fp = (cfgDir as NSString).appendingPathComponent(name)
                        if !isSymbolicLink(fp) {
                            try? fm.removeItem(atPath: fp)
                        }
                    }
                }
            }

            let envTel = ProcessInfo.processInfo.environment["AG_PRISM_TELEMETRY_DIR"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let gRoot = geminiRoot ?? ""
            let telemetryDir: String
            if !envTel.isEmpty {
                telemetryDir = isAllowedTelemetryOverrideDir(envTel, geminiRoot: gRoot)
                    ? normalizeSystemRootPrefix(envTel)
                    : ""
            } else if !gRoot.isEmpty {
                telemetryDir = ((gRoot as NSString).appendingPathComponent("antigravity") as NSString)
                    .appendingPathComponent("sidecar_data/obsidian-prism/telemetry")
            } else {
                telemetryDir = ""
            }
            if !telemetryDir.isEmpty && fm.fileExists(atPath: telemetryDir) && !isDangerousRootPath(telemetryDir) {
                let pluginDataDir = (telemetryDir as NSString).deletingLastPathComponent
                let sidecarDataDir = (pluginDataDir as NSString).deletingLastPathComponent
                if !isSymbolicLink(sidecarDataDir) && !isSymbolicLink(pluginDataDir) && !isSymbolicLink(telemetryDir) {
                    try? fm.removeItem(atPath: telemetryDir)
                }
            }

            let envAddons = ProcessInfo.processInfo.environment["AG_PRISM_ADDONS_DIR"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let addonsTarget: (path: String, stopRoot: String)?
            if !envAddons.isEmpty {
                addonsTarget = resolveAllowedAddonsOverrideDir(envAddons, geminiRoot: gRoot)
            } else if !gRoot.isEmpty {
                let defAddons = ((gRoot as NSString).appendingPathComponent("antigravity") as NSString)
                    .appendingPathComponent("sidecar_data/obsidian-prism/addons")
                addonsTarget = (normalizeSystemRootPrefix(defAddons), normalizeSystemRootPrefix(gRoot))
            } else {
                addonsTarget = nil
            }
            if let target = addonsTarget, !target.path.isEmpty, fm.fileExists(atPath: target.path), !isDangerousRootPath(target.path) {
                let pluginDataDir = (target.path as NSString).deletingLastPathComponent
                let sidecarDataDir = (pluginDataDir as NSString).deletingLastPathComponent
                if !hasSymbolicLinkInChain(target.path, stopRoot: target.stopRoot) &&
                   !isSymbolicLink(sidecarDataDir) &&
                   !isSymbolicLink(pluginDataDir) &&
                   !isSymbolicLink(target.path) {
                    try? fm.removeItem(atPath: target.path)
                }
            }
        }

        let envUsageCache = ProcessInfo.processInfo.environment["PRISM_USAGE_CACHE_PATH"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let allowed = resolveAllowedUsageCacheOverrideFile(envUsageCache, hostCfgDir: hostCfgDir, geminiRoot: geminiRoot) {
            let parentDir = (allowed.path as NSString).deletingLastPathComponent
            if !hasSymbolicLinkInChain(parentDir, stopRoot: allowed.stopRoot) &&
               !isSymbolicLink(allowed.path) &&
               isRegularFileNoSymlink(allowed.path) {
                try? fm.removeItem(atPath: allowed.path)
            }
        }
    }

    private static let fallbackSwarmI18nRemoveExpression: String =
        "(() => { try { window.__agPrismSwarmI18n?.destroy?.(); } catch {} try { document.documentElement?.removeAttribute?.('data-ag-prism-swarm-i18n'); } catch {} try { delete window.__agPrismSwarmI18n; } catch {} try { delete globalThis.__agPrismSwarmI18n; } catch {} try { delete window.__agPrismSwarmI18nFactory; } catch {} try { delete globalThis.__agPrismSwarmI18nFactory; } catch {} return { ok: true, status: 'off' }; })()"

    private static func redactSensitiveUrl(_ raw: String) -> String {
        guard !raw.isEmpty else { return "" }
        guard let re = try? NSRegularExpression(pattern: "([?&](?:token|auth|signature|key|secret)=)[^&\\s#\"']+", options: [.caseInsensitive]) else {
            return raw
        }
        let range = NSRange(raw.startIndex..<raw.endIndex, in: raw)
        return re.stringByReplacingMatches(in: raw, options: [], range: range, withTemplate: "$1<REDACTED>")
    }

    private static func isSwarmSidecarUrl(_ rawUrl: String) -> Bool {
        let trimmed = rawUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let comps = URLComponents(string: trimmed) else { return false }
        guard (comps.scheme ?? "").lowercased() == "plugin" else { return false }
        guard comps.port == nil, comps.user == nil, comps.password == nil else { return false }
        guard comps.path == "/" else { return false }
        let host = comps.host ?? ""
        return host.range(of: "^swarm--swarm_board-\\d+$", options: .regularExpression) != nil
    }

    private static func readSwarmI18nRemoveExpression(installDir: String, payloadDir: String?) -> String {
        let dirs = [installDir, payloadDir].compactMap { $0 }.filter { !$0.isEmpty }
        for dir in dirs {
            let manifestPath = (dir as NSString).appendingPathComponent("manifest.json")
            if let text = try? String(contentsOfFile: manifestPath, encoding: .utf8),
               let raw = try? MiniJson.parseObject(text),
               let expr = raw["swarmI18nRemoveExpression"]?.stringValue,
               !expr.isEmpty {
                return expr
            }
        }
        return fallbackSwarmI18nRemoveExpression
    }

    private static func listSwarmTargets(port: Int) throws -> [CdpPageInfo] {
        guard let url = URL(string: "http://127.0.0.1:\(port)/json/list") else {
            return []
        }
        let cfg = URLSessionConfiguration.ephemeral
        cfg.connectionProxyDictionary = [:]
        cfg.timeoutIntervalForRequest = 2.0
        cfg.timeoutIntervalForResource = 2.0
        let session = URLSession(configuration: cfg)
        defer { session.finishTasksAndInvalidate() }

        let sem = DispatchSemaphore(value: 0)
        var fetchedData: Data?
        var fetchedError: Error?
        let task = session.dataTask(with: url) { data, _, err in
            fetchedData = data
            fetchedError = err
            sem.signal()
        }
        task.resume()
        if sem.wait(timeout: .now() + .milliseconds(2500)) == .timedOut {
            task.cancel()
            return []
        }
        if let err = fetchedError { throw err }
        guard let data = fetchedData, let jsonText = String(data: data, encoding: .utf8) else {
            return []
        }
        let targets = try MiniJson.parseArray(jsonText)
        var out: [CdpPageInfo] = []
        for targetVal in targets {
            guard let t = targetVal.objectValue else { continue }
            let type = (t["type"]?.stringValue ?? "").lowercased()
            let wsUrl = t["webSocketDebuggerUrl"]?.stringValue ?? ""
            let pageUrl = t["url"]?.stringValue ?? ""
            let title = t["title"]?.stringValue ?? ""
            if (type == "iframe" || type == "page") && !wsUrl.isEmpty && isSwarmSidecarUrl(pageUrl) {
                let id = t["id"]?.stringValue ?? wsUrl
                let safeUrl = redactSensitiveUrl(pageUrl)
                let safeTitle = redactSensitiveUrl(title.isEmpty ? pageUrl : title)
                out.append(CdpPageInfo(id: id, title: safeTitle, url: safeUrl, webSocketDebuggerUrl: wsUrl))
            }
        }
        return out
    }

    static func runUninstall(opts: InstallerOptions, progress: ((Int, String) -> Void)?) -> OperationResult {
        let result = OperationResult()
        result.mode = "uninstall"
        let rawDir = (opts.installDir?.isEmpty == false) ? opts.installDir! : getDefaultInstallDir()
        let installDir = URL(fileURLWithPath: rawDir).standardizedFileURL.path
        let pluginDir = resolveNativePluginDir(opts: opts, resolvedInstallDir: installDir)
        if isDangerousRootPath(installDir) || (!pluginDir.isEmpty && isDangerousRootPath(pluginDir)) {
            result.ok = false
            result.headline = InstallerI18n.tr(
                "已拒绝在受保护目录执行卸载",
                "Refused to uninstall a protected directory"
            )
            result.detail = InstallerI18n.tr(
                "目标路径受保护: \(installDir)",
                "Protected target path: \(installDir)"
            )
            return result
        }
        result.installDir = installDir
        result.pluginDir = pluginDir

        let report: (Int, String) -> Void = { pct, msg in
            progress?(pct, msg)
        }

        let cleanLaunchAgent = !opts.noAutostart || shouldCleanHostLaunchAgent(installDir: installDir)
        report(15, InstallerI18n.tr(
            "正在停止后台守护进程...",
            "Stopping background watcher and daemon processes..."
        ))
        stopWatcherInDir(installDir, noAutostart: !cleanLaunchAgent) { msg in
            report(25, msg)
        }
        stopNativeDaemonInDir(pluginDir) { msg in
            report(30, msg)
        }

        report(40, InstallerI18n.tr(
            "正在通过 CDP 清理运行中的 Antigravity Desktop 界面...",
            "Restoring active Antigravity Desktop windows via CDP..."
        ))
        let port = CdpHelper.readPort(overridePort: opts.cdpPort)
        result.cdpPort = port

        var removeExpr: String?
        if let m = try? PluginManifest.load(baseDir: installDir), !m.removeExpression.isEmpty {
            removeExpr = m.removeExpression
        } else if let payloadDir = resolvePayloadDir(),
                  let m = try? PluginManifest.load(baseDir: payloadDir),
                  !m.removeExpression.isEmpty {
            removeExpr = m.removeExpression
        }
        let swarmRemoveExpr = readSwarmI18nRemoveExpression(installDir: installDir, payloadDir: resolvePayloadDir())

        if let port = port, let expr = removeExpr, !expr.isEmpty,
           let pages = try? CdpHelper.listPages(port: port) {
            for page in pages {
                if let session = try? CdpSession.connect(wsUrl: page.webSocketDebuggerUrl, timeoutMs: 3000) {
                    defer { session.close() }
                    if (try? session.evaluate(expr, awaitPromise: false)) != nil {
                        let title = redactSensitiveUrl(CdpHelper.shortTitle(page))
                        result.injectedPages.append(title)
                        report(55, InstallerI18n.tr(
                            "已恢复原生界面: \(title)",
                            "Restored native UI: \(title)"
                        ))
                    }
                }
            }
        }
        if let port = port, !swarmRemoveExpr.isEmpty,
           let swarmTargets = try? listSwarmTargets(port: port) {
            for target in swarmTargets {
                if let session = try? CdpSession.connect(wsUrl: target.webSocketDebuggerUrl, timeoutMs: 2000) {
                    defer { session.close() }
                    if (try? session.evaluate(swarmRemoveExpr, awaitPromise: false)) != nil {
                        let title = redactSensitiveUrl(CdpHelper.shortTitle(target))
                        report(62, InstallerI18n.tr(
                            "已恢复原生 Swarm 面板: \(title)",
                            "Restored native Swarm pane: \(title)"
                        ))
                    }
                }
            }
        }

        if cleanLaunchAgent {
            report(70, InstallerI18n.tr(
                "正在移除 LaunchAgent 登录自启项...",
                "Removing LaunchAgent auto-start item..."
            ))
            unloadLaunchAgent()
            let plistPath = getLaunchAgentPlistPath()
            if FileManager.default.fileExists(atPath: plistPath) {
                try? FileManager.default.removeItem(atPath: plistPath)
            }
        }

        if !opts.purgeData {
            backupUserConfigBeforeUninstall(installDir: installDir, pluginDir: pluginDir)
        }

        if !pluginDir.isEmpty {
            _ = CdpHelper.syncHostPluginRegistry(pluginDir: pluginDir, enable: false)
        }
        if !pluginDir.isEmpty && FileManager.default.fileExists(atPath: pluginDir) && !isSymbolicLink(pluginDir) {
            report(78, InstallerI18n.tr(
                "正在清理本地插件目录: \(pluginDir)",
                "Removing local plugin directory: \(pluginDir)"
            ))
            try? FileManager.default.removeItem(atPath: pluginDir)
        }

        if shouldManageHostLauncher(opts: opts, installDir: installDir) {
            let launcherPath = resolveLauncherAppPath(opts: opts)
            result.launcherPath = launcherPath
            result.launcherRemoved = removeLosslessLauncherIfManaged(appPath: launcherPath) { msg in
                report(82, msg)
            }
        }

        report(86, InstallerI18n.tr(
            "正在清理安装目录: \(installDir)",
            "Removing installation directory: \(installDir)"
        ))
        if FileManager.default.fileExists(atPath: installDir) && !isSymbolicLink(installDir) {
            try? FileManager.default.removeItem(atPath: installDir)
        }

        if opts.purgeData {
            report(92, InstallerI18n.tr(
                "正在清除插件配置与遥测缓存...",
                "Purging plugin configuration and telemetry caches..."
            ))
            purgeUserPluginData(pluginDir: pluginDir)
        }

        result.ok = true
        result.headline = InstallerI18n.tr(
            "已卸载并恢复 Antigravity Desktop 原生界面",
            "Uninstalled and restored native Antigravity Desktop UI"
        )
        result.detail = !result.injectedPages.isEmpty
            ? InstallerI18n.tr(
                "已停止守护、移除自启，并立即还原了 \(result.injectedPages.count) 个打开的窗口。",
                "Stopped background processes, removed auto-start, and immediately restored \(result.injectedPages.count) open window(s)."
            )
            : InstallerI18n.tr(
                "已停止守护、移除登录自启并清理安装目录。",
                "Stopped background processes, removed auto-start, and cleaned up installation files."
            )
        report(100, result.headline)
        return result
    }
}

final class FlippedView: NSView {
    override var isFlipped: Bool { return true }
}

final class InstallerAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let opts: InstallerOptions
    private var window: NSWindow!
    private var statusHeadline: NSTextField!
    private var statusDetail: NSTextField!
    private var metaLabel: NSTextField!
    private var progressBar: NSProgressIndicator!
    private var logView: NSTextView!
    private var launcherCheckbox: NSButton!
    private var uninstallBtn: NSButton!
    private var openDirBtn: NSButton!
    private var installBtn: NSButton!
    private var launchAgBtn: NSButton!
    private var closeBtn: NSButton!

    private var activeInstallDir: String
    private var activePluginDir: String
    private var antigravityApp: String?
    private var busy = false

    init(opts: InstallerOptions) {
        self.opts = opts
        let rawDir = (opts.installDir?.isEmpty == false) ? opts.installDir! : InstallerCore.getDefaultInstallDir()
        self.activeInstallDir = URL(fileURLWithPath: rawDir).standardizedFileURL.path
        self.activePluginDir = InstallerCore.resolveNativePluginDir(opts: opts, resolvedInstallDir: self.activeInstallDir)
        super.init()
    }

    private func setupMainMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(NSMenuItem(
            title: InstallerI18n.tr("退出 Obsidian Prism", "Quit Obsidian Prism"),
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        ))
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: InstallerI18n.tr("编辑", "Edit"))
        editMenu.addItem(NSMenuItem(
            title: InstallerI18n.tr("复制", "Copy"),
            action: #selector(NSText.copy(_:)),
            keyEquivalent: "c"
        ))
        editMenu.addItem(NSMenuItem(
            title: InstallerI18n.tr("全选", "Select All"),
            action: #selector(NSText.selectAll(_:)),
            keyEquivalent: "a"
        ))
        editMenuItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }

    private static func srgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1.0) -> NSColor {
        return NSColor(srgbRed: r / 255.0, green: g / 255.0, blue: b / 255.0, alpha: a)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()

        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 588, height: 492),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        win.title = InstallerI18n.tr(
            "Obsidian Prism 安装与配置工具",
            "Obsidian Prism Installer"
        )
        win.appearance = NSAppearance(named: .aqua)
        win.backgroundColor = Self.srgb(248, 246, 243)
        win.isReleasedWhenClosed = false
        win.delegate = self

        let root = FlippedView(frame: NSRect(x: 0, y: 0, width: 588, height: 492))
        win.contentView = root

        // Header
        let header = FlippedView(frame: NSRect(x: 0, y: 0, width: 588, height: 80))
        header.wantsLayer = true
        header.layer?.backgroundColor = Self.srgb(26, 25, 24).cgColor
        root.addSubview(header)

        let iconView = NSImageView(frame: NSRect(x: 20, y: 18, width: 44, height: 44))
        iconView.image = NSApp.applicationIconImage
        iconView.imageScaling = .scaleProportionallyUpOrDown
        header.addSubview(iconView)

        let titleLabel = NSTextField(labelWithString: InstallerI18n.tr(
            "Obsidian Prism · 安装与配置工具",
            "Obsidian Prism Installer"
        ))
        titleLabel.frame = NSRect(x: 76, y: 15, width: 492, height: 24)
        titleLabel.textColor = Self.srgb(250, 248, 245)
        titleLabel.font = NSFont.systemFont(ofSize: 17, weight: .bold)
        header.addSubview(titleLabel)

        let subtitleLabel = NSTextField(labelWithString: InstallerI18n.tr(
            "Antigravity Desktop 无损实时界面增强、思考滑块与 Token HUD",
            "Lossless real-time UI enhancements, effort slider & Token HUD for Antigravity Desktop"
        ))
        subtitleLabel.frame = NSRect(x: 76, y: 45, width: 492, height: 18)
        subtitleLabel.textColor = Self.srgb(217, 119, 87)
        subtitleLabel.font = NSFont.systemFont(ofSize: 12, weight: .regular)
        header.addSubview(subtitleLabel)

        // Status card
        let card = FlippedView(frame: NSRect(x: 20, y: 96, width: 548, height: 118))
        card.wantsLayer = true
        card.layer?.backgroundColor = NSColor.white.cgColor
        card.layer?.borderColor = Self.srgb(222, 217, 209).cgColor
        card.layer?.borderWidth = 1.0
        card.layer?.cornerRadius = 6.0
        root.addSubview(card)

        statusHeadline = NSTextField(labelWithString: opts.uninstall
            ? InstallerI18n.tr("准备卸载并恢复原版界面...", "Preparing to uninstall and restore native UI...")
            : InstallerI18n.tr("正在检测本地 Antigravity 环境...", "Detecting local Antigravity environment..."))
        statusHeadline.frame = NSRect(x: 14, y: 12, width: 520, height: 24)
        statusHeadline.textColor = Self.srgb(28, 25, 23)
        statusHeadline.font = NSFont.systemFont(ofSize: 14, weight: .bold)
        statusHeadline.lineBreakMode = .byTruncatingTail
        card.addSubview(statusHeadline)

        statusDetail = NSTextField(wrappingLabelWithString: opts.uninstall
            ? InstallerI18n.tr(
                "请确认是否卸载 Obsidian Prism、停止后台守护并恢复原生界面。",
                "Please confirm uninstalling Obsidian Prism, stopping background processes, and restoring the native UI."
            )
            : InstallerI18n.tr(
                "正在只读检测 Antigravity Desktop 与安装状态，等待你确认后再开始安装...",
                "Running read-only preflight checks on Antigravity Desktop; waiting for your confirmation..."
            ))
        statusDetail.frame = NSRect(x: 14, y: 40, width: 520, height: 40)
        statusDetail.textColor = Self.srgb(87, 83, 78)
        statusDetail.font = NSFont.systemFont(ofSize: 12, weight: .regular)
        statusDetail.maximumNumberOfLines = 2
        card.addSubview(statusDetail)

        metaLabel = NSTextField(labelWithString: InstallerI18n.tr(
            "插件目录: \(activePluginDir)",
            "Plugin Dir: \(activePluginDir)"
        ))
        metaLabel.frame = NSRect(x: 14, y: 88, width: 520, height: 18)
        metaLabel.textColor = Self.srgb(120, 113, 108)
        metaLabel.font = NSFont.systemFont(ofSize: 11, weight: .regular)
        metaLabel.lineBreakMode = .byTruncatingMiddle
        card.addSubview(metaLabel)

        // Progress bar
        progressBar = NSProgressIndicator(frame: NSRect(x: 20, y: 224, width: 548, height: 14))
        progressBar.isIndeterminate = false
        progressBar.minValue = 0
        progressBar.maxValue = 100
        progressBar.doubleValue = 0
        root.addSubview(progressBar)

        // Log area
        let scroll = NSScrollView(frame: NSRect(x: 20, y: 248, width: 548, height: 144))
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        let tv = NSTextView(frame: NSRect(x: 0, y: 0, width: 530, height: 140))
        tv.isEditable = false
        tv.isSelectable = true
        tv.backgroundColor = Self.srgb(252, 251, 249)
        tv.textColor = Self.srgb(41, 37, 36)
        tv.font = NSFont.monospacedSystemFont(ofSize: 11.5, weight: .regular)
        tv.isVerticallyResizable = true
        tv.isHorizontallyResizable = false
        tv.autoresizingMask = [.width]
        tv.textContainer?.widthTracksTextView = true
        scroll.documentView = tv
        root.addSubview(scroll)
        self.logView = tv

        // Optional lossless wrapper launcher checkbox (checked by default)
        launcherCheckbox = NSButton(
            checkboxWithTitle: InstallerI18n.tr(
                "创建无损启动器（~/Applications/Antigravity Prism.app，可拖进 Dock 一键开启）",
                "Create lossless launcher (~/Applications/Antigravity Prism.app, pin to Dock)"
            ),
            target: self,
            action: #selector(handleLauncherToggle)
        )
        launcherCheckbox.frame = NSRect(x: 20, y: 402, width: 548, height: 22)
        launcherCheckbox.state = opts.createLauncher ? .on : .off
        launcherCheckbox.font = NSFont.systemFont(ofSize: 12, weight: .regular)
        launcherCheckbox.isHidden = opts.uninstall
        root.addSubview(launcherCheckbox)

        // Buttons
        uninstallBtn = NSButton(
            title: InstallerI18n.tr("卸载并恢复原版", "Uninstall & Restore"),
            target: self,
            action: #selector(handleUninstallClick)
        )
        uninstallBtn.frame = NSRect(x: 20, y: 440, width: 144, height: 32)
        uninstallBtn.bezelStyle = .rounded
        uninstallBtn.isEnabled = false
        root.addSubview(uninstallBtn)

        openDirBtn = NSButton(
            title: InstallerI18n.tr("打开配置目录", "Open Config Dir"),
            target: self,
            action: #selector(handleOpenDirClick)
        )
        openDirBtn.frame = NSRect(x: 172, y: 440, width: 118, height: 32)
        openDirBtn.bezelStyle = .rounded
        openDirBtn.isEnabled = false
        root.addSubview(openDirBtn)

        installBtn = NSButton(
            title: InstallerI18n.tr("立即安装", "Install Now"),
            target: self,
            action: #selector(handleInstallClick)
        )
        installBtn.frame = NSRect(x: 304, y: 440, width: 148, height: 32)
        installBtn.bezelStyle = .rounded
        installBtn.keyEquivalent = "\r"
        installBtn.isHidden = opts.uninstall
        installBtn.isEnabled = false
        root.addSubview(installBtn)

        launchAgBtn = NSButton(
            title: InstallerI18n.tr("启动 Antigravity", "Launch Antigravity"),
            target: self,
            action: #selector(handleLaunchAgClick)
        )
        launchAgBtn.frame = NSRect(x: 304, y: 440, width: 148, height: 32)
        launchAgBtn.bezelStyle = .rounded
        launchAgBtn.isHidden = true
        launchAgBtn.isEnabled = false
        root.addSubview(launchAgBtn)

        closeBtn = NSButton(
            title: InstallerI18n.tr("取消", "Cancel"),
            target: self,
            action: #selector(handleCloseClick)
        )
        closeBtn.frame = NSRect(x: 460, y: 440, width: 108, height: 32)
        closeBtn.bezelStyle = .rounded
        closeBtn.keyEquivalent = "\u{1b}"
        closeBtn.isEnabled = true
        root.addSubview(closeBtn)

        win.center()
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        self.window = win

        startInitialAction()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        return !busy
    }

    @objc private func handleLauncherToggle() {
        opts.createLauncher = (launcherCheckbox.state == .on)
        opts.explicitLauncherFlag = true
    }

    private func appendLog(_ msg: String) {
        let df = DateFormatter()
        df.dateFormat = "HH:mm:ss"
        let line = "[\(df.string(from: Date()))] \(msg)\n"
        DispatchQueue.main.async {
            let attr = NSAttributedString(
                string: line,
                attributes: [
                    .font: NSFont.monospacedSystemFont(ofSize: 11.5, weight: .regular),
                    .foregroundColor: Self.srgb(41, 37, 36),
                ]
            )
            self.logView.textStorage?.append(attr)
            self.logView.scrollToEndOfDocument(nil)
        }
    }

    private func updateProgress(_ pct: Int, _ msg: String) {
        let clamped = Double(max(0, min(100, pct)))
        DispatchQueue.main.async {
            self.progressBar.doubleValue = clamped
        }
        appendLog(msg)
    }

    private func setButtonsEnabled(_ enabled: Bool) {
        uninstallBtn.isEnabled = enabled
        openDirBtn.isEnabled = enabled
        installBtn.isEnabled = enabled
        launchAgBtn.isEnabled = enabled
        closeBtn.isEnabled = enabled
        launcherCheckbox.isEnabled = enabled
    }

    private func startInitialAction() {
        if opts.uninstall {
            let alert = NSAlert()
            alert.messageText = InstallerI18n.tr("卸载确认", "Confirm Uninstall")
            alert.informativeText = InstallerI18n.tr(
                "确认要卸载 Obsidian Prism 并恢复 Antigravity Desktop 原生界面吗？",
                "Are you sure you want to uninstall Obsidian Prism and restore the native Antigravity Desktop UI?"
            )
            alert.alertStyle = .informational
            alert.addButton(withTitle: InstallerI18n.tr("确认卸载", "Uninstall"))
            alert.addButton(withTitle: InstallerI18n.tr("取消", "Cancel"))
            if alert.runModal() == .alertFirstButtonReturn {
                executeUninstall()
            } else {
                window.close()
            }
        } else {
            prepareInstallChoice()
        }
    }

    private func prepareInstallChoice() {
        setButtonsEnabled(false)
        closeBtn.isEnabled = true
        let installDir = activeInstallDir
        let pluginDir = activePluginDir
        DispatchQueue.global(qos: .userInitiated).async {
            let fm = FileManager.default
            let ag = InstallerCore.detectAntigravityDesktop()
            let hasNative = !pluginDir.isEmpty && fm.fileExists(atPath: (pluginDir as NSString).appendingPathComponent("plugin.json"))
            let hasWatcher = fm.fileExists(atPath: (installDir as NSString).appendingPathComponent("obsidian-prism-watcher"))
            let alreadyInstalled = hasNative || hasWatcher
            let hasDir = (!pluginDir.isEmpty && fm.fileExists(atPath: pluginDir)) || fm.fileExists(atPath: installDir)
            let port = CdpHelper.readPort(overridePort: self.opts.cdpPort)

            DispatchQueue.main.async {
                self.antigravityApp = ag.appPath
                if alreadyInstalled {
                    self.statusHeadline.stringValue = InstallerI18n.tr(
                        "已检测到本地 Obsidian Prism · 请选择操作",
                        "Existing Obsidian Prism Installation Found"
                    )
                    self.statusHeadline.textColor = Self.srgb(28, 25, 23)
                    self.statusDetail.stringValue = InstallerI18n.tr(
                        "点击「重新安装 / 升级」可覆盖更新插件并保留现有配置；点击「卸载并恢复原版」可彻底卸载并还原原生界面。",
                        "Click \"Reinstall / Upgrade\" to update while keeping your settings, or \"Uninstall & Restore\" to remove and restore the native UI."
                    )
                    self.installBtn.title = InstallerI18n.tr("重新安装 / 升级", "Reinstall / Upgrade")
                } else {
                    self.statusHeadline.stringValue = InstallerI18n.tr(
                        "是否安装 Obsidian Prism · 黑曜棱镜？",
                        "Install Obsidian Prism?"
                    )
                    self.statusHeadline.textColor = Self.srgb(28, 25, 23)
                    self.statusDetail.stringValue = InstallerI18n.tr(
                        "将部署本地插件与 LaunchAgent 守护（不修改 Antigravity 核心程序文件）。请点击「立即安装」开始，或点击「取消」退出。",
                        "Deploys the local plugin and LaunchAgent watcher without modifying Antigravity.app binaries. Click \"Install Now\" to proceed."
                    )
                    self.installBtn.title = InstallerI18n.tr("立即安装", "Install Now")
                }

                let agSummary: String
                if let appPath = ag.appPath, !appPath.isEmpty {
                    let ver = (ag.version?.isEmpty == false)
                        ? "v\(ag.version!)"
                        : InstallerI18n.tr("已检测到", "Detected")
                    let runState: String
                    if ag.isRunning {
                        runState = port != nil
                            ? InstallerI18n.tr("运行中 · 端口 \(port!)", "Running · Port \(port!)")
                            : InstallerI18n.tr("运行中", "Running")
                    } else {
                        runState = InstallerI18n.tr("未运行", "Not Running")
                    }
                    agSummary = "Antigravity: \(ver) (\(runState))"
                } else {
                    agSummary = InstallerI18n.tr(
                        "未检测到运行中的 Antigravity（支持预先安装）",
                        "Antigravity not detected (pre-install supported)"
                    )
                }
                self.metaLabel.stringValue = "\(agSummary) | \(pluginDir)"

                self.appendLog(InstallerI18n.tr(
                    "环境只读预检完成，当前未对本机做任何修改，等待你确认操作。",
                    "Read-only preflight check completed; no changes have been made yet."
                ))
                self.appendLog(InstallerI18n.tr("原生插件目录: \(pluginDir)", "Native plugin dir: \(pluginDir)"))
                self.appendLog(InstallerI18n.tr("后台守护目录: \(installDir)", "Watcher install dir: \(installDir)"))
                if let appPath = ag.appPath, !appPath.isEmpty {
                    self.appendLog(InstallerI18n.tr(
                        "检测到 Antigravity Desktop: \(appPath)",
                        "Detected Antigravity Desktop: \(appPath)"
                    ))
                }

                self.progressBar.doubleValue = 0
                self.launchAgBtn.isHidden = true
                self.installBtn.isHidden = false
                self.installBtn.isEnabled = true
                self.installBtn.keyEquivalent = "\r"
                self.launcherCheckbox.isHidden = false
                self.launcherCheckbox.isEnabled = true
                self.uninstallBtn.isEnabled = alreadyInstalled
                self.openDirBtn.isEnabled = hasDir
                self.closeBtn.title = InstallerI18n.tr("取消", "Cancel")
                self.closeBtn.keyEquivalent = "\u{1b}"
                self.closeBtn.isEnabled = true
            }
        }
    }

    @objc private func handleInstallClick() {
        executeInstall()
    }

    private func executeInstall() {
        if busy { return }
        busy = true
        opts.createLauncher = (launcherCheckbox.state == .on)
        statusHeadline.stringValue = InstallerI18n.tr(
            "正在安装并配置本机 Antigravity Desktop...",
            "Installing and configuring Antigravity Desktop..."
        )
        statusHeadline.textColor = Self.srgb(28, 25, 23)
        statusDetail.stringValue = InstallerI18n.tr(
            "正在部署本地插件与后台守护服务，请稍候...",
            "Deploying local plugin and background watcher, please wait..."
        )
        progressBar.doubleValue = 5
        setButtonsEnabled(false)
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let res = try InstallerCore.runInstall(opts: self.opts) { pct, msg in
                    self.updateProgress(pct, msg)
                }
                DispatchQueue.main.async {
                    self.activeInstallDir = res.installDir
                    if !res.pluginDir.isEmpty { self.activePluginDir = res.pluginDir }
                    self.antigravityApp = res.antigravityApp
                    self.statusHeadline.stringValue = res.headline
                    self.statusHeadline.textColor = Self.srgb(21, 128, 61)
                    self.statusDetail.stringValue = res.detail
                    self.metaLabel.stringValue = InstallerI18n.tr(
                        "配置: \(res.configSummary)",
                        "Config: \(res.configSummary)"
                    )
                    self.openDirBtn.isEnabled = FileManager.default.fileExists(atPath: self.activePluginDir) || FileManager.default.fileExists(atPath: self.activeInstallDir)
                    self.uninstallBtn.isEnabled = true
                    self.launcherCheckbox.isEnabled = true
                    let showLaunch = (self.antigravityApp != nil && res.injectedPages.isEmpty && !res.bareHostDetected)
                    self.launchAgBtn.isHidden = !showLaunch
                    self.launchAgBtn.isEnabled = showLaunch
                    self.installBtn.isHidden = showLaunch
                    if !showLaunch {
                        self.installBtn.title = InstallerI18n.tr("重新安装", "Reinstall")
                        self.installBtn.isEnabled = true
                        self.installBtn.keyEquivalent = ""
                    }
                    self.busy = false
                    self.closeBtn.title = InstallerI18n.tr("完成并关闭", "Done & Close")
                    self.closeBtn.keyEquivalent = "\r"
                    self.closeBtn.isEnabled = true

                    let env = ProcessInfo.processInfo.environment
                    if res.bareHostDetected &&
                       !self.opts.silent &&
                       !self.opts.noRelaunchPrompt &&
                       env["PRISM_NO_RELAUNCH_PROMPT"] != "1" &&
                       env["AG_PRISM_NO_RELAUNCH_PROMPT"] != "1",
                       let bare = CdpHelper.findBareAntigravityMainProcess() {
                        let alert = NSAlert()
                        alert.messageText = InstallerI18n.tr(
                            "立即激活 Obsidian Prism",
                            "Activate Obsidian Prism Now"
                        )
                        alert.informativeText = InstallerI18n.tr(
                            "检测到正在运行的 Antigravity (v2.33.0+) 未开启本地光学桥接端口（--remote-debugging-port=0）。\n\n是否立即重新打开 Antigravity 使黑曜棱镜（Obsidian Prism）界面当场生效？",
                            "Antigravity (v2.33.0+) is currently running without the local optical bridge flag (--remote-debugging-port=0).\n\nRelaunch Antigravity now to activate the Obsidian Prism UI immediately?"
                        )
                        alert.alertStyle = .informational
                        alert.addButton(withTitle: InstallerI18n.tr("立即重新打开", "Relaunch Now"))
                        alert.addButton(withTitle: InstallerI18n.tr("稍后手动重开", "Later"))
                        let confirmed = (alert.runModal() == .alertFirstButtonReturn)
                        CdpHelper.recordPromptedForHost(
                            pid: bare.pid,
                            startTimeMs: bare.startTimeMs,
                            decision: confirmed ? "yes" : "no",
                            installDir: res.installDir,
                            pluginDir: res.pluginDir
                        )
                        if confirmed {
                            self.busy = true
                            self.closeBtn.isEnabled = false
                            self.statusHeadline.stringValue = InstallerI18n.tr(
                                "正在带参重新打开 Antigravity 并激活界面...",
                                "Relaunching Antigravity with optical bridge flag..."
                            )
                            DispatchQueue.global(qos: .userInitiated).async {
                                let ok = CdpHelper.relaunchAntigravityWithCdp(host: bare, waitExitMs: 15000) { m in
                                    self.appendLog(m)
                                }
                                if ok {
                                    for _ in 0..<24 {
                                        if let newPort = CdpHelper.readPort(overridePort: nil) {
                                            if !self.opts.noNativeDaemon && res.nativePluginDeployed {
                                                _ = CdpHelper.ensureNativeDaemonRunning(
                                                    pluginDir: res.pluginDir,
                                                    cdpPort: newPort,
                                                    preferredApp: res.antigravityApp
                                                ) { m in self.appendLog(m) }
                                            }
                                            break
                                        }
                                        Thread.sleep(forTimeInterval: 0.35)
                                    }
                                }
                                DispatchQueue.main.async {
                                    if ok {
                                        self.statusHeadline.stringValue = InstallerI18n.tr(
                                            "安装成功！已带参重开并激活 Antigravity 界面",
                                            "Installed! Antigravity relaunched and activated"
                                        )
                                        self.statusDetail.stringValue = InstallerI18n.tr(
                                            "已带 --remote-debugging-port=0 重新打开 Antigravity 并激活本地插件与后台守护服务。",
                                            "Relaunched Antigravity with --remote-debugging-port=0 and activated the local plugin and background daemon."
                                        )
                                    }
                                    self.busy = false
                                    self.closeBtn.isEnabled = true
                                }
                            }
                        }
                    }
                }
            } catch {
                self.appendLog(InstallerI18n.tr(
                    "[✗] 错误: \(error.localizedDescription)",
                    "[✗] Error: \(error.localizedDescription)"
                ))
                DispatchQueue.main.async {
                    self.statusHeadline.stringValue = InstallerI18n.tr("安装失败", "Installation Failed")
                    self.statusHeadline.textColor = Self.srgb(185, 28, 28)
                    self.statusDetail.stringValue = error.localizedDescription
                    self.launchAgBtn.isHidden = true
                    self.installBtn.isHidden = false
                    self.installBtn.title = InstallerI18n.tr("重试安装", "Retry Install")
                    self.installBtn.isEnabled = true
                    self.installBtn.keyEquivalent = "\r"
                    self.launcherCheckbox.isEnabled = true
                    self.busy = false
                    self.closeBtn.title = InstallerI18n.tr("关闭", "Close")
                    self.closeBtn.keyEquivalent = "\u{1b}"
                    self.closeBtn.isEnabled = true
                }
            }
        }
    }

    @objc private func handleUninstallClick() {
        let alert = NSAlert()
        alert.messageText = InstallerI18n.tr("卸载并恢复原版", "Uninstall & Restore Native UI")
        alert.informativeText = InstallerI18n.tr(
            "确认卸载 Obsidian Prism、停止后台守护并立即恢复 Antigravity 原生界面？",
            "Confirm uninstalling Obsidian Prism, stopping background processes, and immediately restoring the native Antigravity UI?"
        )
        alert.alertStyle = .warning
        alert.addButton(withTitle: InstallerI18n.tr("确认卸载", "Uninstall"))
        alert.addButton(withTitle: InstallerI18n.tr("取消", "Cancel"))
        if alert.runModal() == .alertFirstButtonReturn {
            executeUninstall()
        }
    }

    private func executeUninstall() {
        if busy { return }
        busy = true
        statusHeadline.stringValue = InstallerI18n.tr(
            "正在卸载 Obsidian Prism 并恢复原版界面...",
            "Uninstalling Obsidian Prism and restoring native UI..."
        )
        statusHeadline.textColor = Self.srgb(28, 25, 23)
        statusDetail.stringValue = InstallerI18n.tr(
            "正在停止后台守护并清理插件文件，请稍候...",
            "Stopping background processes and cleaning up plugin files, please wait..."
        )
        progressBar.doubleValue = 5
        setButtonsEnabled(false)
        DispatchQueue.global(qos: .userInitiated).async {
            let res = InstallerCore.runUninstall(opts: self.opts) { pct, msg in
                self.updateProgress(pct, msg)
            }
            DispatchQueue.main.async {
                self.statusHeadline.stringValue = res.headline
                self.statusHeadline.textColor = Self.srgb(3, 105, 161)
                self.statusDetail.stringValue = res.detail
                self.metaLabel.stringValue = InstallerI18n.tr(
                    "已清理目录: \(res.installDir)",
                    "Cleaned directory: \(res.installDir)"
                )
                self.openDirBtn.isEnabled = false
                self.uninstallBtn.isEnabled = false
                self.launchAgBtn.isHidden = true
                self.installBtn.isHidden = false
                self.installBtn.title = InstallerI18n.tr("重新安装", "Reinstall")
                self.installBtn.isEnabled = true
                self.installBtn.keyEquivalent = ""
                self.launcherCheckbox.isEnabled = true
                self.busy = false
                self.closeBtn.title = InstallerI18n.tr("完成并关闭", "Done & Close")
                self.closeBtn.keyEquivalent = "\r"
                self.closeBtn.isEnabled = true
            }
        }
    }

    @objc private func handleOpenDirClick() {
        let fm = FileManager.default
        let targetDir = (!activePluginDir.isEmpty && fm.fileExists(atPath: activePluginDir)) ? activePluginDir : activeInstallDir
        if fm.fileExists(atPath: targetDir) {
            NSWorkspace.shared.open(URL(fileURLWithPath: targetDir))
        }
    }

    @objc private func handleLaunchAgClick() {
        if let appPath = antigravityApp, FileManager.default.fileExists(atPath: appPath) {
            let normalizedApp = CdpHelper.normalizeAntigravityAppPath(appPath)
            let openProc = Process()
            openProc.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            openProc.arguments = ["-na", normalizedApp, "--args", CdpHelper.cdpOptInFlag]
            var cleanEnv = ProcessInfo.processInfo.environment
            cleanEnv.removeValue(forKey: "ELECTRON_RUN_AS_NODE")
            openProc.environment = cleanEnv
            openProc.standardOutput = FileHandle.nullDevice
            openProc.standardError = FileHandle.nullDevice
            try? openProc.run()
        }
    }

    @objc private func handleCloseClick() {
        window.close()
    }
}

func parseInstallerArgs(_ args: [String]) -> InstallerOptions {
    let opts = InstallerOptions()
    var i = 1
    while i < args.count {
        let a = args[i]
        if a.hasPrefix("-psn_") {
            i += 1
            continue
        }
        if a == "--uninstall" { opts.uninstall = true }
        else if a == "--silent" || a == "/S" || a == "-s" { opts.silent = true }
        else if a == "--popup" { opts.popup = true }
        else if a == "--status" { opts.statusOnly = true }
        else if a == "--no-autostart" { opts.noAutostart = true }
        else if a == "--no-kill-legacy" { opts.noKillLegacy = true }
        else if a == "--no-native-daemon" { opts.noNativeDaemon = true }
        else if a == "--no-relaunch-prompt" { opts.noRelaunchPrompt = true }
        else if a == "--purge-data" { opts.purgeData = true }
        else if a == "--create-launcher" {
            opts.createLauncher = true
            opts.explicitLauncherFlag = true
        }
        else if a == "--no-launcher" {
            opts.createLauncher = false
            opts.explicitLauncherFlag = true
        }
        else if a == "--launcher-dir" && i + 1 < args.count {
            i += 1
            opts.launcherDir = args[i]
            opts.explicitLauncherFlag = true
        }
        else if a == "--lang" && i + 1 < args.count {
            i += 1
            opts.lang = args[i]
            InstallerI18n.setExplicitLanguage(args[i])
        }
        else if a.hasPrefix("--lang=") {
            let val = String(a.dropFirst("--lang=".count))
            opts.lang = val
            InstallerI18n.setExplicitLanguage(val)
        }
        else if a == "--install-dir" && i + 1 < args.count { i += 1; opts.installDir = args[i] }
        else if a == "--plugin-dir" && i + 1 < args.count { i += 1; opts.pluginDir = args[i] }
        else if a == "--cdp-port" && i + 1 < args.count {
            i += 1
            if let p = Int(args[i]), p > 0 { opts.cdpPort = p }
        }
        else if a == "--out" && i + 1 < args.count { i += 1; opts.outFile = args[i] }
        i += 1
    }
    return opts
}

func writeOperationOutFile(_ outFile: String?, res: OperationResult) {
    guard let outFile = outFile, !outFile.isEmpty else { return }
    let d: [String: JsonValue] = [
        "ok": .bool(res.ok),
        "mode": .string(res.mode),
        "headline": .string(res.headline),
        "detail": .string(res.detail),
        "installDir": .string(res.installDir),
        "pluginDir": .string(res.pluginDir),
        "nativePluginDeployed": .bool(res.nativePluginDeployed),
        "nativeDaemonStarted": .bool(res.nativeDaemonStarted),
        "bareHostDetected": .bool(res.bareHostDetected),
        "launcherCreated": .bool(res.launcherCreated),
        "launcherRemoved": .bool(res.launcherRemoved),
        "launcherPath": res.launcherPath.map { .string($0) } ?? .null,
        "antigravityApp": res.antigravityApp.map { .string($0) } ?? .null,
        "antigravityVersion": res.antigravityVersion.map { .string($0) } ?? .null,
        "cdpPort": res.cdpPort.map { .int(Int64($0)) } ?? .null,
        "injectedPages": .array(res.injectedPages.map { .string($0) }),
        "preservedExistingConfig": .bool(res.preservedExistingConfig),
        "warnings": .array(res.warnings.map { .string($0) }),
    ]
    let text = MiniJson.stringify(.object(d), pretty: true) + "\n"
    try? text.write(toFile: outFile, atomically: true, encoding: .utf8)
}

func runInstallerMain() -> Int32 {
    let opts = parseInstallerArgs(CommandLine.arguments)

    if opts.statusOnly {
        let rawDir = (opts.installDir?.isEmpty == false) ? opts.installDir! : InstallerCore.getDefaultInstallDir()
        let dir = URL(fileURLWithPath: rawDir).standardizedFileURL.path
        let pluginDir = InstallerCore.resolveNativePluginDir(opts: opts, resolvedInstallDir: dir)
        let ag = InstallerCore.detectAntigravityDesktop()
        let port = CdpHelper.readPort(overridePort: opts.cdpPort)
        let watcherPath = (dir as NSString).appendingPathComponent(InstallerCore.watcherExeName)
        let launcherPath = InstallerCore.resolveLauncherAppPath(opts: opts)
        let fm = FileManager.default
        let st: [String: JsonValue] = [
            "installed": .bool(fm.fileExists(atPath: dir) && fm.fileExists(atPath: watcherPath)),
            "installDir": .string(dir),
            "pluginDir": .string(pluginDir),
            "nativePluginInstalled": .bool(!pluginDir.isEmpty && fm.fileExists(atPath: (pluginDir as NSString).appendingPathComponent("plugin.json"))),
            "nativeDaemonAlive": .bool(!pluginDir.isEmpty && CdpHelper.isNativeDaemonAlive(pluginDir: pluginDir)),
            "launchAgent": .bool(fm.fileExists(atPath: InstallerCore.getLaunchAgentPlistPath())),
            "launcherInstalled": .bool(InstallerCore.isManagedLauncherBundle(at: launcherPath)),
            "launcherPath": .string(launcherPath),
            "antigravityApp": ag.appPath.map { .string($0) } ?? .null,
            "antigravityVersion": ag.version.map { .string($0) } ?? .null,
            "antigravityRunning": .bool(ag.isRunning),
            "cdpPort": port.map { .int(Int64($0)) } ?? .null,
        ]
        let json = MiniJson.stringify(.object(st), pretty: true) + "\n"
        if let outFile = opts.outFile, !outFile.isEmpty {
            try? json.write(toFile: outFile, atomically: true, encoding: .utf8)
        } else {
            print(json, terminator: "")
        }
        return 0
    }

    if opts.silent {
        do {
            let res = opts.uninstall
                ? InstallerCore.runUninstall(opts: opts, progress: nil)
                : try InstallerCore.runInstall(opts: opts, progress: nil)
            writeOperationOutFile(opts.outFile, res: res)
            if opts.popup {
                let app = NSApplication.shared
                app.setActivationPolicy(.accessory)
                let alert = NSAlert()
                alert.messageText = res.headline
                alert.informativeText = res.detail
                alert.runModal()
            }
            return res.ok ? 0 : 1
        } catch {
            if let outFile = opts.outFile, !outFile.isEmpty {
                let errObj: [String: JsonValue] = [
                    "ok": .bool(false),
                    "error": .string(error.localizedDescription),
                    "errorType": .string(String(describing: type(of: error))),
                ]
                let text = MiniJson.stringify(.object(errObj), pretty: true) + "\n"
                try? text.write(toFile: outFile, atomically: true, encoding: .utf8)
            } else {
                _ = fputs("[Obsidian Prism Installer] Error: \(error.localizedDescription)\n", stderr)
            }
            if opts.popup {
                let app = NSApplication.shared
                app.setActivationPolicy(.accessory)
                let alert = NSAlert()
                alert.alertStyle = .critical
                alert.messageText = InstallerI18n.tr(
                    "Obsidian Prism 操作失败",
                    "Obsidian Prism Operation Failed"
                )
                alert.informativeText = error.localizedDescription
                alert.runModal()
            }
            return 1
        }
    }

    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let delegate = InstallerAppDelegate(opts: opts)
    app.delegate = delegate
    app.run()
    return 0
}

exit(runInstallerMain())
