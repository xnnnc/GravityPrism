using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace AgyClaudeStyle.Watcher
{
    internal class FrameContextMeta
    {
        public string FrameId;
        public bool IsDefault;
        public string ContextType;
    }

    internal class AttachedEntry
    {
        public CdpSession Session;
        public string ScriptId;
        public string OmniScriptId;
        public string ThoughtScriptId;
        public string InlineDiffScriptId;
        public string Title;
        public string MainFrameId;
        public bool HasFrameTree;
        public readonly ConcurrentDictionary<long, FrameContextMeta> ContextFrames = new ConcurrentDictionary<long, FrameContextMeta>();

        public bool IsTrustedMainFrameBinding(Dictionary<string, object> p)
        {
            object ctxIdObj = null;
            bool hasCtxId = p != null && p.TryGetValue("executionContextId", out ctxIdObj) && ctxIdObj != null;
            long ctxId = 0;
            if (hasCtxId)
            {
                try { ctxId = Convert.ToInt64(ctxIdObj); }
                catch { hasCtxId = false; }
            }
            FrameContextMeta meta;
            if (hasCtxId && ContextFrames.TryGetValue(ctxId, out meta) && meta != null)
            {
                if (!meta.IsDefault) return false;
                if (!string.IsNullOrEmpty(meta.ContextType) && !string.Equals(meta.ContextType, "default", StringComparison.Ordinal)) return false;
                if (!string.IsNullOrEmpty(MainFrameId) && !string.IsNullOrEmpty(meta.FrameId) &&
                    !string.Equals(meta.FrameId, MainFrameId, StringComparison.Ordinal))
                {
                    return false;
                }
                return true;
            }
            if (HasFrameTree)
            {
                if (!hasCtxId) return false;
                if (ContextFrames.Count > 0) return false;
            }
            return true;
        }
    }

    internal static class Program
    {
        private static readonly object LogLock = new object();
        private static string _baseDir;
        private static string _pluginDir;
        private static string _logFile;
        private static string _pidFile;
        private static bool _isWatch;
        private static bool _noNativeDaemon;
        private static bool _noRelaunchPrompt;

        private static string GetDefaultWatcherInstallDir()
        {
            string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            if (string.IsNullOrEmpty(localAppData))
            {
                localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            }
            return Path.GetFullPath(Path.Combine(localAppData, "obsidian-prism")).TrimEnd('\\', '/');
        }

        [STAThread]
        private static int Main(string[] args)
        {
            string mode = "watch";
            string customDir = null;
            string customPluginDir = null;
            int? overridePort = null;
            string outFile = null;
            string langArg = null;
            bool showHelp = false;

            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                string parsedLang;
                if (a == "--watch") mode = "watch";
                else if (a == "--once") mode = "once";
                else if (a == "--remove") mode = "remove";
                else if (a == "--help" || a == "-h" || a == "/?") showHelp = true;
                else if (InstallerI18n.TryParseLangArg(args, ref i, out parsedLang)) langArg = parsedLang;
                else if (a == "--no-native-daemon") _noNativeDaemon = true;
                else if (a == "--no-relaunch-prompt") _noRelaunchPrompt = true;
                else if (a == "--dir" && i + 1 < args.Length) customDir = args[++i];
                else if (a == "--plugin-dir" && i + 1 < args.Length) customPluginDir = args[++i];
                else if (a == "--cdp-port" && i + 1 < args.Length)
                {
                    int p;
                    if (int.TryParse(args[++i], out p) && p > 0) overridePort = p;
                }
                else if (a == "--out" && i + 1 < args.Length) outFile = args[++i];
            }

            if (!string.IsNullOrEmpty(langArg))
            {
                InstallerI18n.SetPreferredLang(langArg);
            }

            if (showHelp)
            {
                string helpText = BuildHelpText();
                if (!string.IsNullOrEmpty(outFile))
                {
                    try { File.WriteAllText(outFile, helpText, new UTF8Encoding(false)); } catch { }
                }
                else
                {
                    try { Console.WriteLine(helpText); } catch { }
                }
                return 0;
            }

            _baseDir = Path.GetFullPath(string.IsNullOrEmpty(customDir) ? AppDomain.CurrentDomain.BaseDirectory : customDir).TrimEnd('\\', '/');
            if (!string.IsNullOrEmpty(customPluginDir))
            {
                _pluginDir = Path.GetFullPath(customPluginDir).TrimEnd('\\', '/');
            }
            else if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AG_PRISM_PLUGIN_DIR")))
            {
                _pluginDir = CdpHelper.GetDefaultNativePluginDir();
            }
            else if (string.IsNullOrEmpty(customDir) ||
                     string.Equals(_baseDir, GetDefaultWatcherInstallDir(), StringComparison.OrdinalIgnoreCase))
            {
                _pluginDir = CdpHelper.GetDefaultNativePluginDir();
            }
            else
            {
                _pluginDir = Path.Combine(_baseDir, "obsidian-prism-plugin");
            }
            _logFile = Path.Combine(_baseDir, "watch.log");
            _pidFile = Path.Combine(_baseDir, ".watch.pid");
            _isWatch = (mode == "watch");

            try
            {
                if (mode == "once")
                {
                    return RunOnceAsync(overridePort, outFile).GetAwaiter().GetResult();
                }
                if (mode == "remove")
                {
                    return RunRemoveAsync(overridePort, outFile).GetAwaiter().GetResult();
                }
                return RunWatchAsync(overridePort).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                Log("[!] Fatal error: " + ex.Message);
                WriteResult(outFile, false, ex.Message, null);
                return 1;
            }
        }

        private static string BuildHelpText()
        {
            return InstallerI18n.Tr(
                "Obsidian Prism 后台守护进程 (obsidian-prism-watcher)\r\n" +
                "用法: obsidian-prism-watcher.exe [选项]\r\n\r\n" +
                "选项:\r\n" +
                "  --watch               持续监听并自动注入 Antigravity 窗口（默认）\r\n" +
                "  --once                立即执行一次注入并退出\r\n" +
                "  --remove              移除已注入界面并停止守护进程\r\n" +
                "  --dir <目录>          指定守护资源目录\r\n" +
                "  --plugin-dir <目录>   指定原生插件目录\r\n" +
                "  --cdp-port <端口>     指定 CDP 调试端口\r\n" +
                "  --no-native-daemon    禁用自动拉起本地守护服务\r\n" +
                "  --no-relaunch-prompt  禁用裸启重开提示弹窗\r\n" +
                "  --lang <zh|en>        指定界面/日志语言（覆盖 AG_PRISM_LANG 与系统语言）\r\n" +
                "  --out <文件>          将结果输出到指定文件\r\n" +
                "  --help, -h            显示此帮助信息",
                "Obsidian Prism Background Watcher (obsidian-prism-watcher)\r\n" +
                "Usage: obsidian-prism-watcher.exe [options]\r\n\r\n" +
                "Options:\r\n" +
                "  --watch               Continuously monitor and inject Antigravity windows (default)\r\n" +
                "  --once                Inject once and exit\r\n" +
                "  --remove              Remove injected UI and stop running watcher\r\n" +
                "  --dir <dir>           Specify watcher directory\r\n" +
                "  --plugin-dir <dir>    Specify native plugin directory\r\n" +
                "  --cdp-port <port>     Specify CDP debug port\r\n" +
                "  --no-native-daemon    Do not auto-start local background daemon\r\n" +
                "  --no-relaunch-prompt  Disable bare-launch relaunch prompt\r\n" +
                "  --lang <zh|en>        Set UI/log language (overrides AG_PRISM_LANG and OS locale)\r\n" +
                "  --out <file>          Write result to the specified file\r\n" +
                "  --help, -h            Show this help message"
            );
        }

        private static void Log(string line)
        {
            if (!_isWatch) return;
            lock (LogLock)
            {
                try
                {
                    if (CdpHelper.IsUnsafeReparsePoint(_logFile)) return;
                    FileInfo fi = new FileInfo(_logFile);
                    if (fi.Exists && fi.Length > 1024 * 1024)
                    {
                        File.WriteAllText(_logFile, "", new UTF8Encoding(false));
                    }
                    string entry = string.Format("[{0}] {1}\n", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), line);
                    byte[] bytes = new UTF8Encoding(false).GetBytes(entry);
                    using (FileStream fs = new FileStream(_logFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
                    {
                        fs.Write(bytes, 0, bytes.Length);
                    }
                }
                catch { }
            }
        }

        private static void WriteResult(string outFile, bool ok, string message, List<string> pages)
        {
            if (string.IsNullOrEmpty(outFile)) return;
            try
            {
                Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
                res["ok"] = ok;
                res["message"] = message ?? "";
                if (pages != null) res["pages"] = pages;
                File.WriteAllText(outFile, MiniJson.Stringify(res, true), new UTF8Encoding(false));
            }
            catch { }
        }

        public static string GetDirHash(string dir)
        {
            return CdpHelper.ComputeHash(Path.GetFullPath(dir).TrimEnd('\\', '/').ToLowerInvariant());
        }

        private static int? ReadPidFile()
        {
            try
            {
                if (!File.Exists(_pidFile)) return null;
                int pid;
                if (int.TryParse(File.ReadAllText(_pidFile, Encoding.UTF8).Trim(), out pid) && pid > 0) return pid;
            }
            catch { }
            return null;
        }

        private static void ReleasePidFile(int selfPid)
        {
            try
            {
                if (CdpHelper.IsUnsafeReparsePoint(_pidFile)) return;
                int? current = ReadPidFile();
                if (current.HasValue && current.Value == selfPid)
                {
                    File.Delete(_pidFile);
                }
            }
            catch { }
        }

        private static async Task<int> RunOnceAsync(int? overridePort, string outFile)
        {
            PluginManifest manifest = PluginManifest.Load(_baseDir);
            int? port = CdpHelper.ReadPort(overridePort);
            if (!port.HasValue)
            {
                WriteResult(
                    outFile,
                    false,
                    InstallerI18n.Tr(
                        "未找到调试端口文件，Antigravity 可能未运行",
                        "Debug port file not found; Antigravity may not be running"
                    ),
                    null
                );
                return 1;
            }

            List<CdpPageInfo> pages = await CdpHelper.ListPagesAsync(port.Value).ConfigureAwait(false);
            if (pages.Count == 0)
            {
                WriteResult(
                    outFile,
                    false,
                    InstallerI18n.Tr(
                        "未找到 Antigravity 窗口页面",
                        "No Antigravity window pages found"
                    ),
                    null
                );
                return 1;
            }

            Dictionary<string, object> onceCfg = CdpHelper.ReadConfig(_baseDir, manifest);
            string expr = CdpHelper.BuildInjectExpression(_baseDir, manifest);
            string omniExpr = CdpHelper.BuildOmniClientExpression(_baseDir, manifest);
            string thoughtExpr = CdpHelper.ShouldEnableThought(onceCfg)
                ? CdpHelper.BuildThoughtExpression(_baseDir, onceCfg)
                : "";
            string inlineDiffExpr = CdpHelper.BuildInlineDiffExpression(_baseDir, onceCfg);
            List<string> injectedTitles = new List<string>();
            for (int i = 0; i < pages.Count; i++)
            {
                CdpPageInfo page = pages[i];
                using (CdpSession session = await CdpSession.ConnectAsync(page.WebSocketDebuggerUrl, 4000).ConfigureAwait(false))
                {
                    await session.EvaluateAsync(expr, false).ConfigureAwait(false);
                    if (!string.IsNullOrEmpty(omniExpr))
                    {
                        try { await session.EvaluateAsync(omniExpr, false).ConfigureAwait(false); } catch { }
                    }
                    if (!string.IsNullOrEmpty(thoughtExpr))
                    {
                        try { await session.EvaluateAsync(thoughtExpr, false).ConfigureAwait(false); } catch { }
                    }
                    if (!string.IsNullOrEmpty(inlineDiffExpr))
                    {
                        try { await session.EvaluateAsync(inlineDiffExpr, false).ConfigureAwait(false); } catch { }
                    }
                    injectedTitles.Add(CdpHelper.ShortTitle(page));
                }
            }
            WriteResult(outFile, true, "injected " + injectedTitles.Count + " page(s)", injectedTitles);
            return 0;
        }

        private static async Task<int> RunRemoveAsync(int? overridePort, string outFile)
        {
            PluginManifest manifest = PluginManifest.Load(_baseDir);
            StopRunningWatcherInDir(_baseDir);

            int? port = CdpHelper.ReadPort(overridePort);
            List<string> cleaned = new List<string>();
            if (port.HasValue)
            {
                try
                {
                    List<CdpPageInfo> pages = await CdpHelper.ListPagesAsync(port.Value).ConfigureAwait(false);
                    for (int i = 0; i < pages.Count; i++)
                    {
                        CdpPageInfo page = pages[i];
                        try
                        {
                            using (CdpSession session = await CdpSession.ConnectAsync(page.WebSocketDebuggerUrl, 3000).ConfigureAwait(false))
                            {
                                await session.EvaluateAsync(manifest.RemoveExpression, false).ConfigureAwait(false);
                                cleaned.Add(CdpHelper.ShortTitle(page));
                            }
                        }
                        catch { }
                    }
                }
                catch { }
            }
            WriteResult(outFile, true, "removed from " + cleaned.Count + " page(s)", cleaned);
            return 0;
        }

        private static void StopRunningWatcherInDir(string dir)
        {
            string hash = GetDirHash(dir);
            try
            {
                using (EventWaitHandle stopEvt = EventWaitHandle.OpenExisting("Local\\ObsidianPrismStop_" + hash))
                {
                    stopEvt.Set();
                }
            }
            catch { }

            string pidFile = Path.Combine(dir, ".watch.pid");
            int? pid = null;
            try
            {
                if (File.Exists(pidFile))
                {
                    int p;
                    if (int.TryParse(File.ReadAllText(pidFile, Encoding.UTF8).Trim(), out p) && p > 0) pid = p;
                }
            }
            catch { }

            if (pid.HasValue && pid.Value != Process.GetCurrentProcess().Id)
            {
                try
                {
                    using (Process proc = Process.GetProcessById(pid.Value))
                    {
                        if (!proc.WaitForExit(1500) && CdpHelper.IsExpectedPrismDaemonProcess(proc))
                        {
                            proc.Kill();
                            proc.WaitForExit(1500);
                        }
                    }
                }
                catch { }
            }
            try { if (File.Exists(pidFile)) File.Delete(pidFile); } catch { }
        }

        private static bool IsWatchedHotReloadFile(string relativeName)
        {
            if (string.IsNullOrEmpty(relativeName)) return false;
            string norm = relativeName.Replace('\\', '/');
            if (norm.StartsWith(".", StringComparison.Ordinal) || norm.IndexOf("/.", StringComparison.Ordinal) >= 0)
            {
                return false;
            }
            if (norm.StartsWith("vendor/thought-translator/", StringComparison.OrdinalIgnoreCase) &&
                norm.EndsWith(".js", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (norm.StartsWith("vendor/inline-diff/", StringComparison.OrdinalIgnoreCase) &&
                norm.EndsWith(".js", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return norm.EndsWith(".css", StringComparison.OrdinalIgnoreCase) ||
                   norm.EndsWith(".js", StringComparison.OrdinalIgnoreCase) ||
                   norm.EndsWith(".json", StringComparison.OrdinalIgnoreCase);
        }

        private static async Task<int> RunWatchAsync(int? overridePort)
        {
            string dirHash = GetDirHash(_baseDir);
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "Local\\ObsidianPrismWatcher_" + dirHash, out createdNew))
            {
                if (!createdNew)
                {
                    return 0;
                }

                int selfPid = Process.GetCurrentProcess().Id;
                for (int pidTry = 0; pidTry < 4; pidTry++)
                {
                    try
                    {
                        if (CdpHelper.IsUnsafeReparsePoint(_pidFile))
                        {
                            break;
                        }
                        CdpHelper.ClearReadOnlyAndHiddenAttributes(_pidFile);
                        File.WriteAllText(_pidFile, selfPid.ToString(), new UTF8Encoding(false));
                        break;
                    }
                    catch
                    {
                        if (pidTry < 3) Thread.Sleep(80 * (pidTry + 1));
                    }
                }
                try
                {
                    if (!CdpHelper.IsUnsafeReparsePoint(_logFile))
                    {
                        CdpHelper.ClearReadOnlyAndHiddenAttributes(_logFile);
                        File.WriteAllText(_logFile, "", new UTF8Encoding(false));
                    }
                }
                catch { }

                PluginManifest manifest = PluginManifest.Load(_baseDir);
                Log(InstallerI18n.TrFormat(
                    "[*] Obsidian Prism (obsidian-prism) 守护模式启动 (PID {0})，每 2 秒检查一次窗口",
                    "[*] Obsidian Prism (obsidian-prism) watcher started (PID {0}), polling windows every 2s",
                    selfPid
                ));

                Dictionary<string, object> initialCfg = CdpHelper.ReadConfig(_baseDir, manifest);
                string currentExpr = CdpHelper.BuildInjectExpression(_baseDir, manifest);
                string currentOmniExpr = CdpHelper.BuildOmniClientExpression(_baseDir, manifest);
                string currentThoughtExpr = CdpHelper.ShouldEnableThought(initialCfg)
                    ? CdpHelper.BuildThoughtExpression(_baseDir, initialCfg)
                    : "";
                string currentInlineDiffExpr = CdpHelper.BuildInlineDiffExpression(_baseDir, initialCfg);
                object exprLock = new object();
                ConcurrentDictionary<string, AttachedEntry> attached = new ConcurrentDictionary<string, AttachedEntry>(StringComparer.Ordinal);
                ManualResetEventSlim exitEvent = new ManualResetEventSlim(false);
                EventWaitHandle stopSignal = new EventWaitHandle(false, EventResetMode.ManualReset, "Local\\ObsidianPrismStop_" + dirHash);

                ThreadPool.RegisterWaitForSingleObject(stopSignal, (state, timedOut) =>
                {
                    exitEvent.Set();
                }, null, -1, true);

                AppDomain.CurrentDomain.ProcessExit += (s, e) =>
                {
                    exitEvent.Set();
                    ReleasePidFile(selfPid);
                };

                Func<AttachedEntry, string, string, string, string, Task<Dictionary<string, object>>> applyAsync = async (entry, exprToUse, omniExprToUse, thoughtExprToUse, inlineDiffExprToUse) =>
                {
                    if (!string.IsNullOrEmpty(entry.ScriptId))
                    {
                        try
                        {
                            Dictionary<string, object> rmParams = new Dictionary<string, object>(StringComparer.Ordinal);
                            rmParams["identifier"] = entry.ScriptId;
                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmParams, 5000).ConfigureAwait(false);
                        }
                        catch { }
                    }
                    Dictionary<string, object> addParams = new Dictionary<string, object>(StringComparer.Ordinal);
                    addParams["source"] = exprToUse;
                    Dictionary<string, object> addRes = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addParams, 15000).ConfigureAwait(false);
                    object idVal;
                    if (addRes.TryGetValue("identifier", out idVal)) entry.ScriptId = idVal as string;
                    object evalVal = await entry.Session.EvaluateAsync(exprToUse, false).ConfigureAwait(false);
                    Dictionary<string, object> evalDict = evalVal as Dictionary<string, object>;
                    object statusVal;
                    if (evalDict != null && evalDict.TryGetValue("status", out statusVal) &&
                        string.Equals(statusVal as string, "skipped-non-host", StringComparison.Ordinal))
                    {
                        if (!string.IsNullOrEmpty(entry.ScriptId))
                        {
                            try
                            {
                                Dictionary<string, object> rmSkip = new Dictionary<string, object>(StringComparer.Ordinal);
                                rmSkip["identifier"] = entry.ScriptId;
                                await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmSkip, 5000).ConfigureAwait(false);
                            }
                            catch { }
                            entry.ScriptId = null;
                        }
                        if (!string.IsNullOrEmpty(entry.OmniScriptId))
                        {
                            try
                            {
                                Dictionary<string, object> rmOmniSkip = new Dictionary<string, object>(StringComparer.Ordinal);
                                rmOmniSkip["identifier"] = entry.OmniScriptId;
                                await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmOmniSkip, 5000).ConfigureAwait(false);
                            }
                            catch { }
                            entry.OmniScriptId = null;
                        }
                        if (!string.IsNullOrEmpty(entry.ThoughtScriptId))
                        {
                            try
                            {
                                Dictionary<string, object> rmThoughtSkip = new Dictionary<string, object>(StringComparer.Ordinal);
                                rmThoughtSkip["identifier"] = entry.ThoughtScriptId;
                                await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmThoughtSkip, 5000).ConfigureAwait(false);
                            }
                            catch { }
                            entry.ThoughtScriptId = null;
                        }
                        if (!string.IsNullOrEmpty(entry.InlineDiffScriptId))
                        {
                            try
                            {
                                Dictionary<string, object> rmInlineSkip = new Dictionary<string, object>(StringComparer.Ordinal);
                                rmInlineSkip["identifier"] = entry.InlineDiffScriptId;
                                await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmInlineSkip, 5000).ConfigureAwait(false);
                            }
                            catch { }
                            entry.InlineDiffScriptId = null;
                        }
                        return evalDict;
                    }

                    if (!string.IsNullOrEmpty(entry.OmniScriptId))
                    {
                        try
                        {
                            Dictionary<string, object> rmOmni = new Dictionary<string, object>(StringComparer.Ordinal);
                            rmOmni["identifier"] = entry.OmniScriptId;
                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmOmni, 5000).ConfigureAwait(false);
                        }
                        catch { }
                        entry.OmniScriptId = null;
                    }
                    if (!string.IsNullOrEmpty(omniExprToUse))
                    {
                        try
                        {
                            Dictionary<string, object> addOmni = new Dictionary<string, object>(StringComparer.Ordinal);
                            addOmni["source"] = omniExprToUse;
                            Dictionary<string, object> omniRes = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addOmni, 15000).ConfigureAwait(false);
                            object omniIdVal;
                            if (omniRes.TryGetValue("identifier", out omniIdVal)) entry.OmniScriptId = omniIdVal as string;
                            await entry.Session.EvaluateAsync(omniExprToUse, false).ConfigureAwait(false);
                        }
                        catch { }
                    }

                    bool hadThought = !string.IsNullOrEmpty(entry.ThoughtScriptId);
                    if (hadThought)
                    {
                        try
                        {
                            Dictionary<string, object> rmThought = new Dictionary<string, object>(StringComparer.Ordinal);
                            rmThought["identifier"] = entry.ThoughtScriptId;
                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmThought, 5000).ConfigureAwait(false);
                        }
                        catch { }
                        entry.ThoughtScriptId = null;
                    }
                    if (!string.IsNullOrEmpty(thoughtExprToUse))
                    {
                        try
                        {
                            Dictionary<string, object> addThought = new Dictionary<string, object>(StringComparer.Ordinal);
                            addThought["source"] = thoughtExprToUse;
                            Dictionary<string, object> thoughtRes = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addThought, 15000).ConfigureAwait(false);
                            object thoughtIdVal;
                            if (thoughtRes.TryGetValue("identifier", out thoughtIdVal)) entry.ThoughtScriptId = thoughtIdVal as string;
                            await entry.Session.EvaluateAsync(thoughtExprToUse, false).ConfigureAwait(false);
                        }
                        catch { }
                    }
                    else if (hadThought)
                    {
                        try
                        {
                            await entry.Session.EvaluateAsync(CdpHelper.ThoughtRemoveExpression, false).ConfigureAwait(false);
                        }
                        catch { }
                    }

                    bool hadInlineDiff = !string.IsNullOrEmpty(entry.InlineDiffScriptId);
                    if (hadInlineDiff)
                    {
                        try
                        {
                            Dictionary<string, object> rmInline = new Dictionary<string, object>(StringComparer.Ordinal);
                            rmInline["identifier"] = entry.InlineDiffScriptId;
                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmInline, 5000).ConfigureAwait(false);
                        }
                        catch { }
                        entry.InlineDiffScriptId = null;
                    }
                    if (!string.IsNullOrEmpty(inlineDiffExprToUse))
                    {
                        try
                        {
                            Dictionary<string, object> addInline = new Dictionary<string, object>(StringComparer.Ordinal);
                            addInline["source"] = inlineDiffExprToUse;
                            Dictionary<string, object> inlineRes = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addInline, 15000).ConfigureAwait(false);
                            object inlineIdVal;
                            if (inlineRes.TryGetValue("identifier", out inlineIdVal)) entry.InlineDiffScriptId = inlineIdVal as string;
                            await entry.Session.EvaluateAsync(inlineDiffExprToUse, false).ConfigureAwait(false);
                        }
                        catch { }
                    }
                    else if (hadInlineDiff)
                    {
                        try
                        {
                            await entry.Session.EvaluateAsync(CdpHelper.InlineDiffRemoveExpression, false).ConfigureAwait(false);
                        }
                        catch { }
                    }
                    return evalVal as Dictionary<string, object>;
                };

                Func<CdpPageInfo, Task> attachAsync = async (page) =>
                {
                    if (!attached.TryAdd(page.Id, null)) return;
                    CdpSession session = null;
                    try
                    {
                        session = await CdpSession.ConnectAsync(page.WebSocketDebuggerUrl, 4000).ConfigureAwait(false);
                        AttachedEntry entry = new AttachedEntry();
                        entry.Session = session;
                        entry.ScriptId = null;
                        entry.Title = CdpHelper.ShortTitle(page);
                        attached[page.Id] = entry;

                        session.OnClose = () =>
                        {
                            AttachedEntry ignored;
                            attached.TryRemove(page.Id, out ignored);
                            Log(InstallerI18n.TrFormat(
                                "[-] 窗口已关闭: {0}",
                                "[-] Window closed: {0}",
                                entry.Title
                            ));
                        };

                        session.On("Runtime.executionContextCreated", (cp) =>
                        {
                            object ctxObj;
                            if (cp == null || !cp.TryGetValue("context", out ctxObj) || !(ctxObj is Dictionary<string, object>)) return;
                            Dictionary<string, object> ctxDict = (Dictionary<string, object>)ctxObj;
                            object idObj;
                            if (!ctxDict.TryGetValue("id", out idObj) || idObj == null) return;
                            long cid;
                            try { cid = Convert.ToInt64(idObj); } catch { return; }
                            FrameContextMeta meta = new FrameContextMeta();
                            meta.IsDefault = true;
                            meta.ContextType = "default";
                            meta.FrameId = "";
                            object auxObj;
                            if (ctxDict.TryGetValue("auxData", out auxObj) && auxObj is Dictionary<string, object>)
                            {
                                Dictionary<string, object> aux = (Dictionary<string, object>)auxObj;
                                object fid;
                                if (aux.TryGetValue("frameId", out fid) && fid is string) meta.FrameId = (string)fid;
                                object defObj;
                                if (aux.TryGetValue("isDefault", out defObj) && defObj is bool) meta.IsDefault = (bool)defObj;
                                object tObj;
                                if (aux.TryGetValue("type", out tObj) && tObj is string) meta.ContextType = (string)tObj;
                            }
                            entry.ContextFrames[cid] = meta;
                        });
                        session.On("Runtime.executionContextDestroyed", (dp) =>
                        {
                            object idObj;
                            if (dp != null && dp.TryGetValue("executionContextId", out idObj) && idObj != null)
                            {
                                try
                                {
                                    FrameContextMeta removedMeta;
                                    entry.ContextFrames.TryRemove(Convert.ToInt64(idObj), out removedMeta);
                                }
                                catch { }
                            }
                        });
                        session.On("Runtime.executionContextsCleared", (cp) =>
                        {
                            entry.ContextFrames.Clear();
                        });
                        session.On("Page.frameNavigated", (fp) =>
                        {
                            object fObj;
                            if (fp != null && fp.TryGetValue("frame", out fObj) && fObj is Dictionary<string, object>)
                            {
                                Dictionary<string, object> fDict = (Dictionary<string, object>)fObj;
                                object parentObj;
                                bool hasParent = fDict.TryGetValue("parentId", out parentObj) && parentObj is string && !string.IsNullOrEmpty((string)parentObj);
                                object fidObj;
                                if (!hasParent && fDict.TryGetValue("id", out fidObj) && fidObj is string && !string.IsNullOrEmpty((string)fidObj))
                                {
                                    entry.MainFrameId = (string)fidObj;
                                    entry.HasFrameTree = true;
                                }
                            }
                        });

                        await session.SendAsync("Page.enable", null, 5000).ConfigureAwait(false);
                        try
                        {
                            Dictionary<string, object> ftRes = await session.SendAsync("Page.getFrameTree", null, 3000).ConfigureAwait(false);
                            object ftObj;
                            if (ftRes != null && ftRes.TryGetValue("frameTree", out ftObj) && ftObj is Dictionary<string, object>)
                            {
                                object topFrameObj;
                                if (((Dictionary<string, object>)ftObj).TryGetValue("frame", out topFrameObj) && topFrameObj is Dictionary<string, object>)
                                {
                                    object topIdObj;
                                    if (((Dictionary<string, object>)topFrameObj).TryGetValue("id", out topIdObj) && topIdObj is string && !string.IsNullOrEmpty((string)topIdObj))
                                    {
                                        entry.MainFrameId = (string)topIdObj;
                                        entry.HasFrameTree = true;
                                    }
                                }
                            }
                        }
                        catch { }

                        session.On("Runtime.bindingCalled", (p) =>
                        {
                            if (!entry.IsTrustedMainFrameBinding(p)) return;
                            object bNameObj;
                            object payloadObj;
                            if (!p.TryGetValue("name", out bNameObj)) return;
                            string bName = bNameObj as string;
                            if (!string.Equals(bName, manifest.SettingBinding, StringComparison.Ordinal) &&
                                !string.Equals(bName, "__agClaudeStyleSetting", StringComparison.Ordinal))
                            {
                                return;
                            }
                            if (!p.TryGetValue("payload", out payloadObj) || !(payloadObj is string)) return;
                            try
                            {
                                Dictionary<string, object> kv = MiniJson.ParseObject((string)payloadObj);
                                object actObj;
                                object entriesObj;
                                if (kv.TryGetValue("action", out actObj) &&
                                    string.Equals(actObj as string, "patch-batch", StringComparison.Ordinal) &&
                                    kv.TryGetValue("entries", out entriesObj) &&
                                    entriesObj is Dictionary<string, object>)
                                {
                                    Dictionary<string, object> entriesDict = (Dictionary<string, object>)entriesObj;
                                    if (CdpHelper.UpdateConfigBatch(_baseDir, manifest, entriesDict))
                                    {
                                        if (!string.IsNullOrEmpty(_pluginDir) && Directory.Exists(_pluginDir))
                                        {
                                            try { CdpHelper.UpdateConfigBatch(_pluginDir, manifest, entriesDict); } catch { }
                                        }
                                        Log(InstallerI18n.TrFormat(
                                            "[⚙] 批量设置已保存 ({0} 项)",
                                            "[⚙] Batch settings saved ({0} item(s))",
                                            entriesDict.Count
                                        ));
                                    }
                                    return;
                                }
                                object kObj;
                                object vObj;
                                if (kv.TryGetValue("key", out kObj) && kObj is string && kv.TryGetValue("value", out vObj))
                                {
                                    string key = (string)kObj;
                                    if (CdpHelper.UpdateConfigSetting(_baseDir, manifest, key, vObj))
                                    {
                                        if (!string.IsNullOrEmpty(_pluginDir) && Directory.Exists(_pluginDir))
                                        {
                                            try { CdpHelper.UpdateConfigSetting(_pluginDir, manifest, key, vObj); } catch { }
                                        }
                                        Log(InstallerI18n.TrFormat(
                                            "[⚙] 设置已保存: {0} = {1}",
                                            "[⚙] Setting saved: {0} = {1}",
                                            key,
                                            MiniJson.Stringify(vObj, false)
                                        ));
                                    }
                                }
                            }
                            catch { }
                        });

                        await session.SendAsync("Runtime.enable", null, 5000).ConfigureAwait(false);
                        Dictionary<string, object> bindParams = new Dictionary<string, object>(StringComparer.Ordinal);
                        bindParams["name"] = manifest.SettingBinding;
                        await session.SendAsync("Runtime.addBinding", bindParams, 5000).ConfigureAwait(false);
                        if (!string.Equals(manifest.SettingBinding, "__agClaudeStyleSetting", StringComparison.Ordinal))
                        {
                            try
                            {
                                Dictionary<string, object> legacyBind = new Dictionary<string, object>(StringComparer.Ordinal);
                                legacyBind["name"] = "__agClaudeStyleSetting";
                                await session.SendAsync("Runtime.addBinding", legacyBind, 5000).ConfigureAwait(false);
                            }
                            catch { }
                        }

                        string exprSnapshot;
                        string omniSnapshot;
                        string thoughtSnapshot;
                        string inlineDiffSnapshot;
                        lock (exprLock)
                        {
                            exprSnapshot = currentExpr;
                            omniSnapshot = currentOmniExpr;
                            thoughtSnapshot = currentThoughtExpr;
                            inlineDiffSnapshot = currentInlineDiffExpr;
                        }
                        Dictionary<string, object> res = await applyAsync(entry, exprSnapshot, omniSnapshot, thoughtSnapshot, inlineDiffSnapshot).ConfigureAwait(false);
                        string status = (res != null && res.ContainsKey("status")) ? Convert.ToString(res["status"]) : "ok";
                        Log(InstallerI18n.TrFormat(
                            "[✓] 已注入 obsidian-prism: {0} ({1})",
                            "[✓] Injected obsidian-prism: {0} ({1})",
                            entry.Title,
                            status
                        ));
                    }
                    catch (Exception ex)
                    {
                        AttachedEntry removed;
                        if (attached.TryRemove(page.Id, out removed) && removed != null && removed.Session != null)
                        {
                            try { removed.Session.Close(); } catch { }
                        }
                        if (session != null)
                        {
                            try { session.Close(); } catch { }
                        }
                        Log(InstallerI18n.TrFormat(
                            "[!] 注入失败，稍后重试: {0} — {1}",
                            "[!] Injection failed, will retry: {0} — {1}",
                            CdpHelper.ShortTitle(page),
                            ex.Message
                        ));
                    }
                };

                Timer reloadTimer = null;
                string pendingFilename = null;
                object timerLock = new object();

                FileSystemWatcher fsw = null;
                try
                {
                    fsw = new FileSystemWatcher(_baseDir);
                    fsw.IncludeSubdirectories = true;
                    fsw.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.CreationTime;
                    FileSystemEventHandler onFsChange = (sender, e) =>
                    {
                        string name = e.Name;
                        if (!IsWatchedHotReloadFile(name))
                        {
                            return;
                        }
                        lock (timerLock)
                        {
                            pendingFilename = name;
                            if (reloadTimer == null)
                            {
                                reloadTimer = new Timer(async (_) =>
                                {
                                    string changedName;
                                    lock (timerLock) { changedName = pendingFilename; }
                                    try
                                    {
                                        manifest = PluginManifest.Load(_baseDir);
                                        Dictionary<string, object> nextCfg = CdpHelper.ReadConfig(_baseDir, manifest);
                                        string nextExpr = CdpHelper.BuildInjectExpression(_baseDir, manifest);
                                        string nextOmniExpr = CdpHelper.BuildOmniClientExpression(_baseDir, manifest);
                                        string nextThoughtExpr = CdpHelper.ShouldEnableThought(nextCfg)
                                            ? CdpHelper.BuildThoughtExpression(_baseDir, nextCfg)
                                            : "";
                                        string nextInlineDiffExpr = CdpHelper.BuildInlineDiffExpression(_baseDir, nextCfg);
                                        string fastCfgExpr = string.Equals(Path.GetFileName(changedName ?? ""), "config.json", StringComparison.OrdinalIgnoreCase)
                                            ? CdpHelper.BuildConfigRefreshExpression(_baseDir, manifest)
                                            : null;
                                        string prevThoughtExpr;
                                        string prevInlineDiffExpr;
                                        lock (exprLock)
                                        {
                                            prevThoughtExpr = currentThoughtExpr;
                                            prevInlineDiffExpr = currentInlineDiffExpr;
                                            currentExpr = nextExpr;
                                            currentOmniExpr = nextOmniExpr;
                                            currentThoughtExpr = nextThoughtExpr;
                                            currentInlineDiffExpr = nextInlineDiffExpr;
                                        }

                                        int n = 0;
                                        foreach (KeyValuePair<string, AttachedEntry> kv in attached)
                                        {
                                            AttachedEntry entry = kv.Value;
                                            if (entry == null) continue;
                                            try
                                            {
                                                if (!string.IsNullOrEmpty(fastCfgExpr))
                                                {
                                                    if (!string.IsNullOrEmpty(entry.ScriptId))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> rmP = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            rmP["identifier"] = entry.ScriptId;
                                                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmP, 5000).ConfigureAwait(false);
                                                        }
                                                        catch { }
                                                    }
                                                    Dictionary<string, object> addP = new Dictionary<string, object>(StringComparer.Ordinal);
                                                    addP["source"] = nextExpr;
                                                    Dictionary<string, object> addR = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addP, 15000).ConfigureAwait(false);
                                                    object idV;
                                                    if (addR.TryGetValue("identifier", out idV)) entry.ScriptId = idV as string;

                                                    if (!string.IsNullOrEmpty(entry.OmniScriptId))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> rmO = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            rmO["identifier"] = entry.OmniScriptId;
                                                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmO, 5000).ConfigureAwait(false);
                                                        }
                                                        catch { }
                                                        entry.OmniScriptId = null;
                                                    }
                                                    if (!string.IsNullOrEmpty(nextOmniExpr))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> addO = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            addO["source"] = nextOmniExpr;
                                                            Dictionary<string, object> omniR = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addO, 15000).ConfigureAwait(false);
                                                            object oIdV;
                                                            if (omniR.TryGetValue("identifier", out oIdV)) entry.OmniScriptId = oIdV as string;
                                                        }
                                                        catch { }
                                                    }

                                                    bool hadThought = !string.IsNullOrEmpty(entry.ThoughtScriptId) || !string.IsNullOrEmpty(prevThoughtExpr);
                                                    if (!string.IsNullOrEmpty(entry.ThoughtScriptId))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> rmT = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            rmT["identifier"] = entry.ThoughtScriptId;
                                                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmT, 5000).ConfigureAwait(false);
                                                        }
                                                        catch { }
                                                        entry.ThoughtScriptId = null;
                                                    }
                                                    if (!string.IsNullOrEmpty(nextThoughtExpr))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> addT = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            addT["source"] = nextThoughtExpr;
                                                            Dictionary<string, object> thoughtR = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addT, 15000).ConfigureAwait(false);
                                                            object tIdV;
                                                            if (thoughtR.TryGetValue("identifier", out tIdV)) entry.ThoughtScriptId = tIdV as string;
                                                        }
                                                        catch { }
                                                    }

                                                    bool hadInlineDiff = !string.IsNullOrEmpty(entry.InlineDiffScriptId) || !string.IsNullOrEmpty(prevInlineDiffExpr);
                                                    if (!string.IsNullOrEmpty(entry.InlineDiffScriptId))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> rmI = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            rmI["identifier"] = entry.InlineDiffScriptId;
                                                            await entry.Session.SendAsync("Page.removeScriptToEvaluateOnNewDocument", rmI, 5000).ConfigureAwait(false);
                                                        }
                                                        catch { }
                                                        entry.InlineDiffScriptId = null;
                                                    }
                                                    if (!string.IsNullOrEmpty(nextInlineDiffExpr))
                                                    {
                                                        try
                                                        {
                                                            Dictionary<string, object> addI = new Dictionary<string, object>(StringComparer.Ordinal);
                                                            addI["source"] = nextInlineDiffExpr;
                                                            Dictionary<string, object> inlineR = await entry.Session.SendAsync("Page.addScriptToEvaluateOnNewDocument", addI, 15000).ConfigureAwait(false);
                                                            object iIdV;
                                                            if (inlineR.TryGetValue("identifier", out iIdV)) entry.InlineDiffScriptId = iIdV as string;
                                                        }
                                                        catch { }
                                                    }

                                                    Dictionary<string, object> fastRes = await entry.Session.EvaluateAsync(fastCfgExpr, false).ConfigureAwait(false) as Dictionary<string, object>;
                                                    object refVal;
                                                    if (fastRes != null && fastRes.TryGetValue("refreshed", out refVal) && refVal is bool && (bool)refVal)
                                                    {
                                                        if (!string.IsNullOrEmpty(nextOmniExpr))
                                                        {
                                                            try { await entry.Session.EvaluateAsync(nextOmniExpr, false).ConfigureAwait(false); } catch { }
                                                        }
                                                        if (!string.IsNullOrEmpty(nextThoughtExpr))
                                                        {
                                                            try { await entry.Session.EvaluateAsync(nextThoughtExpr, false).ConfigureAwait(false); } catch { }
                                                        }
                                                        else if (hadThought)
                                                        {
                                                            try { await entry.Session.EvaluateAsync(CdpHelper.ThoughtRemoveExpression, false).ConfigureAwait(false); } catch { }
                                                        }
                                                        if (!string.IsNullOrEmpty(nextInlineDiffExpr))
                                                        {
                                                            try { await entry.Session.EvaluateAsync(nextInlineDiffExpr, false).ConfigureAwait(false); } catch { }
                                                        }
                                                        else if (hadInlineDiff)
                                                        {
                                                            try { await entry.Session.EvaluateAsync(CdpHelper.InlineDiffRemoveExpression, false).ConfigureAwait(false); } catch { }
                                                        }
                                                        n++;
                                                        continue;
                                                    }
                                                    await entry.Session.EvaluateAsync(nextExpr, false).ConfigureAwait(false);
                                                    if (!string.IsNullOrEmpty(nextOmniExpr))
                                                    {
                                                        try { await entry.Session.EvaluateAsync(nextOmniExpr, false).ConfigureAwait(false); } catch { }
                                                    }
                                                    if (!string.IsNullOrEmpty(nextThoughtExpr))
                                                    {
                                                        try { await entry.Session.EvaluateAsync(nextThoughtExpr, false).ConfigureAwait(false); } catch { }
                                                    }
                                                    else if (hadThought)
                                                    {
                                                        try { await entry.Session.EvaluateAsync(CdpHelper.ThoughtRemoveExpression, false).ConfigureAwait(false); } catch { }
                                                    }
                                                    if (!string.IsNullOrEmpty(nextInlineDiffExpr))
                                                    {
                                                        try { await entry.Session.EvaluateAsync(nextInlineDiffExpr, false).ConfigureAwait(false); } catch { }
                                                    }
                                                    else if (hadInlineDiff)
                                                    {
                                                        try { await entry.Session.EvaluateAsync(CdpHelper.InlineDiffRemoveExpression, false).ConfigureAwait(false); } catch { }
                                                    }
                                                    n++;
                                                }
                                                else
                                                {
                                                    await applyAsync(entry, nextExpr, nextOmniExpr, nextThoughtExpr, nextInlineDiffExpr).ConfigureAwait(false);
                                                    n++;
                                                }
                                            }
                                            catch { }
                                        }
                                        Log(InstallerI18n.TrFormat(
                                            "[↻] {0} 已变更，已热更新 {1} 个窗口",
                                            "[↻] {0} changed; hot-reloaded {1} window(s)",
                                            changedName,
                                            n
                                        ));
                                    }
                                    catch (Exception ex)
                                    {
                                        Log(InstallerI18n.TrFormat(
                                            "[!] 读取文件失败: {0}",
                                            "[!] Failed to read file: {0}",
                                            ex.Message
                                        ));
                                    }
                                }, null, 180, Timeout.Infinite);
                            }
                            else
                            {
                                reloadTimer.Change(180, Timeout.Infinite);
                            }
                        }
                    };
                    fsw.Changed += onFsChange;
                    fsw.Created += onFsChange;
                    fsw.Renamed += (s, e) => onFsChange(s, e);
                    fsw.EnableRaisingEvents = true;
                }
                catch { }

                int? lastPort = null;
                int? lastLoggedStalePort = null;
                int consecutiveProbeFailures = 0;
                int? consecutiveProbePort = null;
                HashSet<string> promptedHostKeysInProcess = new HashSet<string>(StringComparer.Ordinal);
                bool yieldingToDaemon = false;
                bool hadLiveHost = false;
                int exitArchiveInFlight = 0;
                long lastDaemonBootTick = 0L;
                long lastShortcutCheckTick = 0L;
                string defaultWatcherDir = GetDefaultWatcherInstallDir();
                string shortcutStateDir = !string.IsNullOrEmpty(_pluginDir) ? _pluginDir : _baseDir;
                try
                {
                    while (!exitEvent.IsSet)
                    {
                        try
                        {
                            long loopTick = Environment.TickCount & int.MaxValue;
                            if (lastShortcutCheckTick == 0L || Math.Abs(loopTick - lastShortcutCheckTick) >= 45000L)
                            {
                                lastShortcutCheckTick = loopTick;
                                CdpHelper.EnsureAntigravityShortcutsOptIn(
                                    _baseDir,
                                    defaultWatcherDir,
                                    shortcutStateDir,
                                    Log
                                );
                            }

                            bool hasActiveAttached = false;
                            foreach (KeyValuePair<string, AttachedEntry> kv in attached)
                            {
                                if (kv.Value != null && kv.Value.Session != null && !kv.Value.Session.IsClosed)
                                {
                                    hasActiveAttached = true;
                                    break;
                                }
                            }
                            int? previewRawPort = CdpHelper.ReadPort(overridePort);
                            if (!previewRawPort.HasValue || (consecutiveProbePort.HasValue && consecutiveProbePort.Value != previewRawPort.Value))
                            {
                                consecutiveProbeFailures = 0;
                                consecutiveProbePort = previewRawPort;
                            }

                            bool nativeAlive = !string.IsNullOrEmpty(_pluginDir) && CdpHelper.IsNativeDaemonAlive(_pluginDir);
                            ActivePortProbeResult portProbe = null;
                            if (!nativeAlive)
                            {
                                portProbe = await CdpHelper.ProbeActivePortAsync(overridePort, hasActiveAttached, consecutiveProbeFailures).ConfigureAwait(false);
                                if (!_noNativeDaemon && !string.IsNullOrEmpty(_pluginDir))
                                {
                                    long nowTick = Environment.TickCount & int.MaxValue;
                                    if ((lastDaemonBootTick == 0L || Math.Abs(nowTick - lastDaemonBootTick) >= 6000L) &&
                                        portProbe.LivePort.HasValue)
                                    {
                                        lastDaemonBootTick = nowTick;
                                        if (CdpHelper.EnsureNativeDaemonRunning(_pluginDir, overridePort, null, Log))
                                        {
                                            nativeAlive = true;
                                        }
                                    }
                                }
                            }
                            if (nativeAlive)
                            {
                                if (!hadLiveHost && previewRawPort.HasValue)
                                {
                                    try
                                    {
                                        if (await CdpHelper.IsPortAliveAsync(previewRawPort.Value, 600).ConfigureAwait(false))
                                        {
                                            hadLiveHost = true;
                                        }
                                    }
                                    catch { }
                                }
                                try
                                {
                                    string pCfg = Path.Combine(_pluginDir, "config.json");
                                    string bCfg = Path.Combine(_baseDir, "config.json");
                                    if (File.Exists(pCfg) &&
                                        !CdpHelper.IsUnsafeReparsePoint(pCfg) &&
                                        !CdpHelper.IsUnsafeReparsePoint(bCfg) &&
                                        (!File.Exists(bCfg) || File.GetLastWriteTimeUtc(pCfg) > File.GetLastWriteTimeUtc(bCfg)))
                                    {
                                        CdpHelper.ClearReadOnlyAndHiddenAttributes(bCfg);
                                        File.Copy(pCfg, bCfg, true);
                                    }
                                }
                                catch { }
                                if (!yieldingToDaemon || attached.Count > 0)
                                {
                                    foreach (KeyValuePair<string, AttachedEntry> kv in attached)
                                    {
                                        AttachedEntry oldEntry;
                                        if (attached.TryRemove(kv.Key, out oldEntry) && oldEntry != null && oldEntry.Session != null)
                                        {
                                            try { oldEntry.Session.Close(); } catch { }
                                        }
                                    }
                                    lastPort = null;
                                    lastLoggedStalePort = null;
                                    consecutiveProbeFailures = 0;
                                    consecutiveProbePort = null;
                                    if (!yieldingToDaemon)
                                    {
                                        yieldingToDaemon = true;
                                        Log(InstallerI18n.Tr(
                                            "[~] 检测到本地守护服务运行中，Watcher 进入热备避让态",
                                            "[~] Local background daemon detected; Watcher entering standby mode"
                                        ));
                                    }
                                }
                                exitEvent.Wait(750);
                                continue;
                            }
                            if (yieldingToDaemon)
                            {
                                yieldingToDaemon = false;
                                Log(InstallerI18n.Tr(
                                    "[+] 本地守护服务已离线，Watcher 接管实时注入",
                                    "[+] Local background daemon offline; Watcher taking over live injection"
                                ));
                            }

                            if (portProbe == null)
                            {
                                portProbe = await CdpHelper.ProbeActivePortAsync(overridePort, hasActiveAttached, consecutiveProbeFailures).ConfigureAwait(false);
                            }

                            if (portProbe.LivePort.HasValue)
                            {
                                consecutiveProbeFailures = 0;
                                consecutiveProbePort = portProbe.LivePort;
                            }
                            else if (portProbe.RawPort.HasValue)
                            {
                                consecutiveProbePort = portProbe.RawPort;
                                consecutiveProbeFailures = portProbe.ConsecutiveFailures;
                            }
                            else
                            {
                                consecutiveProbeFailures = 0;
                                consecutiveProbePort = null;
                            }

                            if (portProbe.IsStalePort && portProbe.RawPort.HasValue)
                            {
                                if (!lastLoggedStalePort.HasValue || lastLoggedStalePort.Value != portProbe.RawPort.Value)
                                {
                                    lastLoggedStalePort = portProbe.RawPort.Value;
                                    Log(InstallerI18n.TrFormat(
                                        "[!] 检测到残留无效调试端口 {0}（连接被拒绝/超时），视作无有效端口并转入裸启恢复检测",
                                        "[!] Detected stale debug port {0} (connection refused/timed out); treating as inactive and checking bare-launch recovery",
                                        portProbe.RawPort.Value
                                    ));
                                }
                                if (lastPort.HasValue || attached.Count > 0)
                                {
                                    foreach (KeyValuePair<string, AttachedEntry> kv in attached)
                                    {
                                        AttachedEntry oldEntry;
                                        if (attached.TryRemove(kv.Key, out oldEntry) && oldEntry != null && oldEntry.Session != null)
                                        {
                                            try { oldEntry.Session.Close(); } catch { }
                                        }
                                    }
                                    lastPort = null;
                                    lastShortcutCheckTick = Environment.TickCount & int.MaxValue;
                                    CdpHelper.EnsureAntigravityShortcutsOptIn(
                                        _baseDir,
                                        defaultWatcherDir,
                                        shortcutStateDir,
                                        Log
                                    );
                                }
                            }
                            else
                            {
                                lastLoggedStalePort = null;
                            }

                            int? livePort = portProbe.LivePort;
                            bool isTransientProbeGrace = !livePort.HasValue &&
                                                         !portProbe.IsStalePort &&
                                                         portProbe.RawPort.HasValue &&
                                                         hasActiveAttached;
                            if (!livePort.HasValue && !isTransientProbeGrace && hadLiveHost)
                            {
                                hadLiveHost = false;
                                if (!overridePort.HasValue &&
                                    IsAutoArchiveOnExitAllowed() &&
                                    IsAutoArchiveOnExitEnabled() &&
                                    Interlocked.CompareExchange(ref exitArchiveInFlight, 1, 0) == 0)
                                {
                                    StartAutoArchiveOnExitFallback(overridePort, exitEvent, () =>
                                    {
                                        Interlocked.Exchange(ref exitArchiveInFlight, 0);
                                    });
                                }
                            }
                            if (!livePort.HasValue && !overridePort.HasValue && !isTransientProbeGrace)
                            {
                                string noPromptEnv1 = Environment.GetEnvironmentVariable("PRISM_NO_RELAUNCH_PROMPT");
                                string noPromptEnv2 = Environment.GetEnvironmentVariable("AG_PRISM_NO_RELAUNCH_PROMPT");
                                string nodeEnv = Environment.GetEnvironmentVariable("NODE_ENV");
                                string mockDec = Environment.GetEnvironmentVariable("AG_PRISM_MOCK_RELAUNCH_DECISION");
                                bool allowPrompt = !_noRelaunchPrompt &&
                                                   noPromptEnv1 != "1" &&
                                                   noPromptEnv2 != "1" &&
                                                   !string.Equals(nodeEnv, "test", StringComparison.OrdinalIgnoreCase) &&
                                                   (!CdpHelper.IsTestSandboxEnvironment(_baseDir) || !string.IsNullOrEmpty(mockDec));
                                if (allowPrompt)
                                {
                                    Dictionary<string, object> curCfg = CdpHelper.ReadConfig(_baseDir, manifest);
                                    object autoObj;
                                    if (curCfg != null && curCfg.TryGetValue("autoPromptCdpRelaunch", out autoObj) && autoObj != null)
                                    {
                                        if ((autoObj is bool && !((bool)autoObj)) ||
                                            string.Equals(Convert.ToString(autoObj), "off", StringComparison.OrdinalIgnoreCase) ||
                                            string.Equals(Convert.ToString(autoObj), "false", StringComparison.OrdinalIgnoreCase))
                                        {
                                            allowPrompt = false;
                                        }
                                    }
                                }
                                if (allowPrompt)
                                {
                                    BareHostProcessInfo bare = CdpHelper.FindBareAntigravityMainProcess();
                                    if (bare != null)
                                    {
                                        // 发现裸启主进程时立即复检并自愈补齐快捷方式参数（无需干等 45 秒周期）
                                        lastShortcutCheckTick = Environment.TickCount & int.MaxValue;
                                        CdpHelper.EnsureAntigravityShortcutsOptIn(
                                            _baseDir,
                                            defaultWatcherDir,
                                            shortcutStateDir,
                                            Log
                                        );
                                        string bareHostKey = bare.Pid + ":" + bare.StartTimeMs;
                                        if (bare.UptimeMs >= 8000L &&
                                            !promptedHostKeysInProcess.Contains(bareHostKey) &&
                                            !CdpHelper.HasPromptedForHost(bare.Pid, bare.StartTimeMs, _baseDir, _pluginDir))
                                        {
                                            if (promptedHostKeysInProcess.Count >= 256)
                                            {
                                                promptedHostKeysInProcess.Clear();
                                            }
                                            promptedHostKeysInProcess.Add(bareHostKey);
                                            CdpHelper.RecordPromptedForHost(bare.Pid, bare.StartTimeMs, "prompted", _baseDir, _pluginDir);
                                            bool confirmed = CdpHelper.PromptUserForCdpRelaunch();
                                            CdpHelper.RecordPromptedForHost(bare.Pid, bare.StartTimeMs, confirmed ? "yes" : "no", _baseDir, _pluginDir);
                                            if (confirmed)
                                            {
                                                Log(InstallerI18n.TrFormat(
                                                    "[*] 用户确认带 --remote-debugging-port=0 重新打开 Antigravity (旧 PID {0})",
                                                    "[*] User confirmed relaunching Antigravity with --remote-debugging-port=0 (old PID {0})",
                                                    bare.Pid
                                                ));
                                                CdpHelper.RelaunchAntigravityWithCdp(bare, 15000, Log);
                                            }
                                        }
                                    }
                                }
                            }
                            if (livePort.HasValue && portProbe.Pages != null)
                            {
                                hadLiveHost = true;
                                List<CdpPageInfo> pages = portProbe.Pages;
                                if (!lastPort.HasValue || lastPort.Value != livePort.Value)
                                {
                                    // Close stale sessions if Antigravity restarted on a new port
                                    foreach (KeyValuePair<string, AttachedEntry> kv in attached)
                                    {
                                        AttachedEntry oldEntry;
                                        if (attached.TryRemove(kv.Key, out oldEntry) && oldEntry != null && oldEntry.Session != null)
                                        {
                                            try { oldEntry.Session.Close(); } catch { }
                                        }
                                    }
                                    Log(InstallerI18n.TrFormat(
                                        "[+] 连接到调试端口 {0}",
                                        "[+] Connected to debug port {0}",
                                        livePort.Value
                                    ));
                                    lastPort = livePort.Value;
                                    // 端口切换或重连后立即复检快捷方式（应对更新覆盖 .lnk）
                                    lastShortcutCheckTick = Environment.TickCount & int.MaxValue;
                                    CdpHelper.EnsureAntigravityShortcutsOptIn(
                                        _baseDir,
                                        defaultWatcherDir,
                                        shortcutStateDir,
                                        Log
                                    );
                                }

                                List<Task> tasks = new List<Task>();
                                for (int i = 0; i < pages.Count; i++)
                                {
                                    if (!attached.ContainsKey(pages[i].Id))
                                    {
                                        tasks.Add(attachAsync(pages[i]));
                                    }
                                }
                                if (tasks.Count > 0)
                                {
                                    await Task.WhenAll(tasks).ConfigureAwait(false);
                                }
                            }
                        }
                        catch { }

                        exitEvent.Wait(2000);
                    }
                }
                finally
                {
                    if (fsw != null) { try { fsw.Dispose(); } catch { } }
                    if (reloadTimer != null) { try { reloadTimer.Dispose(); } catch { } }
                    foreach (KeyValuePair<string, AttachedEntry> kv in attached)
                    {
                        if (kv.Value != null && kv.Value.Session != null)
                        {
                            try { kv.Value.Session.Close(); } catch { }
                        }
                    }
                    try { stopSignal.Dispose(); } catch { }
                    try { exitEvent.Dispose(); } catch { }
                    ReleasePidFile(selfPid);
                }
            }
            return 0;
        }

        private static bool WaitExitSafe(ManualResetEventSlim exitEvent, int milliseconds)
        {
            if (exitEvent == null) return true;
            try
            {
                if (exitEvent.IsSet) return true;
                return exitEvent.Wait(milliseconds);
            }
            catch
            {
                return true;
            }
        }

        private static bool IsAutoArchiveOnExitAllowed()
        {
            string nodeEnv = Environment.GetEnvironmentVariable("NODE_ENV");
            string nodeTestCtx = Environment.GetEnvironmentVariable("NODE_TEST_CONTEXT");
            string noAutoEnv = Environment.GetEnvironmentVariable("AG_PRISM_NO_AUTO_ARCHIVE_ON_EXIT");
            return !string.Equals(nodeEnv, "test", StringComparison.OrdinalIgnoreCase) &&
                   string.IsNullOrEmpty(nodeTestCtx) &&
                   !string.Equals(noAutoEnv, "1", StringComparison.Ordinal) &&
                   !CdpHelper.IsTestSandboxEnvironment(_baseDir);
        }

        private static bool IsAutoArchiveOnExitEnabled()
        {
            List<string> dirs = new List<string>();
            if (!string.IsNullOrEmpty(_pluginDir)) dirs.Add(_pluginDir);
            if (!string.IsNullOrEmpty(_baseDir) && !string.Equals(_baseDir, _pluginDir, StringComparison.OrdinalIgnoreCase))
            {
                dirs.Add(_baseDir);
            }
            for (int i = 0; i < dirs.Count; i++)
            {
                try
                {
                    string cfgPath = Path.Combine(dirs[i], "config.json");
                    if (!File.Exists(cfgPath) || CdpHelper.IsUnsafeReparsePoint(cfgPath)) continue;
                    string raw = File.ReadAllText(cfgPath, Encoding.UTF8).TrimStart('\uFEFF').Trim();
                    if (string.IsNullOrEmpty(raw)) continue;
                    Dictionary<string, object> parsed = MiniJson.ParseObject(raw);
                    if (parsed == null) continue;
                    object val;
                    if (parsed.TryGetValue("autoArchiveOnExit", out val))
                    {
                        if (val is bool) return (bool)val;
                        string s = val as string;
                        if (!string.IsNullOrEmpty(s))
                        {
                            return string.Equals(s.Trim(), "true", StringComparison.OrdinalIgnoreCase) ||
                                   string.Equals(s.Trim(), "on", StringComparison.OrdinalIgnoreCase);
                        }
                        return false;
                    }
                    continue;
                }
                catch { }
            }
            return false;
        }

        private static string ResolveConversationArchiveScriptPath()
        {
            List<string> dirs = new List<string>();
            if (!string.IsNullOrEmpty(_pluginDir)) dirs.Add(_pluginDir);
            if (!string.IsNullOrEmpty(_baseDir) && !string.Equals(_baseDir, _pluginDir, StringComparison.OrdinalIgnoreCase))
            {
                dirs.Add(_baseDir);
            }
            for (int i = 0; i < dirs.Count; i++)
            {
                try
                {
                    string scriptPath = Path.Combine(dirs[i], Path.Combine("sidecars", Path.Combine("daemon", "conversation-archive.mjs")));
                    if (File.Exists(scriptPath) && !CdpHelper.IsUnsafeReparsePoint(scriptPath))
                    {
                        return scriptPath;
                    }
                }
                catch { }
            }
            return null;
        }

        private static bool IsAntigravityOrLanguageServerRunning()
        {
            try
            {
                int selfPid = Process.GetCurrentProcess().Id;
                Process[] procs = Process.GetProcesses();
                bool found = false;
                for (int i = 0; i < procs.Length; i++)
                {
                    Process p = procs[i];
                    try
                    {
                        if (!found && p.Id != selfPid)
                        {
                            string name = (p.ProcessName ?? "").ToLowerInvariant();
                            if (name == "antigravity" || name == "agy" || name.StartsWith("language_server", StringComparison.Ordinal))
                            {
                                found = true;
                            }
                        }
                    }
                    catch { }
                    finally
                    {
                        try { p.Dispose(); } catch { }
                    }
                }
                return found;
            }
            catch
            {
                // 任何进程枚举异常一律 fail-closed，绝不冒险移动文件
                return true;
            }
        }

        private static bool IsProcessIdAlive(int pid)
        {
            if (pid <= 0) return false;
            try
            {
                using (Process p = Process.GetProcessById(pid))
                {
                    return !p.HasExited;
                }
            }
            catch
            {
                return false;
            }
        }

        private static bool TryParseIsoUtc(object rawObj, out DateTime utcTime)
        {
            utcTime = DateTime.MinValue;
            string s = rawObj as string;
            if (string.IsNullOrEmpty(s)) return false;
            DateTime parsed;
            if (!DateTime.TryParse(
                    s,
                    System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.RoundtripKind,
                    out parsed))
            {
                return false;
            }
            utcTime = parsed.Kind == DateTimeKind.Utc ? parsed : parsed.ToUniversalTime();
            return true;
        }

        private static int ReadPositiveIntField(Dictionary<string, object> obj, string key)
        {
            object raw;
            if (obj == null || !obj.TryGetValue(key, out raw) || raw == null) return 0;
            if (raw is int) return (int)raw > 0 ? (int)raw : 0;
            if (raw is long)
            {
                long lv = (long)raw;
                return lv > 0L && lv <= int.MaxValue ? (int)lv : 0;
            }
            if (raw is double)
            {
                double dv = (double)raw;
                return !double.IsNaN(dv) && !double.IsInfinity(dv) && dv > 0.0 && dv <= int.MaxValue ? (int)dv : 0;
            }
            return 0;
        }

        private static bool HasActiveArchiveLockOrRecentRestore()
        {
            try
            {
                string home = Environment.GetEnvironmentVariable("USERPROFILE");
                if (string.IsNullOrEmpty(home)) home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) ?? "";
                if (string.IsNullOrEmpty(home)) return false;
                string archiveDir = Path.Combine(home, Path.Combine(".gemini", Path.Combine("antigravity", "conversations_archive")));
                if (!Directory.Exists(archiveDir)) return false;
                // 归档目录若为不安全重解析点/符号链接，一律 fail-closed 拦截
                if (CdpHelper.IsUnsafeReparsePoint(archiveDir)) return true;

                string lockPath = Path.Combine(archiveDir, ".archive.lock");
                if (File.Exists(lockPath))
                {
                    if (CdpHelper.IsUnsafeReparsePoint(lockPath)) return true;
                    DateTime mtime = File.GetLastWriteTimeUtc(lockPath);
                    if ((DateTime.UtcNow - mtime).TotalSeconds < 300.0)
                    {
                        return true;
                    }
                }

                // 协调正在静置/等待退出的脱离归档或还原任务（消除 4s vs 5.5s 抢跑竞态）；
                // 若记录的 auto-exit-archive PID 已随宿主 Job Object 一起死亡，则不让步，立即由 Watcher 接棒兜底
                string activePath = Path.Combine(archiveDir, ".archive-task-active.json");
                if (File.Exists(activePath))
                {
                    if (CdpHelper.IsUnsafeReparsePoint(activePath)) return true;
                    try
                    {
                        string activeRaw = File.ReadAllText(activePath, Encoding.UTF8).TrimStart('\uFEFF').Trim();
                        Dictionary<string, object> activeObj = MiniJson.ParseObject(activeRaw);
                        if (activeObj != null)
                        {
                            DateTime startedUtc;
                            object startObj;
                            if (!activeObj.TryGetValue("startedAt", out startObj) || !TryParseIsoUtc(startObj, out startedUtc))
                            {
                                startedUtc = File.GetLastWriteTimeUtc(activePath);
                            }
                            double ageSec = (DateTime.UtcNow - startedUtc).TotalSeconds;
                            if (ageSec >= -10.0 && ageSec < 180.0)
                            {
                                int taskPid = ReadPositiveIntField(activeObj, "pid");
                                if (taskPid > 0 && IsProcessIdAlive(taskPid))
                                {
                                    return true;
                                }
                                object activeActObj;
                                string activeAct = activeObj.TryGetValue("action", out activeActObj) ? (activeActObj as string) : null;
                                if ((string.Equals(activeAct, "restore-and-restart", StringComparison.Ordinal) ||
                                     string.Equals(activeAct, "restore", StringComparison.Ordinal)) &&
                                    ageSec < 30.0)
                                {
                                    return true;
                                }
                            }
                        }
                    }
                    catch { }
                }

                string resPath = Path.Combine(archiveDir, ".last-archive-result.json");
                if (File.Exists(resPath))
                {
                    if (CdpHelper.IsUnsafeReparsePoint(resPath)) return true;
                    string raw = File.ReadAllText(resPath, Encoding.UTF8).TrimStart('\uFEFF').Trim();
                    Dictionary<string, object> parsed = MiniJson.ParseObject(raw);
                    object actObj;
                    object tsObj;
                    if (parsed != null &&
                        parsed.TryGetValue("action", out actObj) &&
                        ((parsed.TryGetValue("recordedAt", out tsObj) && tsObj is string) ||
                         (parsed.TryGetValue("updatedAt", out tsObj) && tsObj is string)))
                    {
                        DateTime parsedTsUtc;
                        if (TryParseIsoUtc(tsObj, out parsedTsUtc))
                        {
                            double ageSec = Math.Abs((DateTime.UtcNow - parsedTsUtc).TotalSeconds);
                            if (ageSec < 90.0)
                            {
                                string act = actObj as string;
                                if (string.Equals(act, "restore-and-restart", StringComparison.Ordinal) ||
                                    string.Equals(act, "restore", StringComparison.Ordinal))
                                {
                                    return true;
                                }
                                object okObj;
                                bool isOk = parsed.TryGetValue("ok", out okObj) && (okObj is bool) && (bool)okObj;
                                if (isOk &&
                                    (string.Equals(act, "archive-and-restart", StringComparison.Ordinal) ||
                                     string.Equals(act, "auto-exit-archive", StringComparison.Ordinal) ||
                                     string.Equals(act, "archive", StringComparison.Ordinal)))
                                {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            catch { }
            return false;
        }

        private static void StartAutoArchiveOnExitFallback(int? overridePort, ManualResetEventSlim exitEvent, Action onComplete)
        {
            Task.Run(async () =>
            {
                try
                {
                    await RunAutoArchiveOnExitFallbackAsync(overridePort, exitEvent).ConfigureAwait(false);
                }
                catch { }
                finally
                {
                    if (onComplete != null)
                    {
                        try { onComplete(); } catch { }
                    }
                }
            });
        }

        private static async Task RunAutoArchiveOnExitFallbackAsync(int? overridePort, ManualResetEventSlim exitEvent)
        {
            // 1) 等待 Antigravity 与 language_server 均彻底退出（绝不强杀宿主）
            for (int waitIdx = 0; waitIdx < 15; waitIdx++)
            {
                if (!IsAntigravityOrLanguageServerRunning()) break;
                if (WaitExitSafe(exitEvent, 1000)) return;
                if (!string.IsNullOrEmpty(_pluginDir) && CdpHelper.IsNativeDaemonAlive(_pluginDir)) return;
                int? pWait = CdpHelper.ReadPort(overridePort);
                if (pWait.HasValue && await CdpHelper.IsPortAliveAsync(pWait.Value, 500).ConfigureAwait(false)) return;
            }
            if (IsAntigravityOrLanguageServerRunning()) return;

            // 2) 静置 4 秒等待 SQLite WAL/SHM 完全释放
            if (WaitExitSafe(exitEvent, 4000)) return;

            // 3) 二次 fail-closed 确认：配置仍开启、无活跃 CDP 端口、原生 Daemon 未运行、宿主与 language_server 均未运行、无互斥锁/刚还原记录
            if (!IsAutoArchiveOnExitEnabled()) return;
            if (!string.IsNullOrEmpty(_pluginDir) && CdpHelper.IsNativeDaemonAlive(_pluginDir)) return;
            int? portRecheck = CdpHelper.ReadPort(overridePort);
            if (portRecheck.HasValue && await CdpHelper.IsPortAliveAsync(portRecheck.Value, 600).ConfigureAwait(false)) return;
            if (IsAntigravityOrLanguageServerRunning()) return;
            if (HasActiveArchiveLockOrRecentRestore()) return;

            string scriptPath = ResolveConversationArchiveScriptPath();
            if (string.IsNullOrEmpty(scriptPath)) return;

            string runtimeExe = CdpHelper.FindFallbackNodeExecutable();
            bool useElectronAsNode = false;
            if (string.IsNullOrEmpty(runtimeExe))
            {
                runtimeExe = CdpHelper.FindAntigravityExecutable(null);
                useElectronAsNode = !string.IsNullOrEmpty(runtimeExe);
            }
            if (string.IsNullOrEmpty(runtimeExe) || !File.Exists(runtimeExe)) return;

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = runtimeExe;
                psi.Arguments = "\"" + scriptPath + "\" --archive --subagent-hours=2";
                psi.WorkingDirectory = Path.GetDirectoryName(scriptPath);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                if (useElectronAsNode)
                {
                    psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
                }
                using (Process proc = Process.Start(psi))
                {
                    if (proc == null) return;
                    bool exited = proc.WaitForExit(60000);
                    if (exited)
                    {
                        Log(InstallerI18n.TrFormat(
                            "[storage-guard] Watcher 退出兜底自动归档已执行 (exitCode={0})",
                            "[storage-guard] Watcher auto-archive on exit finished (exitCode={0})",
                            proc.ExitCode
                        ));
                    }
                }
            }
            catch (Exception ex)
            {
                Log(InstallerI18n.TrFormat(
                    "[storage-guard] Watcher 退出兜底自动归档异常: {0}",
                    "[storage-guard] Watcher auto-archive on exit error: {0}",
                    ex.Message
                ));
            }
        }
    }
}
