using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AgyClaudeStyle.Installer
{
    internal class InstallerOptions
    {
        public bool Uninstall;
        public bool Silent;
        public bool Popup;
        public bool StatusOnly;
        public bool ShowHelp;
        public bool NoAutostart;
        public bool NoKillLegacy;
        public bool NoNativeDaemon;
        public bool NoRelaunchPrompt;
        public bool PurgeData;
        public string InstallDir;
        public string PluginDir;
        public int? CdpPort;
        public string OutFile;
        public string Lang;
    }

    internal class AntigravityDetectResult
    {
        public string ExePath;
        public string Version;
        public bool IsRunning;
    }

    internal class InstallerStepException : Exception
    {
        public readonly string StepCode;
        public readonly string StepLabel;
        public readonly string TargetPath;
        public readonly string Hint;

        public InstallerStepException(string stepCode, string stepLabel, string targetPath, string hint, string message, Exception inner)
            : base(message, inner)
        {
            StepCode = stepCode ?? "unknown";
            StepLabel = stepLabel ?? InstallerI18n.Tr("安装操作", "Installation");
            TargetPath = targetPath ?? "";
            Hint = hint ?? "";
        }
    }

    internal class OperationResult
    {
        public bool Ok;
        public string Mode;
        public string Headline;
        public string Detail;
        public string InstallDir;
        public string PluginDir;
        public bool NativePluginDeployed;
        public bool NativeDaemonStarted;
        public string AntigravityExe;
        public string AntigravityVersion;
        public int? CdpPort;
        public List<string> InjectedPages = new List<string>();
        public bool PreservedExistingConfig;
        public bool SelfDeleteScheduled;
        public int PatchedShortcuts;
        public int SkippedShortcuts;
        public int RestoredShortcuts;
        public bool BareHostDetected;
        public string ConfigSummary;
        public List<string> Warnings = new List<string>();
    }

    internal static class InstallerCore
    {
        private const string UninstallRegSubKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\ObsidianPrism";
        private const string StartupLnkName = "Obsidian-Prism.lnk";
        private const string WatcherExeName = "obsidian-prism-watcher.exe";
        private const string SelfInstalledExeName = "obsidian-prism-installer.exe";

        private static int _fileWriteSeq = 0;

        public static string GetDefaultInstallDir()
        {
            string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            if (string.IsNullOrEmpty(localAppData) || string.IsNullOrEmpty(localAppData.Trim()))
            {
                localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            }
            return Path.Combine(localAppData.Trim(), "obsidian-prism");
        }

        /// <summary>
        /// 规范化目录路径，保留盘符根路径末尾斜杠（例如 C:\ 不会被截断为 C:）。
        /// </summary>
        public static string NormalizeDirPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            string full = Path.GetFullPath(path);
            string root = Path.GetPathRoot(full);
            if (!string.IsNullOrEmpty(root) &&
                string.Equals(full.TrimEnd('\\', '/'), root.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase))
            {
                return root;
            }
            return full.TrimEnd('\\', '/');
        }

        private static bool IsReparsePoint(string path)
        {
            return CdpHelper.IsUnsafeReparsePoint(path);
        }

        private static bool IsReparsePoint(string path, out uint reparseTag)
        {
            return CdpHelper.IsUnsafeReparsePoint(path, out reparseTag);
        }

        private static string ResolveInstallChainStopRoot(string dirPath)
        {
            if (string.IsNullOrEmpty(dirPath)) return dirPath;
            string norm = NormalizeDirPath(dirPath);
            string[] candidates = new string[]
            {
                Environment.GetEnvironmentVariable("LOCALAPPDATA"),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Environment.GetEnvironmentVariable("USERPROFILE"),
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            };
            for (int i = 0; i < candidates.Length; i++)
            {
                string cand = candidates[i];
                if (string.IsNullOrEmpty(cand) || string.IsNullOrEmpty(cand.Trim())) continue;
                try
                {
                    string candNorm = NormalizeDirPath(cand.Trim());
                    string candPrefix = candNorm.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
                    if (string.Equals(norm, candNorm, StringComparison.OrdinalIgnoreCase) ||
                        norm.StartsWith(candPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        return candNorm;
                    }
                }
                catch { }
            }
            try
            {
                string root = Path.GetPathRoot(norm);
                if (!string.IsNullOrEmpty(root)) return NormalizeDirPath(root);
            }
            catch { }
            return norm;
        }

        private static void AssertNoReparsePointChain(string dirPath, string stopAtRoot)
        {
            if (string.IsNullOrEmpty(dirPath)) return;
            string cur = NormalizeDirPath(dirPath);
            string rootNorm = !string.IsNullOrEmpty(stopAtRoot) ? NormalizeDirPath(stopAtRoot) : null;
            string rootPrefix = !string.IsNullOrEmpty(rootNorm)
                ? rootNorm.TrimEnd('\\', '/') + Path.DirectorySeparatorChar
                : null;

            while (!string.IsNullOrEmpty(cur))
            {
                uint tag;
                if (IsReparsePoint(cur, out tag))
                {
                    throw new InvalidOperationException(InstallerI18n.TrFormat(
                        "检测到符号链接或重解析点目录 [{0}]，已拒绝操作: {1}",
                        "Detected symbolic link or reparse point directory [{0}]; operation refused: {1}",
                        CdpHelper.DescribeReparseTag(tag),
                        cur
                    ));
                }
                if (!string.IsNullOrEmpty(rootNorm))
                {
                    if (string.Equals(cur, rootNorm, StringComparison.OrdinalIgnoreCase))
                    {
                        break;
                    }
                    if (!string.IsNullOrEmpty(rootPrefix) &&
                        !cur.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        break;
                    }
                }
                string parent = Path.GetDirectoryName(cur);
                if (string.IsNullOrEmpty(parent) || string.Equals(parent, cur, StringComparison.OrdinalIgnoreCase))
                {
                    break;
                }
                cur = NormalizeDirPath(parent);
            }
        }

        private static string ResolveSafeZipEntryDestPath(string targetRoot, string relPath)
        {
            if (string.IsNullOrEmpty(targetRoot) || string.IsNullOrEmpty(relPath))
            {
                throw new InvalidOperationException(InstallerI18n.Tr(
                    "非法的 ZIP 解压目标路径",
                    "Invalid ZIP extraction target path"
                ));
            }
            string normalizedRel = relPath.Replace('/', '\\');
            if (normalizedRel.StartsWith("\\", StringComparison.Ordinal) || Path.IsPathRooted(normalizedRel))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "检测到非法绝对路径 ZIP 条目: {0}",
                    "Detected illegal absolute path in ZIP entry: {0}",
                    relPath
                ));
            }
            string rootFull = NormalizeDirPath(targetRoot);
            string rootPrefix = rootFull.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
            string destFull = Path.GetFullPath(Path.Combine(rootFull, normalizedRel));
            if (!destFull.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "检测到 ZIP Slip 越界路径: {0}",
                    "Detected ZIP Slip path traversal: {0}",
                    relPath
                ));
            }
            string parent = Path.GetDirectoryName(destFull);
            if (!string.IsNullOrEmpty(parent))
            {
                AssertNoReparsePointChain(parent, rootFull);
            }
            uint destTag;
            if (IsReparsePoint(destFull, out destTag))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                    "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                    CdpHelper.DescribeReparseTag(destTag),
                    destFull
                ));
            }
            return destFull;
        }

        /// <summary>
        /// 判断路径是否为驱动器根目录、用户主目录或系统关键目录等危险根路径。
        /// </summary>
        public static bool IsDangerousRootPath(string dirPath)
        {
            if (string.IsNullOrEmpty(dirPath) || string.IsNullOrEmpty(dirPath.Trim())) return true;
            string norm;
            string root;
            try
            {
                norm = NormalizeDirPath(dirPath);
                root = Path.GetPathRoot(norm);
            }
            catch
            {
                return true;
            }
            if (string.IsNullOrEmpty(norm) || string.IsNullOrEmpty(root)) return true;
            if (string.Equals(norm.TrimEnd('\\', '/'), root.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            string normSlash = norm.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
            List<string> protectedRoots = new List<string>();
            Action<string> addProtected = (p) =>
            {
                if (string.IsNullOrEmpty(p)) return;
                try { protectedRoots.Add(NormalizeDirPath(p)); } catch { }
            };

            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
            addProtected(Environment.GetEnvironmentVariable("USERPROFILE"));
            string homeDrive = Environment.GetEnvironmentVariable("HOMEDRIVE");
            string homePath = Environment.GetEnvironmentVariable("HOMEPATH");
            if (!string.IsNullOrEmpty(homeDrive) && !string.IsNullOrEmpty(homePath))
            {
                addProtected(homeDrive + homePath);
            }
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.Windows));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.System));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
            addProtected(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
            addProtected(Path.GetTempPath());

            string userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(userHome)) userHome = Environment.GetEnvironmentVariable("USERPROFILE");
            List<string> redlineDirs = new List<string>();
            Action<string> addRedline = (p) =>
            {
                if (string.IsNullOrEmpty(p)) return;
                try { redlineDirs.Add(NormalizeDirPath(p)); } catch { }
            };
            if (!string.IsNullOrEmpty(userHome))
            {
                string geminiDir = Path.Combine(userHome, ".gemini");
                addProtected(geminiDir);
                addProtected(Path.Combine(geminiDir, "config"));
                addProtected(Path.Combine(geminiDir, "config", "plugins"));
                addProtected(Path.Combine(geminiDir, "antigravity"));
                addRedline(Path.Combine(geminiDir, "antigravity", "conversations_archive"));
                addRedline(Path.Combine(geminiDir, "antigravity", "prism-knowledge-space"));
                addRedline(Path.Combine(userHome, "Documents", "Antigravity-Spark"));
            }
            string myDocs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (!string.IsNullOrEmpty(myDocs))
            {
                addRedline(Path.Combine(myDocs, "Antigravity-Spark"));
            }

            for (int i = 0; i < protectedRoots.Count; i++)
            {
                string p = protectedRoots[i];
                if (string.IsNullOrEmpty(p)) continue;
                if (string.Equals(norm, p, StringComparison.OrdinalIgnoreCase)) return true;
                if (p.StartsWith(normSlash, StringComparison.OrdinalIgnoreCase)) return true;
            }
            for (int i = 0; i < redlineDirs.Count; i++)
            {
                string p = redlineDirs[i];
                if (string.IsNullOrEmpty(p)) continue;
                string pSlash = p.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
                if (string.Equals(norm, p, StringComparison.OrdinalIgnoreCase)) return true;
                if (norm.StartsWith(pSlash, StringComparison.OrdinalIgnoreCase)) return true;
                if (p.StartsWith(normSlash, StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }

        private static bool IsAllowedTelemetryOverrideDir(string candidate, string geminiRoot)
        {
            if (string.IsNullOrEmpty(candidate) || string.IsNullOrEmpty(candidate.Trim())) return false;
            string norm;
            try { norm = NormalizeDirPath(candidate.Trim()); }
            catch { return false; }
            if (IsDangerousRootPath(norm)) return false;

            List<string> allowedRoots = new List<string>();
            Action<string> addBase = (b) =>
            {
                if (string.IsNullOrEmpty(b)) return;
                try { allowedRoots.Add(NormalizeDirPath(b).TrimEnd('\\', '/') + Path.DirectorySeparatorChar); } catch { }
            };
            if (!string.IsNullOrEmpty(geminiRoot)) addBase(geminiRoot);
            string userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(userHome)) userHome = Environment.GetEnvironmentVariable("USERPROFILE");
            if (!string.IsNullOrEmpty(userHome)) addBase(Path.Combine(userHome, ".gemini"));
            addBase(Path.GetTempPath());

            bool underAllowed = false;
            for (int i = 0; i < allowedRoots.Count; i++)
            {
                if (norm.StartsWith(allowedRoots[i], StringComparison.OrdinalIgnoreCase))
                {
                    underAllowed = true;
                    break;
                }
            }
            if (!underAllowed) return false;

            string[] segs = norm.Split(new char[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < segs.Length; i++)
            {
                if (string.Equals(segs[i], "telemetry", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(segs[i], "obsidian-prism", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static bool IsAllowedAddonsOverrideDir(string candidate, string geminiRoot, out string matchedRoot)
        {
            matchedRoot = null;
            if (string.IsNullOrEmpty(candidate) || string.IsNullOrEmpty(candidate.Trim())) return false;
            string norm;
            try { norm = NormalizeDirPath(candidate.Trim()); }
            catch { return false; }
            if (IsDangerousRootPath(norm)) return false;

            string[] segs = norm.Split(new char[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries);
            bool owned = false;
            for (int i = 0; i < segs.Length; i++)
            {
                if (string.Equals(segs[i], "conversations_archive", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(segs[i], "prism-knowledge-space", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(segs[i], "antigravity-spark", StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }
                if (string.Equals(segs[i], "addons", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(segs[i], "obsidian-prism", StringComparison.OrdinalIgnoreCase))
                {
                    owned = true;
                }
            }
            if (!owned) return false;

            List<string> allowedRoots = new List<string>();
            Action<string> addBase = (b) =>
            {
                if (string.IsNullOrEmpty(b)) return;
                try { allowedRoots.Add(NormalizeDirPath(b)); } catch { }
            };
            if (!string.IsNullOrEmpty(geminiRoot)) addBase(geminiRoot);
            string userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(userHome)) userHome = Environment.GetEnvironmentVariable("USERPROFILE");
            if (!string.IsNullOrEmpty(userHome)) addBase(Path.Combine(userHome, ".gemini"));
            addBase(Path.GetTempPath());

            for (int i = 0; i < allowedRoots.Count; i++)
            {
                string root = allowedRoots[i];
                string prefix = root.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
                if (norm.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                {
                    matchedRoot = root;
                    return true;
                }
            }
            return false;
        }

        private static bool IsAllowedUsageCacheOverrideFile(string candidate, string hostCfgDir, string geminiRoot, out string matchedRoot)
        {
            matchedRoot = null;
            if (string.IsNullOrEmpty(candidate) || string.IsNullOrEmpty(candidate.Trim())) return false;
            string normFile;
            string parentDir;
            try
            {
                normFile = Path.GetFullPath(candidate.Trim());
                parentDir = Path.GetDirectoryName(normFile);
            }
            catch { return false; }
            if (string.IsNullOrEmpty(parentDir)) return false;
            if (!string.Equals(Path.GetFileName(normFile), "obsidian-prism-usage-rollup-cache.json", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            string normParent;
            try { normParent = NormalizeDirPath(parentDir); }
            catch { return false; }
            string[] segs = normParent.Split(new char[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < segs.Length; i++)
            {
                if (string.Equals(segs[i], "conversations_archive", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(segs[i], "prism-knowledge-space", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(segs[i], "Antigravity-Spark", StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }
            }

            List<string> allowedRoots = new List<string>();
            Action<string> addBase = (b) =>
            {
                if (string.IsNullOrEmpty(b)) return;
                try { allowedRoots.Add(NormalizeDirPath(b)); } catch { }
            };
            if (!string.IsNullOrEmpty(hostCfgDir)) addBase(hostCfgDir);
            if (!string.IsNullOrEmpty(geminiRoot)) addBase(geminiRoot);
            string userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(userHome)) userHome = Environment.GetEnvironmentVariable("USERPROFILE");
            if (!string.IsNullOrEmpty(userHome)) addBase(Path.Combine(userHome, ".gemini"));
            addBase(Path.GetTempPath());

            for (int i = 0; i < allowedRoots.Count; i++)
            {
                string root = allowedRoots[i];
                string rootSlash = root.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
                if (string.Equals(normParent, root, StringComparison.OrdinalIgnoreCase) ||
                    normParent.StartsWith(rootSlash, StringComparison.OrdinalIgnoreCase))
                {
                    matchedRoot = root;
                    return true;
                }
            }
            return false;
        }

        private static void ClearTreeReadOnlyAttributesNoSymlink(string dir, int depth)
        {
            if (depth > 16 || string.IsNullOrEmpty(dir) || !Directory.Exists(dir) || IsReparsePoint(dir)) return;
            CdpHelper.ClearReadOnlyAndHiddenAttributes(dir);
            try
            {
                string[] files = Directory.GetFiles(dir);
                for (int i = 0; i < files.Length; i++)
                {
                    if (!IsReparsePoint(files[i])) CdpHelper.ClearReadOnlyAndHiddenAttributes(files[i]);
                }
            }
            catch { }
            try
            {
                string[] subDirs = Directory.GetDirectories(dir);
                for (int i = 0; i < subDirs.Length; i++)
                {
                    if (!IsReparsePoint(subDirs[i])) ClearTreeReadOnlyAttributesNoSymlink(subDirs[i], depth + 1);
                }
            }
            catch { }
        }

        private static void SafeDeleteDirectory(string dir)
        {
            if (string.IsNullOrEmpty(dir)) return;
            if (IsDangerousRootPath(dir))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "已拒绝删除受保护的系统或用户根目录: {0}",
                    "Refused to delete protected system or user root directory: {0}",
                    dir
                ));
            }
            if (!Directory.Exists(dir)) return;
            if (IsReparsePoint(dir))
            {
                Directory.Delete(dir, false);
                return;
            }
            ClearTreeReadOnlyAttributesNoSymlink(dir, 0);
            int[] backoffs = new int[] { 80, 160, 300 };
            for (int attempt = 0; attempt <= backoffs.Length; attempt++)
            {
                try
                {
                    if (!Directory.Exists(dir)) return;
                    Directory.Delete(dir, true);
                    return;
                }
                catch (IOException)
                {
                    if (attempt >= backoffs.Length) throw;
                    ClearTreeReadOnlyAttributesNoSymlink(dir, 0);
                    Thread.Sleep(backoffs[attempt]);
                }
                catch (UnauthorizedAccessException)
                {
                    if (attempt >= backoffs.Length) throw;
                    ClearTreeReadOnlyAttributesNoSymlink(dir, 0);
                    Thread.Sleep(backoffs[attempt]);
                }
            }
        }

        private static void CleanInstallDirKeepingSelfExe(string dir, string selfExeFullPath)
        {
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir) || IsReparsePoint(dir)) return;
            try
            {
                string[] files = Directory.GetFiles(dir);
                for (int i = 0; i < files.Length; i++)
                {
                    string fp = files[i];
                    if (string.Equals(Path.GetFullPath(fp), selfExeFullPath, StringComparison.OrdinalIgnoreCase)) continue;
                    if (IsReparsePoint(fp)) continue;
                    try
                    {
                        CdpHelper.ClearReadOnlyAndHiddenAttributes(fp);
                        File.Delete(fp);
                    }
                    catch { }
                }
            }
            catch { }

            try
            {
                string[] subDirs = Directory.GetDirectories(dir);
                for (int i = 0; i < subDirs.Length; i++)
                {
                    string subDir = subDirs[i];
                    if (IsReparsePoint(subDir))
                    {
                        try { Directory.Delete(subDir, false); } catch { }
                        continue;
                    }
                    CleanInstallDirKeepingSelfExe(subDir, selfExeFullPath);
                    try
                    {
                        if (Directory.GetFileSystemEntries(subDir).Length == 0)
                        {
                            Directory.Delete(subDir, false);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        private static bool IsValidConfigJsonFile(string path)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path) || IsReparsePoint(path)) return false;
            try
            {
                string raw = File.ReadAllText(path, Encoding.UTF8).TrimStart('\uFEFF').Trim();
                if (raw.Length == 0) return false;
                return MiniJson.ParseObject(raw) != null;
            }
            catch
            {
                return false;
            }
        }

        private static void BackupUserConfigBeforeUninstall(string installDir, string pluginDir)
        {
            string hostCfgDir = CdpHelper.ResolveHostGeminiConfigDir(pluginDir);
            if (string.IsNullOrEmpty(hostCfgDir) || IsReparsePoint(hostCfgDir)) return;

            string installCfg = !string.IsNullOrEmpty(installDir) ? Path.Combine(installDir, "config.json") : null;
            string pluginCfg = !string.IsNullOrEmpty(pluginDir) ? Path.Combine(pluginDir, "config.json") : null;
            string chosen = null;
            bool installValid = IsValidConfigJsonFile(installCfg);
            bool pluginValid = IsValidConfigJsonFile(pluginCfg);
            if (installValid && pluginValid)
            {
                chosen = File.GetLastWriteTimeUtc(pluginCfg) > File.GetLastWriteTimeUtc(installCfg) ? pluginCfg : installCfg;
            }
            else if (pluginValid)
            {
                chosen = pluginCfg;
            }
            else if (installValid)
            {
                chosen = installCfg;
            }
            if (string.IsNullOrEmpty(chosen)) return;

            try
            {
                Directory.CreateDirectory(hostCfgDir);
                if (IsReparsePoint(hostCfgDir)) return;
                string backupPath = Path.Combine(hostCfgDir, "obsidian-prism-config.backup.json");
                if (IsReparsePoint(backupPath)) return;
                string tmpPath = backupPath + ".tmp." + Process.GetCurrentProcess().Id;
                File.Copy(chosen, tmpPath, true);
                if (File.Exists(backupPath)) File.Delete(backupPath);
                File.Move(tmpPath, backupPath);
            }
            catch { }
        }

        private static bool RestoreUserConfigBackupIfNeeded(string installDir, string pluginDir)
        {
            string installCfg = !string.IsNullOrEmpty(installDir) ? Path.Combine(installDir, "config.json") : null;
            string pluginCfg = !string.IsNullOrEmpty(pluginDir) ? Path.Combine(pluginDir, "config.json") : null;
            if ((!string.IsNullOrEmpty(installCfg) && File.Exists(installCfg)) ||
                (!string.IsNullOrEmpty(pluginCfg) && File.Exists(pluginCfg)))
            {
                return false;
            }
            string hostCfgDir = CdpHelper.ResolveHostGeminiConfigDir(pluginDir);
            if (string.IsNullOrEmpty(hostCfgDir) || IsReparsePoint(hostCfgDir)) return false;
            string backupPath = Path.Combine(hostCfgDir, "obsidian-prism-config.backup.json");
            if (!IsValidConfigJsonFile(backupPath) || string.IsNullOrEmpty(installCfg)) return false;
            try
            {
                if (IsReparsePoint(installCfg)) return false;
                File.Copy(backupPath, installCfg, false);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static void SafeDeleteFileNoReparsePoint(string filePath)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath) || IsReparsePoint(filePath)) return;
            try { File.Delete(filePath); } catch { }
        }

        private static void PurgeUserPluginData(string pluginDir)
        {
            // 绝对红线：严禁触碰 conversations_archive、Antigravity-Spark、prism-knowledge-space
            string hostCfgDir = CdpHelper.ResolveHostGeminiConfigDir(pluginDir);
            if (!string.IsNullOrEmpty(hostCfgDir) && Directory.Exists(hostCfgDir) && !IsReparsePoint(hostCfgDir))
            {
                string[] exactFiles = new string[]
                {
                    "obsidian-prism-config.backup.json",
                    "obsidian-prism-thought.json",
                    "obsidian-prism-thought-cache.json",
                    "obsidian-prism-usage-rollup-cache.json",
                    "obsidian-prism-storage-guard-state.json",
                    "obsidian-prism-sidebar.json",
                    "obsidian-prism-sidebar.json.lock",
                    "obsidian-prism-wallpaper.json",
                    "obsidian-prism-suggester.json",
                };
                for (int i = 0; i < exactFiles.Length; i++)
                {
                    SafeDeleteFileNoReparsePoint(Path.Combine(hostCfgDir, exactFiles[i]));
                }
                try
                {
                    string[] bakFiles = Directory.GetFiles(hostCfgDir, "obsidian-prism-sidebar.json.v1*.bak");
                    for (int i = 0; i < bakFiles.Length; i++)
                    {
                        SafeDeleteFileNoReparsePoint(bakFiles[i]);
                    }
                }
                catch { }

                string envTel = Environment.GetEnvironmentVariable("AG_PRISM_TELEMETRY_DIR");
                string geminiRoot = Path.GetDirectoryName(hostCfgDir);
                string telemetryDir = null;
                if (!string.IsNullOrEmpty(envTel) && !string.IsNullOrEmpty(envTel.Trim()))
                {
                    if (IsAllowedTelemetryOverrideDir(envTel, geminiRoot))
                    {
                        telemetryDir = NormalizeDirPath(envTel.Trim());
                    }
                }
                else if (!string.IsNullOrEmpty(geminiRoot))
                {
                    telemetryDir = Path.Combine(geminiRoot, "antigravity", "sidecar_data", "obsidian-prism", "telemetry");
                }
                if (!string.IsNullOrEmpty(telemetryDir) && Directory.Exists(telemetryDir) && !IsDangerousRootPath(telemetryDir))
                {
                    try
                    {
                        string stopRoot = Path.GetDirectoryName(hostCfgDir);
                        AssertNoReparsePointChain(telemetryDir, stopRoot);
                        SafeDeleteDirectory(telemetryDir);
                    }
                    catch { }
                }

                string envAddons = Environment.GetEnvironmentVariable("AG_PRISM_ADDONS_DIR");
                string addonsDir = null;
                string addonsStopRoot = geminiRoot;
                if (!string.IsNullOrEmpty(envAddons) && !string.IsNullOrEmpty(envAddons.Trim()))
                {
                    string matchedAddonsRoot;
                    if (IsAllowedAddonsOverrideDir(envAddons, geminiRoot, out matchedAddonsRoot))
                    {
                        addonsDir = NormalizeDirPath(envAddons.Trim());
                        addonsStopRoot = matchedAddonsRoot;
                    }
                }
                else if (!string.IsNullOrEmpty(geminiRoot))
                {
                    addonsDir = Path.Combine(geminiRoot, "antigravity", "sidecar_data", "obsidian-prism", "addons");
                }
                if (!string.IsNullOrEmpty(addonsDir) && Directory.Exists(addonsDir) && !IsDangerousRootPath(addonsDir))
                {
                    try
                    {
                        AssertNoReparsePointChain(addonsDir, addonsStopRoot);
                        SafeDeleteDirectory(addonsDir);
                    }
                    catch { }
                }
            }

            string envUsageCache = Environment.GetEnvironmentVariable("PRISM_USAGE_CACHE_PATH");
            string geminiRootForUsage = !string.IsNullOrEmpty(hostCfgDir) ? Path.GetDirectoryName(hostCfgDir) : null;
            string usageCacheStopRoot;
            if (IsAllowedUsageCacheOverrideFile(envUsageCache, hostCfgDir, geminiRootForUsage, out usageCacheStopRoot))
            {
                try
                {
                    string overrideFile = Path.GetFullPath(envUsageCache.Trim());
                    string overrideParent = Path.GetDirectoryName(overrideFile);
                    if (!string.IsNullOrEmpty(overrideParent) && Directory.Exists(overrideParent))
                    {
                        AssertNoReparsePointChain(overrideParent, usageCacheStopRoot);
                        SafeDeleteFileNoReparsePoint(overrideFile);
                    }
                }
                catch { }
            }
        }

        public static string ResolveNativePluginDir(InstallerOptions opts, string resolvedInstallDir)
        {
            if (opts != null && !string.IsNullOrEmpty(opts.PluginDir))
            {
                return NormalizeDirPath(opts.PluginDir);
            }
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AG_PRISM_PLUGIN_DIR")))
            {
                return NormalizeDirPath(CdpHelper.GetDefaultNativePluginDir());
            }
            if (opts == null || string.IsNullOrEmpty(opts.InstallDir))
            {
                return NormalizeDirPath(CdpHelper.GetDefaultNativePluginDir());
            }
            string normInstall = NormalizeDirPath(resolvedInstallDir);
            string parentDir = Path.GetDirectoryName(normInstall);
            string baseName = Path.GetFileName(normInstall);
            return Path.Combine(string.IsNullOrEmpty(parentDir) ? normInstall : parentDir, (string.IsNullOrEmpty(baseName) ? "obsidian-prism" : baseName) + "-native-plugin");
        }

        public static bool MatchesExactCommandPath(string normalizedCmd, string exactPath)
        {
            if (string.IsNullOrEmpty(normalizedCmd) || string.IsNullOrEmpty(exactPath)) return false;
            int idx = 0;
            while (idx <= normalizedCmd.Length - exactPath.Length)
            {
                int found = normalizedCmd.IndexOf(exactPath, idx, StringComparison.Ordinal);
                if (found < 0) return false;
                bool leftOk = (found == 0);
                if (!leftOk)
                {
                    char prev = normalizedCmd[found - 1];
                    leftOk = char.IsWhiteSpace(prev) || prev == '"' || prev == '\'' || prev == '=';
                }
                int afterIdx = found + exactPath.Length;
                bool rightOk = (afterIdx == normalizedCmd.Length);
                if (!rightOk)
                {
                    char next = normalizedCmd[afterIdx];
                    rightOk = char.IsWhiteSpace(next) || next == '"' || next == '\'' || next == ',' || next == ';';
                }
                if (leftOk && rightOk) return true;
                idx = found + 1;
            }
            return false;
        }

        public static bool IsExactOrphanDaemonCommand(string rawCmd, string pluginDir, bool isAntigravityMainBinary, bool hasMainWindow)
        {
            if (string.IsNullOrEmpty(rawCmd) || string.IsNullOrEmpty(pluginDir)) return false;
            string normPlugin = NormalizeDirPath(pluginDir).Replace('\\', '/').TrimEnd('/').ToLowerInvariant();
            if (string.IsNullOrEmpty(normPlugin)) return false;
            string cmd = rawCmd.Replace('\\', '/').ToLowerInvariant();
            if (cmd.Contains("--type=")) return false;

            bool matchesExactEntry =
                MatchesExactCommandPath(cmd, normPlugin + "/sidecars/daemon/main.mjs") ||
                MatchesExactCommandPath(cmd, normPlugin + "/daemon/main.mjs") ||
                MatchesExactCommandPath(cmd, normPlugin + "/watch.js");
            if (!matchesExactEntry) return false;

            if (isAntigravityMainBinary)
            {
                if (hasMainWindow) return false;
                bool hasDaemonFeature =
                    cmd.Contains("--root ") ||
                    cmd.Contains("sidecar_sdk") ||
                    cmd.Contains("--import=");
                if (!hasDaemonFeature) return false;
            }
            return true;
        }

        public static void StopNativeDaemonInDir(string pluginDir, Action<string> log)
        {
            if (string.IsNullOrEmpty(pluginDir) || !Directory.Exists(pluginDir)) return;
            int selfPid = Process.GetCurrentProcess().Id;
            HashSet<int> stoppedPids = new HashSet<int>();
            int? pid = CdpHelper.ReadNativeDaemonPid(pluginDir);
            if (pid.HasValue && pid.Value > 0 && pid.Value != selfPid)
            {
                try
                {
                    using (Process p = Process.GetProcessById(pid.Value))
                    {
                        if (!p.HasExited && CdpHelper.IsExpectedPrismDaemonProcess(p, pluginDir))
                        {
                            p.Kill();
                            p.WaitForExit(2000);
                            stoppedPids.Add(pid.Value);
                            if (log != null)
                            {
                                log(InstallerI18n.TrFormat(
                                    "已停止本地守护服务 (PID {0})",
                                    "Stopped local background daemon (PID {0})",
                                    pid.Value
                                ));
                            }
                        }
                    }
                }
                catch { }
            }

            // 额外清理命令行精确指向当前 pluginDir 入口脚本的残留孤儿 daemon（组合完整路径匹配 + 宿主主进程强门禁，绝不误杀宿主主窗口或其他插件）
            try
            {
                string normPlugin = NormalizeDirPath(pluginDir).Replace('\\', '/').TrimEnd('/').ToLowerInvariant();
                if (!string.IsNullOrEmpty(normPlugin))
                {
                    string[] procNames = new string[] { "node", "Antigravity" };
                    for (int n = 0; n < procNames.Length; n++)
                    {
                        bool isAgMain = string.Equals(procNames[n], "Antigravity", StringComparison.OrdinalIgnoreCase);
                        Process[] procs = null;
                        try { procs = Process.GetProcessesByName(procNames[n]); } catch { procs = null; }
                        if (procs == null) continue;
                        for (int i = 0; i < procs.Length; i++)
                        {
                            try
                            {
                                int candPid = procs[i].Id;
                                if (candPid == selfPid || stoppedPids.Contains(candPid)) continue;
                                if (procs[i].HasExited) continue;
                                bool hasMainWindow = false;
                                if (isAgMain)
                                {
                                    hasMainWindow = procs[i].MainWindowHandle != IntPtr.Zero;
                                    if (hasMainWindow) continue;
                                }
                                bool denied;
                                string cmd = CdpHelper.QueryProcessCommandLineFast(candPid, out denied) ?? "";
                                if (IsExactOrphanDaemonCommand(cmd, pluginDir, isAgMain, hasMainWindow))
                                {
                                    procs[i].Kill();
                                    procs[i].WaitForExit(2000);
                                    stoppedPids.Add(candPid);
                                    if (log != null)
                                    {
                                        log(InstallerI18n.TrFormat(
                                            "已清理残留守护服务 (PID {0})",
                                            "Cleaned up orphaned background daemon (PID {0})",
                                            candPid
                                        ));
                                    }
                                }
                            }
                            catch { }
                            finally
                            {
                                try { procs[i].Dispose(); } catch { }
                            }
                        }
                    }
                }
            }
            catch { }

            string pidFile = Path.Combine(pluginDir, ".daemon.pid");
            try
            {
                if (File.Exists(pidFile) && !IsReparsePoint(pidFile))
                {
                    CdpHelper.ClearReadOnlyAndHiddenAttributes(pidFile);
                    File.Delete(pidFile);
                }
            }
            catch { }
        }

        public static string GetDirHash(string dir)
        {
            return CdpHelper.ComputeHash(NormalizeDirPath(dir).ToLowerInvariant());
        }

        public static string GetStartupShortcutPath()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), StartupLnkName);
        }

        public static AntigravityDetectResult DetectAntigravityDesktop()
        {
            AntigravityDetectResult res = new AntigravityDetectResult();
            try
            {
                Process[] procs = Process.GetProcessesByName("Antigravity");
                if (procs != null && procs.Length > 0)
                {
                    res.IsRunning = true;
                    for (int i = 0; i < procs.Length; i++)
                    {
                        try
                        {
                            if (string.IsNullOrEmpty(res.ExePath))
                            {
                                string p = procs[i].MainModule.FileName;
                                if (!string.IsNullOrEmpty(p) && File.Exists(p))
                                {
                                    res.ExePath = p;
                                }
                            }
                        }
                        catch { }
                        finally
                        {
                            try { procs[i].Dispose(); } catch { }
                        }
                    }
                }
            }
            catch { }

            if (string.IsNullOrEmpty(res.ExePath))
            {
                res.ExePath = CdpHelper.FindAntigravityExecutable(null);
            }

            if (string.IsNullOrEmpty(res.ExePath))
            {
                res.ExePath = FindAntigravityFromUninstallRegistry();
            }

            if (!string.IsNullOrEmpty(res.ExePath))
            {
                try
                {
                    FileVersionInfo fvi = FileVersionInfo.GetVersionInfo(res.ExePath);
                    res.Version = !string.IsNullOrEmpty(fvi.FileVersion) ? fvi.FileVersion : fvi.ProductVersion;
                }
                catch { }
                if (string.IsNullOrEmpty(res.Version))
                {
                    string dir = Path.GetDirectoryName(res.ExePath);
                    string versionFile = Path.Combine(dir, "version");
                    if (File.Exists(versionFile))
                    {
                        try { res.Version = File.ReadAllText(versionFile, Encoding.UTF8).Trim(); } catch { }
                    }
                }
            }

            return res;
        }

        private static string FindAntigravityFromUninstallRegistry()
        {
            RegistryKey[] roots = new RegistryKey[] { Registry.CurrentUser, Registry.LocalMachine };
            string[] subPaths = new string[]
            {
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            };
            for (int r = 0; r < roots.Length; r++)
            {
                for (int sp = 0; sp < subPaths.Length; sp++)
                {
                    try
                    {
                        using (RegistryKey parent = roots[r].OpenSubKey(subPaths[sp]))
                        {
                            if (parent == null) continue;
                            string[] names = parent.GetSubKeyNames();
                            for (int i = 0; i < names.Length; i++)
                            {
                                try
                                {
                                    using (RegistryKey item = parent.OpenSubKey(names[i]))
                                    {
                                        if (item == null) continue;
                                        string disp = item.GetValue("DisplayName") as string;
                                        if (string.IsNullOrEmpty(disp)) continue;
                                        if (!disp.StartsWith("Antigravity", StringComparison.OrdinalIgnoreCase) &&
                                            !disp.StartsWith("Google Antigravity", StringComparison.OrdinalIgnoreCase)) continue;
                                        if (disp.IndexOf("IDE", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                                        if (disp.IndexOf("Tools", StringComparison.OrdinalIgnoreCase) >= 0) continue;

                                        string loc = item.GetValue("InstallLocation") as string;
                                        string exe = TryProbeAntigravityDir(loc);
                                        if (exe != null) return exe;

                                        string uninst = item.GetValue("UninstallString") as string;
                                        exe = TryProbeAntigravityFromCmd(uninst);
                                        if (exe != null) return exe;

                                        string icon = item.GetValue("DisplayIcon") as string;
                                        exe = TryProbeAntigravityFromCmd(icon);
                                        if (exe != null) return exe;
                                    }
                                }
                                catch { }
                            }
                        }
                    }
                    catch { }
                }
            }
            return null;
        }

        private static string TryProbeAntigravityDir(string dir)
        {
            if (string.IsNullOrEmpty(dir)) return null;
            string cleaned = dir.Trim().Trim('"');
            if (string.IsNullOrEmpty(cleaned)) return null;
            string exe = Path.Combine(cleaned, "Antigravity.exe");
            return File.Exists(exe) ? exe : null;
        }

        private static string TryProbeAntigravityFromCmd(string cmd)
        {
            if (string.IsNullOrEmpty(cmd)) return null;
            string s = cmd.Trim();
            string pathPart = null;
            if (s.StartsWith("\"", StringComparison.Ordinal))
            {
                int end = s.IndexOf('"', 1);
                if (end > 1) pathPart = s.Substring(1, end - 1);
            }
            else
            {
                int exeIdx = s.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
                if (exeIdx > 0) pathPart = s.Substring(0, exeIdx + 4);
            }
            if (string.IsNullOrEmpty(pathPart)) return null;
            int comma = pathPart.IndexOf(',');
            if (comma > 0) pathPart = pathPart.Substring(0, comma);
            try
            {
                return TryProbeAntigravityDir(Path.GetDirectoryName(pathPart));
            }
            catch
            {
                return null;
            }
        }

        public static void StopWatcherInDir(string dir, Action<string> log)
        {
            if (!Directory.Exists(dir)) return;
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
            if (File.Exists(pidFile))
            {
                try
                {
                    int pid;
                    if (int.TryParse(File.ReadAllText(pidFile, Encoding.UTF8).Trim(), out pid) &&
                        pid > 0 &&
                        pid != Process.GetCurrentProcess().Id)
                    {
                        try
                        {
                            using (Process p = Process.GetProcessById(pid))
                            {
                                if (!p.HasExited && CdpHelper.IsExpectedPrismDaemonProcess(p, dir))
                                {
                                    if (!p.WaitForExit(2000))
                                    {
                                        p.Kill();
                                        p.WaitForExit(2000);
                                    }
                                    if (log != null)
                                    {
                                        log(InstallerI18n.TrFormat(
                                            "已停止运行中的守护进程 (PID {0})",
                                            "Stopped running watcher process (PID {0})",
                                            pid
                                        ));
                                    }
                                }
                            }
                        }
                        catch { }
                    }
                }
                catch { }
                try
                {
                    if (File.Exists(pidFile) && !IsReparsePoint(pidFile))
                    {
                        CdpHelper.ClearReadOnlyAndHiddenAttributes(pidFile);
                        File.Delete(pidFile);
                    }
                }
                catch { }
            }

            int selfPid = Process.GetCurrentProcess().Id;
            string normalizedDir = NormalizeDirPath(dir).TrimEnd('\\', '/').ToLowerInvariant();
            string normalizedDirPrefix = normalizedDir + "\\";
            string normalizedDirSlash = normalizedDir.Replace('\\', '/');
            string expectedWatcherExeSlash = (normalizedDirSlash + "/" + WatcherExeName).ToLowerInvariant();
            try
            {
                Process[] procs = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(WatcherExeName));
                for (int i = 0; i < procs.Length; i++)
                {
                    try
                    {
                        int candPid = procs[i].Id;
                        if (candPid == selfPid) continue;
                        bool belongsToDir = false;
                        try
                        {
                            string path = procs[i].MainModule.FileName;
                            if (!string.IsNullOrEmpty(path) &&
                                Path.GetFullPath(path).ToLowerInvariant().StartsWith(normalizedDirPrefix, StringComparison.Ordinal))
                            {
                                belongsToDir = true;
                            }
                        }
                        catch
                        {
                            bool denied;
                            string cmd = (CdpHelper.QueryProcessCommandLineFast(candPid, out denied) ?? "").Replace('\\', '/').ToLowerInvariant();
                            if (!string.IsNullOrEmpty(cmd) &&
                                (MatchesExactCommandPath(cmd, expectedWatcherExeSlash) ||
                                 (cmd.Contains("--dir ") && MatchesExactCommandPath(cmd, normalizedDirSlash))))
                            {
                                belongsToDir = true;
                            }
                        }
                        if (belongsToDir)
                        {
                            if (!procs[i].WaitForExit(1500))
                            {
                                procs[i].Kill();
                                procs[i].WaitForExit(1500);
                            }
                        }
                    }
                    catch { }
                    finally
                    {
                        try { procs[i].Dispose(); } catch { }
                    }
                }
            }
            catch { }
        }

        public static void StopLegacyNodeWatchers(Action<string> log)
        {
            try
            {
                string lnkPath = GetStartupShortcutPath();
                if (File.Exists(lnkPath))
                {
                    string workDir = ReadShortcutWorkingDir(lnkPath);
                    if (!string.IsNullOrEmpty(workDir) && Directory.Exists(workDir))
                    {
                        string legacyPidFile = Path.Combine(workDir, ".watch.pid");
                        if (File.Exists(legacyPidFile))
                        {
                            int pid;
                            if (int.TryParse(File.ReadAllText(legacyPidFile, Encoding.UTF8).Trim(), out pid) &&
                                pid > 0 &&
                                pid != Process.GetCurrentProcess().Id)
                            {
                                try
                                {
                                    using (Process p = Process.GetProcessById(pid))
                                    {
                                        if (!p.HasExited && string.Equals(p.ProcessName, "node", StringComparison.OrdinalIgnoreCase))
                                        {
                                            p.Kill();
                                            p.WaitForExit(1500);
                                            if (log != null)
                                            {
                                                log(InstallerI18n.TrFormat(
                                                    "已停止旧版脚本守护进程 (PID {0})",
                                                    "Stopped legacy script watcher (PID {0})",
                                                    pid
                                                ));
                                            }
                                        }
                                    }
                                }
                                catch { }
                            }
                            try { File.Delete(legacyPidFile); } catch { }
                        }
                    }
                }
            }
            catch { }

            try
            {
                int selfPid = Process.GetCurrentProcess().Id;
                Process[] nodeProcs = Process.GetProcessesByName("node");
                for (int i = 0; i < nodeProcs.Length; i++)
                {
                    Process p = nodeProcs[i];
                    try
                    {
                        int pid = p.Id;
                        if (pid <= 0 || pid == selfPid) continue;
                        bool exited = false;
                        try { exited = p.HasExited; } catch { continue; }
                        if (exited) continue;

                        bool accessDenied;
                        string cmd = CdpHelper.QueryProcessCommandLineFast(pid, out accessDenied);
                        if (accessDenied || string.IsNullOrEmpty(cmd)) continue;
                        if (cmd.IndexOf("agy-claude-style", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            cmd.IndexOf("inject.js", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            cmd.IndexOf("--watch", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            if (!p.HasExited && string.Equals(p.ProcessName, "node", StringComparison.OrdinalIgnoreCase))
                            {
                                p.Kill();
                                p.WaitForExit(1500);
                                if (log != null)
                                {
                                    log(InstallerI18n.TrFormat(
                                        "已替换旧版 Node 守护进程 (PID {0})",
                                        "Replaced legacy Node watcher (PID {0})",
                                        pid
                                    ));
                                }
                            }
                        }
                    }
                    catch { }
                    finally
                    {
                        try { p.Dispose(); } catch { }
                    }
                }
            }
            catch { }
        }

        private static string ReadShortcutWorkingDir(string lnkPath)
        {
            try
            {
                WindowsLnkInfo info = WindowsLnkCodec.ReadFile(lnkPath);
                return info != null ? info.WorkingDir : null;
            }
            catch
            {
                return null;
            }
        }

        public static string QuotePathArgumentStrict(string value, string paramName)
        {
            if (string.IsNullOrEmpty(value)) return "\"\"";
            if (value.IndexOf('"') >= 0 || value.IndexOf('\r') >= 0 || value.IndexOf('\n') >= 0 || value.IndexOf('\0') >= 0)
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "路径参数 {0} 包含非法引号或控制字符，已拒绝操作",
                    "Path argument {0} contains illegal quotes or control characters; operation refused",
                    paramName
                ));
            }
            int trailingBackslashes = 0;
            for (int i = value.Length - 1; i >= 0 && value[i] == '\\'; i--)
            {
                trailingBackslashes++;
            }
            if (trailingBackslashes > 0)
            {
                return "\"" + value + new string('\\', trailingBackslashes) + "\"";
            }
            return "\"" + value + "\"";
        }

        public static void CreateStartupShortcut(string installDir, string pluginDir)
        {
            string lnkPath = GetStartupShortcutPath();
            string startupDir = Path.GetDirectoryName(lnkPath);
            if (!string.IsNullOrEmpty(startupDir) && !Directory.Exists(startupDir))
            {
                Directory.CreateDirectory(startupDir);
            }
            if (File.Exists(lnkPath) && !IsReparsePoint(lnkPath))
            {
                CdpHelper.ClearReadOnlyAndHiddenAttributes(lnkPath);
            }
            string targetExe = Path.Combine(installDir, WatcherExeName);
            string shortcutArgs = "--watch";
            if (!string.IsNullOrEmpty(pluginDir))
            {
                shortcutArgs += " --plugin-dir " + QuotePathArgumentStrict(pluginDir, "--plugin-dir");
            }
            string explicitLang = InstallerI18n.ExplicitLang;
            if (!string.IsNullOrEmpty(explicitLang))
            {
                shortcutArgs += " --lang " + explicitLang;
            }
            WindowsLnkCodec.SaveNewShortcut(
                lnkPath,
                targetExe,
                shortcutArgs,
                NormalizeDirPath(installDir),
                "Obsidian Prism (obsidian-prism) watcher"
            );
        }

        public static void RegisterUninstallEntry(string installDir, string version)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallRegSubKey))
            {
                if (key == null) return;
                string exePath = Path.Combine(installDir, SelfInstalledExeName);
                key.SetValue(
                    "DisplayName",
                    InstallerI18n.Tr(
                        "Obsidian Prism · 黑曜棱镜 (Optical UI & Motion Suite for Antigravity)",
                        "Obsidian Prism (Optical UI & Motion Suite for Antigravity)"
                    ),
                    RegistryValueKind.String
                );
                key.SetValue("DisplayVersion", version ?? "1.2.2", RegistryValueKind.String);
                key.SetValue("Publisher", "Obsidian Prism Contributors", RegistryValueKind.String);
                key.SetValue("InstallLocation", installDir, RegistryValueKind.String);
                key.SetValue("DisplayIcon", exePath + ",0", RegistryValueKind.String);
                key.SetValue("UninstallString", QuotePathArgumentStrict(exePath, "UninstallString") + " --uninstall", RegistryValueKind.String);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            }
        }

        private static bool IsExecutableLikeFile(string path)
        {
            if (string.IsNullOrEmpty(path)) return false;
            string ext = Path.GetExtension(path);
            return string.Equals(ext, ".exe", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(ext, ".dll", StringComparison.OrdinalIgnoreCase);
        }

        private static void CleanupStaleOldFiles(string dir, int depth = 0)
        {
            if (depth > 8 || string.IsNullOrEmpty(dir) || !Directory.Exists(dir) || IsReparsePoint(dir)) return;
            try
            {
                string[] oldFiles = Directory.GetFiles(dir, "*.old.*", SearchOption.TopDirectoryOnly);
                for (int i = 0; i < oldFiles.Length; i++)
                {
                    try
                    {
                        if (!IsReparsePoint(oldFiles[i]))
                        {
                            CdpHelper.ClearReadOnlyAndHiddenAttributes(oldFiles[i]);
                            File.Delete(oldFiles[i]);
                        }
                    }
                    catch { }
                }
            }
            catch { }
            if (depth >= 8) return;
            try
            {
                string[] subDirs = Directory.GetDirectories(dir);
                for (int i = 0; i < subDirs.Length; i++)
                {
                    if (!IsReparsePoint(subDirs[i]))
                    {
                        CleanupStaleOldFiles(subDirs[i], depth + 1);
                    }
                }
            }
            catch { }
        }

        private static void WriteZipEntryWithRetry(ZipArchiveEntry entry, string destPath)
        {
            uint preTag;
            if (IsReparsePoint(destPath, out preTag))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                    "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                    CdpHelper.DescribeReparseTag(preTag),
                    destPath
                ));
            }

            byte[] payloadBytes;
            using (Stream inStream = entry.Open())
            using (MemoryStream ms = new MemoryStream())
            {
                inStream.CopyTo(ms);
                payloadBytes = ms.ToArray();
            }

            int pid = Process.GetCurrentProcess().Id;
            int seq = Interlocked.Increment(ref _fileWriteSeq);
            string tmpPath = destPath + ".tmp." + pid + "." + seq;
            bool isExe = IsExecutableLikeFile(destPath);
            int[] backoffs = new int[] { 60, 120, 220, 350, 500 };
            Exception lastErr = null;

            try
            {
                for (int attempt = 0; attempt <= backoffs.Length; attempt++)
                {
                    try
                    {
                        uint curTag;
                        if (IsReparsePoint(destPath, out curTag))
                        {
                            throw new InvalidOperationException(InstallerI18n.TrFormat(
                                "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                                "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                                CdpHelper.DescribeReparseTag(curTag),
                                destPath
                            ));
                        }
                        if (!File.Exists(destPath))
                        {
                            // 全新文件以 CreateNew 一次原子落盘，避免先写 .tmp 再改名触发实时防护双重扫描与抢锁重试
                            using (FileStream directStream = new FileStream(destPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                            {
                                directStream.Write(payloadBytes, 0, payloadBytes.Length);
                            }
                            return;
                        }

                        if (IsReparsePoint(tmpPath))
                        {
                            throw new InvalidOperationException(InstallerI18n.TrFormat(
                                "检测到临时目标为符号链接或重解析点，已拒绝写入: {0}",
                                "Temporary target is a symbolic link or reparse point; write refused: {0}",
                                tmpPath
                            ));
                        }

                        using (FileStream tmpStream = new FileStream(tmpPath, FileMode.Create, FileAccess.Write, FileShare.None))
                        {
                            tmpStream.Write(payloadBytes, 0, payloadBytes.Length);
                        }

                        if (!File.Exists(destPath))
                        {
                            File.Move(tmpPath, destPath);
                            return;
                        }

                        CdpHelper.ClearReadOnlyAndHiddenAttributes(destPath);
                        try
                        {
                            CdpHelper.AtomicReplaceFile(tmpPath, destPath);
                            return;
                        }
                        catch (Exception replaceEx)
                        {
                            if (!(replaceEx is IOException) && !(replaceEx is UnauthorizedAccessException))
                            {
                                throw;
                            }
                            if (isExe)
                            {
                                // Windows 允许对运行中/杀软扫描中的 PE 可执行映像重命名为 .old，再将新版 exe 原子移入；二阶段失败尽力回滚原 PE
                                string staleOld = destPath + ".old." + pid + "." + seq + "." + attempt;
                                bool movedToOld = false;
                                try
                                {
                                    uint preMoveTag;
                                    if (IsReparsePoint(destPath, out preMoveTag))
                                    {
                                        throw new InvalidOperationException(InstallerI18n.TrFormat(
                                            "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                                            "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                                            CdpHelper.DescribeReparseTag(preMoveTag),
                                            destPath
                                        ));
                                    }
                                    CdpHelper.ClearReadOnlyAndHiddenAttributes(destPath);
                                    File.Move(destPath, staleOld);
                                    movedToOld = true;
                                    File.Move(tmpPath, destPath);
                                    try { File.Delete(staleOld); } catch { }
                                    return;
                                }
                                catch (Exception moveEx)
                                {
                                    if (movedToOld && File.Exists(staleOld) && !File.Exists(destPath))
                                    {
                                        try { File.Move(staleOld, destPath); } catch { }
                                    }
                                    if (moveEx is InvalidOperationException) throw;
                                    throw replaceEx;
                                }
                            }
                            else
                            {
                                // 非可执行文件（如 main.mjs/cdp.js）若正被宿主 Sidecar 共享只读打开，回退写入前复检重解析点再使用 FileShare.ReadWrite 覆盖内容
                                uint fallbackTag;
                                if (IsReparsePoint(destPath, out fallbackTag))
                                {
                                    throw new InvalidOperationException(InstallerI18n.TrFormat(
                                        "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                                        "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                                        CdpHelper.DescribeReparseTag(fallbackTag),
                                        destPath
                                    ));
                                }
                                CdpHelper.ClearReadOnlyAndHiddenAttributes(destPath);
                                using (FileStream outStream = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
                                {
                                    outStream.Write(payloadBytes, 0, payloadBytes.Length);
                                }
                                try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
                                return;
                            }
                        }
                    }
                    catch (IOException ioEx)
                    {
                        lastErr = ioEx;
                        try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
                        if (attempt < backoffs.Length) Thread.Sleep(backoffs[attempt]);
                    }
                    catch (UnauthorizedAccessException uaEx)
                    {
                        lastErr = uaEx;
                        try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
                        if (attempt < backoffs.Length) Thread.Sleep(backoffs[attempt]);
                    }
                }
            }
            finally
            {
                try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
            }

            if (lastErr != null)
            {
                throw lastErr;
            }
        }

        private static void CopyFileWithRetry(string srcPath, string destPath, bool overwrite)
        {
            if (string.IsNullOrEmpty(srcPath) || string.IsNullOrEmpty(destPath)) return;
            uint srcTag;
            if (IsReparsePoint(srcPath, out srcTag))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "检测到源文件为符号链接或重解析点 [{0}]，已拒绝复制: {1}",
                    "Source file is a symbolic link or reparse point [{0}]; copy refused: {1}",
                    CdpHelper.DescribeReparseTag(srcTag),
                    srcPath
                ));
            }
            uint dstTag;
            if (IsReparsePoint(destPath, out dstTag))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                    "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                    CdpHelper.DescribeReparseTag(dstTag),
                    destPath
                ));
            }
            if (!overwrite && File.Exists(destPath)) return;
            int pid = Process.GetCurrentProcess().Id;
            int seq = Interlocked.Increment(ref _fileWriteSeq);
            bool isExe = IsExecutableLikeFile(destPath);
            int[] backoffs = new int[] { 60, 120, 220, 350 };
            Exception lastErr = null;
            for (int attempt = 0; attempt <= backoffs.Length; attempt++)
            {
                try
                {
                    uint curDstTag;
                    if (IsReparsePoint(destPath, out curDstTag))
                    {
                        throw new InvalidOperationException(InstallerI18n.TrFormat(
                            "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                            "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                            CdpHelper.DescribeReparseTag(curDstTag),
                            destPath
                        ));
                    }
                    if (File.Exists(destPath))
                    {
                        CdpHelper.ClearReadOnlyAndHiddenAttributes(destPath);
                    }
                    File.Copy(srcPath, destPath, overwrite);
                    return;
                }
                catch (Exception copyEx)
                {
                    if (!(copyEx is IOException) && !(copyEx is UnauthorizedAccessException))
                    {
                        throw;
                    }
                    lastErr = copyEx;
                    if (isExe && overwrite && File.Exists(destPath))
                    {
                        uint preMoveTag;
                        if (IsReparsePoint(destPath, out preMoveTag))
                        {
                            throw new InvalidOperationException(InstallerI18n.TrFormat(
                                "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                                "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                                CdpHelper.DescribeReparseTag(preMoveTag),
                                destPath
                            ));
                        }
                        string staleOld = destPath + ".old." + pid + "." + seq + "." + attempt;
                        bool movedToOld = false;
                        try
                        {
                            CdpHelper.ClearReadOnlyAndHiddenAttributes(destPath);
                            File.Move(destPath, staleOld);
                            movedToOld = true;
                            File.Copy(srcPath, destPath, true);
                            try { File.Delete(staleOld); } catch { }
                            return;
                        }
                        catch
                        {
                            if (movedToOld && File.Exists(staleOld) && !File.Exists(destPath))
                            {
                                try { File.Move(staleOld, destPath); } catch { }
                            }
                        }
                    }
                    if (attempt < backoffs.Length) Thread.Sleep(backoffs[attempt]);
                }
            }
            if (lastErr != null) throw lastErr;
        }

        private static void TryCleanupLegacySiblingPluginDir(string pluginDir, Action<string> log)
        {
            if (string.IsNullOrEmpty(pluginDir)) return;
            try
            {
                string normPlugin = NormalizeDirPath(pluginDir);
                string parent = Path.GetDirectoryName(normPlugin);
                if (string.IsNullOrEmpty(parent)) return;
                string legacyDir = Path.Combine(parent, "antigravity-prism");
                if (string.Equals(NormalizeDirPath(legacyDir), normPlugin, StringComparison.OrdinalIgnoreCase)) return;
                if (!Directory.Exists(legacyDir) || IsDangerousRootPath(legacyDir) || IsReparsePoint(legacyDir)) return;

                StopNativeDaemonInDir(legacyDir, log);
                string legacyCfg = Path.Combine(legacyDir, "config.json");
                string targetCfg = Path.Combine(normPlugin, "config.json");
                if (IsValidConfigJsonFile(legacyCfg) && !File.Exists(targetCfg) && !IsReparsePoint(targetCfg))
                {
                    try { CopyFileWithRetry(legacyCfg, targetCfg, false); } catch { }
                }
                SafeDeleteDirectory(legacyDir);
                if (log != null)
                {
                    log(InstallerI18n.TrFormat(
                        "已清理旧临时插件目录: {0}",
                        "Cleaned up legacy plugin directory: {0}",
                        legacyDir
                    ));
                }
            }
            catch { }
        }

        public static string BuildHelpText()
        {
            return InstallerI18n.Tr(
                "Obsidian Prism · 黑曜棱镜 Windows 安装与配置工具\r\n" +
                "用法: obsidian-prism-installer.exe [选项]\r\n\r\n" +
                "选项:\r\n" +
                "  --silent, -s, /S      静默模式运行（无交互界面）\r\n" +
                "  --uninstall           卸载 Obsidian Prism 并恢复原生界面\r\n" +
                "  --purge-data          卸载时同时清理配置、思考翻译设置与遥测缓存\r\n" +
                "  --status              输出当前安装与运行状态 JSON\r\n" +
                "  --popup               静默模式下执行完成后弹窗提示结果\r\n" +
                "  --no-autostart        安装时跳过开机自启与卸载注册表项\r\n" +
                "  --no-kill-legacy      安装时不终止旧版 Node 守护进程\r\n" +
                "  --no-native-daemon    不自动拉起本地守护服务\r\n" +
                "  --no-relaunch-prompt  不弹出 Antigravity 带参重开提示\r\n" +
                "  --install-dir <目录>  自定义后台守护安装目录\r\n" +
                "  --plugin-dir <目录>   自定义本地插件目录\r\n" +
                "  --cdp-port <端口>     指定 Antigravity CDP 调试端口\r\n" +
                "  --lang <zh|en>        指定界面与日志语言（覆盖 AG_PRISM_LANG 与系统语言）\r\n" +
                "  --out <文件>          将执行结果写入指定文件\r\n" +
                "  --help, -h, /?        显示此帮助信息",
                "Obsidian Prism Installer for Windows\r\n" +
                "Usage: obsidian-prism-installer.exe [options]\r\n\r\n" +
                "Options:\r\n" +
                "  --silent, -s, /S      Run silently without the GUI window\r\n" +
                "  --uninstall           Uninstall Obsidian Prism and restore the native UI\r\n" +
                "  --purge-data          Also purge saved configs, thought settings & telemetry cache on uninstall\r\n" +
                "  --status              Print current installation and runtime status as JSON\r\n" +
                "  --popup               Show a result dialog after silent execution\r\n" +
                "  --no-autostart        Skip startup shortcut and Uninstall registry registration\r\n" +
                "  --no-kill-legacy      Do not stop legacy Node watcher processes during install\r\n" +
                "  --no-native-daemon    Do not auto-start the local background daemon\r\n" +
                "  --no-relaunch-prompt  Disable the Antigravity CDP relaunch prompt\r\n" +
                "  --install-dir <dir>   Custom directory for background watcher files\r\n" +
                "  --plugin-dir <dir>    Custom directory for the local plugin\r\n" +
                "  --cdp-port <port>     Override the Antigravity CDP debug port\r\n" +
                "  --lang <zh|en>        Set UI/log language (overrides AG_PRISM_LANG and OS locale)\r\n" +
                "  --out <file>          Write result output to the specified file\r\n" +
                "  --help, -h, /?        Show this help message"
            );
        }

        public static string BuildFailureHint(Exception ex, string stepCode)
        {
            Exception root = ex is InstallerStepException && ex.InnerException != null ? ex.InnerException : ex;
            string msg = root != null ? (root.Message ?? "") : "";
            if (root is InvalidOperationException &&
                (msg.IndexOf("符号链接", StringComparison.Ordinal) >= 0 ||
                 msg.IndexOf("重解析点", StringComparison.Ordinal) >= 0 ||
                 msg.IndexOf("symbolic link", StringComparison.OrdinalIgnoreCase) >= 0 ||
                 msg.IndexOf("symlink", StringComparison.OrdinalIgnoreCase) >= 0 ||
                 msg.IndexOf("reparse point", StringComparison.OrdinalIgnoreCase) >= 0 ||
                 msg.IndexOf("junction", StringComparison.OrdinalIgnoreCase) >= 0))
            {
                return InstallerI18n.Tr(
                    "目标路径包含符号链接或目录联接，请检查并移除手动创建的软链接目录，或使用 --install-dir / --plugin-dir 指定普通本地目录。",
                    "Target path contains a symbolic link or directory junction. Remove the symlink/junction or specify a standard local folder via --install-dir / --plugin-dir."
                );
            }
            if (root is IOException || msg.IndexOf("being used by another process", StringComparison.OrdinalIgnoreCase) >= 0 || msg.IndexOf("正由另一进程使用", StringComparison.Ordinal) >= 0)
            {
                return InstallerI18n.Tr(
                    "目标文件正被旧版守护进程、Antigravity 或杀毒软件占用，请先完全关闭 Antigravity 客户端后重试安装。",
                    "Target file is in use by a legacy watcher, Antigravity, or antivirus software. Close Antigravity completely and try again."
                );
            }
            if (root is UnauthorizedAccessException || msg.IndexOf("拒绝访问", StringComparison.Ordinal) >= 0 || msg.IndexOf("denied", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return InstallerI18n.Tr(
                    "文件权限不足或被 Windows Defender / 杀毒软件拦截，请检查目录权限或将安装目录加入安全软件白名单后重试。",
                    "Insufficient permissions or blocked by Windows Defender / antivirus. Check folder permissions or add the install folder to exclusions and retry."
                );
            }
            if (string.Equals(stepCode, "start-watcher", StringComparison.Ordinal))
            {
                return InstallerI18n.Tr(
                    "后台守护程序 obsidian-prism-watcher.exe 启动被拦截，请检查杀毒软件隔离区或将 %LOCALAPPDATA%\\obsidian-prism 加入白名单。",
                    "Background watcher obsidian-prism-watcher.exe was blocked from starting. Check antivirus quarantine or add %LOCALAPPDATA%\\obsidian-prism to exclusions."
                );
            }
            return InstallerI18n.Tr(
                "请截图当前日志反馈，并尝试完全关闭 Antigravity 后重新运行安装器。",
                "Please share a screenshot of this log and retry after closing Antigravity completely."
            );
        }

        public static string FormatFailureLogBlock(Exception ex)
        {
            InstallerStepException stepEx = ex as InstallerStepException;
            Exception root = (stepEx != null && stepEx.InnerException != null) ? stepEx.InnerException : ex;
            string stepLabel = stepEx != null ? (stepEx.StepLabel + " [" + stepEx.StepCode + "]") : InstallerI18n.Tr("安装执行", "Installation");
            string targetPath = stepEx != null ? stepEx.TargetPath : "";
            string hint = stepEx != null && !string.IsNullOrEmpty(stepEx.Hint)
                ? stepEx.Hint
                : BuildFailureHint(ex, stepEx != null ? stepEx.StepCode : "");
            string exType = root != null ? root.GetType().FullName : "UnknownException";
            string rawMsg = root != null ? root.Message : (ex != null ? ex.Message : InstallerI18n.Tr("未知错误", "Unknown error"));

            StringBuilder sb = new StringBuilder();
            sb.Append(InstallerI18n.Tr("失败步骤: ", "Failed step: ")).Append(stepLabel);
            sb.Append(InstallerI18n.Tr("\r\n异常类型: ", "\r\nException type: ")).Append(exType);
            if (!string.IsNullOrEmpty(targetPath))
            {
                sb.Append(InstallerI18n.Tr("\r\n关键路径: ", "\r\nTarget path: ")).Append(targetPath);
            }
            sb.Append(InstallerI18n.Tr("\r\n错误详情: ", "\r\nError detail: ")).Append(rawMsg);
            if (!string.IsNullOrEmpty(hint))
            {
                sb.Append(InstallerI18n.Tr("\r\n排查建议: ", "\r\nSuggested fix: ")).Append(hint);
            }
            return sb.ToString();
        }

        public static OperationResult RunInstall(InstallerOptions opts, Action<int, string> progress)
        {
            string currentStep = "validate-paths";
            string currentStepLabel = InstallerI18n.Tr("校验安装路径", "Validate install paths");
            string currentTargetPath = "";
            try
            {
                OperationResult result = new OperationResult();
                result.Mode = "install";
                string installDir = NormalizeDirPath(string.IsNullOrEmpty(opts.InstallDir) ? GetDefaultInstallDir() : opts.InstallDir);
                string pluginDir = ResolveNativePluginDir(opts, installDir);
                currentTargetPath = installDir;
                if (IsDangerousRootPath(installDir))
                {
                    throw new InvalidOperationException(InstallerI18n.TrFormat(
                        "已拒绝将受保护的系统或用户根目录作为安装目录: {0}",
                        "Refused to use protected system or user root directory as install directory: {0}",
                        installDir
                    ));
                }
                if (!string.IsNullOrEmpty(pluginDir) && IsDangerousRootPath(pluginDir))
                {
                    currentTargetPath = pluginDir;
                    throw new InvalidOperationException(InstallerI18n.TrFormat(
                        "已拒绝将受保护的系统或用户根目录作为插件目录: {0}",
                        "Refused to use protected system or user root directory as plugin directory: {0}",
                        pluginDir
                    ));
                }
                result.InstallDir = installDir;
                result.PluginDir = pluginDir;

                Action<int, string> report = (pct, msg) =>
                {
                    if (progress != null) progress(pct, msg);
                };

                currentStep = "detect-host";
                currentStepLabel = InstallerI18n.Tr("检测 Antigravity 环境", "Detect Antigravity environment");
                currentTargetPath = "";
                report(10, InstallerI18n.Tr("正在检测本机 Antigravity Desktop 环境...", "Detecting local Antigravity Desktop environment..."));
                AntigravityDetectResult ag = DetectAntigravityDesktop();
                result.AntigravityExe = ag.ExePath;
                result.AntigravityVersion = ag.Version;
                if (!string.IsNullOrEmpty(ag.ExePath))
                {
                    report(18, InstallerI18n.TrFormat(
                        "已发现 Antigravity Desktop{0}: {1}",
                        "Found Antigravity Desktop{0}: {1}",
                        string.IsNullOrEmpty(ag.Version) ? "" : " (" + ag.Version + ")",
                        ag.ExePath
                    ));
                }
                else
                {
                    report(18, InstallerI18n.Tr(
                        "未在默认目录检测到 Antigravity.exe，仍将安装并启用 CDP 自动监听",
                        "Antigravity.exe not found in default locations; continuing install with automatic CDP watcher"
                    ));
                }

                currentStep = "stop-legacy";
                currentStepLabel = InstallerI18n.Tr("停止旧版守护服务", "Stop legacy watcher & daemon");
                currentTargetPath = installDir;
                report(28, InstallerI18n.Tr("正在停止旧版守护进程（如存在）...", "Stopping existing watcher processes (if any)..."));
                StopWatcherInDir(installDir, (m) => report(32, m));
                StopNativeDaemonInDir(pluginDir, (m) => report(34, m));
                if (!opts.NoKillLegacy)
                {
                    StopLegacyNodeWatchers((m) => report(35, m));
                }

                currentStep = "prepare-dirs";
                currentStepLabel = InstallerI18n.Tr("校验并准备安装目录", "Validate & prepare install directories");
                report(45, InstallerI18n.Tr("正在部署本地插件与独立守护资源...", "Deploying local plugin & standalone watcher resources..."));
                currentTargetPath = installDir;
                AssertNoReparsePointChain(installDir, ResolveInstallChainStopRoot(installDir));
                Directory.CreateDirectory(installDir);
                if (!string.IsNullOrEmpty(pluginDir))
                {
                    currentTargetPath = pluginDir;
                    AssertNoReparsePointChain(pluginDir, ResolveInstallChainStopRoot(pluginDir));
                    Directory.CreateDirectory(pluginDir);
                    TryCleanupLegacySiblingPluginDir(pluginDir, (m) => report(46, m));
                }

                RestoreUserConfigBackupIfNeeded(installDir, pluginDir);

                string installCfgPath = Path.Combine(installDir, "config.json");
                string pluginCfgPath = !string.IsNullOrEmpty(pluginDir) ? Path.Combine(pluginDir, "config.json") : null;
                bool hadInstallCfg = File.Exists(installCfgPath);
                bool hadPluginCfg = !string.IsNullOrEmpty(pluginCfgPath) && File.Exists(pluginCfgPath);
                if (!hadInstallCfg && hadPluginCfg)
                {
                    try { CopyFileWithRetry(pluginCfgPath, installCfgPath, false); hadInstallCfg = File.Exists(installCfgPath); } catch { }
                }
                else if (hadInstallCfg && hadPluginCfg)
                {
                    try
                    {
                        if (File.GetLastWriteTimeUtc(pluginCfgPath) > File.GetLastWriteTimeUtc(installCfgPath))
                        {
                            CopyFileWithRetry(pluginCfgPath, installCfgPath, true);
                        }
                    }
                    catch { }
                }

                currentStep = "extract-payload";
                currentStepLabel = InstallerI18n.Tr("解压部署插件与守护文件", "Extract plugin & watcher files");
                bool preservedConfig = false;
                const string nativePrefix = "native-plugin/";
                using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AGY_PAYLOAD.zip"))
                {
                    if (resStream == null)
                    {
                        throw new InvalidOperationException(InstallerI18n.Tr(
                            "安装包内嵌资源 AGY_PAYLOAD.zip 缺失",
                            "Embedded installer resource AGY_PAYLOAD.zip is missing"
                        ));
                    }
                    using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            if (string.IsNullOrEmpty(entry.Name)) continue;
                            string normFull = entry.FullName.Replace('\\', '/');
                            bool isNativeEntry = normFull.StartsWith(nativePrefix, StringComparison.OrdinalIgnoreCase);
                            string relPath = isNativeEntry ? normFull.Substring(nativePrefix.Length) : normFull;
                            if (string.IsNullOrEmpty(relPath)) continue;

                            string targetRoot = isNativeEntry ? pluginDir : installDir;
                            if (string.IsNullOrEmpty(targetRoot)) continue;

                            currentTargetPath = Path.Combine(targetRoot, relPath.Replace('/', '\\'));
                            string destPath = ResolveSafeZipEntryDestPath(targetRoot, relPath);
                            currentTargetPath = destPath;
                            string parent = Path.GetDirectoryName(destPath);
                            if (!string.IsNullOrEmpty(parent))
                            {
                                Directory.CreateDirectory(parent);
                                AssertNoReparsePointChain(parent, targetRoot);
                            }
                            uint destTag;
                            if (IsReparsePoint(destPath, out destTag))
                            {
                                throw new InvalidOperationException(InstallerI18n.TrFormat(
                                    "检测到目标文件为符号链接或重解析点 [{0}]，已拒绝覆盖: {1}",
                                    "Target file is a symbolic link or reparse point [{0}]; overwrite refused: {1}",
                                    CdpHelper.DescribeReparseTag(destTag),
                                    destPath
                                ));
                            }

                            if (string.Equals(entry.Name, "config.json", StringComparison.OrdinalIgnoreCase) && File.Exists(destPath))
                            {
                                if (!isNativeEntry) preservedConfig = true;
                                continue;
                            }
                            WriteZipEntryWithRetry(entry, destPath);
                        }
                    }
                }
                CleanupStaleOldFiles(installDir);
                CleanupStaleOldFiles(pluginDir);
                CleanupStaleRemovedSelfTempFiles();

                if (hadInstallCfg && !string.IsNullOrEmpty(pluginCfgPath) && File.Exists(installCfgPath))
                {
                    try { CopyFileWithRetry(installCfgPath, pluginCfgPath, true); } catch { }
                }
                result.PreservedExistingConfig = preservedConfig;
                result.NativePluginDeployed = !string.IsNullOrEmpty(pluginDir) && File.Exists(Path.Combine(pluginDir, "plugin.json"));

                currentStep = "sync-registry";
                currentStepLabel = InstallerI18n.Tr("注册 Antigravity 插件配置", "Register Antigravity plugin config");
                currentTargetPath = pluginDir ?? "";
                if (!string.IsNullOrEmpty(pluginDir))
                {
                    string regReason;
                    bool regOk = CdpHelper.SyncHostPluginRegistry(pluginDir, true, out regReason);
                    if (!regOk && !string.IsNullOrEmpty(regReason))
                    {
                        string warn = InstallerI18n.TrFormat(
                            "[!] 未能自动写入宿主插件注册表（非致命）: {0}",
                            "[!] Could not update host plugin registry automatically (non-fatal): {0}",
                            regReason
                        );
                        result.Warnings.Add(warn);
                        report(60, warn);
                    }
                }
                report(62, preservedConfig
                    ? InstallerI18n.Tr("已保留本机现有 config.json 用户配置并同步部署本地插件", "Preserved existing config.json and deployed local plugin")
                    : InstallerI18n.Tr("已部署本地插件并写入默认配置 config.json", "Deployed local plugin and wrote default config.json"));

                try
                {
                    string selfSrc = Assembly.GetExecutingAssembly().Location;
                    string selfDest = Path.Combine(installDir, SelfInstalledExeName);
                    if (!string.IsNullOrEmpty(selfSrc) && File.Exists(selfSrc) &&
                        !string.Equals(Path.GetFullPath(selfSrc), Path.GetFullPath(selfDest), StringComparison.OrdinalIgnoreCase))
                    {
                        CopyFileWithRetry(selfSrc, selfDest, true);
                    }
                }
                catch { }

                currentStep = "load-manifest";
                currentStepLabel = InstallerI18n.Tr("读取插件清单与配置", "Load plugin manifest & config");
                currentTargetPath = Path.Combine(installDir, "manifest.json");
                PluginManifest manifest = PluginManifest.Load(installDir);
                Dictionary<string, object> activeCfg = CdpHelper.ReadConfig(installDir, manifest);
                result.ConfigSummary = InstallerI18n.TrFormat(
                    "语言={0} | 配色={1} | 动效={2} | Omni={3}",
                    "Lang={0} | Palette={1} | Motion={2} | Omni={3}",
                    activeCfg.ContainsKey("language") ? activeCfg["language"] : "auto",
                    activeCfg.ContainsKey("palette") ? activeCfg["palette"] : "obsidian",
                    activeCfg.ContainsKey("motionLevel") ? activeCfg["motionLevel"] : "standard",
                    activeCfg.ContainsKey("omniModule") ? activeCfg["omniModule"] : "on"
                );

                currentStep = "patch-shortcuts";
                currentStepLabel = InstallerI18n.Tr("维护 Antigravity 快捷方式参数", "Update Antigravity shortcut arguments");
                currentTargetPath = "";
                string shortcutStateDir = !string.IsNullOrEmpty(pluginDir) ? pluginDir : installDir;
                int skippedShortcuts = 0;
                int alreadySetShortcuts = 0;
                List<string> skippedShortcutPaths = new List<string>();
                try
                {
                    result.PatchedShortcuts = CdpHelper.EnsureAntigravityShortcutsOptIn(
                        installDir,
                        GetDefaultInstallDir(),
                        shortcutStateDir,
                        out skippedShortcuts,
                        out alreadySetShortcuts,
                        skippedShortcutPaths,
                        (m) => report(68, m)
                    );
                    result.SkippedShortcuts = skippedShortcuts;
                    if (skippedShortcuts > 0)
                    {
                        result.Warnings.Add(InstallerI18n.TrFormat(
                            "已跳过 {0} 个需要管理员权限的系统级快捷方式",
                            "Skipped {0} system shortcut(s) requiring Administrator privileges",
                            skippedShortcuts
                        ));
                    }
                }
                catch (Exception scEx)
                {
                    string warn = InstallerI18n.TrFormat(
                        "[!] 快捷方式启动参数配置异常（非致命，核心插件已安装）: {0}",
                        "[!] Shortcut configuration warning (non-fatal, core plugin installed): {0}",
                        scEx.Message
                    );
                    result.Warnings.Add(warn);
                    report(68, warn);
                }

                currentStep = "register-autostart";
                currentStepLabel = InstallerI18n.Tr("配置开机自启与卸载入口", "Configure autostart & uninstall entry");
                currentTargetPath = GetStartupShortcutPath();
                if (!opts.NoAutostart)
                {
                    report(72, InstallerI18n.Tr("正在配置 Windows 开机自启与卸载入口...", "Configuring Windows startup shortcut & uninstall entry..."));
                    try
                    {
                        CreateStartupShortcut(installDir, pluginDir);
                    }
                    catch (Exception startupEx)
                    {
                        string warn = InstallerI18n.TrFormat(
                            "[!] 创建开机自启快捷方式被拦截（非致命，插件已正常部署）: {0}",
                            "[!] Startup shortcut creation blocked (non-fatal, plugin deployed): {0}",
                            startupEx.Message
                        );
                        result.Warnings.Add(warn);
                        report(73, warn);
                    }
                    try
                    {
                        RegisterUninstallEntry(installDir, manifest.Version);
                    }
                    catch (Exception regEx)
                    {
                        string warn = InstallerI18n.TrFormat(
                            "[!] 写入 Windows 卸载注册表入口被拦截（非致命）: {0}",
                            "[!] Writing Windows Uninstall registry entry blocked (non-fatal): {0}",
                            regEx.Message
                        );
                        result.Warnings.Add(warn);
                        report(74, warn);
                    }
                }
                else
                {
                    report(72, InstallerI18n.Tr("已按参数跳过开机自启注册", "Skipped autostart registration per CLI option"));
                }

                currentStep = "start-native-daemon";
                currentStepLabel = InstallerI18n.Tr("激活本地守护服务", "Start local background daemon");
                currentTargetPath = pluginDir ?? "";
                if (!opts.NoNativeDaemon && result.NativePluginDeployed)
                {
                    report(78, InstallerI18n.Tr("正在激活本地插件与后台守护服务...", "Starting local plugin & background daemon..."));
                    result.NativeDaemonStarted = CdpHelper.EnsureNativeDaemonRunning(pluginDir, opts.CdpPort, ag.ExePath, (m) => report(80, m));
                }

                currentStep = "start-watcher";
                currentStepLabel = InstallerI18n.Tr("启动后台静默守护进程", "Start background watcher");
                report(82, InstallerI18n.Tr("正在启动后台静默守护进程...", "Starting silent background watcher..."));
                string watcherExe = Path.Combine(installDir, WatcherExeName);
                currentTargetPath = watcherExe;
                string watcherArgs = "--watch --dir " + QuotePathArgumentStrict(installDir, "--dir");
                if (!string.IsNullOrEmpty(pluginDir))
                {
                    watcherArgs += " --plugin-dir " + QuotePathArgumentStrict(pluginDir, "--plugin-dir");
                }
                if (opts.NoNativeDaemon)
                {
                    watcherArgs += " --no-native-daemon";
                }
                if (opts.NoRelaunchPrompt)
                {
                    watcherArgs += " --no-relaunch-prompt";
                }
                if (opts.CdpPort.HasValue && opts.CdpPort.Value > 0)
                {
                    watcherArgs += " --cdp-port " + opts.CdpPort.Value;
                }
                string explicitWatcherLang = InstallerI18n.ExplicitLang;
                if (!string.IsNullOrEmpty(explicitWatcherLang))
                {
                    watcherArgs += " --lang " + explicitWatcherLang;
                }
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = watcherExe;
                psi.Arguments = watcherArgs;
                psi.WorkingDirectory = installDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                Exception watcherStartErr = null;
                int[] startBackoffs = new int[] { 150, 300, 500 };
                bool watcherStarted = false;
                for (int wTry = 0; wTry <= startBackoffs.Length; wTry++)
                {
                    try
                    {
                        Process.Start(psi);
                        watcherStarted = true;
                        break;
                    }
                    catch (Exception wEx)
                    {
                        watcherStartErr = wEx;
                        if (wTry < startBackoffs.Length) Thread.Sleep(startBackoffs[wTry]);
                    }
                }
                if (!watcherStarted)
                {
                    if (result.NativeDaemonStarted)
                    {
                        string warn = InstallerI18n.TrFormat(
                            "[!] 启动独立守护 obsidian-prism-watcher.exe 受阻（可能被杀毒软件拦截，但本地守护服务已运行）: {0}",
                            "[!] Standalone watcher obsidian-prism-watcher.exe failed to start (possibly blocked by antivirus, but local background daemon is running): {0}",
                            watcherStartErr != null ? watcherStartErr.Message : InstallerI18n.Tr("未知原因", "Unknown reason")
                        );
                        result.Warnings.Add(warn);
                        report(84, warn);
                    }
                    else if (watcherStartErr != null)
                    {
                        throw new InstallerStepException(
                            "start-watcher",
                            InstallerI18n.Tr("启动后台守护进程", "Start background watcher"),
                            watcherExe,
                            BuildFailureHint(watcherStartErr, "start-watcher"),
                            InstallerI18n.TrFormat(
                                "无法启动后台守护进程 obsidian-prism-watcher.exe: {0}",
                                "Failed to start background watcher obsidian-prism-watcher.exe: {0}",
                                watcherStartErr.Message
                            ),
                            watcherStartErr
                        );
                    }
                }

                currentStep = "verify-cdp";
                currentStepLabel = InstallerI18n.Tr("检测 Antigravity 实时注入状态", "Verify live Antigravity injection");
                currentTargetPath = "";
                report(90, InstallerI18n.Tr("正在检查 Antigravity Desktop 实时注入状态...", "Checking live Antigravity Desktop injection status..."));
                int? port = CdpHelper.ReadPort(opts.CdpPort);
                bool cdpReachable = false;
                string watchLogPath = Path.Combine(installDir, "watch.log");
                if (port.HasValue)
                {
                    List<CdpPageInfo> pages = null;
                    for (int attempt = 0; attempt < 15; attempt++)
                    {
                        try
                        {
                            pages = CdpHelper.ListPagesAsync(port.Value).GetAwaiter().GetResult();
                            cdpReachable = true;
                            string logContent = "";
                            if (File.Exists(watchLogPath))
                            {
                                using (FileStream fs = new FileStream(watchLogPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                                using (StreamReader sr = new StreamReader(fs, Encoding.UTF8))
                                {
                                    logContent = sr.ReadToEnd();
                                }
                            }
                            bool watcherInjected = logContent.IndexOf("[✓] 已注入 obsidian-prism:", StringComparison.Ordinal) >= 0 ||
                                                   logContent.IndexOf("[✓] Injected obsidian-prism:", StringComparison.Ordinal) >= 0 ||
                                                   (!string.IsNullOrEmpty(pluginDir) && CdpHelper.IsNativeDaemonAlive(pluginDir));
                            if (pages != null && pages.Count > 0 && watcherInjected)
                            {
                                bool allReady = true;
                                List<string> titles = new List<string>();
                                for (int p = 0; p < pages.Count; p++)
                                {
                                    titles.Add(RedactSensitiveUrl(CdpHelper.ShortTitle(pages[p])));
                                    using (CdpSession s = CdpSession.ConnectAsync(pages[p].WebSocketDebuggerUrl, 2000).GetAwaiter().GetResult())
                                    {
                                        object okVal = s.EvaluateAsync("Boolean(window.__agPrism || window.__agClaudeStyle)", false).GetAwaiter().GetResult();
                                        if (!(okVal is bool) || !((bool)okVal))
                                        {
                                            allReady = false;
                                        }
                                    }
                                }
                                if (allReady)
                                {
                                    result.InjectedPages = titles;
                                    break;
                                }
                            }
                        }
                        catch
                        {
                            pages = null;
                            if (!opts.CdpPort.HasValue && attempt >= 1)
                            {
                                if (!ag.IsRunning || CdpHelper.FindBareAntigravityMainProcess() != null)
                                {
                                    break;
                                }
                            }
                        }
                        Thread.Sleep(350);
                    }
                }
                result.CdpPort = cdpReachable ? port : null;

                result.Ok = true;
                if (result.InjectedPages.Count > 0)
                {
                    result.Headline = InstallerI18n.TrFormat(
                        "安装成功！已实时激活 {0} 个 Antigravity 窗口",
                        "Installed! Activated {0} Antigravity window(s)",
                        result.InjectedPages.Count
                    );
                    result.Detail = InstallerI18n.Tr(
                        "已部署本地插件与后台守护服务，并配置开机自启。后续打开新窗口或更新 Antigravity 后也会自动生效。",
                        "Local plugin, standby watcher & autostart are configured. New windows and future Antigravity updates will auto-apply."
                    );
                    for (int i = 0; i < result.InjectedPages.Count; i++)
                    {
                        report(98, InstallerI18n.TrFormat(
                            "已注入窗口: {0}",
                            "Injected window: {0}",
                            result.InjectedPages[i]
                        ));
                    }
                }
                else if (cdpReachable && port.HasValue)
                {
                    result.Headline = InstallerI18n.Tr(
                        "已安装本地插件并启动守护！等待 Antigravity 窗口就绪",
                        "Installed & watcher started! Waiting for window"
                    );
                    result.Detail = InstallerI18n.TrFormat(
                        "已部署本地插件并启动后台守护。检测到调试端口 {0}，窗口就绪后将自动完成激活。",
                        "Local plugin & watcher are running. Detected debug port {0}; activation will complete automatically once a window is ready.",
                        port.Value
                    );
                }
                else
                {
                    BareHostProcessInfo bareHost = !opts.CdpPort.HasValue ? CdpHelper.FindBareAntigravityMainProcess() : null;
                    if (bareHost != null)
                    {
                        result.BareHostDetected = true;
                        result.Headline = InstallerI18n.Tr(
                            "安装完成！重新打开一次 Antigravity 即可激活界面",
                            "Installed! Reopen Antigravity once to activate"
                        );
                        if (result.PatchedShortcuts == 0 && alreadySetShortcuts == 0 && skippedShortcuts > 0)
                        {
                            result.Detail = InstallerI18n.Tr(
                                "检测到 Antigravity 快捷方式位于系统受保护目录（需管理员权限写入）；核心插件已安装完毕，请以管理员身份运行安装器补齐快捷方式参数或手动追加 --remote-debugging-port=0 后重开 Antigravity。",
                                "Antigravity shortcuts are in a protected folder. Core plugin is installed; run as Administrator or append --remote-debugging-port=0, then reopen Antigravity."
                            );
                        }
                        else
                        {
                            result.Detail = InstallerI18n.Tr(
                                "检测到当前 Antigravity (v2.33.0+) 未开启本地光学桥接端口；桌面与开始菜单快捷方式已自动补齐 --remote-debugging-port=0，重新打开后将自动永久生效。",
                                "Running Antigravity (v2.33.0+) lacks the local CDP bridge. Shortcuts were updated with --remote-debugging-port=0; reopen Antigravity to activate."
                            );
                        }
                    }
                    else
                    {
                        result.Headline = InstallerI18n.Tr(
                            "安装成功！本地插件与后台守护已就绪",
                            "Installed! Local plugin & watcher are ready"
                        );
                        if (result.PatchedShortcuts == 0 && alreadySetShortcuts == 0 && skippedShortcuts > 0)
                        {
                            result.Detail = InstallerI18n.TrFormat(
                                "核心插件与守护已就绪；但有 {0} 个系统级快捷方式需要管理员权限才能写入 --remote-debugging-port=0，请以管理员身份运行一次或手动补充启动参数。",
                                "Core plugin & watcher are ready, but {0} system shortcut(s) need Administrator rights for --remote-debugging-port=0. Run as Administrator or add the flag manually.",
                                skippedShortcuts
                            );
                        }
                        else
                        {
                            result.Detail = InstallerI18n.Tr(
                                "当前未检测到运行中的 Antigravity Desktop；快捷方式与守护进程已就绪，打开 Antigravity Desktop 后会自动立即生效。",
                                "Antigravity Desktop is not currently running. Shortcuts and background watcher are ready and will take effect as soon as you launch it."
                            );
                        }
                    }
                }
                report(100, result.Headline);
                return result;
            }
            catch (InstallerStepException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InstallerStepException(
                    currentStep,
                    currentStepLabel,
                    currentTargetPath,
                    BuildFailureHint(ex, currentStep),
                    ex.Message,
                    ex
                );
            }
        }

        private const string FallbackSwarmI18nRemoveExpression =
            "(() => { try { window.__agPrismSwarmI18n && window.__agPrismSwarmI18n.destroy && window.__agPrismSwarmI18n.destroy(); } catch {} try { document.documentElement && document.documentElement.removeAttribute && document.documentElement.removeAttribute('data-ag-prism-swarm-i18n'); } catch {} try { delete window.__agPrismSwarmI18n; } catch {} try { delete globalThis.__agPrismSwarmI18n; } catch {} try { delete window.__agPrismSwarmI18nFactory; } catch {} try { delete globalThis.__agPrismSwarmI18nFactory; } catch {} return { ok: true, status: 'off' }; })()";

        private static readonly System.Text.RegularExpressions.Regex SensitiveUrlQueryRegex =
            new System.Text.RegularExpressions.Regex(
                @"([?&](?:token|auth|signature|key|secret)=)[^&\s#""']+",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled
            );

        private static readonly System.Text.RegularExpressions.Regex SwarmSidecarHostRegex =
            new System.Text.RegularExpressions.Regex(
                @"^swarm--swarm_board-\d+$",
                System.Text.RegularExpressions.RegexOptions.Compiled
            );

        private static string RedactSensitiveUrl(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return "";
            return SensitiveUrlQueryRegex.Replace(raw, "$1<REDACTED>");
        }

        private static bool IsSwarmSidecarUrl(string rawUrl)
        {
            if (string.IsNullOrWhiteSpace(rawUrl)) return false;
            try
            {
                Uri u = new Uri(rawUrl.Trim());
                if (!string.Equals(u.Scheme, "plugin", StringComparison.OrdinalIgnoreCase)) return false;
                if (!SwarmSidecarHostRegex.IsMatch(u.Host ?? "")) return false;
                if (!u.IsDefaultPort && u.Port >= 0) return false;
                if (!string.IsNullOrEmpty(u.UserInfo)) return false;
                if (!string.Equals(u.AbsolutePath, "/", StringComparison.Ordinal)) return false;
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static async Task<List<CdpPageInfo>> ListSwarmTargetsAsync(int port)
        {
            List<CdpPageInfo> res = new List<CdpPageInfo>();
            using (System.Net.Http.HttpClient http = new System.Net.Http.HttpClient())
            {
                http.Timeout = TimeSpan.FromMilliseconds(2000);
                string url = string.Format("http://127.0.0.1:{0}/json/list", port);
                string json = await http.GetStringAsync(url).ConfigureAwait(false);
                List<object> targets = MiniJson.ParseArray(json);
                if (targets == null) return res;
                for (int i = 0; i < targets.Count; i++)
                {
                    Dictionary<string, object> t = targets[i] as Dictionary<string, object>;
                    if (t == null) continue;
                    string type = t.ContainsKey("type") ? (t["type"] as string ?? "") : "";
                    string wsUrl = t.ContainsKey("webSocketDebuggerUrl") ? (t["webSocketDebuggerUrl"] as string ?? "") : "";
                    string pageUrl = t.ContainsKey("url") ? (t["url"] as string ?? "") : "";
                    string title = t.ContainsKey("title") ? (t["title"] as string ?? "") : "";
                    if ((string.Equals(type, "iframe", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(type, "page", StringComparison.OrdinalIgnoreCase)) &&
                        !string.IsNullOrEmpty(wsUrl) &&
                        IsSwarmSidecarUrl(pageUrl))
                    {
                        CdpPageInfo info = new CdpPageInfo();
                        info.Id = t.ContainsKey("id") ? (t["id"] as string ?? wsUrl) : wsUrl;
                        info.Title = RedactSensitiveUrl(string.IsNullOrEmpty(title) ? pageUrl : title);
                        info.Url = RedactSensitiveUrl(pageUrl);
                        info.WebSocketDebuggerUrl = wsUrl;
                        res.Add(info);
                    }
                }
            }
            return res;
        }

        public static OperationResult RunUninstall(InstallerOptions opts, Action<int, string> progress)
        {
            OperationResult result = new OperationResult();
            result.Mode = "uninstall";
            string installDir = NormalizeDirPath(string.IsNullOrEmpty(opts.InstallDir) ? GetDefaultInstallDir() : opts.InstallDir);
            string pluginDir = ResolveNativePluginDir(opts, installDir);
            if (IsDangerousRootPath(installDir))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "已拒绝在受保护的系统或用户根目录执行卸载: {0}",
                    "Refused to uninstall from protected system or user root directory: {0}",
                    installDir
                ));
            }
            if (!string.IsNullOrEmpty(pluginDir) && IsDangerousRootPath(pluginDir))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "已拒绝在受保护的系统或用户根目录执行插件目录卸载: {0}",
                    "Refused to uninstall plugin from protected system or user root directory: {0}",
                    pluginDir
                ));
            }
            result.InstallDir = installDir;
            result.PluginDir = pluginDir;

            Action<int, string> report = (pct, msg) =>
            {
                if (progress != null) progress(pct, msg);
            };

            report(15, InstallerI18n.Tr("正在停止后台守护进程...", "Stopping background watcher processes..."));
            StopWatcherInDir(installDir, (m) => report(25, m));
            StopNativeDaemonInDir(pluginDir, (m) => report(30, m));

            report(40, InstallerI18n.Tr("正在通过 CDP 清理运行中的 Antigravity Desktop 界面...", "Cleaning up injected UI in running Antigravity windows via CDP..."));
            int? port = CdpHelper.ReadPort(opts.CdpPort);
            result.CdpPort = port;
            string removeExpr = null;
            string swarmRemoveExpr = null;
            string manifestPath = Path.Combine(installDir, "manifest.json");
            if (File.Exists(manifestPath))
            {
                try { removeExpr = PluginManifest.Load(installDir).RemoveExpression; } catch { }
                try
                {
                    Dictionary<string, object> rawDisk = MiniJson.ParseObject(File.ReadAllText(manifestPath, Encoding.UTF8));
                    if (rawDisk != null && rawDisk.ContainsKey("swarmI18nRemoveExpression"))
                    {
                        swarmRemoveExpr = rawDisk["swarmI18nRemoveExpression"] as string;
                    }
                }
                catch { }
            }
            if (string.IsNullOrEmpty(removeExpr) || string.IsNullOrEmpty(swarmRemoveExpr))
            {
                try
                {
                    using (Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AGY_PAYLOAD.zip"))
                    using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                    {
                        ZipArchiveEntry entry = archive.GetEntry("manifest.json");
                        if (entry != null)
                        {
                            using (StreamReader sr = new StreamReader(entry.Open(), Encoding.UTF8))
                            {
                                Dictionary<string, object> raw = MiniJson.ParseObject(sr.ReadToEnd());
                                if (string.IsNullOrEmpty(removeExpr) && raw.ContainsKey("removeExpression"))
                                {
                                    removeExpr = raw["removeExpression"] as string;
                                }
                                if (string.IsNullOrEmpty(swarmRemoveExpr) && raw.ContainsKey("swarmI18nRemoveExpression"))
                                {
                                    swarmRemoveExpr = raw["swarmI18nRemoveExpression"] as string;
                                }
                            }
                        }
                    }
                }
                catch { }
            }
            if (string.IsNullOrEmpty(swarmRemoveExpr))
            {
                swarmRemoveExpr = FallbackSwarmI18nRemoveExpression;
            }

            if (port.HasValue && !string.IsNullOrEmpty(removeExpr))
            {
                try
                {
                    List<CdpPageInfo> pages = CdpHelper.ListPagesAsync(port.Value).GetAwaiter().GetResult();
                    for (int i = 0; i < pages.Count; i++)
                    {
                        try
                        {
                            using (CdpSession s = CdpSession.ConnectAsync(pages[i].WebSocketDebuggerUrl, 3000).GetAwaiter().GetResult())
                            {
                                s.EvaluateAsync(removeExpr, false).GetAwaiter().GetResult();
                                string title = RedactSensitiveUrl(CdpHelper.ShortTitle(pages[i]));
                                result.InjectedPages.Add(title);
                                report(55, InstallerI18n.TrFormat("已恢复原生界面: {0}", "Restored native UI: {0}", title));
                            }
                        }
                        catch { }
                    }
                }
                catch { }
            }
            if (port.HasValue && !string.IsNullOrEmpty(swarmRemoveExpr))
            {
                try
                {
                    List<CdpPageInfo> swarmTargets = ListSwarmTargetsAsync(port.Value).GetAwaiter().GetResult();
                    for (int i = 0; i < swarmTargets.Count; i++)
                    {
                        try
                        {
                            using (CdpSession s = CdpSession.ConnectAsync(swarmTargets[i].WebSocketDebuggerUrl, 2000).GetAwaiter().GetResult())
                            {
                                s.EvaluateAsync(swarmRemoveExpr, false).GetAwaiter().GetResult();
                                string title = RedactSensitiveUrl(CdpHelper.ShortTitle(swarmTargets[i]));
                                report(62, InstallerI18n.TrFormat("已恢复原生 Swarm 面板: {0}", "Restored native Swarm pane: {0}", title));
                            }
                        }
                        catch { }
                    }
                }
                catch { }
            }

            report(70, InstallerI18n.Tr("正在还原快捷方式并移除开机自启与卸载注册表项...", "Restoring shortcuts and removing autostart & uninstall registry entries..."));
            result.RestoredShortcuts = CdpHelper.RestoreAntigravityShortcutsOptIn(
                installDir,
                GetDefaultInstallDir(),
                !string.IsNullOrEmpty(pluginDir) ? pluginDir : installDir,
                (m) => report(72, m)
            );
            bool isDefaultInstall = string.Equals(
                NormalizeDirPath(installDir),
                NormalizeDirPath(GetDefaultInstallDir()),
                StringComparison.OrdinalIgnoreCase
            );
            try
            {
                string lnk = GetStartupShortcutPath();
                if (File.Exists(lnk))
                {
                    string lnkWork = ReadShortcutWorkingDir(lnk);
                    if (isDefaultInstall || (!string.IsNullOrEmpty(lnkWork) &&
                        string.Equals(NormalizeDirPath(lnkWork), NormalizeDirPath(installDir), StringComparison.OrdinalIgnoreCase)))
                    {
                        File.Delete(lnk);
                    }
                }
            }
            catch { }
            try
            {
                using (RegistryKey regKey = Registry.CurrentUser.OpenSubKey(UninstallRegSubKey))
                {
                    if (regKey != null)
                    {
                        string regLoc = regKey.GetValue("InstallLocation") as string;
                        if (isDefaultInstall || (!string.IsNullOrEmpty(regLoc) &&
                            string.Equals(NormalizeDirPath(regLoc), NormalizeDirPath(installDir), StringComparison.OrdinalIgnoreCase)))
                        {
                            regKey.Close();
                            Registry.CurrentUser.DeleteSubKeyTree(UninstallRegSubKey, false);
                        }
                    }
                }
            }
            catch { }

            if (!opts.PurgeData)
            {
                BackupUserConfigBeforeUninstall(installDir, pluginDir);
            }

            if (!string.IsNullOrEmpty(pluginDir))
            {
                CdpHelper.SyncHostPluginRegistry(pluginDir, false);
            }

            if (!string.IsNullOrEmpty(pluginDir) && Directory.Exists(pluginDir))
            {
                report(80, InstallerI18n.TrFormat("正在清理本地插件目录: {0}", "Removing local plugin directory: {0}", pluginDir));
                try { SafeDeleteDirectory(pluginDir); } catch { }
            }

            report(85, InstallerI18n.TrFormat("正在清理安装目录: {0}", "Removing install directory: {0}", installDir));
            string selfExe = Assembly.GetExecutingAssembly().Location;
            string installDirPrefix = NormalizeDirPath(installDir).TrimEnd('\\', '/').ToLowerInvariant() + "\\";
            bool runningInsideInstallDir = !string.IsNullOrEmpty(selfExe) &&
                Path.GetFullPath(selfExe).ToLowerInvariant().StartsWith(installDirPrefix, StringComparison.Ordinal);

            if (Directory.Exists(installDir))
            {
                if (!runningInsideInstallDir)
                {
                    try { SafeDeleteDirectory(installDir); } catch { }
                }
                else
                {
                    if (IsDangerousRootPath(installDir))
                    {
                        throw new InvalidOperationException(InstallerI18n.TrFormat(
                            "已拒绝清理受保护的系统或用户根目录: {0}",
                            "Refused to clean protected system or user root directory: {0}",
                            installDir
                        ));
                    }
                    CleanInstallDirKeepingSelfExe(installDir, Path.GetFullPath(selfExe));
                    result.SelfDeleteScheduled = true;
                }
            }

            if (opts.PurgeData)
            {
                report(92, InstallerI18n.Tr("正在清除插件配置与遥测缓存...", "Purging plugin configuration and telemetry cache..."));
                PurgeUserPluginData(pluginDir);
            }

            result.Ok = true;
            result.Headline = InstallerI18n.Tr(
                "已卸载并恢复 Antigravity Desktop 原生界面",
                "Uninstalled & restored native Antigravity UI"
            );
            result.Detail = result.InjectedPages.Count > 0
                ? InstallerI18n.TrFormat(
                    "已停止守护、移除自启，并立即还原了 {0} 个打开的窗口。",
                    "Stopped watcher, removed autostart, and immediately restored {0} open window(s).",
                    result.InjectedPages.Count
                )
                : InstallerI18n.Tr(
                    "已停止守护、移除开机自启并清理安装文件。",
                    "Stopped watcher, removed autostart, and cleaned up installation files."
                );
            report(100, result.Headline);
            return result;
        }

        private const uint MOVEFILE_DELAY_UNTIL_REBOOT = 0x00000004;
        private const string RemovedSelfTempPrefix = "obsidian-prism-removed-";
        private const string HiddenRemovedSelfTempPrefix = ".obsidian-prism-removed-";
        private const string PendingCleanupManifestName = "obsidian-prism-pending-cleanup.txt";

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool MoveFileExW(string lpExistingFileName, string lpNewFileName, uint dwFlags);

        private static bool IsSafeRemovedSelfTempFilePath(string filePath)
        {
            if (string.IsNullOrEmpty(filePath)) return false;
            try
            {
                string name = Path.GetFileName(filePath);
                if (string.IsNullOrEmpty(name) || name.Length > 128) return false;
                if (!name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)) return false;
                bool hasPrefix = name.StartsWith(RemovedSelfTempPrefix, StringComparison.OrdinalIgnoreCase) ||
                                 name.StartsWith(HiddenRemovedSelfTempPrefix, StringComparison.OrdinalIgnoreCase);
                if (!hasPrefix) return false;
                return !IsReparsePoint(filePath);
            }
            catch
            {
                return false;
            }
        }

        public static string ResolveSameVolumeMoveTarget(string selfExeFullPath, string safeInstallDir, string tempDir)
        {
            if (string.IsNullOrEmpty(selfExeFullPath) || string.IsNullOrEmpty(safeInstallDir)) return null;
            string selfRoot = Path.GetPathRoot(selfExeFullPath);
            if (string.IsNullOrEmpty(selfRoot)) return null;

            string token = Process.GetCurrentProcess().Id + "-" + Guid.NewGuid().ToString("N") + ".tmp";
            if (!string.IsNullOrEmpty(tempDir) && Directory.Exists(tempDir) && !IsReparsePoint(tempDir))
            {
                string tempRoot = Path.GetPathRoot(Path.GetFullPath(tempDir));
                if (!string.IsNullOrEmpty(tempRoot) &&
                    string.Equals(selfRoot, tempRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return Path.Combine(tempDir, RemovedSelfTempPrefix + token);
                }
            }

            // 跨盘符降级：移至同卷父目录隐藏临时文件，确保普通用户权限下也能立即同步删净安装目录
            string parentDir = Path.GetDirectoryName(safeInstallDir.TrimEnd('\\', '/'));
            if (!string.IsNullOrEmpty(parentDir) && Directory.Exists(parentDir) && !IsReparsePoint(parentDir))
            {
                string parentRoot = Path.GetPathRoot(Path.GetFullPath(parentDir));
                if (!string.IsNullOrEmpty(parentRoot) &&
                    string.Equals(selfRoot, parentRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return Path.Combine(parentDir, HiddenRemovedSelfTempPrefix + token);
                }
            }
            return null;
        }

        private static void RecordPendingRemovedSelfTempFile(string tempDir, string movedPath)
        {
            if (string.IsNullOrEmpty(tempDir) || string.IsNullOrEmpty(movedPath)) return;
            try
            {
                if (!Directory.Exists(tempDir) || IsReparsePoint(tempDir)) return;
                string manifestPath = Path.Combine(tempDir, PendingCleanupManifestName);
                if (IsReparsePoint(manifestPath)) return;
                File.AppendAllText(manifestPath, movedPath + "\n", new UTF8Encoding(false));
            }
            catch { }
        }

        private static void CleanupStaleRemovedSelfTempFiles()
        {
            try
            {
                string tempDir = Path.GetTempPath();
                if (string.IsNullOrEmpty(tempDir) || !Directory.Exists(tempDir) || IsReparsePoint(tempDir)) return;
                string[] staleFiles = Directory.GetFiles(tempDir, RemovedSelfTempPrefix + "*.tmp", SearchOption.TopDirectoryOnly);
                for (int i = 0; i < staleFiles.Length; i++)
                {
                    string fp = staleFiles[i];
                    if (!IsSafeRemovedSelfTempFilePath(fp)) continue;
                    try
                    {
                        CdpHelper.ClearReadOnlyAndHiddenAttributes(fp);
                        File.Delete(fp);
                    }
                    catch { }
                }

                string manifestPath = Path.Combine(tempDir, PendingCleanupManifestName);
                if (File.Exists(manifestPath) && !IsReparsePoint(manifestPath))
                {
                    string[] lines = File.ReadAllLines(manifestPath, Encoding.UTF8);
                    List<string> remaining = new List<string>();
                    for (int i = 0; i < lines.Length; i++)
                    {
                        string fp = (lines[i] ?? "").Trim();
                        if (fp.Length == 0 || !IsSafeRemovedSelfTempFilePath(fp)) continue;
                        if (!File.Exists(fp)) continue;
                        try
                        {
                            CdpHelper.ClearReadOnlyAndHiddenAttributes(fp);
                            File.Delete(fp);
                        }
                        catch
                        {
                            if (File.Exists(fp)) remaining.Add(fp);
                        }
                    }
                    if (remaining.Count == 0)
                    {
                        try { File.Delete(manifestPath); } catch { }
                    }
                    else
                    {
                        try { File.WriteAllLines(manifestPath, remaining.ToArray(), new UTF8Encoding(false)); } catch { }
                    }
                }
            }
            catch { }
        }

        public static void ScheduleSelfDeleteIfNeeded(string installDir)
        {
            string selfExe = Assembly.GetExecutingAssembly().Location;
            if (string.IsNullOrEmpty(selfExe) || !File.Exists(selfExe) || IsReparsePoint(selfExe)) return;
            string safeInstallDir = (!string.IsNullOrEmpty(installDir) && !IsDangerousRootPath(installDir))
                ? NormalizeDirPath(installDir)
                : string.Empty;
            if (string.IsNullOrEmpty(safeInstallDir) || IsReparsePoint(safeInstallDir)) return;

            string selfFull = Path.GetFullPath(selfExe);
            string installPrefix = safeInstallDir.TrimEnd('\\', '/') + "\\";
            if (!selfFull.StartsWith(installPrefix, StringComparison.OrdinalIgnoreCase)) return;

            // 纯原生无子进程清理：先切离安装目录并把运行中的自身同卷移至临时文件，再立即同步删空安装目录（零脚本宿主）
            string tempDir = Path.GetTempPath();
            try
            {
                if (!string.IsNullOrEmpty(tempDir) && Directory.Exists(tempDir))
                {
                    Environment.CurrentDirectory = tempDir;
                }
            }
            catch { }

            CleanupStaleRemovedSelfTempFiles();

            bool movedOut = false;
            bool movedOutsideTemp = false;
            string movedTemp = null;
            try
            {
                movedTemp = ResolveSameVolumeMoveTarget(selfFull, safeInstallDir, tempDir);
                if (!string.IsNullOrEmpty(movedTemp) && !File.Exists(movedTemp) && !IsReparsePoint(movedTemp))
                {
                    CdpHelper.ClearReadOnlyAndHiddenAttributes(selfFull);
                    File.Move(selfFull, movedTemp);
                    movedOut = true;
                    string movedDir = Path.GetDirectoryName(movedTemp) ?? "";
                    movedOutsideTemp = string.IsNullOrEmpty(tempDir) ||
                        !string.Equals(
                            NormalizeDirPath(movedDir),
                            NormalizeDirPath(tempDir),
                            StringComparison.OrdinalIgnoreCase
                        );
                    if (movedOutsideTemp)
                    {
                        try
                        {
                            File.SetAttributes(movedTemp, FileAttributes.Hidden | FileAttributes.Temporary);
                        }
                        catch { }
                        RecordPendingRemovedSelfTempFile(tempDir, movedTemp);
                    }
                }
            }
            catch { }

            if (movedOut)
            {
                try
                {
                    SafeDeleteDirectory(safeInstallDir);
                }
                catch { }
                try
                {
                    if (!string.IsNullOrEmpty(movedTemp) && File.Exists(movedTemp))
                    {
                        MoveFileExW(movedTemp, null, MOVEFILE_DELAY_UNTIL_REBOOT);
                    }
                }
                catch { }
                return;
            }

            // 极端只读跨卷兜底：标记系统重启清理，绝不派生脚本或命令行子进程
            try
            {
                MoveFileExW(selfFull, null, MOVEFILE_DELAY_UNTIL_REBOOT);
                MoveFileExW(safeInstallDir, null, MOVEFILE_DELAY_UNTIL_REBOOT);
            }
            catch { }
        }
    }

    internal class InstallerForm : Form
    {
        private readonly InstallerOptions _opts;
        private readonly Label _titleLabel;
        private readonly Label _subtitleLabel;
        private readonly Label _statusHeadline;
        private readonly Label _statusDetail;
        private readonly Label _metaLabel;
        private readonly ProgressBar _progressBar;
        private readonly TextBox _logBox;
        private readonly Button _uninstallBtn;
        private readonly Button _openDirBtn;
        private readonly Button _installBtn;
        private readonly Button _launchAgBtn;
        private readonly Button _closeBtn;

        private string _activeInstallDir;
        private string _activePluginDir;
        private string _antigravityExe;
        private bool _selfDeleteOnClose;
        private bool _busy;

        public InstallerForm(InstallerOptions opts)
        {
            _opts = opts;
            _activeInstallDir = InstallerCore.NormalizeDirPath(string.IsNullOrEmpty(opts.InstallDir) ? InstallerCore.GetDefaultInstallDir() : opts.InstallDir);
            _activePluginDir = InstallerCore.ResolveNativePluginDir(opts, _activeInstallDir);
            string uiFontFamily = InstallerI18n.IsZhUi ? "Microsoft YaHei UI" : "Segoe UI";

            SuspendLayout();

            Text = InstallerI18n.Tr("Obsidian Prism · 黑曜棱镜 安装与配置工具", "Obsidian Prism Installer");
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            Font = new Font(uiFontFamily, 9.5f, FontStyle.Regular);
            ClientSize = new Size(588, 464);
            BackColor = Color.FromArgb(244, 247, 251);
            try { Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location); } catch { }

            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 80;
            header.BackColor = Color.FromArgb(14, 17, 25);
            header.Padding = new Padding(20, 14, 20, 12);

            _titleLabel = new Label();
            _titleLabel.UseMnemonic = false;
            _titleLabel.Text = InstallerI18n.Tr("Obsidian Prism · 黑曜棱镜安装器", "Obsidian Prism Installer");
            _titleLabel.ForeColor = Color.FromArgb(248, 250, 252);
            _titleLabel.Font = new Font(uiFontFamily, 13.5f, FontStyle.Bold);
            _titleLabel.AutoSize = true;
            _titleLabel.Location = new Point(20, 14);

            _subtitleLabel = new Label();
            _subtitleLabel.UseMnemonic = false;
            _subtitleLabel.Text = InstallerI18n.Tr(
                "Antigravity 主题外观、动效调节、上下文监控与思考翻译套件",
                "Theme, motion, context telemetry & thought translation suite for Antigravity"
            );
            _subtitleLabel.ForeColor = Color.FromArgb(96, 165, 250);
            _subtitleLabel.Font = new Font(uiFontFamily, 9f, FontStyle.Regular);
            _subtitleLabel.AutoSize = true;
            _subtitleLabel.Location = new Point(21, 46);

            header.Controls.Add(_titleLabel);
            header.Controls.Add(_subtitleLabel);
            Controls.Add(header);

            Panel card = new Panel();
            card.Location = new Point(20, 96);
            card.Size = new Size(548, 118);
            card.BackColor = Color.White;
            card.BorderStyle = BorderStyle.FixedSingle;

            _statusHeadline = new Label();
            _statusHeadline.UseMnemonic = false;
            _statusHeadline.Text = opts.Uninstall
                ? InstallerI18n.Tr("准备卸载并恢复原版界面...", "Preparing to uninstall & restore native UI...")
                : InstallerI18n.Tr("正在检测本地 Antigravity 环境...", "Detecting local Antigravity environment...");
            _statusHeadline.ForeColor = Color.FromArgb(28, 25, 23);
            _statusHeadline.Font = new Font(uiFontFamily, 11f, FontStyle.Bold);
            _statusHeadline.Location = new Point(14, 12);
            _statusHeadline.Size = new Size(520, 26);

            _statusDetail = new Label();
            _statusDetail.UseMnemonic = false;
            _statusDetail.Text = opts.Uninstall
                ? InstallerI18n.Tr(
                    "请确认是否卸载 Obsidian Prism、停止后台守护并恢复原生界面。",
                    "Confirm to uninstall Obsidian Prism, stop background watchers, and restore the native UI."
                )
                : InstallerI18n.Tr(
                    "正在只读检测 Antigravity Desktop 与安装状态，等待你确认后再开始安装...",
                    "Running read-only check on Antigravity Desktop and install state. Waiting for your confirmation..."
                );
            _statusDetail.ForeColor = Color.FromArgb(87, 83, 78);
            _statusDetail.Location = new Point(14, 42);
            _statusDetail.Size = new Size(520, 44);

            _metaLabel = new Label();
            _metaLabel.UseMnemonic = false;
            _metaLabel.Text = InstallerI18n.Tr("插件目录: ", "Plugin dir: ") + _activePluginDir;
            _metaLabel.ForeColor = Color.FromArgb(120, 113, 108);
            _metaLabel.Font = new Font(uiFontFamily, 8.2f, FontStyle.Regular);
            _metaLabel.Location = new Point(14, 90);
            _metaLabel.Size = new Size(520, 20);
            _metaLabel.AutoEllipsis = true;

            card.Controls.Add(_statusHeadline);
            card.Controls.Add(_statusDetail);
            card.Controls.Add(_metaLabel);
            Controls.Add(card);

            _progressBar = new ProgressBar();
            _progressBar.Location = new Point(20, 224);
            _progressBar.Size = new Size(548, 14);
            _progressBar.Minimum = 0;
            _progressBar.Maximum = 100;
            _progressBar.Value = 0;
            Controls.Add(_progressBar);

            _logBox = new TextBox();
            _logBox.Location = new Point(20, 248);
            _logBox.Size = new Size(548, 148);
            _logBox.Multiline = true;
            _logBox.ReadOnly = true;
            _logBox.ScrollBars = ScrollBars.Vertical;
            _logBox.BackColor = Color.FromArgb(252, 251, 249);
            _logBox.ForeColor = Color.FromArgb(41, 37, 36);
            _logBox.Font = new Font("Consolas", 8.8f, FontStyle.Regular);
            Controls.Add(_logBox);

            _uninstallBtn = new Button();
            _uninstallBtn.UseMnemonic = false;
            _uninstallBtn.Text = InstallerI18n.Tr("卸载并恢复原版", "Uninstall & Reset");
            _uninstallBtn.Location = new Point(20, 412);
            _uninstallBtn.Size = new Size(136, 34);
            _uninstallBtn.Enabled = false;
            _uninstallBtn.FlatStyle = FlatStyle.System;
            _uninstallBtn.Click += async (s, e) => await HandleUninstallClickAsync();

            _openDirBtn = new Button();
            _openDirBtn.UseMnemonic = false;
            _openDirBtn.Text = InstallerI18n.Tr("打开配置目录", "Open Config Dir");
            _openDirBtn.Location = new Point(164, 412);
            _openDirBtn.Size = new Size(122, 34);
            _openDirBtn.Enabled = false;
            _openDirBtn.FlatStyle = FlatStyle.System;
            _openDirBtn.Click += (s, e) =>
            {
                try
                {
                    string targetDir = (!string.IsNullOrEmpty(_activePluginDir) && Directory.Exists(_activePluginDir))
                        ? _activePluginDir
                        : _activeInstallDir;
                    if (!string.IsNullOrEmpty(targetDir) && Directory.Exists(targetDir)) Process.Start("explorer.exe", targetDir);
                }
                catch { }
            };

            _installBtn = new Button();
            _installBtn.UseMnemonic = false;
            _installBtn.Text = InstallerI18n.Tr("立即安装", "Install Now");
            _installBtn.Location = new Point(306, 412);
            _installBtn.Size = new Size(144, 34);
            _installBtn.Visible = !opts.Uninstall;
            _installBtn.Enabled = false;
            _installBtn.FlatStyle = FlatStyle.Flat;
            _installBtn.FlatAppearance.BorderSize = 0;
            _installBtn.Font = new Font(uiFontFamily, 9.5f, FontStyle.Bold);
            _installBtn.Cursor = Cursors.Hand;
            _installBtn.Click += async (s, e) => await ExecuteInstallAsync();

            _launchAgBtn = new Button();
            _launchAgBtn.UseMnemonic = false;
            _launchAgBtn.Text = InstallerI18n.Tr("启动 Antigravity", "Launch Antigravity");
            _launchAgBtn.Location = new Point(306, 412);
            _launchAgBtn.Size = new Size(144, 34);
            _launchAgBtn.Visible = false;
            _launchAgBtn.FlatStyle = FlatStyle.System;
            _launchAgBtn.Click += (s, e) =>
            {
                try
                {
                    if (!string.IsNullOrEmpty(_antigravityExe) && File.Exists(_antigravityExe))
                    {
                        ProcessStartInfo lpsi = new ProcessStartInfo(_antigravityExe, CdpHelper.CdpOptInFlag);
                        lpsi.UseShellExecute = false;
                        Process.Start(lpsi);
                    }
                }
                catch { }
            };

            _closeBtn = new Button();
            _closeBtn.UseMnemonic = false;
            _closeBtn.Text = InstallerI18n.Tr("取消", "Cancel");
            _closeBtn.Location = new Point(458, 412);
            _closeBtn.Size = new Size(110, 34);
            _closeBtn.Enabled = true;
            _closeBtn.FlatStyle = FlatStyle.System;
            _closeBtn.Click += (s, e) => Close();

            Controls.Add(_uninstallBtn);
            Controls.Add(_openDirBtn);
            Controls.Add(_installBtn);
            Controls.Add(_launchAgBtn);
            Controls.Add(_closeBtn);
            CancelButton = _closeBtn;
            UpdateInstallButtonStyle();

            // Coordinates above are designed at 96 DPI; set AutoScaleDimensions + Dpi mode
            // so PerMonitorV2 scales the form and child controls proportionally on high-DPI displays.
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            ResumeLayout(false);
            PerformLayout();

            Shown += async (s, e) => await StartInitialActionAsync();
            FormClosing += (s, e) =>
            {
                if (_busy)
                {
                    e.Cancel = true;
                    return;
                }
                if (_selfDeleteOnClose)
                {
                    InstallerCore.ScheduleSelfDeleteIfNeeded(_activeInstallDir);
                }
            };
        }

        private void UpdateInstallButtonStyle()
        {
            if (_installBtn.Enabled)
            {
                _installBtn.BackColor = Color.FromArgb(37, 99, 235);
                _installBtn.ForeColor = Color.White;
            }
            else
            {
                _installBtn.BackColor = Color.FromArgb(203, 213, 225);
                _installBtn.ForeColor = Color.FromArgb(100, 116, 139);
            }
        }

        private void AppendLog(string msg)
        {
            if (IsDisposed || Disposing) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(new Action<string>(AppendLog), msg); } catch { }
                return;
            }
            _logBox.AppendText(string.Format("[{0}] {1}\r\n", DateTime.Now.ToString("HH:mm:ss"), msg));
        }

        private void UpdateProgress(int pct, string msg)
        {
            if (IsDisposed || Disposing) return;
            if (InvokeRequired)
            {
                try { BeginInvoke(new Action<int, string>(UpdateProgress), pct, msg); } catch { }
                return;
            }
            _progressBar.Value = Math.Max(0, Math.Min(100, pct));
            AppendLog(msg);
        }

        private async Task StartInitialActionAsync()
        {
            if (_opts.Uninstall)
            {
                DialogResult dr = MessageBox.Show(
                    this,
                    InstallerI18n.Tr(
                        "确认要卸载 Obsidian Prism 并恢复 Antigravity Desktop 原生界面吗？",
                        "Are you sure you want to uninstall Obsidian Prism and restore the native Antigravity Desktop UI?"
                    ),
                    InstallerI18n.Tr("卸载确认", "Confirm Uninstall"),
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (dr != DialogResult.Yes)
                {
                    Close();
                    return;
                }
                await ExecuteUninstallAsync();
            }
            else
            {
                await PrepareInstallChoiceAsync();
            }
        }

        private async Task PrepareInstallChoiceAsync()
        {
            SetButtonsEnabled(false);
            _closeBtn.Enabled = true;
            try
            {
                string installDir = _activeInstallDir;
                string pluginDir = _activePluginDir;
                AntigravityDetectResult ag = null;
                bool alreadyInstalled = false;
                bool hasDir = false;
                int? port = null;

                await Task.Run(() =>
                {
                    ag = InstallerCore.DetectAntigravityDesktop();
                    bool hasNative = !string.IsNullOrEmpty(pluginDir) && File.Exists(Path.Combine(pluginDir, "plugin.json"));
                    bool hasWatcher = Directory.Exists(installDir) && File.Exists(Path.Combine(installDir, "obsidian-prism-watcher.exe"));
                    alreadyInstalled = hasNative || hasWatcher;
                    hasDir = (!string.IsNullOrEmpty(pluginDir) && Directory.Exists(pluginDir)) || Directory.Exists(installDir);
                    port = CdpHelper.ReadPort(_opts.CdpPort);
                });

                if (IsDisposed || Disposing) return;

                _antigravityExe = ag != null ? ag.ExePath : null;
                if (alreadyInstalled)
                {
                    _statusHeadline.Text = InstallerI18n.Tr(
                        "已检测到本地 Obsidian Prism · 请选择操作",
                        "Obsidian Prism Detected · Choose an Action"
                    );
                    _statusHeadline.ForeColor = Color.FromArgb(28, 25, 23);
                    _statusDetail.Text = InstallerI18n.Tr(
                        "点击「重新安装 / 升级」可覆盖更新插件并保留现有配置；点击「卸载并恢复原版」可彻底卸载并还原原生界面。",
                        "Click 'Reinstall / Update' to update while preserving settings, or 'Uninstall & Reset' to restore the native UI."
                    );
                    _installBtn.Text = InstallerI18n.Tr("重新安装 / 升级", "Reinstall / Update");
                }
                else
                {
                    _statusHeadline.Text = InstallerI18n.Tr(
                        "是否安装 Obsidian Prism · 黑曜棱镜？",
                        "Install Obsidian Prism?"
                    );
                    _statusHeadline.ForeColor = Color.FromArgb(28, 25, 23);
                    _statusDetail.Text = InstallerI18n.Tr(
                        "将部署本地插件、后台热备守护与开机自启（不修改 Antigravity 核心程序文件）。请点击「立即安装」开始，或点击「取消」退出。",
                        "Deploys the local plugin, standby watcher & autostart without modifying Antigravity binaries. Click 'Install Now' to proceed."
                    );
                    _installBtn.Text = InstallerI18n.Tr("立即安装", "Install Now");
                }

                string agSummary;
                if (ag != null && !string.IsNullOrEmpty(ag.ExePath))
                {
                    string ver = !string.IsNullOrEmpty(ag.Version)
                        ? "v" + ag.Version
                        : InstallerI18n.Tr("已检测到", "Detected");
                    string runState = ag.IsRunning
                        ? (port.HasValue
                            ? InstallerI18n.TrFormat("运行中 · 端口 {0}", "Running · Port {0}", port.Value)
                            : InstallerI18n.Tr("运行中", "Running"))
                        : InstallerI18n.Tr("未运行", "Not running");
                    agSummary = "Antigravity: " + ver + " (" + runState + ")";
                }
                else
                {
                    agSummary = InstallerI18n.Tr(
                        "未检测到运行中的 Antigravity（支持预先安装）",
                        "Antigravity not detected (pre-install supported)"
                    );
                }
                _metaLabel.Text = agSummary + " | " + pluginDir;

                AppendLog(InstallerI18n.Tr(
                    "环境只读预检完成，当前未对本机做任何修改，等待你确认操作。",
                    "Read-only environment check complete. No changes made yet; waiting for confirmation."
                ));
                AppendLog(InstallerI18n.Tr("原生插件目录: ", "Native plugin dir: ") + pluginDir);
                AppendLog(InstallerI18n.Tr("后台守护目录: ", "Watcher dir: ") + installDir);
                if (ag != null && !string.IsNullOrEmpty(ag.ExePath))
                {
                    AppendLog(InstallerI18n.Tr("检测到 Antigravity Desktop: ", "Detected Antigravity Desktop: ") + ag.ExePath);
                }

                _progressBar.Value = 0;
                _launchAgBtn.Visible = false;
                _installBtn.Visible = true;
                _installBtn.Enabled = true;
                _uninstallBtn.Enabled = alreadyInstalled;
                _openDirBtn.Enabled = hasDir;
                _closeBtn.Text = InstallerI18n.Tr("取消", "Cancel");
                _closeBtn.Enabled = true;
                AcceptButton = _installBtn;
                UpdateInstallButtonStyle();
            }
            catch (Exception ex)
            {
                if (IsDisposed || Disposing) return;
                _statusHeadline.Text = InstallerI18n.Tr("准备安装 Obsidian Prism", "Ready to Install Obsidian Prism");
                _statusDetail.Text = InstallerI18n.TrFormat(
                    "环境预检遇到提示：{0}。你仍可点击「立即安装」继续或点击「取消」退出。",
                    "Pre-check notice: {0}. You can still click 'Install Now' to continue or 'Cancel' to exit.",
                    ex.Message
                );
                AppendLog(InstallerI18n.Tr("[!] 预检提示: ", "[!] Pre-check notice: ") + ex.Message);
                _installBtn.Visible = true;
                _installBtn.Text = InstallerI18n.Tr("立即安装", "Install Now");
                _installBtn.Enabled = true;
                _closeBtn.Text = InstallerI18n.Tr("取消", "Cancel");
                _closeBtn.Enabled = true;
                AcceptButton = _installBtn;
                UpdateInstallButtonStyle();
            }
        }

        private async Task ExecuteInstallAsync()
        {
            if (_busy) return;
            _busy = true;
            _statusHeadline.Text = InstallerI18n.Tr(
                "正在安装并配置本机 Antigravity Desktop...",
                "Installing & configuring Antigravity Desktop..."
            );
            _statusHeadline.ForeColor = Color.FromArgb(28, 25, 23);
            _statusDetail.Text = InstallerI18n.Tr(
                "正在部署本地插件与后台守护服务，请稍候...",
                "Deploying local plugin and standby background watcher, please wait..."
            );
            _progressBar.Value = 5;
            SetButtonsEnabled(false);
            try
            {
                OperationResult res = await Task.Run(() => InstallerCore.RunInstall(_opts, UpdateProgress));
                _activeInstallDir = res.InstallDir;
                if (!string.IsNullOrEmpty(res.PluginDir)) _activePluginDir = res.PluginDir;
                _antigravityExe = res.AntigravityExe;
                _statusHeadline.Text = res.Headline;
                _statusHeadline.ForeColor = Color.FromArgb(21, 128, 61);
                _statusDetail.Text = res.Detail;
                _metaLabel.Text = InstallerI18n.Tr("配置: ", "Config: ") + res.ConfigSummary;
                _openDirBtn.Enabled = (!string.IsNullOrEmpty(_activePluginDir) && Directory.Exists(_activePluginDir)) || Directory.Exists(_activeInstallDir);
                _uninstallBtn.Enabled = true;
                bool showLaunch = (!string.IsNullOrEmpty(_antigravityExe) && res.InjectedPages.Count == 0 && !res.BareHostDetected);
                _launchAgBtn.Visible = showLaunch;
                _launchAgBtn.Enabled = showLaunch;
                _installBtn.Visible = !showLaunch;
                if (!showLaunch)
                {
                    _installBtn.Text = InstallerI18n.Tr("重新安装", "Reinstall");
                    _installBtn.Enabled = true;
                }
                _closeBtn.Text = InstallerI18n.Tr("完成并关闭", "Done & Close");
                AcceptButton = _closeBtn;

                if (res.BareHostDetected &&
                    !_opts.Silent &&
                    !_opts.NoRelaunchPrompt &&
                    Environment.GetEnvironmentVariable("PRISM_NO_RELAUNCH_PROMPT") != "1" &&
                    Environment.GetEnvironmentVariable("AG_PRISM_NO_RELAUNCH_PROMPT") != "1")
                {
                    BareHostProcessInfo bareHost = CdpHelper.FindBareAntigravityMainProcess();
                    if (bareHost != null)
                    {
                        DialogResult relaunchDr = MessageBox.Show(
                            this,
                            InstallerI18n.Tr(
                                "检测到正在运行的 Antigravity 未开启本地光学桥接端口（v2.33.0+ 默认关闭）。\r\n" +
                                "桌面与开始菜单快捷方式已自动补齐 --remote-debugging-port=0。\r\n\r\n" +
                                "是否立即重新打开 Antigravity 使黑曜棱镜（Obsidian Prism）界面当场生效？",
                                "Running Antigravity does not have the local optical bridge enabled (disabled by default in v2.33.0+).\r\n" +
                                "Desktop and Start Menu shortcuts have been updated with --remote-debugging-port=0.\r\n\r\n" +
                                "Reopen Antigravity now to activate Obsidian Prism immediately?"
                            ),
                            InstallerI18n.Tr("立即激活 Obsidian Prism", "Activate Obsidian Prism Now"),
                            MessageBoxButtons.YesNo,
                            MessageBoxIcon.Question
                        );
                        CdpHelper.RecordPromptedForHost(
                            bareHost.Pid,
                            bareHost.StartTimeMs,
                            relaunchDr == DialogResult.Yes ? "yes" : "no",
                            res.InstallDir,
                            res.PluginDir
                        );
                        if (relaunchDr == DialogResult.Yes)
                        {
                            _statusHeadline.Text = InstallerI18n.Tr(
                                "正在带参重新打开 Antigravity 并激活界面...",
                                "Relaunching Antigravity with CDP enabled..."
                            );
                            AppendLog(InstallerI18n.Tr(
                                "正在等待旧实例释放锁并带 --remote-debugging-port=0 重新打开 Antigravity...",
                                "Waiting for previous instance to release lock and relaunching Antigravity with --remote-debugging-port=0..."
                            ));
                            bool relaunched = await Task.Run(() =>
                            {
                                bool ok = CdpHelper.RelaunchAntigravityWithCdp(bareHost, 15000, AppendLog);
                                if (!ok) return false;
                                for (int w = 0; w < 24; w++)
                                {
                                    int? newPort = CdpHelper.ReadPort(null);
                                    if (newPort.HasValue)
                                    {
                                        if (!_opts.NoNativeDaemon && res.NativePluginDeployed)
                                        {
                                            CdpHelper.EnsureNativeDaemonRunning(res.PluginDir, newPort, res.AntigravityExe, AppendLog);
                                        }
                                        return true;
                                    }
                                    Thread.Sleep(350);
                                }
                                return true;
                            });
                            if (relaunched)
                            {
                                _statusHeadline.Text = InstallerI18n.Tr(
                                    "安装成功！已带参重开并激活 Antigravity 界面",
                                    "Installed! Antigravity relaunched & activated"
                                );
                                _statusDetail.Text = InstallerI18n.Tr(
                                    "已自动为快捷方式补齐 --remote-debugging-port=0 并激活本地插件与后台守护服务，后续日常启动将自动生效。",
                                    "Shortcuts were updated with --remote-debugging-port=0 and the local plugin & background daemon are active for future launches."
                                );
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                InstallerStepException stepEx = ex as InstallerStepException;
                string stepTitle = stepEx != null
                    ? InstallerI18n.TrFormat("安装失败 · {0}", "Installation failed · {0}", stepEx.StepLabel)
                    : InstallerI18n.Tr("安装失败", "Installation failed");
                string hint = stepEx != null && !string.IsNullOrEmpty(stepEx.Hint)
                    ? stepEx.Hint
                    : InstallerCore.BuildFailureHint(ex, stepEx != null ? stepEx.StepCode : "");
                _statusHeadline.Text = stepTitle;
                _statusHeadline.ForeColor = Color.FromArgb(185, 28, 28);
                _statusDetail.Text = string.IsNullOrEmpty(hint) ? ex.Message : (ex.Message + " — " + hint);
                AppendLog(InstallerI18n.Tr("[✗] 错误诊断:\r\n", "[✗] Failure diagnostics:\r\n") + InstallerCore.FormatFailureLogBlock(ex));
                _launchAgBtn.Visible = false;
                _installBtn.Visible = true;
                _installBtn.Text = InstallerI18n.Tr("重试安装", "Retry Install");
                _installBtn.Enabled = true;
                _closeBtn.Text = InstallerI18n.Tr("关闭", "Close");
                AcceptButton = _installBtn;
            }
            finally
            {
                _busy = false;
                _closeBtn.Enabled = true;
                UpdateInstallButtonStyle();
            }
        }

        private async Task HandleUninstallClickAsync()
        {
            DialogResult dr = MessageBox.Show(
                this,
                InstallerI18n.Tr(
                    "确认卸载 Obsidian Prism、停止后台守护并立即恢复 Antigravity 原生界面？",
                    "Confirm uninstalling Obsidian Prism, stopping background watchers, and restoring the native Antigravity UI?"
                ),
                InstallerI18n.Tr("卸载并恢复原版", "Uninstall & Reset"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question
            );
            if (dr != DialogResult.Yes) return;
            await ExecuteUninstallAsync();
        }

        private async Task ExecuteUninstallAsync()
        {
            if (_busy) return;
            _busy = true;
            _statusHeadline.Text = InstallerI18n.Tr(
                "正在卸载 Obsidian Prism 并恢复原版界面...",
                "Uninstalling Obsidian Prism & restoring UI..."
            );
            _statusHeadline.ForeColor = Color.FromArgb(28, 25, 23);
            _statusDetail.Text = InstallerI18n.Tr(
                "正在停止后台守护、还原快捷方式并清理插件文件，请稍候...",
                "Stopping background watchers, restoring shortcuts, and removing plugin files, please wait..."
            );
            _progressBar.Value = 5;
            SetButtonsEnabled(false);
            try
            {
                OperationResult res = await Task.Run(() => InstallerCore.RunUninstall(_opts, UpdateProgress));
                _selfDeleteOnClose = res.SelfDeleteScheduled;
                _statusHeadline.Text = res.Headline;
                _statusHeadline.ForeColor = Color.FromArgb(3, 105, 161);
                _statusDetail.Text = res.Detail;
                _metaLabel.Text = InstallerI18n.Tr("已清理目录: ", "Cleaned dir: ") + res.InstallDir;
                _openDirBtn.Enabled = false;
                _uninstallBtn.Enabled = false;
                _launchAgBtn.Visible = false;
                if (!_selfDeleteOnClose)
                {
                    _installBtn.Visible = true;
                    _installBtn.Text = InstallerI18n.Tr("重新安装", "Reinstall");
                    _installBtn.Enabled = true;
                }
                else
                {
                    _installBtn.Visible = false;
                    _installBtn.Enabled = false;
                }
                _closeBtn.Text = InstallerI18n.Tr("完成并关闭", "Done & Close");
                AcceptButton = _closeBtn;
            }
            catch (Exception ex)
            {
                _statusHeadline.Text = InstallerI18n.Tr("卸载失败", "Uninstall failed");
                _statusHeadline.ForeColor = Color.FromArgb(185, 28, 28);
                _statusDetail.Text = ex.Message;
                AppendLog(InstallerI18n.Tr("[✗] 错误: ", "[✗] Error: ") + ex);
                _closeBtn.Text = InstallerI18n.Tr("关闭", "Close");
            }
            finally
            {
                _busy = false;
                _closeBtn.Enabled = true;
                UpdateInstallButtonStyle();
            }
        }

        private void SetButtonsEnabled(bool enabled)
        {
            _uninstallBtn.Enabled = enabled;
            _openDirBtn.Enabled = enabled;
            _installBtn.Enabled = enabled;
            _launchAgBtn.Enabled = enabled;
            _closeBtn.Enabled = enabled;
            UpdateInstallButtonStyle();
        }
    }

    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static int Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }

            InstallerOptions opts = ParseArgs(args);
            if (!string.IsNullOrEmpty(opts.Lang))
            {
                InstallerI18n.SetPreferredLang(opts.Lang);
            }

            if (opts.ShowHelp)
            {
                string helpText = InstallerCore.BuildHelpText();
                if (!string.IsNullOrEmpty(opts.OutFile))
                {
                    File.WriteAllText(opts.OutFile, helpText, new UTF8Encoding(false));
                }
                else
                {
                    try { Console.WriteLine(helpText); } catch { }
                }
                if (opts.Popup)
                {
                    MessageBox.Show(
                        helpText,
                        InstallerI18n.Tr("Obsidian Prism 安装器帮助", "Obsidian Prism Installer Help"),
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                return 0;
            }

            if (opts.StatusOnly)
            {
                string dir = InstallerCore.NormalizeDirPath(string.IsNullOrEmpty(opts.InstallDir) ? InstallerCore.GetDefaultInstallDir() : opts.InstallDir);
                string pluginDir = InstallerCore.ResolveNativePluginDir(opts, dir);
                AntigravityDetectResult ag = InstallerCore.DetectAntigravityDesktop();
                int? port = CdpHelper.ReadPort(opts.CdpPort);
                Dictionary<string, object> st = new Dictionary<string, object>(StringComparer.Ordinal);
                st["installed"] = Directory.Exists(dir) && File.Exists(Path.Combine(dir, "obsidian-prism-watcher.exe"));
                st["installDir"] = dir;
                st["pluginDir"] = pluginDir;
                st["nativePluginInstalled"] = !string.IsNullOrEmpty(pluginDir) && File.Exists(Path.Combine(pluginDir, "plugin.json"));
                st["nativeDaemonAlive"] = !string.IsNullOrEmpty(pluginDir) && CdpHelper.IsNativeDaemonAlive(pluginDir);
                st["startupShortcut"] = File.Exists(InstallerCore.GetStartupShortcutPath());
                st["antigravityExe"] = ag.ExePath;
                st["antigravityVersion"] = ag.Version;
                st["antigravityRunning"] = ag.IsRunning;
                st["cdpPort"] = port.HasValue ? (object)port.Value : null;
                st["uiLang"] = InstallerI18n.EffectiveLang;
                string json = MiniJson.Stringify(st, true);
                if (!string.IsNullOrEmpty(opts.OutFile)) File.WriteAllText(opts.OutFile, json, new UTF8Encoding(false));
                else Console.WriteLine(json);
                return 0;
            }

            if (opts.Silent)
            {
                try
                {
                    OperationResult res = opts.Uninstall
                        ? InstallerCore.RunUninstall(opts, null)
                        : InstallerCore.RunInstall(opts, null);
                    WriteOutFile(opts.OutFile, res);
                    if (opts.Popup)
                    {
                        MessageBox.Show(res.Detail, res.Headline, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    if (res.SelfDeleteScheduled)
                    {
                        InstallerCore.ScheduleSelfDeleteIfNeeded(res.InstallDir);
                    }
                    return res.Ok ? 0 : 1;
                }
                catch (Exception ex)
                {
                    InstallerStepException stepEx = ex as InstallerStepException;
                    Exception rootEx = (stepEx != null && stepEx.InnerException != null) ? stepEx.InnerException : ex;
                    string diagText = InstallerCore.FormatFailureLogBlock(ex);
                    if (!string.IsNullOrEmpty(opts.OutFile))
                    {
                        Dictionary<string, object> err = new Dictionary<string, object>(StringComparer.Ordinal);
                        err["ok"] = false;
                        err["error"] = rootEx.Message;
                        err["errorType"] = rootEx.GetType().FullName;
                        err["failedStep"] = stepEx != null ? stepEx.StepCode : "unknown";
                        err["failedStepLabel"] = stepEx != null ? stepEx.StepLabel : InstallerI18n.Tr("安装操作", "Installation");
                        err["failedPath"] = stepEx != null ? stepEx.TargetPath : "";
                        err["hint"] = stepEx != null && !string.IsNullOrEmpty(stepEx.Hint)
                            ? stepEx.Hint
                            : InstallerCore.BuildFailureHint(ex, stepEx != null ? stepEx.StepCode : "");
                        File.WriteAllText(opts.OutFile, MiniJson.Stringify(err, true), new UTF8Encoding(false));
                    }
                    else
                    {
                        try { Console.Error.WriteLine(diagText); } catch { }
                    }
                    if (opts.Popup)
                    {
                        MessageBox.Show(
                            diagText,
                            InstallerI18n.Tr("Obsidian Prism 操作失败", "Obsidian Prism Operation Failed"),
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                    }
                    return 1;
                }
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm(opts));
            return 0;
        }

        private static InstallerOptions ParseArgs(string[] args)
        {
            InstallerOptions opts = new InstallerOptions();
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                string parsedLang;
                if (a == "--uninstall") opts.Uninstall = true;
                else if (a == "--silent" || a == "/S" || a == "-s") opts.Silent = true;
                else if (a == "--popup") opts.Popup = true;
                else if (a == "--status") opts.StatusOnly = true;
                else if (a == "--help" || a == "-h" || a == "/?") opts.ShowHelp = true;
                else if (InstallerI18n.TryParseLangArg(args, ref i, out parsedLang)) opts.Lang = parsedLang;
                else if (a == "--no-autostart") opts.NoAutostart = true;
                else if (a == "--no-kill-legacy") opts.NoKillLegacy = true;
                else if (a == "--no-native-daemon") opts.NoNativeDaemon = true;
                else if (a == "--no-relaunch-prompt") opts.NoRelaunchPrompt = true;
                else if (a == "--purge-data") opts.PurgeData = true;
                else if (a == "--install-dir" && i + 1 < args.Length) opts.InstallDir = args[++i];
                else if (a == "--plugin-dir" && i + 1 < args.Length) opts.PluginDir = args[++i];
                else if (a == "--cdp-port" && i + 1 < args.Length)
                {
                    int p;
                    if (int.TryParse(args[++i], out p) && p > 0) opts.CdpPort = p;
                }
                else if (a == "--out" && i + 1 < args.Length) opts.OutFile = args[++i];
            }
            return opts;
        }

        private static void WriteOutFile(string outFile, OperationResult res)
        {
            if (string.IsNullOrEmpty(outFile)) return;
            Dictionary<string, object> d = new Dictionary<string, object>(StringComparer.Ordinal);
            d["ok"] = res.Ok;
            d["mode"] = res.Mode;
            d["headline"] = res.Headline;
            d["detail"] = res.Detail;
            d["installDir"] = res.InstallDir;
            d["pluginDir"] = res.PluginDir;
            d["nativePluginDeployed"] = res.NativePluginDeployed;
            d["nativeDaemonStarted"] = res.NativeDaemonStarted;
            d["antigravityExe"] = res.AntigravityExe;
            d["antigravityVersion"] = res.AntigravityVersion;
            d["cdpPort"] = res.CdpPort.HasValue ? (object)res.CdpPort.Value : null;
            d["injectedPages"] = res.InjectedPages;
            d["preservedExistingConfig"] = res.PreservedExistingConfig;
            d["selfDeleteScheduled"] = res.SelfDeleteScheduled;
            d["patchedShortcuts"] = res.PatchedShortcuts;
            d["skippedShortcuts"] = res.SkippedShortcuts;
            d["restoredShortcuts"] = res.RestoredShortcuts;
            d["bareHostDetected"] = res.BareHostDetected;
            d["warnings"] = res.Warnings;
            File.WriteAllText(outFile, MiniJson.Stringify(d, true), new UTF8Encoding(false));
        }
    }
}
