using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;

namespace AgyClaudeStyle
{
    public static class InstallerI18n
    {
        private static readonly object _langLock = new object();
        private static string _explicitLang = null;

        public static string NormalizeLang(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return null;
            string s = raw.Trim().ToLowerInvariant();
            if (s.Length == 0 || s == "auto" || s == "system" || s == "default")
            {
                return null;
            }
            if (s == "zh" ||
                s.StartsWith("zh-", StringComparison.Ordinal) ||
                s.StartsWith("zh_", StringComparison.Ordinal) ||
                s == "cn" ||
                s == "chinese")
            {
                return "zh";
            }
            return "en";
        }

        public static void SetPreferredLang(string lang)
        {
            string normalized = NormalizeLang(lang);
            lock (_langLock)
            {
                _explicitLang = normalized;
            }
        }

        public static string ExplicitLang
        {
            get
            {
                lock (_langLock)
                {
                    return _explicitLang;
                }
            }
        }

        public static string EffectiveLang
        {
            get
            {
                string explicitCopy;
                lock (_langLock)
                {
                    explicitCopy = _explicitLang;
                }
                if (!string.IsNullOrEmpty(explicitCopy))
                {
                    return explicitCopy;
                }
                string envLang = NormalizeLang(Environment.GetEnvironmentVariable("AG_PRISM_LANG"));
                if (!string.IsNullOrEmpty(envLang))
                {
                    return envLang;
                }
                string uiName = "";
                try
                {
                    CultureInfo ui = CultureInfo.CurrentUICulture;
                    if (ui != null && !string.IsNullOrEmpty(ui.Name))
                    {
                        uiName = ui.Name;
                    }
                }
                catch { }
                return uiName.StartsWith("zh", StringComparison.OrdinalIgnoreCase) ? "zh" : "en";
            }
        }

        public static bool IsZhUi
        {
            get { return string.Equals(EffectiveLang, "zh", StringComparison.Ordinal); }
        }

        public static string Tr(string zh, string en)
        {
            return IsZhUi ? (zh ?? "") : (en ?? "");
        }

        public static string TrFormat(string zhFormat, string enFormat, params object[] args)
        {
            string fmt = IsZhUi ? (zhFormat ?? "") : (enFormat ?? "");
            if (args == null || args.Length == 0) return fmt;
            return string.Format(CultureInfo.InvariantCulture, fmt, args);
        }

        public static bool TryParseLangArg(string[] args, ref int index, out string lang)
        {
            lang = null;
            if (args == null || index < 0 || index >= args.Length) return false;
            string a = args[index];
            if (string.IsNullOrEmpty(a)) return false;
            if (string.Equals(a, "--lang", StringComparison.OrdinalIgnoreCase))
            {
                if (index + 1 < args.Length)
                {
                    lang = args[++index];
                    return true;
                }
                return false;
            }
            if (a.StartsWith("--lang=", StringComparison.OrdinalIgnoreCase))
            {
                lang = a.Substring(7);
                return true;
            }
            return false;
        }
    }

    public class BareHostProcessInfo
    {
        public int Pid;
        public string ExePath;
        public long StartTimeMs;
        public long UptimeMs;
    }
    public class CdpPageInfo
    {
        public string Id;
        public string Title;
        public string Url;
        public string WebSocketDebuggerUrl;
    }

    public class ActivePortProbeResult
    {
        public int? RawPort;
        public int? LivePort;
        public List<CdpPageInfo> Pages;
        public bool IsStalePort;
        public bool IsConnectionRefused;
        public bool IsTransientTimeout;
        public int ConsecutiveFailures;
    }

    public class PluginManifest
    {
        public string Version;
        public string StyleId;
        public string SettingBinding;
        public List<string> Parts;
        public Dictionary<string, object> DefaultConfig;
        public Dictionary<string, object> Validators;
        public string RemoveExpression;

        public static PluginManifest Load(string baseDir)
        {
            string manifestPath = Path.Combine(baseDir, "manifest.json");
            Dictionary<string, object> raw = MiniJson.ParseObject(File.ReadAllText(manifestPath, Encoding.UTF8));
            PluginManifest m = new PluginManifest();
            m.Version = GetString(raw, "version", "1.0.8-beta.3");
            m.StyleId = GetString(raw, "styleId", "ag-prism-css");
            m.SettingBinding = GetString(raw, "settingBinding", "__agPrismSetting");
            m.RemoveExpression = GetString(raw, "removeExpression", "");
            m.Parts = new List<string>();
            List<object> partsObj = raw.ContainsKey("parts") ? raw["parts"] as List<object> : null;
            if (partsObj != null)
            {
                for (int i = 0; i < partsObj.Count; i++)
                {
                    string s = partsObj[i] as string;
                    if (!string.IsNullOrEmpty(s)) m.Parts.Add(s);
                }
            }
            m.DefaultConfig = raw.ContainsKey("defaultConfig") && raw["defaultConfig"] is Dictionary<string, object>
                ? (Dictionary<string, object>)raw["defaultConfig"]
                : new Dictionary<string, object>(StringComparer.Ordinal);
            m.Validators = raw.ContainsKey("validators") && raw["validators"] is Dictionary<string, object>
                ? (Dictionary<string, object>)raw["validators"]
                : new Dictionary<string, object>(StringComparer.Ordinal);
            return m;
        }

        private static string GetString(Dictionary<string, object> d, string k, string fallback)
        {
            object v;
            if (d.TryGetValue(k, out v) && v is string) return (string)v;
            return fallback;
        }
    }

    public sealed class CdpSession : IDisposable
    {
        private readonly ClientWebSocket _ws;
        private readonly SemaphoreSlim _sendLock = new SemaphoreSlim(1, 1);
        private readonly ConcurrentDictionary<int, TaskCompletionSource<Dictionary<string, object>>> _pending =
            new ConcurrentDictionary<int, TaskCompletionSource<Dictionary<string, object>>>();
        private readonly Dictionary<string, List<Action<Dictionary<string, object>>>> _listeners =
            new Dictionary<string, List<Action<Dictionary<string, object>>>>(StringComparer.Ordinal);
        private readonly object _listenerLock = new object();
        private readonly CancellationTokenSource _cts = new CancellationTokenSource();
        private int _nextId = 0;
        private volatile bool _closed = false;

        public bool IsClosed
        {
            get { return _closed; }
        }

        public Action OnClose;

        private CdpSession(ClientWebSocket ws)
        {
            _ws = ws;
        }

        public static async Task<CdpSession> ConnectAsync(string wsUrl, int timeoutMs)
        {
            ClientWebSocket ws = new ClientWebSocket();
            CancellationTokenSource cts = new CancellationTokenSource(timeoutMs);
            try
            {
                await ws.ConnectAsync(new Uri(wsUrl), cts.Token).ConfigureAwait(false);
                CdpSession session = new CdpSession(ws);
                session.StartReceiveLoop();
                return session;
            }
            catch
            {
                try { ws.Dispose(); } catch { }
                throw;
            }
            finally
            {
                cts.Dispose();
            }
        }

        public void On(string method, Action<Dictionary<string, object>> callback)
        {
            lock (_listenerLock)
            {
                List<Action<Dictionary<string, object>>> list;
                if (!_listeners.TryGetValue(method, out list))
                {
                    list = new List<Action<Dictionary<string, object>>>();
                    _listeners[method] = list;
                }
                list.Add(callback);
            }
        }

        public async Task<Dictionary<string, object>> SendAsync(string method, Dictionary<string, object> parameters, int timeoutMs)
        {
            if (_closed) throw new InvalidOperationException("CDP connection closed");
            int id = Interlocked.Increment(ref _nextId);
            Dictionary<string, object> payload = new Dictionary<string, object>(StringComparer.Ordinal);
            payload["id"] = id;
            payload["method"] = method;
            payload["params"] = parameters ?? new Dictionary<string, object>(StringComparer.Ordinal);
            string json = MiniJson.Stringify(payload, false);
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            TaskCompletionSource<Dictionary<string, object>> tcs =
                new TaskCompletionSource<Dictionary<string, object>>(TaskCreationOptions.RunContinuationsAsynchronously);
            _pending[id] = tcs;

            try
            {
                await _sendLock.WaitAsync(_cts.Token).ConfigureAwait(false);
                try
                {
                    if (_closed) throw new InvalidOperationException("CDP connection closed");
                    const int chunkSize = 65536;
                    int offset = 0;
                    while (offset < bytes.Length)
                    {
                        int count = Math.Min(chunkSize, bytes.Length - offset);
                        bool endOfMessage = (offset + count) >= bytes.Length;
                        await _ws.SendAsync(
                            new ArraySegment<byte>(bytes, offset, count),
                            WebSocketMessageType.Text,
                            endOfMessage,
                            _cts.Token
                        ).ConfigureAwait(false);
                        offset += count;
                    }
                }
                finally
                {
                    _sendLock.Release();
                }

                using (CancellationTokenSource delayCts = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token))
                {
                    Task delayTask = Task.Delay(timeoutMs, delayCts.Token);
                    Task completed = await Task.WhenAny(tcs.Task, delayTask).ConfigureAwait(false);
                    if (completed == tcs.Task)
                    {
                        delayCts.Cancel();
                        return await tcs.Task.ConfigureAwait(false);
                    }
                }
                TaskCompletionSource<Dictionary<string, object>> removed;
                _pending.TryRemove(id, out removed);
                if (_closed) throw new InvalidOperationException("CDP connection closed");
                throw new TimeoutException("CDP " + method + " timeout");
            }
            catch
            {
                TaskCompletionSource<Dictionary<string, object>> removed;
                _pending.TryRemove(id, out removed);
                throw;
            }
        }

        public async Task<object> EvaluateAsync(string expression, bool awaitPromise)
        {
            Dictionary<string, object> parameters = new Dictionary<string, object>(StringComparer.Ordinal);
            parameters["expression"] = expression;
            parameters["returnByValue"] = true;
            parameters["awaitPromise"] = awaitPromise;
            Dictionary<string, object> res = await SendAsync("Runtime.evaluate", parameters, 15000).ConfigureAwait(false);

            object exObj;
            if (res.TryGetValue("exceptionDetails", out exObj) && exObj is Dictionary<string, object>)
            {
                Dictionary<string, object> exDetails = (Dictionary<string, object>)exObj;
                string msg = null;
                object innerEx;
                if (exDetails.TryGetValue("exception", out innerEx) && innerEx is Dictionary<string, object>)
                {
                    object desc;
                    if (((Dictionary<string, object>)innerEx).TryGetValue("description", out desc) && desc is string)
                    {
                        msg = (string)desc;
                    }
                }
                if (string.IsNullOrEmpty(msg))
                {
                    object text;
                    if (exDetails.TryGetValue("text", out text) && text is string) msg = (string)text;
                }
                throw new Exception(msg ?? "Runtime.evaluate exception");
            }

            object resultObj;
            if (res.TryGetValue("result", out resultObj) && resultObj is Dictionary<string, object>)
            {
                object val;
                if (((Dictionary<string, object>)resultObj).TryGetValue("value", out val)) return val;
            }
            return null;
        }

        private void StartReceiveLoop()
        {
            Task.Run(async () =>
            {
                byte[] buffer = new byte[65536];
                MemoryStream ms = new MemoryStream();
                try
                {
                    while (!_cts.IsCancellationRequested && _ws.State == WebSocketState.Open)
                    {
                        ms.SetLength(0);
                        WebSocketReceiveResult result;
                        do
                        {
                            result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token).ConfigureAwait(false);
                            if (result.MessageType == WebSocketMessageType.Close)
                            {
                                return;
                            }
                            if (result.Count > 0)
                            {
                                ms.Write(buffer, 0, result.Count);
                            }
                        } while (!result.EndOfMessage);

                        if (result.MessageType == WebSocketMessageType.Text && ms.Length > 0)
                        {
                            string text = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                            HandleMessage(text);
                        }
                    }
                }
                catch
                {
                }
                finally
                {
                    ms.Dispose();
                    MarkClosed();
                }
            });
        }

        private void HandleMessage(string text)
        {
            Dictionary<string, object> msg;
            try
            {
                msg = MiniJson.ParseObject(text);
            }
            catch
            {
                return;
            }

            object methodObj;
            if (msg.TryGetValue("method", out methodObj) && methodObj is string)
            {
                string method = (string)methodObj;
                Dictionary<string, object> p = msg.ContainsKey("params") && msg["params"] is Dictionary<string, object>
                    ? (Dictionary<string, object>)msg["params"]
                    : new Dictionary<string, object>(StringComparer.Ordinal);
                List<Action<Dictionary<string, object>>> snapshot = null;
                lock (_listenerLock)
                {
                    List<Action<Dictionary<string, object>>> list;
                    if (_listeners.TryGetValue(method, out list) && list.Count > 0)
                    {
                        snapshot = new List<Action<Dictionary<string, object>>>(list);
                    }
                }
                if (snapshot != null)
                {
                    for (int i = 0; i < snapshot.Count; i++)
                    {
                        try { snapshot[i](p); } catch { }
                    }
                }
                return;
            }

            object idObj;
            if (msg.TryGetValue("id", out idObj) && idObj != null)
            {
                int id = Convert.ToInt32(idObj);
                TaskCompletionSource<Dictionary<string, object>> tcs;
                if (_pending.TryRemove(id, out tcs))
                {
                    object errObj;
                    if (msg.TryGetValue("error", out errObj) && errObj != null)
                    {
                        string errMsg = null;
                        Dictionary<string, object> errDict = errObj as Dictionary<string, object>;
                        if (errDict != null && errDict.ContainsKey("message")) errMsg = errDict["message"] as string;
                        if (string.IsNullOrEmpty(errMsg)) errMsg = MiniJson.Stringify(errObj, false);
                        tcs.TrySetException(new Exception(errMsg));
                    }
                    else
                    {
                        Dictionary<string, object> resDict = msg.ContainsKey("result") && msg["result"] is Dictionary<string, object>
                            ? (Dictionary<string, object>)msg["result"]
                            : new Dictionary<string, object>(StringComparer.Ordinal);
                        tcs.TrySetResult(resDict);
                    }
                }
            }
        }

        private void MarkClosed()
        {
            if (_closed) return;
            _closed = true;
            foreach (KeyValuePair<int, TaskCompletionSource<Dictionary<string, object>>> kv in _pending)
            {
                TaskCompletionSource<Dictionary<string, object>> tcs;
                if (_pending.TryRemove(kv.Key, out tcs))
                {
                    tcs.TrySetException(new Exception("CDP connection closed"));
                }
            }
            Action cb = OnClose;
            if (cb != null)
            {
                try { cb(); } catch { }
            }
        }

        public void Close()
        {
            MarkClosed();
            try { _cts.Cancel(); } catch { }
            try
            {
                if (_ws.State == WebSocketState.Open)
                {
                    _ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None).Wait(300);
                }
            }
            catch { }
            try { _ws.Dispose(); } catch { }
        }

        public void Dispose()
        {
            Close();
            try { _cts.Dispose(); } catch { }
            try { _sendLock.Dispose(); } catch { }
        }
    }

    public static class CdpHelper
    {
        private static readonly HttpClient SharedHttp = CreateSharedHttpClient();

        private static HttpClient CreateSharedHttpClient()
        {
            HttpClientHandler handler = new HttpClientHandler();
            handler.UseProxy = false;
            HttpClient client = new HttpClient(handler);
            // Windows loopback 关闭端口 TCP SYN 重传耗时约 2000~2100ms，Timeout 需高于该值才能准确捕获 ConnectionRefused 而非被 2000ms 超时截胡
            client.Timeout = TimeSpan.FromMilliseconds(3000);
            return client;
        }

        public static string GetPortFilePath()
        {
            string appData = Environment.GetEnvironmentVariable("APPDATA");
            if (string.IsNullOrEmpty(appData))
            {
                appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            }
            return Path.Combine(appData, "Antigravity", "DevToolsActivePort");
        }

        public static int? ReadPort(int? overridePort)
        {
            if (overridePort.HasValue && overridePort.Value > 0) return overridePort.Value;
            string envPort = Environment.GetEnvironmentVariable("AG_CDP_PORT");
            if (!string.IsNullOrEmpty(envPort))
            {
                int p;
                if (int.TryParse(envPort.Trim(), out p) && p > 0) return p;
            }
            try
            {
                string portFile = GetPortFilePath();
                if (!File.Exists(portFile)) return null;
                string[] lines = File.ReadAllLines(portFile, Encoding.UTF8);
                if (lines.Length == 0) return null;
                int p;
                if (int.TryParse(lines[0].Trim(), out p) && p > 0) return p;
            }
            catch { }
            return null;
        }

        public static async Task<bool> IsPortAliveAsync(int port, int timeoutMs = 1200)
        {
            if (port <= 0 || port > 65535) return false;
            int effectiveMs = timeoutMs > 100 ? timeoutMs : 1200;
            using (CancellationTokenSource cts = new CancellationTokenSource(effectiveMs))
            {
                try
                {
                    string url = string.Format("http://127.0.0.1:{0}/json/list", port);
                    using (HttpResponseMessage resp = await SharedHttp.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token).ConfigureAwait(false))
                    {
                        return resp.IsSuccessStatusCode;
                    }
                }
                catch
                {
                    return false;
                }
            }
        }

        private static bool IsConnectionRefusedException(Exception ex)
        {
            if (ex == null) return false;
            Queue<Exception> q = new Queue<Exception>();
            q.Enqueue(ex);
            while (q.Count > 0)
            {
                Exception cur = q.Dequeue();
                if (cur == null) continue;
                SocketException sex = cur as SocketException;
                if (sex != null && sex.SocketErrorCode == SocketError.ConnectionRefused)
                {
                    return true;
                }
                AggregateException agg = cur as AggregateException;
                if (agg != null && agg.InnerExceptions != null)
                {
                    for (int i = 0; i < agg.InnerExceptions.Count; i++) q.Enqueue(agg.InnerExceptions[i]);
                }
                if (cur.InnerException != null) q.Enqueue(cur.InnerException);
            }
            return false;
        }

        private static bool IsTransientTimeoutException(Exception ex)
        {
            if (ex == null) return false;
            Queue<Exception> q = new Queue<Exception>();
            q.Enqueue(ex);
            while (q.Count > 0)
            {
                Exception cur = q.Dequeue();
                if (cur == null) continue;
                if (cur is TaskCanceledException || cur is OperationCanceledException || cur is TimeoutException)
                {
                    return true;
                }
                WebException wex = cur as WebException;
                if (wex != null && wex.Status == WebExceptionStatus.Timeout)
                {
                    return true;
                }
                SocketException sex = cur as SocketException;
                if (sex != null && sex.SocketErrorCode == SocketError.TimedOut)
                {
                    return true;
                }
                AggregateException agg = cur as AggregateException;
                if (agg != null && agg.InnerExceptions != null)
                {
                    for (int i = 0; i < agg.InnerExceptions.Count; i++) q.Enqueue(agg.InnerExceptions[i]);
                }
                if (cur.InnerException != null) q.Enqueue(cur.InnerException);
            }
            return false;
        }

        public static Task<ActivePortProbeResult> ProbeActivePortAsync(int? overridePort)
        {
            return ProbeActivePortAsync(overridePort, false, 0);
        }

        public static async Task<ActivePortProbeResult> ProbeActivePortAsync(
            int? overridePort,
            bool hasActiveAttachedSession,
            int consecutiveTimeoutFailures
        )
        {
            ActivePortProbeResult res = new ActivePortProbeResult();
            int? rawPort = ReadPort(overridePort);
            res.RawPort = rawPort;
            if (!rawPort.HasValue)
            {
                res.LivePort = null;
                res.Pages = null;
                res.IsStalePort = false;
                res.IsConnectionRefused = false;
                res.IsTransientTimeout = false;
                res.ConsecutiveFailures = 0;
                return res;
            }
            try
            {
                List<CdpPageInfo> pages = await ListPagesAsync(rawPort.Value).ConfigureAwait(false);
                if (pages != null)
                {
                    res.LivePort = rawPort;
                    res.Pages = pages;
                    res.IsStalePort = false;
                    res.IsConnectionRefused = false;
                    res.IsTransientTimeout = false;
                    res.ConsecutiveFailures = 0;
                    return res;
                }
                res.LivePort = null;
                res.Pages = null;
                res.IsStalePort = true;
                res.ConsecutiveFailures = (consecutiveTimeoutFailures > 0 ? consecutiveTimeoutFailures : 0) + 1;
                return res;
            }
            catch (Exception ex)
            {
                bool isRefused = IsConnectionRefusedException(ex);
                bool isTimeout = !isRefused && IsTransientTimeoutException(ex);
                int nextFailures = (consecutiveTimeoutFailures > 0 ? consecutiveTimeoutFailures : 0) + 1;
                res.LivePort = null;
                res.Pages = null;
                res.IsConnectionRefused = isRefused;
                res.IsTransientTimeout = isTimeout;
                res.ConsecutiveFailures = nextFailures;
                // 已有活跃 attached 会话时：ConnectionRefused 立即判死，瞬态超时需连续 2 次失败才判 IsStalePort 断连
                if (isRefused)
                {
                    res.IsStalePort = true;
                }
                else if (hasActiveAttachedSession && isTimeout && nextFailures < 2)
                {
                    res.IsStalePort = false;
                }
                else
                {
                    res.IsStalePort = true;
                }
                return res;
            }
        }

        public static bool IsBareAuxiliaryTarget(string title, string pageUrl)
        {
            string ttl = (title ?? "").Trim();
            if (string.Equals(ttl, "Untitled", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(ttl, "launchpad", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            string rawUrl = (pageUrl ?? "").Trim();
            int qIdx = rawUrl.IndexOfAny(new char[] { '?', '#' });
            string cleanUrl = (qIdx >= 0 ? rawUrl.Substring(0, qIdx) : rawUrl).TrimEnd('/');
            if (string.Equals(cleanUrl, "launchpad", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cleanUrl, "launchpad.html", StringComparison.OrdinalIgnoreCase) ||
                cleanUrl.EndsWith("/launchpad", StringComparison.OrdinalIgnoreCase) ||
                cleanUrl.EndsWith("/launchpad.html", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return false;
        }

        public static bool IsEligibleTarget(string type, string wsUrl, string title, string pageUrl)
        {
            if (type != "page" || string.IsNullOrEmpty(wsUrl)) return false;
            string url = (pageUrl ?? "").Trim();
            string ttl = (title ?? "").Trim();
            if (url.Length == 0) return false;
            if (url.StartsWith("devtools://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("about:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("chrome:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("chrome-extension:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("edge:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("blob:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("plugin:", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            if (IsBareAuxiliaryTarget(ttl, url))
            {
                return false;
            }
            if (url.StartsWith("vscode-file://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("app://", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (url.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
            {
                return url.IndexOf("workbench", StringComparison.OrdinalIgnoreCase) >= 0 ||
                       url.IndexOf("antigravity", StringComparison.OrdinalIgnoreCase) >= 0 ||
                       ttl.IndexOf("antigravity", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            Uri uri;
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri)) return false;
            string scheme = (uri.Scheme ?? "").ToLowerInvariant();
            if (scheme != "http" && scheme != "https") return false;
            string host = (uri.Host ?? "").ToLowerInvariant();
            if (host != "127.0.0.1" && host != "localhost" && host != "::1" && host != "[::1]") return false;
            string absPath = (uri.AbsolutePath ?? "/").ToLowerInvariant();
            if (absPath == "/viewer" || absPath.StartsWith("/viewer/", StringComparison.Ordinal) ||
                absPath == "/sandbox" || absPath.StartsWith("/sandbox/", StringComparison.Ordinal) ||
                absPath == "/stream" || absPath.StartsWith("/stream/", StringComparison.Ordinal) ||
                absPath == "/api" || absPath.StartsWith("/api/", StringComparison.Ordinal))
            {
                return false;
            }
            if (ttl.IndexOf("antigravity", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            if (scheme == "https" && (ttl.Length == 0 || ttl.StartsWith("127.0.0.1", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }
            return false;
        }

        public static async Task<List<CdpPageInfo>> ListPagesAsync(int port)
        {
            string url = string.Format("http://127.0.0.1:{0}/json/list", port);
            string json = await SharedHttp.GetStringAsync(url).ConfigureAwait(false);
            List<object> targets = MiniJson.ParseArray(json);
            List<CdpPageInfo> pages = new List<CdpPageInfo>();
            for (int i = 0; i < targets.Count; i++)
            {
                Dictionary<string, object> t = targets[i] as Dictionary<string, object>;
                if (t == null) continue;
                string type = GetStr(t, "type");
                string wsUrl = GetStr(t, "webSocketDebuggerUrl");
                string title = GetStr(t, "title") ?? "";
                string pageUrl = GetStr(t, "url") ?? "";
                if (IsEligibleTarget(type, wsUrl, title, pageUrl))
                {
                    CdpPageInfo info = new CdpPageInfo();
                    info.Id = GetStr(t, "id") ?? wsUrl;
                    info.Title = title;
                    info.Url = pageUrl;
                    info.WebSocketDebuggerUrl = wsUrl;
                    pages.Add(info);
                }
            }
            return pages;
        }

        private static bool ToBoolOnOff(object v)
        {
            if (v is bool) return (bool)v;
            string s = v as string;
            return s != null && !string.Equals(s, "off", StringComparison.OrdinalIgnoreCase) && !string.Equals(s, "false", StringComparison.OrdinalIgnoreCase);
        }

        public static Dictionary<string, object> ReconcileConfigAliases(Dictionary<string, object> raw)
        {
            Dictionary<string, object> res = new Dictionary<string, object>(StringComparer.Ordinal);
            if (raw != null)
            {
                foreach (KeyValuePair<string, object> kv in raw) res[kv.Key] = kv.Value;
            }
            if (res.ContainsKey("language")) res["lang"] = res["language"];
            else if (res.ContainsKey("lang")) res["language"] = res["lang"];

            if (res.ContainsKey("homeLayout")) res["homeMode"] = res["homeLayout"];
            else if (res.ContainsKey("homeMode")) res["homeLayout"] = res["homeMode"];

            if (res.ContainsKey("homeRipple") || res.ContainsKey("ripple"))
            {
                bool on = res.ContainsKey("homeRipple") ? ToBoolOnOff(res["homeRipple"]) : ToBoolOnOff(res["ripple"]);
                res["homeRipple"] = on;
                res["ripple"] = on ? "on" : "off";
            }
            if (res.ContainsKey("composerRestyle") || res.ContainsKey("composer"))
            {
                bool on = res.ContainsKey("composerRestyle") ? ToBoolOnOff(res["composerRestyle"]) : ToBoolOnOff(res["composer"]);
                res["composerRestyle"] = on;
                res["composer"] = on ? "on" : "off";
            }
            if (res.ContainsKey("placeholderStyle")) res["promptStyle"] = res["placeholderStyle"];
            else if (res.ContainsKey("promptStyle")) res["placeholderStyle"] = res["promptStyle"];

            if (res.ContainsKey("sidebarRestyle") || res.ContainsKey("sidebar"))
            {
                bool on = res.ContainsKey("sidebarRestyle") ? ToBoolOnOff(res["sidebarRestyle"]) : ToBoolOnOff(res["sidebar"]);
                res["sidebarRestyle"] = on;
                res["sidebar"] = on ? "on" : "off";
            }
            if (res.ContainsKey("sidebarCompact"))
            {
                res["sidebarCompact"] = ToBoolOnOff(res["sidebarCompact"]);
            }
            if (res.ContainsKey("smoothCaret"))
            {
                res["smoothCaret"] = ToBoolOnOff(res["smoothCaret"]);
            }
            if (res.ContainsKey("contextMenu"))
            {
                res["contextMenu"] = ToBoolOnOff(res["contextMenu"]);
            }
            if (res.ContainsKey("convRipple"))
            {
                object cr = res["convRipple"];
                if (cr is bool)
                {
                    res["convRipple"] = (bool)cr ? "medium" : "off";
                }
                else
                {
                    string crs = cr as string;
                    if (crs != null)
                    {
                        string lowCr = crs.Trim().ToLowerInvariant();
                        if (lowCr == "on" || lowCr == "true") res["convRipple"] = "medium";
                        else if (lowCr == "off" || lowCr == "false") res["convRipple"] = "off";
                        else if (lowCr == "subtle" || lowCr == "medium" || lowCr == "full") res["convRipple"] = lowCr;
                    }
                }
            }
            if (res.ContainsKey("codeLigatures"))
            {
                object cl = res["codeLigatures"];
                if (cl is bool)
                {
                    res["codeLigatures"] = (bool)cl;
                }
                else
                {
                    string cls = cl as string;
                    res["codeLigatures"] = cls != null && (string.Equals(cls, "on", StringComparison.OrdinalIgnoreCase) || string.Equals(cls, "true", StringComparison.OrdinalIgnoreCase));
                }
            }
            string[] boolOnOffKeys = new string[] { "telemetryModule", "effortSliderModule", "omniModule", "sidebarStudio", "autoUpdate", "sidebarNavFold" };
            for (int i = 0; i < boolOnOffKeys.Length; i++)
            {
                string k = boolOnOffKeys[i];
                object bv;
                if (res.TryGetValue(k, out bv) && bv is bool)
                {
                    res[k] = (bool)bv ? "on" : "off";
                }
            }
            object palVal;
            if (res.TryGetValue("palette", out palVal) && string.Equals(palVal as string, "claude", StringComparison.Ordinal))
            {
                res["palette"] = "warm";
            }
            object mascotVal;
            if (res.TryGetValue("mascot", out mascotVal) && string.Equals(mascotVal as string, "dual", StringComparison.Ordinal))
            {
                res["mascot"] = "crab";
            }
            return res;
        }

        public static Dictionary<string, object> ReadConfig(string baseDir, PluginManifest manifest)
        {
            Dictionary<string, object> cfg = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, object> kv in manifest.DefaultConfig)
            {
                cfg[kv.Key] = kv.Value;
            }
            try
            {
                string cfgPath = Path.Combine(baseDir, "config.json");
                if (File.Exists(cfgPath))
                {
                    Dictionary<string, object> userCfg = ReconcileConfigAliases(MiniJson.ParseObject(File.ReadAllText(cfgPath, Encoding.UTF8)));
                    foreach (KeyValuePair<string, object> kv in userCfg)
                    {
                        cfg[kv.Key] = kv.Value;
                    }
                }
            }
            catch { }
            return ReconcileConfigAliases(cfg);
        }

        public static bool ValidateConfigEntry(PluginManifest manifest, string key, object value)
        {
            if (manifest == null || manifest.Validators == null || string.IsNullOrEmpty(key)) return false;
            object rule;
            if (!manifest.Validators.TryGetValue(key, out rule)) return false;
            string ruleStr = rule as string;
            if (ruleStr == "boolean")
            {
                if (!(value is bool))
                {
                    string sv = value as string;
                    if (sv != "on" && sv != "off") return false;
                }
                return true;
            }
            if (rule is List<object>)
            {
                string strVal = value as string;
                if (strVal == null) return false;
                List<object> allowed = (List<object>)rule;
                for (int i = 0; i < allowed.Count; i++)
                {
                    if (string.Equals(allowed[i] as string, strVal, StringComparison.Ordinal))
                    {
                        return true;
                    }
                }
            }
            return false;
        }

        private const uint IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003u;
        private const uint IO_REPARSE_TAG_SYMLINK = 0xA000000Cu;
        private const uint IO_REPARSE_TAG_LX_SYMLINK = 0xA000001Du;
        private const uint IO_REPARSE_TAG_WOF = 0x80000017u;
        private const uint IO_REPARSE_TAG_DEDUP = 0x80000013u;
        private const uint IO_REPARSE_TAG_ONEDRIVE = 0x80000021u;
        private const uint IO_REPARSE_TAG_CLOUD_BASE = 0x9000001Au;
        private const uint IO_REPARSE_TAG_CLOUD_MASK = 0xFFFF0FFFu;
        private const int ERROR_FILE_NOT_FOUND = 2;
        private const int ERROR_PATH_NOT_FOUND = 3;
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);
        private static int _atomicWriteSeq = 0;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct WIN32_FIND_DATAW
        {
            public uint dwFileAttributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME ftCreationTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME ftLastAccessTime;
            public System.Runtime.InteropServices.ComTypes.FILETIME ftLastWriteTime;
            public uint nFileSizeHigh;
            public uint nFileSizeLow;
            public uint dwReserved0;
            public uint dwReserved1;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string cFileName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)]
            public string cAlternateFileName;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindFirstFileW(string lpFileName, out WIN32_FIND_DATAW lpFindFileData);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FindClose(IntPtr hFindFile);

        /// <summary>
        /// 仅放行微软标准非重定向存储层/云占位重解析标签（WOF CompactOS 压缩、OneDrive Cloud Filter、NTFS Dedup）。
        /// Symlink / Junction / 未知标签一律返回 false（Fail-Closed）。
        /// </summary>
        public static bool IsSafeNonRedirectReparseTag(uint tag)
        {
            if (tag == IO_REPARSE_TAG_WOF ||
                tag == IO_REPARSE_TAG_DEDUP ||
                tag == IO_REPARSE_TAG_ONEDRIVE)
            {
                return true;
            }
            if ((tag & IO_REPARSE_TAG_CLOUD_MASK) == IO_REPARSE_TAG_CLOUD_BASE)
            {
                return true;
            }
            return false;
        }

        public static string DescribeReparseTag(uint tag)
        {
            if (tag == IO_REPARSE_TAG_SYMLINK) return "Symlink (0xA000000C)";
            if (tag == IO_REPARSE_TAG_MOUNT_POINT) return "Junction/MountPoint (0xA0000003)";
            if (tag == IO_REPARSE_TAG_LX_SYMLINK) return "WSL Symlink (0xA000001D)";
            if (tag == IO_REPARSE_TAG_WOF) return "WOF CompactOS (0x80000017)";
            if (tag == IO_REPARSE_TAG_DEDUP) return "NTFS Dedup (0x80000013)";
            if (tag == IO_REPARSE_TAG_ONEDRIVE || (tag & IO_REPARSE_TAG_CLOUD_MASK) == IO_REPARSE_TAG_CLOUD_BASE)
            {
                return string.Format("Cloud/OneDrive (0x{0:X8})", tag);
            }
            if (tag == 0u) return "Unknown ReparsePoint";
            return string.Format("ReparsePoint (0x{0:X8})", tag);
        }

        private static bool TryBuildFindFirstQuery(string path, out string query, out bool isDriveRoot)
        {
            query = null;
            isDriveRoot = false;
            if (string.IsNullOrEmpty(path)) return false;

            bool hasExtendedPrefix = path.StartsWith(@"\\?\", StringComparison.Ordinal);
            string wildcardCheckSlice = hasExtendedPrefix ? path.Substring(4) : path;
            if (wildcardCheckSlice.IndexOf('*') >= 0 || wildcardCheckSlice.IndexOf('?') >= 0)
            {
                return false;
            }

            string normalized = hasExtendedPrefix ? path : path.Replace('/', '\\');
            if (!hasExtendedPrefix &&
                (normalized.EndsWith(@"\.", StringComparison.Ordinal) ||
                 normalized.EndsWith(@"\..", StringComparison.Ordinal) ||
                 normalized == "." ||
                 normalized == ".."))
            {
                normalized = Path.GetFullPath(normalized);
            }

            string trimmed = normalized.TrimEnd('\\');
            if (string.IsNullOrEmpty(trimmed))
            {
                return false;
            }

            if (hasExtendedPrefix)
            {
                if (trimmed.Length == 6 && char.IsLetter(trimmed[4]) && trimmed[5] == ':')
                {
                    isDriveRoot = true;
                    return true;
                }
                query = trimmed;
                return true;
            }

            if (trimmed.Length == 2 && char.IsLetter(trimmed[0]) && trimmed[1] == ':')
            {
                isDriveRoot = true;
                return true;
            }

            if (trimmed.Length >= 248)
            {
                string abs = trimmed;
                bool isUnc = abs.StartsWith(@"\\", StringComparison.Ordinal) && !abs.StartsWith(@"\\.\", StringComparison.Ordinal);
                bool isDriveAbs = abs.Length >= 3 && char.IsLetter(abs[0]) && abs[1] == ':' && abs[2] == '\\';
                if (!isUnc && !isDriveAbs)
                {
                    abs = Path.GetFullPath(abs).TrimEnd('\\');
                    isUnc = abs.StartsWith(@"\\", StringComparison.Ordinal) && !abs.StartsWith(@"\\.\", StringComparison.Ordinal);
                }
                if (abs.Length == 2 && char.IsLetter(abs[0]) && abs[1] == ':')
                {
                    isDriveRoot = true;
                    return true;
                }
                query = isUnc ? (@"\\?\UNC\" + abs.Substring(2)) : (@"\\?\" + abs);
                return true;
            }

            query = trimmed;
            return true;
        }

        public static bool TryGetReparseTag(string path, out uint reparseTag)
        {
            reparseTag = 0u;
            if (string.IsNullOrEmpty(path)) return false;
            try
            {
                string query;
                bool isDriveRoot;
                if (!TryBuildFindFirstQuery(path, out query, out isDriveRoot) || isDriveRoot)
                {
                    return false;
                }
                WIN32_FIND_DATAW data;
                IntPtr handle = FindFirstFileW(query, out data);
                if (handle == INVALID_HANDLE_VALUE)
                {
                    return false;
                }
                try
                {
                    if ((data.dwFileAttributes & (uint)FileAttributes.ReparsePoint) != 0u)
                    {
                        reparseTag = data.dwReserved0;
                        return true;
                    }
                    return false;
                }
                finally
                {
                    FindClose(handle);
                }
            }
            catch
            {
                return false;
            }
        }

        public static bool IsUnsafeReparsePoint(string path)
        {
            uint tag;
            return IsUnsafeReparsePoint(path, out tag);
        }

        /// <summary>
        /// 判断路径是否为具有重定向风险的重解析点（符号链接、目录联接、悬空软链或未知重解析点）。
        /// 直接通过 FindFirstFileW 判定（拦截通配符，超长路径自动补 \\?\ 前缀），放行纯存储层/云占位标签（WOF / OneDrive Cloud / Dedup）；
        /// 仅在 ERROR_FILE_NOT_FOUND(2) 或 ERROR_PATH_NOT_FOUND(3) 时返回 false，其余任何错误/异常严格 Fail-Closed 返回 true。
        /// </summary>
        public static bool IsUnsafeReparsePoint(string path, out uint reparseTag)
        {
            reparseTag = 0u;
            if (string.IsNullOrEmpty(path)) return false;
            try
            {
                string query;
                bool isDriveRoot;
                if (!TryBuildFindFirstQuery(path, out query, out isDriveRoot))
                {
                    return true;
                }
                if (isDriveRoot)
                {
                    return false;
                }
                WIN32_FIND_DATAW data;
                IntPtr handle = FindFirstFileW(query, out data);
                if (handle == INVALID_HANDLE_VALUE)
                {
                    int err = Marshal.GetLastWin32Error();
                    if (err == ERROR_FILE_NOT_FOUND || err == ERROR_PATH_NOT_FOUND)
                    {
                        return false;
                    }
                    return true;
                }
                try
                {
                    if ((data.dwFileAttributes & (uint)FileAttributes.ReparsePoint) == 0u)
                    {
                        return false;
                    }
                    reparseTag = data.dwReserved0;
                    return !IsSafeNonRedirectReparseTag(reparseTag);
                }
                finally
                {
                    FindClose(handle);
                }
            }
            catch
            {
                return true;
            }
        }

        private static string NormalizeChainPath(string rawPath)
        {
            if (string.IsNullOrEmpty(rawPath)) return "";
            string full = Path.GetFullPath(rawPath);
            string root = Path.GetPathRoot(full);
            if (!string.IsNullOrEmpty(root) &&
                string.Equals(full.TrimEnd('\\', '/'), root.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase))
            {
                return root;
            }
            return full.TrimEnd('\\', '/');
        }

        /// <summary>
        /// 检查目录链路（覆盖 ~/.gemini → cfgDir 或沙盒 .gemini → cfgDir 祖先链）是否存在不安全重解析点。
        /// 任何无法解析或越界异常均 Fail-Closed 返回 true。
        /// </summary>
        public static bool HasUnsafeReparsePointInChain(string dirPath, out string unsafePath, out uint reparseTag)
        {
            unsafePath = dirPath ?? "";
            reparseTag = 0u;
            if (string.IsNullOrEmpty(dirPath)) return false;
            try
            {
                string probeQuery;
                bool probeIsRoot;
                if (!TryBuildFindFirstQuery(dirPath, out probeQuery, out probeIsRoot))
                {
                    unsafePath = dirPath;
                    return true;
                }
                string cur = NormalizeChainPath(dirPath);
                if (string.IsNullOrEmpty(cur)) return true;

                string stopRoot = null;
                string userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (string.IsNullOrEmpty(userHome)) userHome = Environment.GetEnvironmentVariable("USERPROFILE");
                if (!string.IsNullOrEmpty(userHome))
                {
                    string defaultGemini = NormalizeChainPath(Path.Combine(userHome, ".gemini"));
                    string defaultGeminiPrefix = defaultGemini.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
                    if (string.Equals(cur, defaultGemini, StringComparison.OrdinalIgnoreCase) ||
                        cur.StartsWith(defaultGeminiPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        stopRoot = defaultGemini;
                    }
                }
                if (string.IsNullOrEmpty(stopRoot))
                {
                    string scan = cur;
                    for (int depth = 0; depth < 64 && !string.IsNullOrEmpty(scan); depth++)
                    {
                        if (string.Equals(Path.GetFileName(scan), ".gemini", StringComparison.OrdinalIgnoreCase))
                        {
                            stopRoot = scan;
                            break;
                        }
                        string up = Path.GetDirectoryName(scan);
                        if (string.IsNullOrEmpty(up) || string.Equals(up, scan, StringComparison.OrdinalIgnoreCase)) break;
                        scan = NormalizeChainPath(up);
                    }
                }
                if (string.IsNullOrEmpty(stopRoot))
                {
                    stopRoot = cur;
                }

                string walk = cur;
                bool reachedStop = false;
                for (int step = 0; step < 64 && !string.IsNullOrEmpty(walk); step++)
                {
                    uint tag;
                    if (IsUnsafeReparsePoint(walk, out tag))
                    {
                        unsafePath = walk;
                        reparseTag = tag;
                        return true;
                    }
                    if (string.Equals(walk, stopRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        reachedStop = true;
                        break;
                    }
                    string parent = Path.GetDirectoryName(walk);
                    if (string.IsNullOrEmpty(parent) || string.Equals(parent, walk, StringComparison.OrdinalIgnoreCase))
                    {
                        break;
                    }
                    walk = NormalizeChainPath(parent);
                }
                if (!reachedStop)
                {
                    unsafePath = dirPath;
                    return true;
                }
                return false;
            }
            catch
            {
                unsafePath = dirPath;
                reparseTag = 0u;
                return true;
            }
        }

        public static void ClearReadOnlyAndHiddenAttributes(string path)
        {
            if (string.IsNullOrEmpty(path)) return;
            try
            {
                if (IsUnsafeReparsePoint(path)) return;
                if (!File.Exists(path) && !Directory.Exists(path)) return;
                FileAttributes attrs = File.GetAttributes(path);
                FileAttributes toStrip = FileAttributes.ReadOnly | FileAttributes.Hidden | FileAttributes.System;
                if ((attrs & toStrip) != 0)
                {
                    FileAttributes next = attrs & ~toStrip;
                    File.SetAttributes(path, next == 0 ? FileAttributes.Normal : next);
                }
            }
            catch { }
        }

        private static void AtomicWriteJson(string cfgPath, Dictionary<string, object> next)
        {
            if (string.IsNullOrEmpty(cfgPath)) return;
            string parentDir = Path.GetDirectoryName(cfgPath);
            if (!string.IsNullOrEmpty(parentDir))
            {
                string badDir;
                uint badTag;
                if (HasUnsafeReparsePointInChain(parentDir, out badDir, out badTag))
                {
                    throw new InvalidOperationException(InstallerI18n.TrFormat(
                        "目标目录链路包含符号链接或重解析点 [{0}]，已拒绝写入: {1}",
                        "Target directory chain contains a symbolic link or reparse point [{0}]; write refused: {1}",
                        DescribeReparseTag(badTag),
                        badDir
                    ));
                }
            }
            if (IsUnsafeReparsePoint(cfgPath))
            {
                throw new InvalidOperationException(InstallerI18n.TrFormat(
                    "目标文件为符号链接或重解析点，已拒绝覆盖: {0}",
                    "Target file is a symbolic link or reparse point; overwrite refused: {0}",
                    cfgPath
                ));
            }
            int seq = Interlocked.Increment(ref _atomicWriteSeq);
            string tmpPath = cfgPath + ".tmp." + Process.GetCurrentProcess().Id + "." + seq;
            string content = MiniJson.Stringify(next, true) + "\n";
            byte[] utf8Bytes = new UTF8Encoding(false).GetBytes(content);
            int[] backoffs = new int[] { 50, 100, 200, 350 };
            Exception lastErr = null;
            for (int attempt = 0; attempt <= backoffs.Length; attempt++)
            {
                try
                {
                    if (!string.IsNullOrEmpty(parentDir))
                    {
                        string curBadDir;
                        uint curBadTag;
                        if (HasUnsafeReparsePointInChain(parentDir, out curBadDir, out curBadTag))
                        {
                            throw new InvalidOperationException(InstallerI18n.TrFormat(
                                "目标目录链路包含符号链接或重解析点 [{0}]，已拒绝写入: {1}",
                                "Target directory chain contains a symbolic link or reparse point [{0}]; write refused: {1}",
                                DescribeReparseTag(curBadTag),
                                curBadDir
                            ));
                        }
                    }
                    if (IsUnsafeReparsePoint(cfgPath))
                    {
                        throw new InvalidOperationException(InstallerI18n.TrFormat(
                            "目标文件为符号链接或重解析点，已拒绝覆盖: {0}",
                            "Target file is a symbolic link or reparse point; overwrite refused: {0}",
                            cfgPath
                        ));
                    }
                    if (IsUnsafeReparsePoint(tmpPath))
                    {
                        throw new InvalidOperationException(InstallerI18n.TrFormat(
                            "临时文件为符号链接或重解析点，已拒绝写入: {0}",
                            "Temporary file is a symbolic link or reparse point; write refused: {0}",
                            tmpPath
                        ));
                    }
                    if (File.Exists(tmpPath))
                    {
                        File.Delete(tmpPath);
                    }
                    using (FileStream tmpFs = new FileStream(tmpPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        tmpFs.Write(utf8Bytes, 0, utf8Bytes.Length);
                    }
                    if (File.Exists(cfgPath))
                    {
                        ClearReadOnlyAndHiddenAttributes(cfgPath);
                        try
                        {
                            AtomicReplaceFile(tmpPath, cfgPath);
                        }
                        catch (Exception replaceEx)
                        {
                            if (!(replaceEx is IOException) && !(replaceEx is UnauthorizedAccessException))
                            {
                                throw;
                            }
                            if (attempt < backoffs.Length)
                            {
                                throw;
                            }
                            if (!string.IsNullOrEmpty(parentDir))
                            {
                                string fbBadDir;
                                uint fbBadTag;
                                if (HasUnsafeReparsePointInChain(parentDir, out fbBadDir, out fbBadTag))
                                {
                                    throw new InvalidOperationException(InstallerI18n.TrFormat(
                                        "目标目录链路包含符号链接或重解析点 [{0}]，已拒绝回退写入: {1}",
                                        "Target directory chain contains a symbolic link or reparse point [{0}]; fallback write refused: {1}",
                                        DescribeReparseTag(fbBadTag),
                                        fbBadDir
                                    ));
                                }
                            }
                            if (IsUnsafeReparsePoint(cfgPath))
                            {
                                throw new InvalidOperationException(InstallerI18n.TrFormat(
                                    "目标文件为符号链接或重解析点，已拒绝回退覆盖: {0}",
                                    "Target file is a symbolic link or reparse point; fallback overwrite refused: {0}",
                                    cfgPath
                                ));
                            }
                            ClearReadOnlyAndHiddenAttributes(cfgPath);
                            using (FileStream fs = new FileStream(cfgPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite))
                            {
                                fs.Write(utf8Bytes, 0, utf8Bytes.Length);
                            }
                            try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
                        }
                    }
                    else
                    {
                        if (IsUnsafeReparsePoint(cfgPath))
                        {
                            throw new InvalidOperationException(InstallerI18n.TrFormat(
                                "目标文件为符号链接或重解析点，已拒绝覆盖: {0}",
                                "Target file is a symbolic link or reparse point; overwrite refused: {0}",
                                cfgPath
                            ));
                        }
                        File.Move(tmpPath, cfgPath);
                    }
                    return;
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
                catch
                {
                    try { if (File.Exists(tmpPath)) File.Delete(tmpPath); } catch { }
                    throw;
                }
            }
            if (lastErr != null) throw lastErr;
        }

        public static bool UpdateConfigBatch(string baseDir, PluginManifest manifest, Dictionary<string, object> entries)
        {
            if (entries == null || entries.Count == 0) return false;
            Dictionary<string, object> validPatch = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, object> kv in entries)
            {
                if (ValidateConfigEntry(manifest, kv.Key, kv.Value))
                {
                    validPatch[kv.Key] = kv.Value;
                }
            }
            if (validPatch.Count == 0) return false;

            Dictionary<string, object> reconciledPatch = ReconcileConfigAliases(validPatch);
            Dictionary<string, object> next = ReadConfig(baseDir, manifest);
            foreach (KeyValuePair<string, object> kv in reconciledPatch)
            {
                next[kv.Key] = kv.Value;
            }
            AtomicWriteJson(Path.Combine(baseDir, "config.json"), next);
            return true;
        }

        public static bool UpdateConfigSetting(string baseDir, PluginManifest manifest, string key, object value)
        {
            Dictionary<string, object> single = new Dictionary<string, object>(StringComparer.Ordinal);
            single[key] = value;
            return UpdateConfigBatch(baseDir, manifest, single);
        }

        public static string GetDefaultNativePluginDir()
        {
            string envOverride = Environment.GetEnvironmentVariable("AG_PRISM_PLUGIN_DIR");
            if (!string.IsNullOrEmpty(envOverride) && !string.IsNullOrEmpty(envOverride.Trim()))
            {
                return Path.GetFullPath(envOverride.Trim()).TrimEnd('\\', '/');
            }
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(home))
            {
                home = Environment.GetEnvironmentVariable("USERPROFILE");
            }
            if (string.IsNullOrEmpty(home))
            {
                string hd = Environment.GetEnvironmentVariable("HOMEDRIVE");
                string hp = Environment.GetEnvironmentVariable("HOMEPATH");
                if (!string.IsNullOrEmpty(hd) && !string.IsNullOrEmpty(hp))
                {
                    home = hd + hp;
                }
            }
            return Path.Combine(home ?? "", ".gemini", "config", "plugins", "obsidian-prism");
        }

        public static int? ReadNativeDaemonPid(string pluginDir)
        {
            if (string.IsNullOrEmpty(pluginDir)) return null;
            try
            {
                string pidPath = Path.Combine(pluginDir, ".daemon.pid");
                if (!File.Exists(pidPath)) return null;
                string raw = File.ReadAllText(pidPath, Encoding.UTF8).Trim();
                if (string.IsNullOrEmpty(raw)) return null;
                int plainPid;
                if (int.TryParse(raw, out plainPid) && plainPid > 0) return plainPid;
                if (raw.StartsWith("{", StringComparison.Ordinal))
                {
                    Dictionary<string, object> obj = MiniJson.ParseObject(raw);
                    object pidVal;
                    if (obj != null && obj.TryGetValue("pid", out pidVal) && pidVal != null)
                    {
                        int parsed = Convert.ToInt32(pidVal);
                        if (parsed > 0) return parsed;
                    }
                }
            }
            catch { }
            return null;
        }

        private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        private const int ProcessCommandLineInformation = 60;
        private const int ERROR_ACCESS_DENIED = 5;
        private const int ERROR_INVALID_PARAMETER = 87;
        private const int STATUS_ACCESS_DENIED = unchecked((int)0xC0000022);
        private const int STATUS_PRIVILEGE_NOT_HELD = unchecked((int)0xC0000061);
        private const int STATUS_PROCESS_IS_TERMINATING = unchecked((int)0xC000010A);

        [StructLayout(LayoutKind.Sequential)]
        private struct UNICODE_STRING
        {
            public ushort Length;
            public ushort MaximumLength;
            public IntPtr Buffer;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const uint MOVEFILE_REPLACE_EXISTING = 0x00000001;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool MoveFileExW(string lpExistingFileName, string lpNewFileName, uint dwFlags);

        public static void AtomicReplaceFile(string sourceTempPath, string destPath)
        {
            if (string.IsNullOrEmpty(sourceTempPath) || string.IsNullOrEmpty(destPath))
            {
                throw new ArgumentException("Source or destination path is empty");
            }
            if (!MoveFileExW(sourceTempPath, destPath, MOVEFILE_REPLACE_EXISTING))
            {
                int err = Marshal.GetLastWin32Error();
                if (err == ERROR_ACCESS_DENIED)
                {
                    throw new UnauthorizedAccessException("Access denied replacing file (Win32 error 5): " + destPath);
                }
                throw new IOException(
                    "Failed to atomically replace file (Win32 error " + err + "): " + destPath,
                    Marshal.GetHRForLastWin32Error()
                );
            }
        }

        [DllImport("ntdll.dll")]
        private static extern int NtQueryInformationProcess(
            IntPtr processHandle,
            int processInformationClass,
            IntPtr processInformation,
            int processInformationLength,
            out int returnLength
        );

        private static readonly object _daemonCacheLock = new object();
        private static int _verifiedDaemonPid = 0;
        private static long _verifiedStartTicks = 0L;

        public static string QueryProcessCommandLineFast(int pid, out bool accessDenied)
        {
            bool notFound;
            return QueryProcessCommandLineFast(pid, out accessDenied, out notFound);
        }

        private static string QueryProcessCommandLineFast(int pid, out bool accessDenied, out bool notFound)
        {
            accessDenied = false;
            notFound = false;
            if (pid <= 0)
            {
                notFound = true;
                return "";
            }
            IntPtr hProc = IntPtr.Zero;
            IntPtr buf = IntPtr.Zero;
            try
            {
                hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
                if (hProc == IntPtr.Zero)
                {
                    int lastErr = Marshal.GetLastWin32Error();
                    if (lastErr == ERROR_ACCESS_DENIED)
                    {
                        accessDenied = true;
                    }
                    else if (lastErr == ERROR_INVALID_PARAMETER)
                    {
                        notFound = true;
                    }
                    return "";
                }
                int allocSize = 2048;
                buf = Marshal.AllocHGlobal(allocSize);
                int reqLen = 0;
                int status = NtQueryInformationProcess(hProc, ProcessCommandLineInformation, buf, allocSize, out reqLen);
                if (status != 0 && reqLen > allocSize && reqLen <= 262144)
                {
                    Marshal.FreeHGlobal(buf);
                    allocSize = reqLen + 64;
                    buf = Marshal.AllocHGlobal(allocSize);
                    status = NtQueryInformationProcess(hProc, ProcessCommandLineInformation, buf, allocSize, out reqLen);
                }
                if (status == 0)
                {
                    UNICODE_STRING us = (UNICODE_STRING)Marshal.PtrToStructure(buf, typeof(UNICODE_STRING));
                    if (us.Buffer != IntPtr.Zero && us.Length > 0 && (us.Length % 2) == 0)
                    {
                        long bufStart = buf.ToInt64();
                        long bufEnd = bufStart + allocSize;
                        long strStart = us.Buffer.ToInt64();
                        long strEnd = strStart + us.Length;
                        if (strStart >= bufStart && strEnd <= bufEnd)
                        {
                            return Marshal.PtrToStringUni(us.Buffer, us.Length / 2) ?? "";
                        }
                    }
                }
                else if (status == STATUS_ACCESS_DENIED || status == STATUS_PRIVILEGE_NOT_HELD)
                {
                    accessDenied = true;
                }
                else if (status == STATUS_PROCESS_IS_TERMINATING)
                {
                    notFound = true;
                }
            }
            catch { }
            finally
            {
                if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf);
                if (hProc != IntPtr.Zero) CloseHandle(hProc);
            }
            return "";
        }

        private static string QueryWindowsProcessCommandLine(int pid)
        {
            bool accessDenied;
            return QueryWindowsProcessCommandLine(pid, true, out accessDenied);
        }

        public static string QueryWindowsProcessCommandLine(int pid, bool allowRetry, out bool accessDenied)
        {
            accessDenied = false;
            if (pid <= 0) return "";
            // 纯 Win32 PEB 通道：遇 ACCESS_DENIED 或进程已退出立即返回；仅对瞬态空串执行有界极短退避重试（零外部进程、零 WMI）
            int maxAttempts = 2;
            int retryDelayMs = allowRetry ? 50 : 25;
            for (int attempt = 0; attempt < maxAttempts; attempt++)
            {
                bool denied;
                bool notFound;
                string fastCmd = (QueryProcessCommandLineFast(pid, out denied, out notFound) ?? "").Trim();
                if (!string.IsNullOrEmpty(fastCmd)) return fastCmd;
                if (denied)
                {
                    accessDenied = true;
                    return "";
                }
                if (notFound)
                {
                    return "";
                }
                if (attempt == 0)
                {
                    if (allowRetry)
                    {
                        try
                        {
                            using (Process checkProc = Process.GetProcessById(pid))
                            {
                                if (checkProc.HasExited) return "";
                            }
                        }
                        catch (Win32Exception wex)
                        {
                            if (wex.NativeErrorCode == ERROR_ACCESS_DENIED)
                            {
                                accessDenied = true;
                            }
                            return "";
                        }
                        catch
                        {
                            return "";
                        }
                    }
                    try { Thread.Sleep(retryDelayMs); } catch { }
                }
            }
            return "";
        }

        private static bool MatchesNativeLockFilePid(int pid, string pluginDir, bool requireToken = false)
        {
            if (pid <= 0) return false;
            List<string> dirs = new List<string>();
            if (!string.IsNullOrEmpty(pluginDir)) dirs.Add(pluginDir);
            string defDir = GetDefaultNativePluginDir();
            if (!string.IsNullOrEmpty(defDir) && !dirs.Contains(defDir)) dirs.Add(defDir);
            for (int d = 0; d < dirs.Count; d++)
            {
                try
                {
                    string pidPath = Path.Combine(dirs[d], ".daemon.pid");
                    if (!File.Exists(pidPath) || IsUnsafeReparsePoint(pidPath)) continue;
                    string raw = File.ReadAllText(pidPath, Encoding.UTF8).Trim();
                    if (string.IsNullOrEmpty(raw)) continue;
                    int plainPid;
                    if (!requireToken && int.TryParse(raw, out plainPid) && plainPid == pid) return true;
                    if (raw.StartsWith("{", StringComparison.Ordinal))
                    {
                        Dictionary<string, object> obj = MiniJson.ParseObject(raw);
                        object pidVal;
                        if (obj != null && obj.TryGetValue("pid", out pidVal) && pidVal != null && Convert.ToInt32(pidVal) == pid)
                        {
                            if (!requireToken) return true;
                            object tokVal;
                            if (obj.TryGetValue("token", out tokVal) && tokVal is string && !string.IsNullOrEmpty(((string)tokVal).Trim()))
                            {
                                return true;
                            }
                        }
                    }
                }
                catch { }
            }
            return false;
        }

        public static bool IsExpectedPrismDaemonProcess(Process proc, string pluginDir = null)
        {
            if (proc == null) return false;
            try
            {
                string name = (proc.ProcessName ?? "").ToLowerInvariant();
                if (string.IsNullOrEmpty(name)) return false;
                if (name == "obsidian-prism-watcher" ||
                    name.Contains("obsidian-prism") ||
                    name.Contains("agy-claude-style"))
                {
                    return true;
                }
                if (name.Contains("node") || name.Contains("watcher"))
                {
                    bool accessDenied;
                    string cmd = (QueryWindowsProcessCommandLine(proc.Id, false, out accessDenied) ?? "")
                        .Replace('\\', '/')
                        .ToLowerInvariant();
                    if (string.IsNullOrEmpty(cmd))
                    {
                        if (!accessDenied && MatchesNativeLockFilePid(proc.Id, pluginDir, true))
                        {
                            try
                            {
                                if (proc.MainWindowHandle == IntPtr.Zero)
                                {
                                    string modFile = Path.GetFileName(proc.MainModule.FileName ?? "");
                                    if (string.Equals(modFile, "node.exe", StringComparison.OrdinalIgnoreCase))
                                    {
                                        return true;
                                    }
                                }
                            }
                            catch { }
                        }
                        return false;
                    }
                    if (cmd.Contains("obsidian-prism") ||
                        cmd.Contains("antigravity-prism") ||
                        cmd.Contains("agy-claude-style") ||
                        cmd.Contains("sidecars/daemon/main.mjs") ||
                        cmd.Contains("daemon/main.mjs") ||
                        cmd.Contains("watch.js"))
                    {
                        return true;
                    }
                    if (!string.IsNullOrEmpty(pluginDir))
                    {
                        string normPlugin = pluginDir.Replace('\\', '/').TrimEnd('/').ToLowerInvariant();
                        if (!string.IsNullOrEmpty(normPlugin) && cmd.Contains(normPlugin))
                        {
                            return true;
                        }
                    }
                    return false;
                }
                if (name.Contains("antigravity") || name.Contains("electron") || name == "agy")
                {
                    bool matchedLock = MatchesNativeLockFilePid(proc.Id, pluginDir);
                    bool accessDenied;
                    string cmd = (QueryWindowsProcessCommandLine(proc.Id, true, out accessDenied) ?? "").Replace('\\', '/').ToLowerInvariant();
                    if (string.IsNullOrEmpty(cmd))
                    {
                        if (!accessDenied && MatchesNativeLockFilePid(proc.Id, pluginDir, true))
                        {
                            try
                            {
                                if (proc.MainWindowHandle == IntPtr.Zero)
                                {
                                    string modFile = Path.GetFileName(proc.MainModule.FileName ?? "");
                                    if (string.Equals(modFile, "Antigravity.exe", StringComparison.OrdinalIgnoreCase) ||
                                        string.Equals(modFile, "electron.exe", StringComparison.OrdinalIgnoreCase) ||
                                        string.Equals(modFile, "agy.exe", StringComparison.OrdinalIgnoreCase))
                                    {
                                        return true;
                                    }
                                }
                            }
                            catch { }
                        }
                        return false;
                    }
                    if (cmd.Contains("--type=")) return false;
                    bool hasPrismOwner = cmd.Contains("obsidian-prism") || cmd.Contains("antigravity-prism") || cmd.Contains("agy-claude-style");
                    if (!hasPrismOwner && !string.IsNullOrEmpty(pluginDir))
                    {
                        string normPlugin = pluginDir.Replace('\\', '/').TrimEnd('/').ToLowerInvariant();
                        if (!string.IsNullOrEmpty(normPlugin) && cmd.Contains(normPlugin)) hasPrismOwner = true;
                    }
                    bool hasDaemonEntry = cmd.Contains("sidecars/daemon/main.mjs") || cmd.Contains("/daemon/main.mjs") || cmd.Contains("/watch.js");
                    if ((hasPrismOwner || matchedLock) && hasDaemonEntry) return true;
                    if (matchedLock && cmd.Contains("sidecar_sdk/register_loader.js") && cmd.Contains("main.mjs")) return true;
                    return false;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        public static string ResolveHostGeminiConfigDir(string pluginDir)
        {
            string envDir = Environment.GetEnvironmentVariable("AG_PRISM_GEMINI_CONFIG_DIR");
            if (!string.IsNullOrEmpty(envDir))
            {
                return Path.GetFullPath(envDir.Trim()).TrimEnd('\\', '/');
            }
            string defPlugin = Path.GetFullPath(GetDefaultNativePluginDir()).TrimEnd('\\', '/');
            string resolvedPlugin = string.IsNullOrEmpty(pluginDir) ? defPlugin : Path.GetFullPath(pluginDir).TrimEnd('\\', '/');
            if (string.Equals(resolvedPlugin, defPlugin, StringComparison.OrdinalIgnoreCase))
            {
                string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (string.IsNullOrEmpty(home)) home = Environment.GetEnvironmentVariable("USERPROFILE") ?? "";
                return Path.Combine(home, ".gemini", "config");
            }
            string parent = Path.GetDirectoryName(resolvedPlugin);
            if (!string.IsNullOrEmpty(parent) && string.Equals(Path.GetFileName(parent), "plugins", StringComparison.OrdinalIgnoreCase))
            {
                return Path.GetDirectoryName(parent);
            }
            return null;
        }

        public static bool SyncHostPluginRegistry(string pluginDir, bool enable)
        {
            string ignoredReason;
            return SyncHostPluginRegistry(pluginDir, enable, out ignoredReason);
        }

        public static bool SyncHostPluginRegistry(string pluginDir, bool enable, out string reason)
        {
            reason = null;
            string cfgDir = ResolveHostGeminiConfigDir(pluginDir);
            if (string.IsNullOrEmpty(cfgDir))
            {
                reason = InstallerI18n.Tr(
                    "未解析到宿主 .gemini/config 目录",
                    "Could not resolve host .gemini/config directory"
                );
                return false;
            }
            string cfgPath = Path.Combine(cfgDir, "config.json");
            try
            {
                string badDir;
                uint dirTag;
                if (HasUnsafeReparsePointInChain(cfgDir, out badDir, out dirTag))
                {
                    reason = InstallerI18n.TrFormat(
                        "宿主配置目录链路包含 {0}，已按安全策略跳过自动写入: {1}",
                        "Host config directory chain contains {0}; auto-write skipped by security policy: {1}",
                        DescribeReparseTag(dirTag),
                        badDir
                    );
                    return false;
                }
                uint cfgTag;
                if (IsUnsafeReparsePoint(cfgPath, out cfgTag))
                {
                    reason = InstallerI18n.TrFormat(
                        "宿主 config.json 为 {0}（如 dotfiles 软链接），已保护原链接未覆盖: {1}",
                        "Host config.json is a {0} (e.g. dotfiles symlink); original link preserved without overwriting: {1}",
                        DescribeReparseTag(cfgTag),
                        cfgPath
                    );
                    return false;
                }
                if (enable)
                {
                    Directory.CreateDirectory(cfgDir);
                    if (HasUnsafeReparsePointInChain(cfgDir, out badDir, out dirTag))
                    {
                        reason = InstallerI18n.TrFormat(
                            "宿主配置目录链路包含 {0}，已按安全策略跳过自动写入: {1}",
                            "Host config directory chain contains {0}; auto-write skipped by security policy: {1}",
                            DescribeReparseTag(dirTag),
                            badDir
                        );
                        return false;
                    }
                    if (IsUnsafeReparsePoint(cfgPath, out cfgTag))
                    {
                        reason = InstallerI18n.TrFormat(
                            "宿主 config.json 为 {0}（如 dotfiles 软链接），已保护原链接未覆盖: {1}",
                            "Host config.json is a {0} (e.g. dotfiles symlink); original link preserved without overwriting: {1}",
                            DescribeReparseTag(cfgTag),
                            cfgPath
                        );
                        return false;
                    }
                    Dictionary<string, object> rootObj = new Dictionary<string, object>(StringComparer.Ordinal);
                    if (File.Exists(cfgPath))
                    {
                        string raw = File.ReadAllText(cfgPath, Encoding.UTF8).TrimStart('\uFEFF').Trim();
                        if (raw.Length > 0)
                        {
                            Dictionary<string, object> parsed = MiniJson.ParseObject(raw);
                            if (parsed == null)
                            {
                                reason = InstallerI18n.Tr(
                                    "宿主 config.json JSON 格式异常，已保护原文件未覆盖",
                                    "Host config.json has invalid JSON syntax; original file preserved without overwriting"
                                );
                                return false;
                            }
                            rootObj = parsed;
                        }
                    }
                    Dictionary<string, object> pluginsObj = null;
                    object existingPlugins;
                    if (rootObj.TryGetValue("plugins", out existingPlugins) && existingPlugins is Dictionary<string, object>)
                    {
                        pluginsObj = (Dictionary<string, object>)existingPlugins;
                    }
                    else
                    {
                        pluginsObj = new Dictionary<string, object>(StringComparer.Ordinal);
                        rootObj["plugins"] = pluginsObj;
                    }
                    Dictionary<string, object> entryObj = null;
                    object existingEntry;
                    if (pluginsObj.TryGetValue("obsidian-prism", out existingEntry) && existingEntry is Dictionary<string, object>)
                    {
                        entryObj = (Dictionary<string, object>)existingEntry;
                    }
                    else
                    {
                        entryObj = new Dictionary<string, object>(StringComparer.Ordinal);
                    }
                    entryObj["enabled"] = true;
                    pluginsObj["obsidian-prism"] = entryObj;
                    if (pluginsObj.ContainsKey("antigravity-prism"))
                    {
                        pluginsObj.Remove("antigravity-prism");
                    }
                    AtomicWriteJson(cfgPath, rootObj);
                    return true;
                }

                if (File.Exists(cfgPath))
                {
                    string raw = File.ReadAllText(cfgPath, Encoding.UTF8).TrimStart('\uFEFF').Trim();
                    if (raw.Length > 0)
                    {
                        Dictionary<string, object> parsed = MiniJson.ParseObject(raw);
                        if (parsed != null)
                        {
                            bool changed = false;
                            object pVal;
                            if (parsed.TryGetValue("plugins", out pVal) && pVal is Dictionary<string, object>)
                            {
                                Dictionary<string, object> pDict = (Dictionary<string, object>)pVal;
                                if (pDict.Remove("obsidian-prism")) changed = true;
                                if (pDict.Remove("antigravity-prism")) changed = true;
                            }
                            object sVal;
                            if (parsed.TryGetValue("sidecars", out sVal) && sVal is Dictionary<string, object>)
                            {
                                Dictionary<string, object> sDict = (Dictionary<string, object>)sVal;
                                if (sDict.Remove("obsidian-prism/daemon")) changed = true;
                            }
                            if (changed)
                            {
                                AtomicWriteJson(cfgPath, parsed);
                            }
                        }
                    }
                }
                string cacheFile = Path.Combine(cfgDir, "obsidian-prism-thought-cache.json");
                if (!IsUnsafeReparsePoint(cacheFile) && File.Exists(cacheFile))
                {
                    try
                    {
                        ClearReadOnlyAndHiddenAttributes(cacheFile);
                        File.Delete(cacheFile);
                    }
                    catch { }
                }
                return true;
            }
            catch (Exception ex)
            {
                reason = ex.GetType().Name + ": " + ex.Message;
                return false;
            }
        }

        private static bool IsAntigravityRegistryDisplayName(string disp)
        {
            if (string.IsNullOrEmpty(disp)) return false;
            if (disp.IndexOf("IDE", StringComparison.OrdinalIgnoreCase) >= 0) return false;
            if (disp.IndexOf("Tools", StringComparison.OrdinalIgnoreCase) >= 0) return false;
            return disp.StartsWith("Antigravity", StringComparison.OrdinalIgnoreCase) ||
                   disp.StartsWith("Google Antigravity", StringComparison.OrdinalIgnoreCase);
        }

        private static string TryProbeAntigravityDirCandidate(string dir)
        {
            if (string.IsNullOrEmpty(dir)) return null;
            string cleaned = dir.Trim().Trim('"');
            if (string.IsNullOrEmpty(cleaned)) return null;
            try
            {
                string cand = Path.Combine(cleaned, "Antigravity.exe");
                return File.Exists(cand) ? cand : null;
            }
            catch
            {
                return null;
            }
        }

        private static string TryProbeAntigravityFromCommand(string cmd)
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
                if (string.Equals(Path.GetFileName(pathPart), "Antigravity.exe", StringComparison.OrdinalIgnoreCase) &&
                    File.Exists(pathPart))
                {
                    return pathPart;
                }
                return TryProbeAntigravityDirCandidate(Path.GetDirectoryName(pathPart));
            }
            catch
            {
                return null;
            }
        }

        public static string FindAntigravityExecutable(string preferredExe = null)
        {
            string envExe = Environment.GetEnvironmentVariable("AG_PRISM_ELECTRON_EXE");
            if (!string.IsNullOrEmpty(envExe) && File.Exists(envExe.Trim())) return envExe.Trim();
            if (!string.IsNullOrEmpty(preferredExe) && File.Exists(preferredExe)) return preferredExe;

            string runningExe = null;
            try
            {
                Process[] procs = Process.GetProcessesByName("Antigravity");
                for (int i = 0; i < procs.Length; i++)
                {
                    try
                    {
                        if (runningExe == null)
                        {
                            string p = procs[i].MainModule.FileName;
                            if (!string.IsNullOrEmpty(p) && File.Exists(p)) runningExe = p;
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
            if (!string.IsNullOrEmpty(runningExe)) return runningExe;

            string localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            if (string.IsNullOrEmpty(localAppData))
            {
                localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            }
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(userProfile))
            {
                userProfile = Environment.GetEnvironmentVariable("USERPROFILE");
            }
            string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string progFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string[] candidates = new string[]
            {
                !string.IsNullOrEmpty(localAppData) ? Path.Combine(localAppData, "Programs", "antigravity", "Antigravity.exe") : null,
                !string.IsNullOrEmpty(localAppData) ? Path.Combine(localAppData, "Antigravity", "Antigravity.exe") : null,
                !string.IsNullOrEmpty(progFiles) ? Path.Combine(progFiles, "Antigravity", "Antigravity.exe") : null,
                !string.IsNullOrEmpty(progFilesX86) ? Path.Combine(progFilesX86, "Antigravity", "Antigravity.exe") : null,
                !string.IsNullOrEmpty(userProfile) ? Path.Combine(userProfile, "scoop", "apps", "antigravity", "current", "Antigravity.exe") : null
            };
            for (int i = 0; i < candidates.Length; i++)
            {
                if (!string.IsNullOrEmpty(candidates[i]) && File.Exists(candidates[i])) return candidates[i];
            }

            try
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
                                            if (!IsAntigravityRegistryDisplayName(disp)) continue;

                                            string exe = TryProbeAntigravityDirCandidate(item.GetValue("InstallLocation") as string);
                                            if (exe != null) return exe;

                                            exe = TryProbeAntigravityFromCommand(item.GetValue("UninstallString") as string);
                                            if (exe != null) return exe;

                                            exe = TryProbeAntigravityFromCommand(item.GetValue("DisplayIcon") as string);
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
            }
            catch { }

            if (!IsTestSandboxEnvironment(null))
            {
                string fromShortcut = TryFindAntigravityExeFromShortcuts();
                if (!string.IsNullOrEmpty(fromShortcut)) return fromShortcut;
            }
            return null;
        }

        private static string TryFindAntigravityExeFromShortcuts()
        {
            try
            {
                List<string> dirs = GetShortcutCandidateDirs(null, null);
                if (dirs.Count == 0) return null;
                List<string> lnks = new List<string>();
                for (int i = 0; i < dirs.Count; i++)
                {
                    CollectLnkFilesBounded(dirs[i], 0, lnks);
                }
                if (lnks.Count == 0) return null;
                for (int i = 0; i < lnks.Count; i++)
                {
                    try
                    {
                        WindowsLnkInfo info = WindowsLnkCodec.ReadFile(lnks[i]);
                        if (info == null) continue;
                        string trimmed = (info.TargetPath ?? "").Trim().Trim('"');
                        if (!string.IsNullOrEmpty(trimmed) &&
                            string.Equals(Path.GetFileName(trimmed), "Antigravity.exe", StringComparison.OrdinalIgnoreCase) &&
                            File.Exists(trimmed))
                        {
                            return trimmed;
                        }
                    }
                    catch { }
                }
            }
            catch { }
            return null;
        }

        public static string FindFallbackNodeExecutable()
        {
            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            string[] parts = pathEnv.Split(new char[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                try
                {
                    string cand = Path.Combine(parts[i].Trim().Trim('"'), "node.exe");
                    if (File.Exists(cand)) return cand;
                }
                catch { }
            }
            string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            List<string> extra = new List<string>();
            if (!string.IsNullOrEmpty(progFiles)) extra.Add(Path.Combine(progFiles, "nodejs", "node.exe"));
            if (!string.IsNullOrEmpty(localAppData)) extra.Add(Path.Combine(localAppData, "Volta", "bin", "node.exe"));
            if (!string.IsNullOrEmpty(localAppData)) extra.Add(Path.Combine(localAppData, "Programs", "nodejs", "node.exe"));
            for (int i = 0; i < extra.Count; i++)
            {
                if (File.Exists(extra[i])) return extra[i];
            }
            if (!string.IsNullOrEmpty(appData))
            {
                string nvmRoot = Path.Combine(appData, "nvm");
                if (Directory.Exists(nvmRoot))
                {
                    try
                    {
                        string[] dirs = Directory.GetDirectories(nvmRoot, "v*");
                        Array.Sort(dirs, StringComparer.OrdinalIgnoreCase);
                        for (int i = dirs.Length - 1; i >= 0; i--)
                        {
                            string cand = Path.Combine(dirs[i], "node.exe");
                            if (File.Exists(cand)) return cand;
                        }
                    }
                    catch { }
                }
            }
            return null;
        }

        public static bool EnsureNativeDaemonRunning(string pluginDir, int? cdpPort = null, string preferredAgExe = null, Action<string> log = null)
        {
            if (string.Equals(Environment.GetEnvironmentVariable("AG_PRISM_NO_NATIVE_DAEMON"), "1", StringComparison.Ordinal))
            {
                return false;
            }
            if (string.IsNullOrEmpty(pluginDir)) return false;
            string mainMjs = Path.Combine(pluginDir, Path.Combine("sidecars", Path.Combine("daemon", "main.mjs")));
            if (!File.Exists(mainMjs)) return false;
            if (IsNativeDaemonAlive(pluginDir)) return true;

            string runtimeExe = FindAntigravityExecutable(preferredAgExe);
            bool useElectronAsNode = !string.IsNullOrEmpty(runtimeExe);
            if (!useElectronAsNode)
            {
                runtimeExe = FindFallbackNodeExecutable();
            }
            if (string.IsNullOrEmpty(runtimeExe) || !File.Exists(runtimeExe))
            {
                return false;
            }

            try
            {
                string args = "\"" + mainMjs + "\" --root \"" + pluginDir.TrimEnd('\\', '/') + "\"";
                if (cdpPort.HasValue && cdpPort.Value > 0)
                {
                    args += " --port " + cdpPort.Value;
                }
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = runtimeExe;
                psi.Arguments = args;
                psi.WorkingDirectory = Path.GetDirectoryName(mainMjs);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                if (useElectronAsNode)
                {
                    psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
                }
                Process started = Process.Start(psi);
                if (started == null) return false;

                for (int i = 0; i < 25; i++)
                {
                    if (IsNativeDaemonAlive(pluginDir))
                    {
                        if (log != null)
                        {
                            log(InstallerI18n.TrFormat(
                                "[✓] 已拉起原生五通道 Sidecar Daemon ({0})",
                                "[✓] Started native 5-channel Sidecar Daemon ({0})",
                                useElectronAsNode ? "ELECTRON_RUN_AS_NODE=1" : "node"
                            ));
                        }
                        return true;
                    }
                    try
                    {
                        if (started.HasExited) break;
                    }
                    catch { }
                    Thread.Sleep(120);
                }
                return IsNativeDaemonAlive(pluginDir);
            }
            catch
            {
                return false;
            }
        }

        private static void RemoveStaleDaemonLockIfMatches(string pluginDir, int stalePid)
        {
            if (string.IsNullOrEmpty(pluginDir) || stalePid <= 0) return;
            try
            {
                if (ReadNativeDaemonPid(pluginDir) == stalePid)
                {
                    string pidPath = Path.Combine(pluginDir, ".daemon.pid");
                    if (File.Exists(pidPath)) File.Delete(pidPath);
                }
            }
            catch { }
        }

        public static bool IsNativeDaemonAlive(string pluginDir)
        {
            int? pid = ReadNativeDaemonPid(pluginDir);
            if (!pid.HasValue || pid.Value <= 0) return false;
            Process proc = null;
            try
            {
                proc = Process.GetProcessById(pid.Value);
                if (proc.HasExited)
                {
                    lock (_daemonCacheLock)
                    {
                        if (_verifiedDaemonPid == pid.Value)
                        {
                            _verifiedDaemonPid = 0;
                            _verifiedStartTicks = 0L;
                        }
                    }
                    RemoveStaleDaemonLockIfMatches(pluginDir, pid.Value);
                    return false;
                }
                long procStartTicks = 0L;
                try { procStartTicks = proc.StartTime.ToUniversalTime().Ticks; } catch { procStartTicks = 0L; }
                lock (_daemonCacheLock)
                {
                    if (_verifiedDaemonPid == pid.Value && _verifiedStartTicks == procStartTicks)
                    {
                        return true;
                    }
                }
                if (IsExpectedPrismDaemonProcess(proc, pluginDir))
                {
                    lock (_daemonCacheLock)
                    {
                        _verifiedDaemonPid = pid.Value;
                        _verifiedStartTicks = procStartTicks;
                    }
                    return true;
                }
                RemoveStaleDaemonLockIfMatches(pluginDir, pid.Value);
                return false;
            }
            catch
            {
                lock (_daemonCacheLock)
                {
                    if (_verifiedDaemonPid == pid.Value)
                    {
                        _verifiedDaemonPid = 0;
                        _verifiedStartTicks = 0L;
                    }
                }
                RemoveStaleDaemonLockIfMatches(pluginDir, pid.Value);
                return false;
            }
            finally
            {
                if (proc != null)
                {
                    try { proc.Dispose(); } catch { }
                }
            }
        }

        public const string CdpOptInFlag = "--remote-debugging-port=0";
        private const uint MB_YESNO = 0x00000004;
        private const uint MB_ICONQUESTION = 0x00000020;
        private const uint MB_SETFOREGROUND = 0x00010000;
        private const int IDYES = 6;

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int MessageBoxW(IntPtr hWnd, string lpText, string lpCaption, uint uType);

        private static long NowEpochMs()
        {
            DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            return (long)(DateTime.UtcNow - epoch).TotalMilliseconds;
        }

        private static long ProcessStartEpochMs(Process proc)
        {
            try
            {
                DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
                return (long)(proc.StartTime.ToUniversalTime() - epoch).TotalMilliseconds;
            }
            catch
            {
                return 0L;
            }
        }

        public static bool IsTestSandboxEnvironment(string installDir = null)
        {
            string disable1 = Environment.GetEnvironmentVariable("PRISM_DISABLE_SHORTCUT_SYNC");
            string disable2 = Environment.GetEnvironmentVariable("AG_PRISM_DISABLE_SHORTCUT_SYNC");
            if (disable1 == "1" || disable2 == "1") return true;
            string nodeEnv = Environment.GetEnvironmentVariable("NODE_ENV");
            if (string.Equals(nodeEnv, "test", StringComparison.OrdinalIgnoreCase)) return true;
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("NODE_TEST_CONTEXT"))) return true;
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AG_PRISM_GEMINI_CONFIG_DIR"))) return true;
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("AG_PRISM_ELECTRON_EXE"))) return true;
            if (!string.IsNullOrEmpty(installDir))
            {
                try
                {
                    string normInst = Path.GetFullPath(installDir).TrimEnd('\\', '/');
                    string normTemp = Path.GetFullPath(Path.GetTempPath()).TrimEnd('\\', '/');
                    if (!string.IsNullOrEmpty(normTemp) &&
                        (string.Equals(normInst, normTemp, StringComparison.OrdinalIgnoreCase) ||
                         normInst.StartsWith(normTemp + "\\", StringComparison.OrdinalIgnoreCase)))
                    {
                        return true;
                    }
                }
                catch { }
            }
            return false;
        }

        public static List<string> GetShortcutCandidateDirs(string installDir, string defaultInstallDir)
        {
            List<string> dirs = new List<string>();
            string envDirs = Environment.GetEnvironmentVariable("AG_PRISM_SHORTCUT_DIRS");
            if (!string.IsNullOrEmpty(envDirs))
            {
                string trimmedEnv = envDirs.Trim();
                if (string.Equals(trimmedEnv, "none", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(trimmedEnv, "off", StringComparison.OrdinalIgnoreCase))
                {
                    return dirs;
                }
                string[] parts = trimmedEnv.Split(new char[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < parts.Length; i++)
                {
                    string d = parts[i].Trim();
                    if (!string.IsNullOrEmpty(d) && Directory.Exists(d) && !dirs.Contains(d)) dirs.Add(d);
                }
                return dirs;
            }

            // 严格隔离自动化测试与临时沙盒目录，避免触碰真实桌面快捷方式；
            // 允许真实用户在非默认目录安装时正常修补快捷方式。
            if (IsTestSandboxEnvironment(installDir))
            {
                return dirs;
            }

            string userDesktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrEmpty(userProfile))
            {
                userProfile = Environment.GetEnvironmentVariable("USERPROFILE");
            }
            string profileDesktop = !string.IsNullOrEmpty(userProfile) ? Path.Combine(userProfile, "Desktop") : null;
            string userStartMenu = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
            string userPrograms = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string quickLaunch = !string.IsNullOrEmpty(appData)
                ? Path.Combine(appData, @"Microsoft\Internet Explorer\Quick Launch")
                : null;
            string taskbarPinned = !string.IsNullOrEmpty(appData)
                ? Path.Combine(appData, @"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar")
                : null;
            string startMenuPinned = !string.IsNullOrEmpty(appData)
                ? Path.Combine(appData, @"Microsoft\Internet Explorer\Quick Launch\User Pinned\StartMenu")
                : null;
            string implicitPinned = !string.IsNullOrEmpty(appData)
                ? Path.Combine(appData, @"Microsoft\Internet Explorer\Quick Launch\User Pinned\ImplicitAppShortcuts")
                : null;
            string commonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
            string commonStartMenu = Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu);
            string commonPrograms = Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms);

            string[] raw = new string[]
            {
                userDesktop,
                profileDesktop,
                userStartMenu,
                userPrograms,
                quickLaunch,
                taskbarPinned,
                startMenuPinned,
                implicitPinned,
                commonDesktop,
                commonStartMenu,
                commonPrograms
            };
            HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < raw.Length; i++)
            {
                if (string.IsNullOrEmpty(raw[i])) continue;
                try
                {
                    if (!Directory.Exists(raw[i])) continue;
                    string norm = Path.GetFullPath(raw[i]).TrimEnd('\\', '/');
                    if (seen.Add(norm))
                    {
                        dirs.Add(raw[i]);
                    }
                }
                catch { }
            }
            return dirs;
        }

        private static void CollectLnkFilesBounded(string dir, int depth, List<string> outFiles)
        {
            if (depth > 3 || string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return;
            try
            {
                string[] lnks = Directory.GetFiles(dir, "*.lnk", SearchOption.TopDirectoryOnly);
                for (int i = 0; i < lnks.Length; i++)
                {
                    outFiles.Add(lnks[i]);
                }
            }
            catch { }
            if (depth >= 3) return;
            try
            {
                string[] subs = Directory.GetDirectories(dir);
                for (int i = 0; i < subs.Length; i++)
                {
                    if (IsUnsafeReparsePoint(subs[i])) continue;
                    CollectLnkFilesBounded(subs[i], depth + 1, outFiles);
                }
            }
            catch { }
        }

        private static List<string> ReadPatchedShortcutsRecord(string stateDir)
        {
            List<string> list = new List<string>();
            if (string.IsNullOrEmpty(stateDir)) return list;
            try
            {
                string recPath = Path.Combine(stateDir, ".patched-shortcuts.json");
                if (!File.Exists(recPath)) return list;
                Dictionary<string, object> obj = MiniJson.ParseObject(File.ReadAllText(recPath, Encoding.UTF8));
                object arrObj;
                if (obj != null && obj.TryGetValue("patchedPaths", out arrObj) && arrObj is List<object>)
                {
                    List<object> rawList = (List<object>)arrObj;
                    for (int i = 0; i < rawList.Count; i++)
                    {
                        string p = rawList[i] as string;
                        if (!string.IsNullOrEmpty(p)) list.Add(p);
                    }
                }
            }
            catch { }
            return list;
        }

        private static void WritePatchedShortcutsRecord(string stateDir, List<string> paths)
        {
            if (string.IsNullOrEmpty(stateDir)) return;
            try
            {
                Directory.CreateDirectory(stateDir);
                string recPath = Path.Combine(stateDir, ".patched-shortcuts.json");
                List<object> arr = new List<object>();
                HashSet<string> seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                for (int i = 0; i < paths.Count; i++)
                {
                    if (!string.IsNullOrEmpty(paths[i]) && seen.Add(paths[i]))
                    {
                        arr.Add(paths[i]);
                    }
                }
                Dictionary<string, object> root = new Dictionary<string, object>(StringComparer.Ordinal);
                root["patchedPaths"] = arr;
                root["updatedAt"] = NowEpochMs();
                AtomicWriteJson(recPath, root);
            }
            catch { }
        }

        public static int EnsureAntigravityShortcutsOptIn(
            string installDir,
            string defaultInstallDir,
            string stateDir,
            Action<string> log = null
        )
        {
            int skippedCount;
            int alreadySetCount;
            return EnsureAntigravityShortcutsOptIn(installDir, defaultInstallDir, stateDir, out skippedCount, out alreadySetCount, null, log);
        }

        public static int EnsureAntigravityShortcutsOptIn(
            string installDir,
            string defaultInstallDir,
            string stateDir,
            out int skippedCount,
            out int alreadySetCount,
            List<string> skippedPaths = null,
            Action<string> log = null
        )
        {
            skippedCount = 0;
            alreadySetCount = 0;
            List<string> rootDirs = GetShortcutCandidateDirs(installDir, defaultInstallDir);
            if (rootDirs.Count == 0) return 0;

            List<string> rawLnkFiles = new List<string>();
            for (int i = 0; i < rootDirs.Count; i++)
            {
                CollectLnkFilesBounded(rootDirs[i], 0, rawLnkFiles);
            }
            if (rawLnkFiles.Count == 0) return 0;

            HashSet<string> seenLnks = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            List<string> lnkFiles = new List<string>();
            for (int i = 0; i < rawLnkFiles.Count; i++)
            {
                string p = rawLnkFiles[i];
                if (!string.IsNullOrEmpty(p) && seenLnks.Add(p))
                {
                    lnkFiles.Add(p);
                }
            }
            if (lnkFiles.Count == 0) return 0;

            List<string> recorded = ReadPatchedShortcutsRecord(stateDir);
            List<string> localSkipped = skippedPaths ?? new List<string>();
            int patchedCount = 0;
            try
            {
                for (int i = 0; i < lnkFiles.Count; i++)
                {
                    string lnkPath = lnkFiles[i];
                    if (IsUnsafeReparsePoint(lnkPath)) continue;
                    bool matchedAntigravity = false;
                    try
                    {
                        WindowsLnkInfo info = WindowsLnkCodec.ReadFile(lnkPath);
                        if (info == null) continue;
                        string target = info.TargetPath ?? "";
                        string fileName = Path.GetFileName(target.Trim().Trim('"'));
                        if (!string.Equals(fileName, "Antigravity.exe", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }
                        matchedAntigravity = true;
                        string origArgs = info.Arguments ?? "";
                        if (origArgs.IndexOf("--remote-debugging-port", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            alreadySetCount++;
                            continue;
                        }
                        string nextArgs = string.IsNullOrEmpty(origArgs.Trim())
                            ? CdpOptInFlag
                            : (origArgs.TrimEnd() + " " + CdpOptInFlag);
                        // 仅对非符号链接的普通 .lnk 文件尝试清理只读属性后再以纯 MS-SHLLINK 写回；若位于受保护目录无权限或被锁定则记录告警继续
                        ClearReadOnlyAndHiddenAttributes(lnkPath);
                        WindowsLnkCodec.WriteArguments(lnkPath, nextArgs);
                        recorded.Add(lnkPath);
                        patchedCount++;
                    }
                    catch
                    {
                        if (matchedAntigravity ||
                            string.Equals(Path.GetFileName(lnkPath), "Antigravity.lnk", StringComparison.OrdinalIgnoreCase))
                        {
                            skippedCount++;
                            localSkipped.Add(lnkPath);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                if (log != null)
                {
                    log(InstallerI18n.TrFormat(
                        "[!] 快捷方式扫描异常（非致命，已跳过）: {0}",
                        "[!] Shortcut scan warning (non-fatal, skipped): {0}",
                        ex.Message
                    ));
                }
            }

            if (patchedCount > 0)
            {
                WritePatchedShortcutsRecord(stateDir, recorded);
                if (log != null)
                {
                    log(InstallerI18n.TrFormat(
                        "已自动维护 {0} 个 Antigravity 快捷方式开启 --remote-debugging-port=0",
                        "Updated {0} Antigravity shortcut(s) with --remote-debugging-port=0",
                        patchedCount
                    ));
                }
            }
            if (skippedCount > 0 && log != null)
            {
                log(InstallerI18n.TrFormat(
                    "[!] 已跳过 {0} 个受保护或只读的系统级 Antigravity 快捷方式（不影响安装，需提权或手动追加参数）: {1}",
                    "[!] Skipped {0} protected/read-only system Antigravity shortcut(s) (non-fatal; run as Administrator or append flag manually): {1}",
                    skippedCount,
                    localSkipped[0]
                ));
            }
            return patchedCount;
        }

        private static string StripOptInFlagFromArguments(string rawArgs)
        {
            if (string.IsNullOrEmpty(rawArgs)) return "";
            string[] tokens = rawArgs.Split(new char[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            List<string> kept = new List<string>();
            for (int i = 0; i < tokens.Length; i++)
            {
                string t = tokens[i];
                if (string.Equals(t, CdpOptInFlag, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(t, "\"--remote-debugging-port=0\"", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                kept.Add(t);
            }
            return string.Join(" ", kept.ToArray());
        }

        public static int RestoreAntigravityShortcutsOptIn(
            string installDir,
            string defaultInstallDir,
            string stateDir,
            Action<string> log = null
        )
        {
            HashSet<string> candidateLnks = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            List<string> rootDirs = GetShortcutCandidateDirs(installDir, defaultInstallDir);
            List<string> scanned = new List<string>();
            for (int i = 0; i < rootDirs.Count; i++)
            {
                CollectLnkFilesBounded(rootDirs[i], 0, scanned);
            }
            for (int i = 0; i < scanned.Count; i++) candidateLnks.Add(scanned[i]);

            string[] stateCandidates = new string[] { stateDir, installDir };
            for (int s = 0; s < stateCandidates.Length; s++)
            {
                List<string> rec = ReadPatchedShortcutsRecord(stateCandidates[s]);
                for (int i = 0; i < rec.Count; i++) candidateLnks.Add(rec[i]);
            }

            int restoredCount = 0;
            if (candidateLnks.Count > 0)
            {
                try
                {
                    foreach (string lnkPath in candidateLnks)
                    {
                        if (string.IsNullOrEmpty(lnkPath) || !File.Exists(lnkPath) || IsUnsafeReparsePoint(lnkPath)) continue;
                        try
                        {
                            WindowsLnkInfo info = WindowsLnkCodec.ReadFile(lnkPath);
                            if (info == null) continue;
                            string target = info.TargetPath ?? "";
                            string fileName = Path.GetFileName(target.Trim().Trim('"'));
                            if (!string.Equals(fileName, "Antigravity.exe", StringComparison.OrdinalIgnoreCase))
                            {
                                continue;
                            }
                            string origArgs = info.Arguments ?? "";
                            if (origArgs.IndexOf(CdpOptInFlag, StringComparison.OrdinalIgnoreCase) < 0)
                            {
                                continue;
                            }
                            string restoredArgs = StripOptInFlagFromArguments(origArgs);
                            ClearReadOnlyAndHiddenAttributes(lnkPath);
                            WindowsLnkCodec.WriteArguments(lnkPath, restoredArgs);
                            restoredCount++;
                        }
                        catch { }
                    }
                }
                catch { }
            }

            for (int s = 0; s < stateCandidates.Length; s++)
            {
                if (string.IsNullOrEmpty(stateCandidates[s])) continue;
                try
                {
                    string recFile = Path.Combine(stateCandidates[s], ".patched-shortcuts.json");
                    if (File.Exists(recFile)) File.Delete(recFile);
                }
                catch { }
            }

            if (restoredCount > 0 && log != null)
            {
                log(InstallerI18n.TrFormat(
                    "已还原 {0} 个 Antigravity 快捷方式启动参数",
                    "Restored launch arguments for {0} Antigravity shortcut(s)",
                    restoredCount
                ));
            }
            return restoredCount;
        }

        public static BareHostProcessInfo FindBareAntigravityMainProcess()
        {
            string mockPidEnv = Environment.GetEnvironmentVariable("AG_PRISM_MOCK_BARE_HOST_PID");
            int mockPid;
            if (!string.IsNullOrEmpty(mockPidEnv) && int.TryParse(mockPidEnv.Trim(), out mockPid) && mockPid > 0)
            {
                Process mp = null;
                try
                {
                    mp = Process.GetProcessById(mockPid);
                    if (!mp.HasExited)
                    {
                        long startMs = ProcessStartEpochMs(mp);
                        long uptimeMs = startMs > 0L ? Math.Max(0L, NowEpochMs() - startMs) : 10000L;
                        string mockUptimeEnv = Environment.GetEnvironmentVariable("AG_PRISM_MOCK_BARE_HOST_UPTIME_MS");
                        long forcedUptime;
                        if (!string.IsNullOrEmpty(mockUptimeEnv) && long.TryParse(mockUptimeEnv.Trim(), out forcedUptime))
                        {
                            uptimeMs = forcedUptime;
                        }
                        string exe = "";
                        try { exe = mp.MainModule.FileName; } catch { }
                        BareHostProcessInfo info = new BareHostProcessInfo();
                        info.Pid = mockPid;
                        info.ExePath = exe;
                        info.StartTimeMs = startMs;
                        info.UptimeMs = uptimeMs;
                        return info;
                    }
                }
                catch { }
                finally
                {
                    if (mp != null) { try { mp.Dispose(); } catch { } }
                }
                return null;
            }

            try
            {
                Process[] procs = Process.GetProcessesByName("Antigravity");
                BareHostProcessInfo candidate = null;
                BareHostProcessInfo windowFallbackCandidate = null;
                for (int i = 0; i < procs.Length; i++)
                {
                    Process p = procs[i];
                    try
                    {
                        bool exited = false;
                        try
                        {
                            exited = p.HasExited;
                        }
                        catch (Win32Exception wex)
                        {
                            // 权限不足（如管理员宿主进程）直接跳过，绝不误判为裸启
                            if (wex.NativeErrorCode == ERROR_ACCESS_DENIED) continue;
                        }
                        if (exited) continue;
                        bool hasMainWindow = false;
                        try { hasMainWindow = (p.MainWindowHandle != IntPtr.Zero); } catch { }
                        bool accessDenied;
                        string cmd = QueryWindowsProcessCommandLine(p.Id, hasMainWindow, out accessDenied);
                        if (string.IsNullOrEmpty(cmd))
                        {
                            // 权限不足导致命令行不可读时绝不激活 windowFallbackCandidate，避免将已带参管理员主窗口误判为裸启
                            if (!accessDenied && windowFallbackCandidate == null && hasMainWindow)
                            {
                                bool mainModuleDenied = false;
                                string fbExe = "";
                                try
                                {
                                    fbExe = p.MainModule.FileName;
                                }
                                catch (Win32Exception wex)
                                {
                                    if (wex.NativeErrorCode == ERROR_ACCESS_DENIED) mainModuleDenied = true;
                                }
                                catch { }
                                if (mainModuleDenied) continue;
                                long fbStartMs = ProcessStartEpochMs(p);
                                if (string.IsNullOrEmpty(fbExe)) fbExe = FindAntigravityExecutable(null);
                                windowFallbackCandidate = new BareHostProcessInfo();
                                windowFallbackCandidate.Pid = p.Id;
                                windowFallbackCandidate.ExePath = fbExe;
                                windowFallbackCandidate.StartTimeMs = fbStartMs;
                                windowFallbackCandidate.UptimeMs = fbStartMs > 0L ? Math.Max(0L, NowEpochMs() - fbStartMs) : 0L;
                            }
                            continue;
                        }
                        if (cmd.IndexOf("--type=", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                        if (cmd.IndexOf("--import=", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            cmd.IndexOf("sidecar_sdk", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            cmd.IndexOf("main.mjs", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            cmd.IndexOf("watch.js", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            continue;
                        }
                        if (cmd.IndexOf("--remote-debugging-port", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            // A host process already opted into CDP is running
                            return null;
                        }
                        if (candidate == null)
                        {
                            long stMs = ProcessStartEpochMs(p);
                            string exePath = "";
                            try { exePath = p.MainModule.FileName; } catch { }
                            if (string.IsNullOrEmpty(exePath)) exePath = FindAntigravityExecutable(null);
                            candidate = new BareHostProcessInfo();
                            candidate.Pid = p.Id;
                            candidate.ExePath = exePath;
                            candidate.StartTimeMs = stMs;
                            candidate.UptimeMs = stMs > 0L ? Math.Max(0L, NowEpochMs() - stMs) : 0L;
                        }
                    }
                    catch { }
                    finally
                    {
                        try { p.Dispose(); } catch { }
                    }
                }
                if (candidate == null && windowFallbackCandidate != null)
                {
                    int? livePort = ReadPort(null);
                    if (livePort.HasValue && livePort.Value > 0)
                    {
                        try
                        {
                            ActivePortProbeResult probe = ProbeActivePortAsync(livePort.Value, false, 0).GetAwaiter().GetResult();
                            if (probe != null && !probe.IsStalePort)
                            {
                                return null;
                            }
                        }
                        catch { }
                    }
                }
                return candidate ?? windowFallbackCandidate;
            }
            catch
            {
                return null;
            }
        }

        private static bool StateFileMatchesHost(string filePath, int hostPid, long startTimeMs)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath) || hostPid <= 0) return false;
            try
            {
                string raw = File.ReadAllText(filePath, Encoding.UTF8).Trim();
                if (string.IsNullOrEmpty(raw)) return false;
                Dictionary<string, object> obj = MiniJson.ParseObject(raw);
                if (obj == null) return false;
                string expectedKey = hostPid + ":" + startTimeMs;
                string pidPrefix = hostPid + ":";
                object hkObj;
                if (obj.TryGetValue("hostKey", out hkObj) && hkObj is string)
                {
                    string hk = (string)hkObj;
                    if (string.Equals(hk, expectedKey, StringComparison.Ordinal)) return true;
                    if (startTimeMs <= 0L && hk.StartsWith(pidPrefix, StringComparison.Ordinal)) return true;
                }
                object kObj;
                if (obj.TryGetValue("key", out kObj) && kObj is string)
                {
                    string k = (string)kObj;
                    if (string.Equals(k, expectedKey, StringComparison.Ordinal)) return true;
                    if (startTimeMs <= 0L && k.StartsWith(pidPrefix, StringComparison.Ordinal)) return true;
                }
                object pidObj;
                if (obj.TryGetValue("hostPid", out pidObj) && pidObj != null && Convert.ToInt32(pidObj) == hostPid)
                {
                    long savedStart = 0L;
                    object st1;
                    object st2;
                    if (obj.TryGetValue("hostStartMs", out st1) && st1 != null) savedStart = Convert.ToInt64(st1);
                    else if (obj.TryGetValue("startTimeMs", out st2) && st2 != null) savedStart = Convert.ToInt64(st2);
                    if (savedStart <= 0L || startTimeMs <= 0L || Math.Abs(savedStart - startTimeMs) <= 15000L)
                    {
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static readonly object _promptedHostLock = new object();
        private static readonly HashSet<string> _promptedHostKeys = new HashSet<string>(StringComparer.Ordinal);

        private static bool IsHostKeyPromptedInMemory(int hostPid, long startTimeMs)
        {
            if (hostPid <= 0) return true;
            string expectedKey = hostPid + ":" + startTimeMs;
            string pidPrefix = hostPid + ":";
            lock (_promptedHostLock)
            {
                if (_promptedHostKeys.Contains(expectedKey)) return true;
                foreach (string hk in _promptedHostKeys)
                {
                    if (string.IsNullOrEmpty(hk) || !hk.StartsWith(pidPrefix, StringComparison.Ordinal)) continue;
                    if (startTimeMs <= 0L) return true;
                    long savedStart;
                    if (long.TryParse(hk.Substring(pidPrefix.Length), out savedStart))
                    {
                        if (savedStart <= 0L || Math.Abs(savedStart - startTimeMs) <= 15000L)
                        {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        private static void RememberPromptedHostInMemory(int hostPid, long startTimeMs)
        {
            if (hostPid <= 0) return;
            string hostKey = hostPid + ":" + startTimeMs;
            lock (_promptedHostLock)
            {
                if (_promptedHostKeys.Count >= 256)
                {
                    _promptedHostKeys.Clear();
                }
                _promptedHostKeys.Add(hostKey);
            }
        }

        public static bool HasPromptedForHost(int hostPid, long startTimeMs, string installDir, string pluginDir)
        {
            if (hostPid <= 0) return true;
            if (IsHostKeyPromptedInMemory(hostPid, startTimeMs)) return true;
            if (!string.IsNullOrEmpty(pluginDir))
            {
                if (StateFileMatchesHost(Path.Combine(pluginDir, ".relaunch-prompt-state.json"), hostPid, startTimeMs))
                {
                    RememberPromptedHostInMemory(hostPid, startTimeMs);
                    return true;
                }
            }
            if (!string.IsNullOrEmpty(installDir))
            {
                if (StateFileMatchesHost(Path.Combine(installDir, ".relaunch-prompt-state.json"), hostPid, startTimeMs))
                {
                    RememberPromptedHostInMemory(hostPid, startTimeMs);
                    return true;
                }
            }
            return false;
        }

        public static void RecordPromptedForHost(int hostPid, long startTimeMs, string decision, string installDir, string pluginDir)
        {
            if (hostPid <= 0) return;
            // 先写入进程内 HashSet 兜底，即使磁盘只读/满导致状态文件写盘失败，也绝不每 2s 无限弹窗
            RememberPromptedHostInMemory(hostPid, startTimeMs);
            string hostKey = hostPid + ":" + startTimeMs;
            Dictionary<string, object> obj = new Dictionary<string, object>(StringComparer.Ordinal);
            obj["hostPid"] = hostPid;
            obj["hostStartMs"] = startTimeMs;
            obj["startTimeMs"] = startTimeMs;
            obj["hostKey"] = hostKey;
            obj["key"] = hostKey;
            obj["decision"] = string.IsNullOrEmpty(decision) ? "prompted" : decision;
            obj["updatedAt"] = NowEpochMs();

            string[] dirs = new string[] { pluginDir, installDir };
            for (int i = 0; i < dirs.Length; i++)
            {
                if (string.IsNullOrEmpty(dirs[i])) continue;
                try
                {
                    Directory.CreateDirectory(dirs[i]);
                    AtomicWriteJson(Path.Combine(dirs[i], ".relaunch-prompt-state.json"), obj);
                }
                catch { }
            }
        }

        public static string GetCdpRelaunchPromptCaption()
        {
            return InstallerI18n.Tr(
                "Obsidian Prism · 恢复界面连接",
                "Obsidian Prism · Restore UI Connection"
            );
        }

        public static string GetCdpRelaunchPromptText()
        {
            return InstallerI18n.Tr(
                "检测到 Antigravity 已升级或无参启动，尚未开启本地光学桥接端口（--remote-debugging-port=0）。\r\n" +
                "快捷方式参数已自动维护完毕。\r\n\r\n" +
                "是否立即重新打开 Antigravity 以恢复 Obsidian Prism（黑曜棱镜）界面？",
                "Antigravity appears to have updated or launched without the local optical bridge flag (--remote-debugging-port=0).\r\n" +
                "Your shortcuts have been automatically updated.\r\n\r\n" +
                "Reopen Antigravity now to restore the Obsidian Prism interface?"
            );
        }

        public static bool PromptUserForCdpRelaunch()
        {
            string mockDec = Environment.GetEnvironmentVariable("AG_PRISM_MOCK_RELAUNCH_DECISION");
            if (!string.IsNullOrEmpty(mockDec))
            {
                return string.Equals(mockDec.Trim(), "yes", StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(mockDec.Trim(), "1", StringComparison.OrdinalIgnoreCase);
            }
            string text = GetCdpRelaunchPromptText();
            string caption = GetCdpRelaunchPromptCaption();
            int ans = MessageBoxW(IntPtr.Zero, text, caption, MB_YESNO | MB_ICONQUESTION | MB_SETFOREGROUND);
            return ans == IDYES;
        }

        public static bool RelaunchAntigravityWithCdp(
            BareHostProcessInfo host,
            int waitExitMs = 15000,
            Action<string> log = null
        )
        {
            if (host == null || host.Pid <= 0 || string.IsNullOrEmpty(host.ExePath) || !File.Exists(host.ExePath))
            {
                return false;
            }
            try
            {
                Process target = null;
                try
                {
                    target = Process.GetProcessById(host.Pid);
                    if (!target.HasExited)
                    {
                        try { target.CloseMainWindow(); } catch { }
                        int softWait = Math.Min(8000, Math.Max(1000, waitExitMs));
                        if (!target.WaitForExit(softWait) && !target.HasExited)
                        {
                            try { target.Kill(); } catch { }
                            target.WaitForExit(4000);
                        }
                    }
                }
                catch { }
                finally
                {
                    if (target != null) { try { target.Dispose(); } catch { } }
                }

                // Wait until single-instance lock holder is fully gone before spawning --remote-debugging-port=0
                int waited = 0;
                while (waited < 5000)
                {
                    BareHostProcessInfo lingering = FindBareAntigravityMainProcess();
                    if (lingering == null || lingering.Pid != host.Pid) break;
                    Thread.Sleep(150);
                    waited += 150;
                }
                Thread.Sleep(250);

                string launchArgs = Environment.GetEnvironmentVariable("AG_PRISM_MOCK_RELAUNCH_ARGS");
                if (string.IsNullOrEmpty(launchArgs)) launchArgs = CdpOptInFlag;
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = host.ExePath;
                psi.Arguments = launchArgs;
                psi.WorkingDirectory = Path.GetDirectoryName(host.ExePath);
                psi.UseShellExecute = false;
                Process spawned = Process.Start(psi);
                if (spawned != null)
                {
                    if (log != null)
                    {
                        log(InstallerI18n.TrFormat(
                            "已带 {0} 重新打开 Antigravity (PID {1})",
                            "Relaunched Antigravity with {0} (PID {1})",
                            CdpOptInFlag,
                            spawned.Id
                        ));
                    }
                    return true;
                }
            }
            catch { }
            return false;
        }

        public static string ComputeHash(string str)
        {
            unchecked
            {
                uint h = 2166136261u;
                for (int i = 0; i < str.Length; i++)
                {
                    h ^= (uint)str[i];
                    h *= 16777619u;
                }
                return ToBase36(h);
            }
        }

        private static string ToBase36(uint value)
        {
            const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
            if (value == 0) return "0";
            char[] buf = new char[8];
            int pos = buf.Length;
            while (value > 0)
            {
                buf[--pos] = digits[(int)(value % 36u)];
                value /= 36u;
            }
            return new string(buf, pos, buf.Length - pos);
        }

        public static string ReadRuntimeBundle(string baseDir, PluginManifest manifest)
        {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < manifest.Parts.Count; i++)
            {
                if (i > 0) sb.Append('\n');
                string rel = manifest.Parts[i].Replace('/', Path.DirectorySeparatorChar);
                sb.Append(File.ReadAllText(Path.Combine(baseDir, rel), Encoding.UTF8));
            }
            return sb.ToString();
        }

        public static string BuildConfigRefreshExpression(string baseDir, PluginManifest manifest)
        {
            Dictionary<string, object> config = ReadConfig(baseDir, manifest);
            string codeHash = "";
            try { codeHash = ComputeHash(ReadRuntimeBundle(baseDir, manifest)); } catch { }
            Dictionary<string, object> nextCfg = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, object> kv in config)
            {
                nextCfg[kv.Key] = kv.Value;
            }
            nextCfg["binding"] = manifest.SettingBinding;
            if (!string.IsNullOrEmpty(codeHash)) nextCfg["codeHash"] = codeHash;
            nextCfg["__fromFile"] = true;
            string cfgJson = MiniJson.Stringify(nextCfg, false);
            string verJson = MiniJson.StringifyString(manifest.Version);
            string hashJson = MiniJson.StringifyString(codeHash);

            StringBuilder sb = new StringBuilder(cfgJson.Length + 768);
            sb.Append("(() => {\n");
            sb.Append("    const nextCfg = ").Append(cfgJson).Append(";\n");
            sb.Append("    const api = window.__agPrism || window.__agClaudeStyle;\n");
            sb.Append("    if (!api || api.version !== ").Append(verJson).Append(" || typeof api.refreshConfig !== 'function') return { ok: false, refreshed: false };\n");
            sb.Append("    if (").Append(hashJson).Append(" && api.codeHash && api.codeHash !== ").Append(hashJson).Append(") return { ok: false, refreshed: false };\n");
            sb.Append("    api.refreshConfig(nextCfg);\n");
            sb.Append("    const liveState = typeof api.getState === 'function' ? api.getState() : null;\n");
            sb.Append("    const effectiveCfg = (liveState && liveState.cfg) || nextCfg;\n");
            sb.Append("    try { window.__agPrismTelemetry?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("    try { window.__agPrismEffortSlider?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("    try { window.__agPrismThought?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("    try { window.__agPrismInlineDiff?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("    try { if (effectiveCfg.omniModule === 'off') window.__agPrismOmni?.destroy?.(); else window.__agPrismOmni?.sync?.(effectiveCfg, window.__agPrismOmniServerMeta || null); } catch {}\n");
            sb.Append("    if (effectiveCfg && effectiveCfg.sidebarStudio !== 'on') {\n");
            sb.Append("      try { window.__agPrismSidebar?.sync?.(effectiveCfg, window.__agPrismSidebarMeta || null); } catch {}\n");
            sb.Append("      try { window.__agPrismSidebar?.destroy?.(); } catch {}\n");
            sb.Append("      try { delete window.__agPrismSidebar; } catch {}\n");
            sb.Append("      try { if (document.documentElement) ['data-ag-prism-mode', 'data-ag-prism-chat-kind', 'data-ag-prism-chat-telemetry', 'data-ag-cs-space', 'data-ag-cs-space-palette', 'data-ag-cs-space-accent'].forEach((a) => document.documentElement.removeAttribute(a)); } catch {}\n");
            sb.Append("    } else {\n");
            sb.Append("      try { window.__agPrismSidebar?.sync?.(effectiveCfg, window.__agPrismSidebarMeta || null); } catch {}\n");
            sb.Append("    }\n");
            sb.Append("    try { const hiMode = effectiveCfg.hostLocalization; const hiLang = effectiveCfg.language; const navL = String((typeof navigator !== 'undefined' && ((navigator.languages && navigator.languages[0]) || navigator.language)) || '').trim(); if (hiMode === 'off') window.__agPrismHostI18n?.setMode?.('off'); else if (hiMode === 'on') window.__agPrismHostI18n?.setMode?.('on'); else if ((hiLang && hiLang !== 'zh-CN' && hiLang !== 'auto') || ((!hiLang || hiLang === 'auto') && navL && !/^zh(?:$|-(?:cn|hans|sg)(?:-|$))/i.test(navL))) window.__agPrismHostI18n?.destroy?.(); else window.__agPrismHostI18n?.setMode?.('auto'); } catch {}\n");
            sb.Append("    if (document.documentElement) {\n");
            sb.Append("      if (effectiveCfg && effectiveCfg.thoughtTranslate && effectiveCfg.thoughtTranslate !== 'off') document.documentElement.setAttribute('data-ag-prism-thought-view', effectiveCfg.thoughtView === 'bilingual' ? 'bilingual' : 'immersive');\n");
            sb.Append("      else document.documentElement.removeAttribute('data-ag-prism-thought-view');\n");
            sb.Append("      document.documentElement.setAttribute('data-ag-prism-sidebar-studio', effectiveCfg && effectiveCfg.sidebarStudio === 'on' ? 'on' : 'off');\n");
            sb.Append("    }\n");
            sb.Append("    return { ok: true, refreshed: true, state: liveState };\n");
            sb.Append("  })()");
            return sb.ToString();
        }

        public static string BuildOmniClientExpression(string baseDir, PluginManifest manifest)
        {
            string omniPath = Path.Combine(baseDir, Path.Combine("vendor", Path.Combine("omni-viewer", "omni-client.js")));
            if (!File.Exists(omniPath)) return "";
            string clientSource = File.ReadAllText(omniPath, Encoding.UTF8);
            if (string.IsNullOrEmpty(clientSource)) return "";
            Dictionary<string, object> config = ReadConfig(baseDir, manifest);
            string cfgJson = MiniJson.Stringify(config, false);
            string hashJson = MiniJson.StringifyString(ComputeHash(clientSource));
            StringBuilder sb = new StringBuilder(clientSource.Length + cfgJson.Length + 1024);
            sb.Append("(() => {\n");
            sb.Append("  const href = String((typeof location !== 'undefined' && location && location.href) || '');\n");
            sb.Append("  const ttl = String((typeof document !== 'undefined' && document && document.title) || '').trim();\n");
            sb.Append("  if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(href)) return { ok: false, skipped: true };\n");
            sb.Append("  if (/^(devtools:|chrome:|chrome-extension:|edge:|about:|data:|blob:|plugin:)/i.test(href)) return { ok: false, skipped: true };\n");
            sb.Append("  if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?\\/(?:viewer|sandbox|stream|api)(?:[/?#]|$)/i.test(href)) return { ok: false, skipped: true };\n");
            sb.Append("  const bootCfg = ").Append(cfgJson).Append(";\n");
            sb.Append("  const nextHash = ").Append(hashJson).Append(";\n");
            sb.Append("  const liveCfg = (window.__agPrism && typeof window.__agPrism.getState === 'function' && window.__agPrism.getState()?.cfg) || bootCfg;\n");
            sb.Append("  const serverMeta = window.__agPrismOmniServerMeta || null;\n");
            sb.Append("  const prev = window.__agPrismOmni;\n");
            sb.Append("  const reused = Boolean(prev && prev.codeHash === nextHash && typeof prev.sync === 'function');\n");
            sb.Append("  if (!reused) {\n");
            sb.Append("    try { prev?.destroy?.(); } catch {}\n");
            sb.Append("    ").Append(clientSource).Append('\n');
            sb.Append("    if (window.__agPrismOmni && typeof window.__agPrismOmni === 'object') {\n");
            sb.Append("      try { window.__agPrismOmni.codeHash = nextHash; } catch {}\n");
            sb.Append("    }\n");
            sb.Append("  }\n");
            sb.Append("  try { window.__agPrismOmni?.sync?.(liveCfg, serverMeta); } catch {}\n");
            sb.Append("  if (liveCfg && liveCfg.omniModule === 'off') return { ok: true, status: 'disabled' };\n");
            sb.Append("  return { ok: true, status: reused ? 'synced' : (window.__agPrismOmni ? 'mounted' : 'ready') };\n");
            sb.Append("})()");
            return sb.ToString();
        }

        public const string ThoughtRemoveExpression =
            "(() => {\n" +
            "  try { window.__agPrismThought?.destroy?.(); } catch {}\n" +
            "  try { document.querySelectorAll?.('[data-testid=\"prism-thought-ai-config\"]')?.forEach?.((el) => el.remove()); } catch {}\n" +
            "  try { delete window.__agPrismThought; } catch {}\n" +
            "  try { delete globalThis.__agPrismThought; } catch {}\n" +
            "  try { delete window.__agPrismThoughtSettingsUi; } catch {}\n" +
            "  try { delete globalThis.__agPrismThoughtSettingsUi; } catch {}\n" +
            "  try {\n" +
            "    const sec = document.getElementById?.('ag-cs-settings-sec') || document.getElementById?.('ag-prism-settings-sec');\n" +
            "    if (sec) {\n" +
            "      sec.__prismThoughtUiHandle = null;\n" +
            "      sec.__prismMountThoughtUi?.();\n" +
            "    }\n" +
            "  } catch {}\n" +
            "  return { ok: true, status: 'off' };\n" +
            "})()";

        public static bool ShouldEnableThought(Dictionary<string, object> cfg)
        {
            if (cfg == null) return false;
            Dictionary<string, object> reconciled = ReconcileConfigAliases(cfg);
            object rawObj;
            if (!reconciled.TryGetValue("thoughtTranslate", out rawObj)) return false;
            string rawStr = rawObj as string;
            if (string.IsNullOrEmpty(rawStr)) return false;
            string raw = rawStr.Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(raw) || raw == "off" || raw == "false" || raw == "0" || raw == "none")
            {
                return false;
            }
            return raw == "machine" || raw == "ai" || raw == "on" || raw == "auto";
        }

        private static string ResolveSafePluginFile(string pluginDir, string relPath)
        {
            if (string.IsNullOrEmpty(pluginDir) || string.IsNullOrEmpty(relPath)) return null;
            try
            {
                string rootFull = Path.GetFullPath(pluginDir).TrimEnd('\\', '/');
                if (string.IsNullOrEmpty(rootFull)) return null;
                string rootPrefix = rootFull + Path.DirectorySeparatorChar;
                string normalizedRel = relPath.Replace('/', Path.DirectorySeparatorChar).TrimStart('\\', '/');
                string fullPath = Path.GetFullPath(Path.Combine(rootFull, normalizedRel));
                if (!fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase)) return null;
                if (!File.Exists(fullPath)) return null;
                if (IsUnsafeReparsePoint(fullPath)) return null;
                string curDir = Path.GetDirectoryName(fullPath);
                while (!string.IsNullOrEmpty(curDir) &&
                       curDir.Length > rootFull.Length &&
                       curDir.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    if (IsUnsafeReparsePoint(curDir)) return null;
                    string parent = Path.GetDirectoryName(curDir);
                    if (string.Equals(parent, curDir, StringComparison.OrdinalIgnoreCase)) break;
                    curDir = parent;
                }
                return fullPath;
            }
            catch
            {
                return null;
            }
        }

        public static string BuildThoughtExpression(string baseDir, PluginManifest manifest)
        {
            Dictionary<string, object> config = ReadConfig(baseDir, manifest);
            return BuildThoughtExpression(baseDir, config);
        }

        public static string BuildThoughtExpression(string pluginDir, Dictionary<string, object> cfg)
        {
            if (!ShouldEnableThought(cfg)) return "";
            string clientPath = ResolveSafePluginFile(pluginDir, "vendor/thought-translator/thought-client.js");
            string settingsUiPath = ResolveSafePluginFile(pluginDir, "vendor/thought-translator/thought-settings-ui.js");
            if (string.IsNullOrEmpty(clientPath) || string.IsNullOrEmpty(settingsUiPath)) return "";

            string clientSource;
            string settingsUiSource;
            try
            {
                clientSource = File.ReadAllText(clientPath, Encoding.UTF8);
                settingsUiSource = File.ReadAllText(settingsUiPath, Encoding.UTF8);
            }
            catch
            {
                return "";
            }
            if (string.IsNullOrEmpty(clientSource) || string.IsNullOrEmpty(settingsUiSource)) return "";

            Dictionary<string, object> reconciled = ReconcileConfigAliases(cfg);
            Dictionary<string, object> bootCfg = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, object> kv in reconciled)
            {
                bootCfg[kv.Key] = kv.Value;
            }
            object rawModeObj;
            string rawMode = (reconciled.TryGetValue("thoughtTranslate", out rawModeObj) && rawModeObj is string)
                ? ((string)rawModeObj).Trim().ToLowerInvariant()
                : "";
            bootCfg["thoughtTranslate"] = (rawMode == "machine") ? "machine" : "ai";

            string bootCfgJson = MiniJson.Stringify(bootCfg, false);
            string codeHash = ComputeHash(clientSource + "\n" + settingsUiSource);
            string hashJson = MiniJson.StringifyString(codeHash);

            StringBuilder sb = new StringBuilder(clientSource.Length + settingsUiSource.Length + bootCfgJson.Length + 3072);
            sb.Append("(() => {\n");
            sb.Append("  try {\n");
            sb.Append("    if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };\n");
            sb.Append("  } catch {\n");
            sb.Append("    return { ok: false, status: 'skipped-subframe' };\n");
            sb.Append("  }\n");
            sb.Append("  const hasDomMarker = () => {\n");
            sb.Append("    try {\n");
            sb.Append("      if (\n");
            sb.Append("        document.body &&\n");
            sb.Append("        document.body.classList &&\n");
            sb.Append("        (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))\n");
            sb.Append("      ) {\n");
            sb.Append("        return true;\n");
            sb.Append("      }\n");
            sb.Append("      return Boolean(\n");
            sb.Append("        typeof document.querySelector === 'function' &&\n");
            sb.Append("          document.querySelector(\n");
            sb.Append("            '.agy-shell, .agy-home, [data-testid=\"aux-pane-split\"], [data-testid=\"conversation-view\"], [data-testid=\"agent-input-box\"], [data-testid=\"model-selector-trigger\"], .monaco-workbench'\n");
            sb.Append("          )\n");
            sb.Append("      );\n");
            sb.Append("    } catch {\n");
            sb.Append("      return false;\n");
            sb.Append("    }\n");
            sb.Append("  };\n");
            sb.Append("  let needDomMarkerOnReady = false;\n");
            sb.Append("  let isPlainHttpLocalhost = false;\n");
            sb.Append("  try {\n");
            sb.Append("    const loc = typeof window !== 'undefined' && window.location;\n");
            sb.Append("    const href = loc && typeof loc.href === 'string' ? loc.href : '';\n");
            sb.Append("    if (href) {\n");
            sb.Append("      const low = href.toLowerCase();\n");
            sb.Append("      if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {\n");
            sb.Append("        return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("      }\n");
            sb.Append("      if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {\n");
            sb.Append("        const ttl = String(document.title || '').trim();\n");
            sb.Append("        if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {\n");
            sb.Append("          return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("        }\n");
            sb.Append("      }\n");
            sb.Append("      if (low.startsWith('http:') || low.startsWith('https:')) {\n");
            sb.Append("        const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);\n");
            sb.Append("        if (!m) return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("        const pathname = (m[3] || '/').toLowerCase();\n");
            sb.Append("        if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {\n");
            sb.Append("          return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("        }\n");
            sb.Append("        if (!hasDomMarker()) {\n");
            sb.Append("          isPlainHttpLocalhost = m[1].toLowerCase() === 'http';\n");
            sb.Append("          const rs = String(document.readyState || '');\n");
            sb.Append("          if (isPlainHttpLocalhost) {\n");
            sb.Append("            if (rs === 'loading') needDomMarkerOnReady = true;\n");
            sb.Append("            else return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("          } else if (!/\\bantigravity\\b/i.test(String(document.title || ''))) {\n");
            sb.Append("            if (rs === 'loading') needDomMarkerOnReady = true;\n");
            sb.Append("            else return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("          }\n");
            sb.Append("        }\n");
            sb.Append("      }\n");
            sb.Append("    }\n");
            sb.Append("  } catch {}\n");
            sb.Append("  const getSettingsSec = () => {\n");
            sb.Append("    try {\n");
            sb.Append("      return document.getElementById?.('ag-cs-settings-sec') || document.getElementById?.('ag-prism-settings-sec') || null;\n");
            sb.Append("    } catch {\n");
            sb.Append("      return null;\n");
            sb.Append("    }\n");
            sb.Append("  };\n");
            sb.Append("  const cleanupThought = () => {\n");
            sb.Append("    try { window.__agPrismThought?.destroy?.(); } catch {}\n");
            sb.Append("    try { document.querySelectorAll?.('[data-testid=\"prism-thought-ai-config\"]')?.forEach?.((el) => el.remove()); } catch {}\n");
            sb.Append("    try { delete window.__agPrismThought; } catch {}\n");
            sb.Append("    try { delete globalThis.__agPrismThought; } catch {}\n");
            sb.Append("    try { delete window.__agPrismThoughtSettingsUi; } catch {}\n");
            sb.Append("    try { delete globalThis.__agPrismThoughtSettingsUi; } catch {}\n");
            sb.Append("    try {\n");
            sb.Append("      const sec = getSettingsSec();\n");
            sb.Append("      if (sec) {\n");
            sb.Append("        sec.__prismThoughtUiHandle = null;\n");
            sb.Append("        sec.__prismMountThoughtUi?.();\n");
            sb.Append("      }\n");
            sb.Append("    } catch {}\n");
            sb.Append("  };\n");
            sb.Append("  const getLiveCfg = () => {\n");
            sb.Append("    try {\n");
            sb.Append("      const st = window.__agPrism?.getState?.();\n");
            sb.Append("      return st && st.cfg && typeof st.cfg === 'object' ? st.cfg : null;\n");
            sb.Append("    } catch {\n");
            sb.Append("      return null;\n");
            sb.Append("    }\n");
            sb.Append("  };\n");
            sb.Append("  const bootCfg = ").Append(bootCfgJson).Append(";\n");
            sb.Append("  const initialLiveCfg = getLiveCfg();\n");
            sb.Append("  if (initialLiveCfg && initialLiveCfg.thoughtTranslate === 'off') {\n");
            sb.Append("    cleanupThought();\n");
            sb.Append("    return { ok: true, status: 'off', skippedByLiveCfg: true };\n");
            sb.Append("  }\n");
            sb.Append("  const targetHash = ").Append(hashJson).Append(";\n");
            sb.Append("  const mountOrReuse = () => {\n");
            sb.Append("    if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {\n");
            sb.Append("      return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("    }\n");
            sb.Append("    const liveCfg = getLiveCfg();\n");
            sb.Append("    if (liveCfg && liveCfg.thoughtTranslate === 'off') {\n");
            sb.Append("      cleanupThought();\n");
            sb.Append("      return { ok: true, status: 'off', skippedByLiveCfg: true };\n");
            sb.Append("    }\n");
            sb.Append("    const effectiveCfg = liveCfg || bootCfg;\n");
            sb.Append("    const existingThought = window.__agPrismThought;\n");
            sb.Append("    const existingUi = window.__agPrismThoughtSettingsUi || globalThis.__agPrismThoughtSettingsUi;\n");
            sb.Append("    if (\n");
            sb.Append("      existingThought &&\n");
            sb.Append("      existingThought.__prismCodeHash === targetHash &&\n");
            sb.Append("      existingUi &&\n");
            sb.Append("      existingUi.__prismCodeHash === targetHash\n");
            sb.Append("    ) {\n");
            sb.Append("      try { existingThought.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("      try { window.__agPrism?.syncAbsorbed?.(); } catch {}\n");
            sb.Append("      try { getSettingsSec()?.__prismMountThoughtUi?.(); } catch {}\n");
            sb.Append("      return { ok: true, reused: true, codeHash: targetHash };\n");
            sb.Append("    }\n");
            sb.Append("    cleanupThought();\n");
            sb.Append("    ;").Append(clientSource).Append(";\n");
            sb.Append("    ;").Append(settingsUiSource).Append(";\n");
            sb.Append("    const mountedThought = window.__agPrismThought || globalThis.__agPrismThought;\n");
            sb.Append("    const mountedUi = window.__agPrismThoughtSettingsUi || globalThis.__agPrismThoughtSettingsUi;\n");
            sb.Append("    if (mountedThought && typeof mountedThought === 'object') {\n");
            sb.Append("      mountedThought.__prismCodeHash = targetHash;\n");
            sb.Append("      try { window.__agPrismThought = mountedThought; } catch {}\n");
            sb.Append("      try { globalThis.__agPrismThought = mountedThought; } catch {}\n");
            sb.Append("    }\n");
            sb.Append("    if (mountedUi && typeof mountedUi === 'object') {\n");
            sb.Append("      mountedUi.__prismCodeHash = targetHash;\n");
            sb.Append("      try { window.__agPrismThoughtSettingsUi = mountedUi; } catch {}\n");
            sb.Append("      try { globalThis.__agPrismThoughtSettingsUi = mountedUi; } catch {}\n");
            sb.Append("    }\n");
            sb.Append("    try { mountedThought?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("    try { window.__agPrism?.syncAbsorbed?.(); } catch {}\n");
            sb.Append("    try { getSettingsSec()?.__prismMountThoughtUi?.(); } catch {}\n");
            sb.Append("    return { ok: true, status: 'mounted', codeHash: targetHash };\n");
            sb.Append("  };\n");
            sb.Append("  if ((needDomMarkerOnReady || !document.documentElement) && typeof document.addEventListener === 'function') {\n");
            sb.Append("    document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });\n");
            sb.Append("    return { ok: true, status: 'deferred', codeHash: targetHash };\n");
            sb.Append("  }\n");
            sb.Append("  return mountOrReuse();\n");
            sb.Append("})()");
            return sb.ToString();
        }

        public const string InlineDiffRemoveExpression =
            "(() => {\n" +
            "  try { window.__agPrismInlineDiff?.destroy?.(); } catch {}\n" +
            "  try { document.getElementById?.('ag-prism-inline-diff-css')?.remove?.(); } catch {}\n" +
            "  try { document.querySelectorAll?.('.ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}\n" +
            "  try { delete window.__agPrismInlineDiff; } catch {}\n" +
            "  try { delete globalThis.__agPrismInlineDiff; } catch {}\n" +
            "  try { delete window.__agPrismInlineDiffFactory; } catch {}\n" +
            "  try { delete globalThis.__agPrismInlineDiffFactory; } catch {}\n" +
            "  try { delete window.__agPrismInlineDiffResolve; } catch {}\n" +
            "  return { ok: true, status: 'off' };\n" +
            "})()";

        public static string BuildInlineDiffExpression(string baseDir, PluginManifest manifest)
        {
            Dictionary<string, object> config = ReadConfig(baseDir, manifest);
            return BuildInlineDiffExpression(baseDir, config);
        }

        public static string BuildInlineDiffExpression(string pluginDir, Dictionary<string, object> cfg)
        {
            string clientPath = ResolveSafePluginFile(pluginDir, "vendor/inline-diff/inline-diff-client.js");
            if (string.IsNullOrEmpty(clientPath)) return "";

            string clientSource;
            try
            {
                clientSource = File.ReadAllText(clientPath, Encoding.UTF8);
            }
            catch
            {
                return "";
            }
            if (string.IsNullOrEmpty(clientSource)) return "";

            Dictionary<string, object> bootCfg = ReconcileConfigAliases(cfg);
            string bootCfgJson = MiniJson.Stringify(bootCfg, false);
            string codeHash = ComputeHash(clientSource);
            string hashJson = MiniJson.StringifyString(codeHash);

            StringBuilder sb = new StringBuilder(clientSource.Length + bootCfgJson.Length + 2560);
            sb.Append("(() => {\n");
            sb.Append("  try {\n");
            sb.Append("    if (window.self !== window.top) return { ok: false, status: 'skipped-subframe' };\n");
            sb.Append("  } catch {\n");
            sb.Append("    return { ok: false, status: 'skipped-subframe' };\n");
            sb.Append("  }\n");
            sb.Append("  const hasDomMarker = () => {\n");
            sb.Append("    try {\n");
            sb.Append("      if (\n");
            sb.Append("        document.body &&\n");
            sb.Append("        document.body.classList &&\n");
            sb.Append("        (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))\n");
            sb.Append("      ) {\n");
            sb.Append("        return true;\n");
            sb.Append("      }\n");
            sb.Append("      return Boolean(\n");
            sb.Append("        typeof document.querySelector === 'function' &&\n");
            sb.Append("          document.querySelector(\n");
            sb.Append("            '.agy-shell, .agy-home, [data-testid=\"aux-pane-split\"], [data-testid=\"conversation-view\"], [data-testid=\"agent-input-box\"], [data-testid=\"model-selector-trigger\"], .monaco-workbench'\n");
            sb.Append("          )\n");
            sb.Append("      );\n");
            sb.Append("    } catch {\n");
            sb.Append("      return false;\n");
            sb.Append("    }\n");
            sb.Append("  };\n");
            sb.Append("  let needDomMarkerOnReady = false;\n");
            sb.Append("  let isPlainHttpLocalhost = false;\n");
            sb.Append("  try {\n");
            sb.Append("    const loc = typeof window !== 'undefined' && window.location;\n");
            sb.Append("    const href = loc && typeof loc.href === 'string' ? loc.href : '';\n");
            sb.Append("    if (href) {\n");
            sb.Append("      const low = href.toLowerCase();\n");
            sb.Append("      if (low.startsWith('devtools://') || low.startsWith('data:') || low.startsWith('chrome:') || low.startsWith('chrome-extension:') || low.startsWith('edge:') || low.startsWith('blob:') || low.startsWith('plugin:')) {\n");
            sb.Append("        return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("      }\n");
            sb.Append("      if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) {\n");
            sb.Append("        const ttl = String(document.title || '').trim();\n");
            sb.Append("        if (/^(?:untitled|launchpad)$/i.test(ttl) || /\\/launchpad(?:\\.html)?(?:[?#]|$)/i.test(low)) {\n");
            sb.Append("          return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("        }\n");
            sb.Append("      }\n");
            sb.Append("      if (low.startsWith('http:') || low.startsWith('https:')) {\n");
            sb.Append("        const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);\n");
            sb.Append("        if (!m) return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("        const pathname = (m[3] || '/').toLowerCase();\n");
            sb.Append("        if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) {\n");
            sb.Append("          return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("        }\n");
            sb.Append("        if (!hasDomMarker()) {\n");
            sb.Append("          isPlainHttpLocalhost = m[1].toLowerCase() === 'http';\n");
            sb.Append("          const rs = String(document.readyState || '');\n");
            sb.Append("          if (isPlainHttpLocalhost) {\n");
            sb.Append("            if (rs === 'loading') needDomMarkerOnReady = true;\n");
            sb.Append("            else return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("          } else if (!/\\bantigravity\\b/i.test(String(document.title || ''))) {\n");
            sb.Append("            if (rs === 'loading') needDomMarkerOnReady = true;\n");
            sb.Append("            else return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("          }\n");
            sb.Append("        }\n");
            sb.Append("      }\n");
            sb.Append("    }\n");
            sb.Append("  } catch {}\n");
            sb.Append("  const cleanupInlineDiff = () => {\n");
            sb.Append("    try { (window.__agPrismInlineDiff || globalThis.__agPrismInlineDiff)?.destroy?.(); } catch {}\n");
            sb.Append("    try { document.getElementById?.('ag-prism-inline-diff-css')?.remove?.(); } catch {}\n");
            sb.Append("    try { document.querySelectorAll?.('.ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}\n");
            sb.Append("    try { delete window.__agPrismInlineDiff; } catch {}\n");
            sb.Append("    try { delete globalThis.__agPrismInlineDiff; } catch {}\n");
            sb.Append("    try { delete window.__agPrismInlineDiffFactory; } catch {}\n");
            sb.Append("    try { delete globalThis.__agPrismInlineDiffFactory; } catch {}\n");
            sb.Append("    try { delete window.__agPrismInlineDiffResolve; } catch {}\n");
            sb.Append("  };\n");
            sb.Append("  const getLiveCfg = () => {\n");
            sb.Append("    try {\n");
            sb.Append("      const st = window.__agPrism?.getState?.();\n");
            sb.Append("      return st && st.cfg && typeof st.cfg === 'object' ? st.cfg : null;\n");
            sb.Append("    } catch {\n");
            sb.Append("      return null;\n");
            sb.Append("    }\n");
            sb.Append("  };\n");
            sb.Append("  const bootCfg = ").Append(bootCfgJson).Append(";\n");
            sb.Append("  const targetHash = ").Append(hashJson).Append(";\n");
            sb.Append("  const mountOrReuse = () => {\n");
            sb.Append("    if (needDomMarkerOnReady && !hasDomMarker() && (isPlainHttpLocalhost || !/\\bantigravity\\b/i.test(String(document.title || '')))) {\n");
            sb.Append("      return { ok: false, status: 'skipped-non-host' };\n");
            sb.Append("    }\n");
            sb.Append("    const effectiveCfg = getLiveCfg() || bootCfg;\n");
            sb.Append("    const existing = window.__agPrismInlineDiff || globalThis.__agPrismInlineDiff;\n");
            sb.Append("    if (existing && !existing.getDebugState?.()?.destroyed && existing.__prismCodeHash === targetHash && typeof existing.sync === 'function') {\n");
            sb.Append("      try { existing.sync(effectiveCfg); } catch {}\n");
            sb.Append("      return { ok: true, reused: true, codeHash: targetHash };\n");
            sb.Append("    }\n");
            sb.Append("    cleanupInlineDiff();\n");
            sb.Append("    ;").Append(clientSource).Append(";\n");
            sb.Append("    let mounted = window.__agPrismInlineDiff || globalThis.__agPrismInlineDiff;\n");
            sb.Append("    const factory = window.__agPrismInlineDiffFactory || globalThis.__agPrismInlineDiffFactory;\n");
            sb.Append("    if (!mounted && typeof factory === 'function') {\n");
            sb.Append("      try { mounted = factory({ window, document }); } catch {}\n");
            sb.Append("    }\n");
            sb.Append("    if (mounted && typeof mounted === 'object') {\n");
            sb.Append("      mounted.__prismCodeHash = targetHash;\n");
            sb.Append("      try { window.__agPrismInlineDiff = mounted; } catch {}\n");
            sb.Append("      try { globalThis.__agPrismInlineDiff = mounted; } catch {}\n");
            sb.Append("    }\n");
            sb.Append("    if (typeof factory === 'function') {\n");
            sb.Append("      try { window.__agPrismInlineDiffFactory = factory; } catch {}\n");
            sb.Append("      try { globalThis.__agPrismInlineDiffFactory = factory; } catch {}\n");
            sb.Append("    }\n");
            sb.Append("    try { mounted?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("    return { ok: true, status: 'mounted', codeHash: targetHash };\n");
            sb.Append("  };\n");
            sb.Append("  if ((needDomMarkerOnReady || !document.documentElement) && typeof document.addEventListener === 'function') {\n");
            sb.Append("    document.addEventListener('DOMContentLoaded', () => { try { mountOrReuse(); } catch {} }, { once: true });\n");
            sb.Append("    return { ok: true, status: 'deferred', codeHash: targetHash };\n");
            sb.Append("  }\n");
            sb.Append("  return mountOrReuse();\n");
            sb.Append("})()");
            return sb.ToString();
        }

        public static string BuildInjectExpression(string baseDir, PluginManifest manifest)
        {
            Dictionary<string, object> config = ReadConfig(baseDir, manifest);
            string css = File.ReadAllText(Path.Combine(baseDir, "style.css"), Encoding.UTF8);
            string bundle = ReadRuntimeBundle(baseDir, manifest);
            string codeHash = ComputeHash(bundle);

            Dictionary<string, object> initCfg = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, object> kv in config)
            {
                initCfg[kv.Key] = kv.Value;
            }
            initCfg["binding"] = manifest.SettingBinding;
            initCfg["codeHash"] = codeHash;
            initCfg["__fromFile"] = true;

            string styleIdJson = MiniJson.StringifyString(manifest.StyleId);
            string verJson = MiniJson.StringifyString(manifest.Version);
            StringBuilder sb = new StringBuilder(css.Length + bundle.Length + 4608);
            sb.Append("(() => {\n");
            sb.Append("    const css = ");
            sb.Append(MiniJson.StringifyString(css));
            sb.Append(";\n");
            sb.Append("    const migrateLegacyStorage = () => {\n");
            sb.Append("      try {\n");
            sb.Append("        if (typeof localStorage === 'undefined' || !localStorage) return;\n");
            sb.Append("        const legacyRaw = localStorage.getItem('ag-claude-style:config');\n");
            sb.Append("        const v3Raw = localStorage.getItem('agClaudeStyle.settings.v3');\n");
            sb.Append("        const prismRaw = localStorage.getItem('ag-prism:config');\n");
            sb.Append("        if (!prismRaw && (legacyRaw || v3Raw)) localStorage.setItem('ag-prism:config', legacyRaw || v3Raw);\n");
            sb.Append("        if (!v3Raw && (prismRaw || legacyRaw)) localStorage.setItem('agClaudeStyle.settings.v3', prismRaw || legacyRaw);\n");
            sb.Append("      } catch {}\n");
            sb.Append("    };\n");
            sb.Append("    const cleanupLegacyResidue = () => {\n");
            sb.Append("      try { const oldStyle = document.getElementById('ag-claude-style-css'); if (oldStyle) oldStyle.remove(); } catch {}\n");
            sb.Append("      try { const oldApi = window.__agClaudeStyle; if (oldApi && (!window.__agPrism || Number(oldApi.version) <= 2)) { if (typeof oldApi.destroy === 'function') oldApi.destroy(); delete window.__agClaudeStyle; } } catch {}\n");
            sb.Append("    };\n");
            sb.Append("    const applyStyle = () => {\n");
            sb.Append("      const targetParent = document.head || document.documentElement;\n");
            sb.Append("      if (!targetParent) return;\n");
            sb.Append("      cleanupLegacyResidue();\n");
            sb.Append("      let style = document.getElementById(").Append(styleIdJson).Append(");\n");
            sb.Append("      if (!style) {\n");
            sb.Append("        style = document.createElement('style');\n");
            sb.Append("        style.id = ").Append(styleIdJson).Append(";\n");
            sb.Append("      }\n");
            sb.Append("      if (style.textContent !== css) { style.textContent = css; style.removeAttribute?.('data-ag-cs-flat'); }\n");
            sb.Append("      if (style.parentNode !== targetParent || targetParent.lastElementChild !== style) {\n");
            sb.Append("        targetParent.appendChild(style);\n");
            sb.Append("      }\n");
            sb.Append("    };\n\n");
            sb.Append("    let status = 'ok';\n");
            sb.Append("    let mounted = false;\n");
            sb.Append("    const stripForeignMount = () => {\n");
            sb.Append("      try { window.__agPrismTelemetry?.destroy?.(); } catch {}\n");
            sb.Append("      try { window.__agPrismEffortSlider?.destroy?.(); } catch {}\n");
            sb.Append("      try { window.__agPrismThought?.destroy?.(); } catch {}\n");
            sb.Append("      try { document.querySelectorAll?.('[data-testid=\"prism-thought-ai-config\"]')?.forEach?.((el) => el.remove()); } catch {}\n");
            sb.Append("      try { window.__agPrismInlineDiff?.destroy?.(); } catch {}\n");
            sb.Append("      try { document.querySelectorAll?.('.ag-cs-inline-diff-box, .ag-cs-diff-ctx-menu')?.forEach?.((el) => el.remove()); } catch {}\n");
            sb.Append("      try { window.__agPrismOmni?.destroy?.(); } catch {}\n");
            sb.Append("      try { window.__agPrismContextMenu?.destroy?.(); } catch {}\n");
            sb.Append("      try { document.querySelectorAll?.('.ag-cs-ctx-menu, .ag-cs-ctx-toast')?.forEach?.((el) => el.remove()); } catch {}\n");
            sb.Append("      try { window.__agPrismHostI18n?.destroy?.(); document.documentElement?.removeAttribute?.('data-ag-prism-host-i18n'); } catch {}\n");
            sb.Append("      try { document.documentElement?.removeAttribute?.('data-ag-cs-model-menu'); document.querySelectorAll?.('[data-ag-cs-aux-dual],[data-ag-cs-model-overlay]').forEach((el) => { el.removeAttribute('data-ag-cs-aux-dual'); el.removeAttribute('data-ag-cs-model-overlay'); }); } catch {}\n");
            sb.Append("      try { window.__agPrism?.destroy?.(); } catch {}\n");
            sb.Append("      try { document.getElementById(").Append(styleIdJson).Append(")?.remove(); } catch {}\n");
            sb.Append("      try { document.getElementById('ag-claude-style-css')?.remove(); } catch {}\n");
            sb.Append("      try { document.getElementById('ag-prism-settings-v101-css')?.remove(); } catch {}\n");
            sb.Append("      try { document.getElementById('ag-prism-omni-css')?.remove(); } catch {}\n");
            sb.Append("      try { document.getElementById('ag-prism-inline-diff-css')?.remove(); } catch {}\n");
            sb.Append("      delete window.__agPrismThought; delete window.__agPrismThoughtSettingsUi; delete globalThis.__agPrismThoughtSettingsUi; delete window.__agPrismInlineDiff; delete globalThis.__agPrismInlineDiff; delete window.__agPrismInlineDiffFactory; delete globalThis.__agPrismInlineDiffFactory; delete window.__agPrismInlineDiffResolve; delete window.__agPrismOmni; delete window.__agPrismContextMenu; delete globalThis.__agPrismContextMenu; delete window.__agPrism; delete window.__agClaudeStyle;\n");
            sb.Append("    };\n");
            sb.Append("    const hasDomWorkbenchMarkers = () => {\n");
            sb.Append("      try {\n");
            sb.Append("        if (document.body?.classList && (document.body.classList.contains('theme-standalone') || document.body.classList.contains('monaco-workbench'))) return true;\n");
            sb.Append("        return Boolean(document.querySelector('.agy-shell, .agy-home, [data-testid=\"aux-pane-split\"], [data-testid=\"conversation-view\"], [data-testid=\"agent-input-box\"], [data-testid=\"model-selector-trigger\"], .monaco-workbench'));\n");
            sb.Append("      } catch { return false; }\n");
            sb.Append("    };\n");
            sb.Append("    const checkHostIdentity = () => {\n");
            sb.Append("      try {\n");
            sb.Append("        const href = String((typeof window !== 'undefined' && window.location && window.location.href) || '');\n");
            sb.Append("        if (!href) return 'ok';\n");
            sb.Append("        const low = href.toLowerCase();\n");
            sb.Append("        if (/^(devtools:|data:|chrome:|chrome-extension:|edge:|blob:|plugin:)/.test(low)) return 'reject';\n");
            sb.Append("        const ttl = String(document.title || '').trim();\n");
            sb.Append("        const bareAux = /^(?:untitled|launchpad)$/i.test(ttl) || /(?:^|\\/)launchpad(?:\\.html)?(?:[?#]|$)/i.test(href);\n");
            sb.Append("        if (low.startsWith('vscode-file://') || low.startsWith('app://') || low.startsWith('about:')) return bareAux ? 'reject' : 'ok';\n");
            sb.Append("        if (bareAux) return 'reject';\n");
            sb.Append("        const m = /^(https?):\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(?::\\d+)?(\\/[^?#]*)?(?:[?#]|$)/i.exec(href);\n");
            sb.Append("        if (!m) return low.startsWith('http:') || low.startsWith('https:') ? 'reject' : 'ok';\n");
            sb.Append("        const pathname = (m[3] || '/').toLowerCase();\n");
            sb.Append("        if (/^\\/(?:viewer(?:\\/|$)|sandbox(?:\\/|$)|stream(?:\\/|$)|api(?:\\/|$))/.test(pathname)) return 'reject';\n");
            sb.Append("        if (hasDomWorkbenchMarkers()) return 'ok';\n");
            sb.Append("        const rs = String(document.readyState || '');\n");
            sb.Append("        if (m[1].toLowerCase() === 'http') return rs === 'loading' ? 'defer' : 'reject';\n");
            sb.Append("        if (/\\bantigravity\\b/i.test(ttl)) return 'ok';\n");
            sb.Append("        return rs === 'complete' ? 'reject' : 'ok';\n");
            sb.Append("      } catch { return 'ok'; }\n");
            sb.Append("    };\n");
            sb.Append("    const mount = () => {\n");
            sb.Append("      if (mounted || !document.documentElement) return;\n");
            sb.Append("      const hostVerdict = checkHostIdentity();\n");
            sb.Append("      if (hostVerdict === 'reject') { status = 'skipped-non-host'; stripForeignMount(); return; }\n");
            sb.Append("      if (hostVerdict === 'defer') { status = 'deferred'; document.addEventListener('DOMContentLoaded', () => mount(), { once: true }); return; }\n");
            sb.Append("      mounted = true;\n");
            sb.Append("      try {\n");
            sb.Append("        cleanupLegacyResidue();\n");
            sb.Append("        if (!window.__agPrismRepoBridge) {\n");
            sb.Append("          const fn = (a) => Promise.resolve({ ok: false, offline: true, action: typeof a === 'string' ? a : (a && a.action) || 'status', noRemote: true, hasRemote: false, branch: 'local', commit: ").Append(verJson).Append(", shortHash: ").Append(verJson).Append(" });\n");
            sb.Append("          fn.call = fn; fn.request = fn; fn.status = () => fn('status'); fn.pull = () => fn('pull'); fn.sync = () => fn('pull'); fn.resolve = () => {};\n");
            sb.Append("          window.__agPrismRepoBridge = fn;\n");
            sb.Append("        }\n");
            sb.Append("        if (document.head) applyStyle();\n");
            sb.Append("        else document.addEventListener('DOMContentLoaded', applyStyle, { once: true });\n");
            sb.Append("        const bootCfg = ").Append(MiniJson.Stringify(initCfg, false)).Append(";\n");
            sb.Append("        const existingPrism = window.__agPrism || window.__agClaudeStyle;\n");
            sb.Append("        const bundleUnchanged = Boolean(\n");
            sb.Append("          existingPrism &&\n");
            sb.Append("          existingPrism.version === ").Append(verJson).Append(" &&\n");
            sb.Append("          existingPrism.codeHash === bootCfg.codeHash &&\n");
            sb.Append("          typeof existingPrism.refreshConfig === 'function' &&\n");
            sb.Append("          window.__agPrismTelemetry &&\n");
            sb.Append("          window.__agPrismEffortSlider\n");
            sb.Append("        );\n");
            sb.Append("        if (bundleUnchanged) {\n");
            sb.Append("          existingPrism.refreshConfig(bootCfg);\n");
            sb.Append("        } else {\n");
            sb.Append("          try { window.__agPrismTelemetry?.destroy?.(); } catch {}\n");
            sb.Append("          try { window.__agPrismEffortSlider?.destroy?.(); } catch {}\n");
            sb.Append("          try { window.__agPrismThought?.destroy?.(); } catch {}\n");
            sb.Append("          try { window.__agPrismOmni?.destroy?.(); } catch {}\n");
            sb.Append("          try { window.__agPrismContextMenu?.destroy?.(); } catch {}\n");
            sb.Append("          try { document.querySelectorAll?.('[data-ag-prism-fallback=\"1\"]').forEach((n) => n.remove()); } catch {}\n");
            sb.Append("          ").Append(bundle).Append('\n');
            sb.Append("          if (typeof globalThis.__agCsUiMain === 'function') {\n");
            sb.Append("            globalThis.__agCsUiMain(bootCfg);\n");
            sb.Append("          }\n");
            sb.Append("        }\n");
            sb.Append("        migrateLegacyStorage();\n");
            sb.Append("        if (window.__agClaudeStyle && !window.__agPrism) window.__agPrism = window.__agClaudeStyle;\n");
            sb.Append("        else if (window.__agPrism) window.__agClaudeStyle = window.__agPrism;\n");
            sb.Append("        const liveState = window.__agPrism && typeof window.__agPrism.getState === 'function' ? window.__agPrism.getState() : null;\n");
            sb.Append("        const effectiveCfg = (liveState && liveState.cfg) || bootCfg;\n");
            sb.Append("        try { window.__agPrismTelemetry?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("        try { window.__agPrismEffortSlider?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("        try { window.__agPrismThought?.sync?.(effectiveCfg); } catch {}\n");
            sb.Append("        try { if (effectiveCfg.omniModule === 'off') window.__agPrismOmni?.destroy?.(); else window.__agPrismOmni?.sync?.(effectiveCfg, window.__agPrismOmniServerMeta || null); } catch {}\n");
            sb.Append("        if (document.documentElement && !document.documentElement.hasAttribute('data-ag-prism')) {\n");
            sb.Append("          document.documentElement.setAttribute('data-ag-prism', ").Append(verJson).Append(");\n");
            sb.Append("        }\n");
            sb.Append("      } catch (e) {\n");
            sb.Append("        status = 'error: ' + (e && e.message ? e.message : String(e));\n");
            sb.Append("        if (typeof console !== 'undefined' && console.error) {\n");
            sb.Append("          console.error('[obsidian-prism] init error:', e);\n");
            sb.Append("        }\n");
            sb.Append("      }\n");
            sb.Append("    };\n\n");
            sb.Append("    if (document.documentElement) {\n");
            sb.Append("      mount();\n");
            sb.Append("    } else {\n");
            sb.Append("      status = 'deferred';\n");
            sb.Append("      const onReady = () => {\n");
            sb.Append("        if (document.documentElement) {\n");
            sb.Append("          document.removeEventListener('readystatechange', onReady);\n");
            sb.Append("          document.removeEventListener('DOMContentLoaded', onReady);\n");
            sb.Append("          mount();\n");
            sb.Append("        }\n");
            sb.Append("      };\n");
            sb.Append("      document.addEventListener('readystatechange', onReady);\n");
            sb.Append("      document.addEventListener('DOMContentLoaded', onReady);\n");
            sb.Append("    }\n");
            sb.Append("    const api = window.__agPrism || window.__agClaudeStyle;\n");
            sb.Append("    const st = api && typeof api.getState === 'function' ? api.getState() : null;\n");
            sb.Append("    return {\n");
            sb.Append("      version: ").Append(verJson).Append(",\n");
            sb.Append("      status,\n");
            sb.Append("      state: st,\n");
            sb.Append("    };\n");
            sb.Append("  })()");
            return sb.ToString();
        }

        public static string ShortTitle(CdpPageInfo page)
        {
            string t = !string.IsNullOrEmpty(page.Title) ? page.Title : (page.Url ?? "");
            return t.Length > 60 ? t.Substring(0, 57) + "..." : t;
        }

        private static string GetStr(Dictionary<string, object> d, string k)
        {
            object v;
            if (d.TryGetValue(k, out v) && v is string) return (string)v;
            return null;
        }
    }

    public class WindowsLnkInfo
    {
        public uint Flags;
        public bool IsUnicode;
        public bool HasArguments;
        public string TargetPath;
        public string Arguments;
        public string Name;
        public string RelativePath;
        public string WorkingDir;
        public string IconLocation;
        public int StringDataStart;
        public int ArgsStart;
        public int ArgsEnd;
        public int ExtraDataStart;
    }

    /// <summary>
    /// 纯 C# MS-SHLLINK (.lnk) 二进制读写器与原生标准 ShellLink COM 创建器。
    /// 读写已有快捷方式全程零 COM、零子进程，逐字节无损保留 Header/IDList/LinkInfo/ExtraData；
    /// 新建快捷方式使用 Explorer 标准 CLSID_ShellLink (IShellLinkW + IPersistFile)。
    /// </summary>
    public static class WindowsLnkCodec
    {
        public const int HeaderSize = 0x4C;
        public const int MaxFileBytes = 1024 * 1024;

        private const uint FlagHasIdList = 0x00000001u;
        private const uint FlagHasLinkInfo = 0x00000002u;
        private const uint FlagHasName = 0x00000004u;
        private const uint FlagHasRelativePath = 0x00000008u;
        private const uint FlagHasWorkingDir = 0x00000010u;
        private const uint FlagHasArguments = 0x00000020u;
        private const uint FlagHasIconLocation = 0x00000040u;
        private const uint FlagIsUnicode = 0x00000080u;

        private static readonly byte[] LnkClsid = new byte[]
        {
            0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
            0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46
        };

        [ComImport]
        [Guid("00021401-0000-0000-C000-000000000046")]
        private class ShellLinkCoClass
        {
        }

        [ComImport]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        [Guid("000214F9-0000-0000-C000-000000000046")]
        private interface IShellLinkW
        {
            void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
            void GetIDList(out IntPtr ppidl);
            void SetIDList(IntPtr pidl);
            void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
            void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
            void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
            void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
            void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
            void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
            void GetHotkey(out short pwHotkey);
            void SetHotkey(short wHotkey);
            void GetShowCmd(out int piShowCmd);
            void SetShowCmd(int iShowCmd);
            void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
            void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
            void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
            void Resolve(IntPtr hwnd, uint fFlags);
            void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
        }

        private static ushort ReadUInt16LE(byte[] buf, int offset)
        {
            return (ushort)(buf[offset] | (buf[offset + 1] << 8));
        }

        private static uint ReadUInt32LE(byte[] buf, int offset)
        {
            return (uint)(buf[offset]
                | (buf[offset + 1] << 8)
                | (buf[offset + 2] << 16)
                | (buf[offset + 3] << 24));
        }

        private static void WriteUInt16LE(byte[] buf, int offset, ushort val)
        {
            buf[offset] = (byte)(val & 0xFF);
            buf[offset + 1] = (byte)((val >> 8) & 0xFF);
        }

        private static void WriteUInt32LE(byte[] buf, int offset, uint val)
        {
            buf[offset] = (byte)(val & 0xFF);
            buf[offset + 1] = (byte)((val >> 8) & 0xFF);
            buf[offset + 2] = (byte)((val >> 16) & 0xFF);
            buf[offset + 3] = (byte)((val >> 24) & 0xFF);
        }

        private static bool HasNonAscii(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            for (int i = 0; i < text.Length; i++)
            {
                if (text[i] > 0x7F) return true;
            }
            return false;
        }

        private static string ReadNullTerminatedAnsi(byte[] buf, int start, int limit)
        {
            if (start < 0 || start >= limit || limit > buf.Length) return "";
            int end = start;
            while (end < limit && buf[end] != 0) end++;
            if (end <= start) return "";
            return Encoding.Default.GetString(buf, start, end - start);
        }

        private static string ReadNullTerminatedUtf16LE(byte[] buf, int start, int limit)
        {
            if (start < 0 || start + 1 >= limit || limit > buf.Length) return "";
            int end = start;
            while (end + 1 < limit && (buf[end] != 0 || buf[end + 1] != 0)) end += 2;
            if (end <= start) return "";
            return Encoding.Unicode.GetString(buf, start, end - start);
        }

        private static string JoinPathParts(string basePart, string suffix)
        {
            string b = basePart ?? "";
            string s = suffix ?? "";
            if (b.Length == 0) return s;
            if (s.Length == 0) return b;
            if (b.EndsWith("\\", StringComparison.Ordinal) ||
                b.EndsWith("/", StringComparison.Ordinal) ||
                s.StartsWith("\\", StringComparison.Ordinal) ||
                s.StartsWith("/", StringComparison.Ordinal))
            {
                return b + s;
            }
            return b + "\\" + s;
        }

        private static string ResolveRelativeTarget(string lnkPath, string relativePath)
        {
            if (string.IsNullOrEmpty(relativePath)) return "";
            if (string.IsNullOrEmpty(lnkPath)) return relativePath;
            try
            {
                string dir = Path.GetDirectoryName(lnkPath);
                if (!string.IsNullOrEmpty(dir))
                {
                    return Path.GetFullPath(Path.Combine(dir, relativePath));
                }
            }
            catch { }
            return relativePath;
        }

        private static string ExtractTargetFromLinkInfo(byte[] buf, int baseOff, int liLen)
        {
            if (liLen < 0x1C || baseOff + liLen > buf.Length) return "";
            uint liSizeU = ReadUInt32LE(buf, baseOff);
            uint liHeaderSizeU = ReadUInt32LE(buf, baseOff + 4);
            uint liFlags = ReadUInt32LE(buf, baseOff + 8);
            if (liSizeU < 0x1Cu || liHeaderSizeU < 0x1Cu || liSizeU > (uint)liLen) return "";
            int liSize = (int)liSizeU;
            int liHeaderSize = (int)liHeaderSizeU;
            int liEnd = baseOff + liSize;

            bool hasUniOffsets = liHeaderSize >= 0x24 && liSize >= 0x24;
            uint commonSuffixOffU = ReadUInt32LE(buf, baseOff + 24);
            string commonSuffix = "";
            if (hasUniOffsets)
            {
                uint commonSuffixUniOffU = ReadUInt32LE(buf, baseOff + 32);
                if (commonSuffixUniOffU >= (uint)liHeaderSize && commonSuffixUniOffU < (uint)liSize)
                {
                    commonSuffix = ReadNullTerminatedUtf16LE(buf, baseOff + (int)commonSuffixUniOffU, liEnd);
                }
            }
            if (commonSuffix.Length == 0 && commonSuffixOffU >= (uint)liHeaderSize && commonSuffixOffU < (uint)liSize)
            {
                commonSuffix = ReadNullTerminatedAnsi(buf, baseOff + (int)commonSuffixOffU, liEnd);
            }

            if ((liFlags & 0x01u) != 0)
            {
                string localBase = "";
                if (hasUniOffsets)
                {
                    uint localBaseUniOffU = ReadUInt32LE(buf, baseOff + 28);
                    if (localBaseUniOffU >= (uint)liHeaderSize && localBaseUniOffU < (uint)liSize)
                    {
                        localBase = ReadNullTerminatedUtf16LE(buf, baseOff + (int)localBaseUniOffU, liEnd);
                    }
                }
                if (localBase.Length == 0)
                {
                    uint localBaseOffU = ReadUInt32LE(buf, baseOff + 16);
                    if (localBaseOffU >= (uint)liHeaderSize && localBaseOffU < (uint)liSize)
                    {
                        localBase = ReadNullTerminatedAnsi(buf, baseOff + (int)localBaseOffU, liEnd);
                    }
                }
                if (localBase.Length > 0) return JoinPathParts(localBase, commonSuffix);
            }

            if ((liFlags & 0x02u) != 0)
            {
                uint cnrlOffU = ReadUInt32LE(buf, baseOff + 20);
                if (cnrlOffU >= (uint)liHeaderSize && cnrlOffU + 20u <= (uint)liSize)
                {
                    int cnrlAbs = baseOff + (int)cnrlOffU;
                    uint cnrlSizeU = ReadUInt32LE(buf, cnrlAbs);
                    if (cnrlSizeU >= 20u && cnrlOffU + cnrlSizeU <= (uint)liSize)
                    {
                        int cnrlEnd = cnrlAbs + (int)cnrlSizeU;
                        uint netNameOffU = ReadUInt32LE(buf, cnrlAbs + 8);
                        string netName = "";
                        if (netNameOffU > 0x14u && cnrlAbs + 24 <= cnrlEnd)
                        {
                            uint netNameUniOffU = ReadUInt32LE(buf, cnrlAbs + 20);
                            if (netNameUniOffU > 0u && netNameUniOffU < cnrlSizeU)
                            {
                                netName = ReadNullTerminatedUtf16LE(buf, cnrlAbs + (int)netNameUniOffU, cnrlEnd);
                            }
                        }
                        if (netName.Length == 0 && netNameOffU >= 20u && netNameOffU < cnrlSizeU)
                        {
                            netName = ReadNullTerminatedAnsi(buf, cnrlAbs + (int)netNameOffU, cnrlEnd);
                        }
                        if (netName.Length > 0) return JoinPathParts(netName, commonSuffix);
                    }
                }
            }
            return "";
        }

        private static string ExtractTargetFromExtraData(byte[] buf, int startOff, int endOff)
        {
            if (startOff < 0 || endOff > buf.Length || endOff - startOff < 4) return "";
            int off = startOff;
            while (off + 4 <= endOff)
            {
                uint blockSizeU = ReadUInt32LE(buf, off);
                if (blockSizeU < 4u) break;
                if (blockSizeU > (uint)(endOff - off)) break;
                int blockSize = (int)blockSizeU;
                if (blockSize >= 8)
                {
                    uint sig = ReadUInt32LE(buf, off + 4);
                    // EnvironmentVariableDataBlock (MS-SHLLINK 2.5.4)
                    if (sig == 0xA0000001u && blockSize >= 0x0314)
                    {
                        string uni = ReadNullTerminatedUtf16LE(buf, off + 268, off + 268 + 520);
                        if (uni.Length > 0) return Environment.ExpandEnvironmentVariables(uni);
                        string ansi = ReadNullTerminatedAnsi(buf, off + 8, off + 8 + 260);
                        if (ansi.Length > 0) return Environment.ExpandEnvironmentVariables(ansi);
                    }
                }
                off += blockSize;
            }
            return "";
        }

        private static bool IsDriveSpec(string s)
        {
            if (string.IsNullOrEmpty(s)) return false;
            if (s.Length != 2 && s.Length != 3) return false;
            char c0 = s[0];
            bool isAlpha = (c0 >= 'A' && c0 <= 'Z') || (c0 >= 'a' && c0 <= 'z');
            if (!isAlpha || s[1] != ':') return false;
            return s.Length == 2 || s[2] == '\\';
        }

        private static string ExtractTargetFromIdList(byte[] buf, int startOff, int len)
        {
            if (len < 4 || startOff < 0 || startOff + len > buf.Length) return "";
            int endOff = startOff + len;
            int off = startOff;
            string drive = "";
            List<string> segments = new List<string>();
            while (off + 2 <= endOff)
            {
                ushort itemSize = ReadUInt16LE(buf, off);
                if (itemSize == 0) break;
                if (itemSize < 3 || off + itemSize > endOff) break;
                int itemEnd = off + itemSize;
                byte type = buf[off + 2];
                if (type >= 0x20 && type <= 0x2F && itemSize >= 6)
                {
                    string drv = ReadNullTerminatedAnsi(buf, off + 3, itemEnd).Trim();
                    if (IsDriveSpec(drv))
                    {
                        drive = drv.EndsWith("\\", StringComparison.Ordinal) ? drv : (drv + "\\");
                    }
                }
                else if (type >= 0x30 && type <= 0x3F && itemSize >= 16)
                {
                    string name = "";
                    if (itemSize >= 20)
                    {
                        ushort extOff = ReadUInt16LE(buf, itemEnd - 2);
                        if (extOff >= 14 && extOff + 10 <= itemSize - 2)
                        {
                            int extAbs = off + extOff;
                            ushort extSize = ReadUInt16LE(buf, extAbs);
                            ushort extVer = ReadUInt16LE(buf, extAbs + 2);
                            uint extSig = ReadUInt32LE(buf, extAbs + 4);
                            if (extSig == 0xBEEF0004u && extSize >= 16 && extOff + extSize <= itemSize)
                            {
                                int nameOff = 0;
                                if (extVer == 3) nameOff = extAbs + 20;
                                else if (extVer == 7) nameOff = extAbs + 38;
                                else if (extVer == 8) nameOff = extAbs + 42;
                                else if (extVer >= 9) nameOff = extAbs + 46;
                                if (nameOff > 0 && nameOff + 2 <= extAbs + extSize)
                                {
                                    name = ReadNullTerminatedUtf16LE(buf, nameOff, extAbs + extSize);
                                }
                            }
                        }
                    }
                    if (name.Length == 0)
                    {
                        if ((type & 0x04) != 0)
                        {
                            name = ReadNullTerminatedUtf16LE(buf, off + 14, itemEnd);
                        }
                        else
                        {
                            name = ReadNullTerminatedAnsi(buf, off + 14, itemEnd);
                        }
                    }
                    if (name.Length > 0) segments.Add(name);
                }
                off += itemSize;
            }
            if (drive.Length == 0 || segments.Count == 0) return "";
            return drive + string.Join("\\", segments.ToArray());
        }

        public static WindowsLnkInfo ParseBuffer(byte[] buf, string lnkPath = "")
        {
            if (buf == null || buf.Length < HeaderSize)
            {
                throw new InvalidDataException("Invalid .lnk file: shorter than 76-byte ShellLinkHeader");
            }
            if (buf.Length > MaxFileBytes)
            {
                throw new InvalidDataException("Invalid .lnk file: exceeds max allowed size");
            }
            uint headerSize = ReadUInt32LE(buf, 0);
            if (headerSize != (uint)HeaderSize)
            {
                throw new InvalidDataException("Invalid .lnk HeaderSize: 0x" + headerSize.ToString("X"));
            }
            for (int i = 0; i < LnkClsid.Length; i++)
            {
                if (buf[4 + i] != LnkClsid[i])
                {
                    throw new InvalidDataException("Invalid .lnk LinkCLSID");
                }
            }

            uint flags = ReadUInt32LE(buf, 20);
            bool isUnicode = (flags & FlagIsUnicode) != 0;
            int offset = HeaderSize;

            int idListPayloadStart = -1;
            int idListPayloadLen = 0;
            if ((flags & FlagHasIdList) != 0)
            {
                if (offset + 2 > buf.Length) throw new InvalidDataException("Truncated LinkTargetIDList size");
                ushort idListSize = ReadUInt16LE(buf, offset);
                if (offset + 2 + idListSize > buf.Length) throw new InvalidDataException("Truncated LinkTargetIDList payload");
                idListPayloadStart = offset + 2;
                idListPayloadLen = idListSize;
                offset += 2 + idListSize;
            }

            int linkInfoStart = -1;
            int linkInfoLen = 0;
            if ((flags & FlagHasLinkInfo) != 0)
            {
                if (offset + 4 > buf.Length) throw new InvalidDataException("Truncated LinkInfo size");
                uint liSizeU = ReadUInt32LE(buf, offset);
                if (liSizeU < 0x1Cu || liSizeU > (uint)(buf.Length - offset))
                {
                    throw new InvalidDataException("Invalid or truncated LinkInfo");
                }
                linkInfoStart = offset;
                linkInfoLen = (int)liSizeU;
                offset += linkInfoLen;
            }

            int stringDataStart = offset;
            uint[] stringBits = new uint[]
            {
                FlagHasName,
                FlagHasRelativePath,
                FlagHasWorkingDir,
                FlagHasArguments,
                FlagHasIconLocation
            };
            string[] stringValues = new string[5];
            int argsStart = -1;
            int argsEnd = -1;

            for (int s = 0; s < stringBits.Length; s++)
            {
                bool present = (flags & stringBits[s]) != 0;
                if (s == 3 && !present)
                {
                    argsStart = offset;
                    argsEnd = offset;
                }
                if (!present) continue;
                if (offset + 2 > buf.Length) throw new InvalidDataException("Truncated StringData count");
                ushort countChars = ReadUInt16LE(buf, offset);
                int byteLen = isUnicode ? (countChars * 2) : countChars;
                if (offset + 2 + byteLen > buf.Length) throw new InvalidDataException("Truncated StringData payload");
                int fieldStart = offset;
                string rawStr = isUnicode
                    ? Encoding.Unicode.GetString(buf, offset + 2, byteLen)
                    : Encoding.Default.GetString(buf, offset + 2, byteLen);
                offset += 2 + byteLen;
                stringValues[s] = rawStr;
                if (s == 3)
                {
                    argsStart = fieldStart;
                    argsEnd = offset;
                }
            }

            int extraDataStart = offset;

            string targetPath = linkInfoStart >= 0 ? ExtractTargetFromLinkInfo(buf, linkInfoStart, linkInfoLen) : "";
            if (targetPath.Length == 0)
            {
                targetPath = ExtractTargetFromExtraData(buf, extraDataStart, buf.Length);
            }
            if (targetPath.Length == 0 && !string.IsNullOrEmpty(stringValues[1]))
            {
                targetPath = ResolveRelativeTarget(lnkPath, stringValues[1]);
            }
            if (targetPath.Length == 0 && idListPayloadStart >= 0)
            {
                targetPath = ExtractTargetFromIdList(buf, idListPayloadStart, idListPayloadLen);
            }
            if (targetPath.Length > 0 && HasNonAscii(targetPath) && linkInfoStart >= 0 && linkInfoLen >= 8 && ReadUInt32LE(buf, linkInfoStart + 4) < 0x24u)
            {
                string unicodeFallback = ExtractTargetFromExtraData(buf, extraDataStart, buf.Length);
                if (unicodeFallback.Length == 0 && isUnicode && !string.IsNullOrEmpty(stringValues[1]) && !string.IsNullOrEmpty(lnkPath))
                {
                    unicodeFallback = ResolveRelativeTarget(lnkPath, stringValues[1]);
                }
                if (unicodeFallback.Length == 0 && idListPayloadStart >= 0)
                {
                    unicodeFallback = ExtractTargetFromIdList(buf, idListPayloadStart, idListPayloadLen);
                }
                if (unicodeFallback.Length > 0) targetPath = unicodeFallback;
            }

            WindowsLnkInfo info = new WindowsLnkInfo();
            info.Flags = flags;
            info.IsUnicode = isUnicode;
            info.HasArguments = (flags & FlagHasArguments) != 0;
            info.TargetPath = targetPath ?? "";
            info.Name = stringValues[0];
            info.RelativePath = stringValues[1];
            info.WorkingDir = stringValues[2];
            info.Arguments = stringValues[3] ?? "";
            info.IconLocation = stringValues[4];
            info.StringDataStart = stringDataStart;
            info.ArgsStart = argsStart;
            info.ArgsEnd = argsEnd;
            info.ExtraDataStart = extraDataStart;
            return info;
        }

        private static byte[] EncodeStringDataField(string text, bool isUnicode)
        {
            string s = text ?? "";
            if (isUnicode)
            {
                if (s.Length > 0xFFFF)
                {
                    throw new InvalidOperationException("StringData field exceeds 65535 UTF-16 code units");
                }
                byte[] payload = Encoding.Unicode.GetBytes(s);
                byte[] res = new byte[2 + payload.Length];
                WriteUInt16LE(res, 0, (ushort)s.Length);
                Buffer.BlockCopy(payload, 0, res, 2, payload.Length);
                return res;
            }
            byte[] ansiPayload = Encoding.ASCII.GetBytes(s);
            if (ansiPayload.Length > 0xFFFF)
            {
                throw new InvalidOperationException("StringData field exceeds 65535 ANSI bytes");
            }
            byte[] ansiRes = new byte[2 + ansiPayload.Length];
            WriteUInt16LE(ansiRes, 0, (ushort)ansiPayload.Length);
            Buffer.BlockCopy(ansiPayload, 0, ansiRes, 2, ansiPayload.Length);
            return ansiRes;
        }

        public static byte[] UpdateArguments(byte[] buf, string nextArguments)
        {
            WindowsLnkInfo parsed = ParseBuffer(buf);
            string nextStr = nextArguments ?? "";
            bool wantHasArgs = nextStr.Length > 0;
            bool needUnicodeUpgrade = !parsed.IsUnicode && wantHasArgs && HasNonAscii(nextStr);

            if (!needUnicodeUpgrade)
            {
                uint nextFlags = wantHasArgs
                    ? (parsed.Flags | FlagHasArguments)
                    : (parsed.Flags & ~FlagHasArguments);
                byte[] argChunk = wantHasArgs ? EncodeStringDataField(nextStr, parsed.IsUnicode) : new byte[0];
                int prefixLen = parsed.ArgsStart;
                int suffixLen = buf.Length - parsed.ArgsEnd;
                byte[] output = new byte[prefixLen + argChunk.Length + suffixLen];
                Buffer.BlockCopy(buf, 0, output, 0, prefixLen);
                WriteUInt32LE(output, 20, nextFlags);
                if (argChunk.Length > 0)
                {
                    Buffer.BlockCopy(argChunk, 0, output, prefixLen, argChunk.Length);
                }
                if (suffixLen > 0)
                {
                    Buffer.BlockCopy(buf, parsed.ArgsEnd, output, prefixLen + argChunk.Length, suffixLen);
                }
                return output;
            }

            // ANSI .lnk 写入非 ASCII 参数时升格 IsUnicode 并无损转码已有 StringData，其余字节原样保留
            uint upgradedFlags = parsed.Flags | FlagIsUnicode | FlagHasArguments;
            List<byte[]> chunks = new List<byte[]>();
            byte[] beforeStrings = new byte[parsed.StringDataStart];
            Buffer.BlockCopy(buf, 0, beforeStrings, 0, parsed.StringDataStart);
            WriteUInt32LE(beforeStrings, 20, upgradedFlags);
            chunks.Add(beforeStrings);
            if ((parsed.Flags & FlagHasName) != 0) chunks.Add(EncodeStringDataField(parsed.Name ?? "", true));
            if ((parsed.Flags & FlagHasRelativePath) != 0) chunks.Add(EncodeStringDataField(parsed.RelativePath ?? "", true));
            if ((parsed.Flags & FlagHasWorkingDir) != 0) chunks.Add(EncodeStringDataField(parsed.WorkingDir ?? "", true));
            chunks.Add(EncodeStringDataField(nextStr, true));
            if ((parsed.Flags & FlagHasIconLocation) != 0) chunks.Add(EncodeStringDataField(parsed.IconLocation ?? "", true));
            int extraLen = buf.Length - parsed.ExtraDataStart;
            if (extraLen > 0)
            {
                byte[] extra = new byte[extraLen];
                Buffer.BlockCopy(buf, parsed.ExtraDataStart, extra, 0, extraLen);
                chunks.Add(extra);
            }

            int totalLen = 0;
            for (int i = 0; i < chunks.Count; i++) totalLen += chunks[i].Length;
            byte[] merged = new byte[totalLen];
            int cursor = 0;
            for (int i = 0; i < chunks.Count; i++)
            {
                Buffer.BlockCopy(chunks[i], 0, merged, cursor, chunks[i].Length);
                cursor += chunks[i].Length;
            }
            return merged;
        }

        private static byte[] ReadRawLnkBytesSafely(string lnkPath, out string resolvedPath)
        {
            if (string.IsNullOrEmpty(lnkPath)) throw new ArgumentException("Empty .lnk path");
            resolvedPath = Path.GetFullPath(lnkPath);
            string parentDir = Path.GetDirectoryName(resolvedPath);
            if (string.IsNullOrEmpty(parentDir) || CdpHelper.IsUnsafeReparsePoint(parentDir))
            {
                throw new InvalidOperationException("Refusing unsafe reparse point parent directory");
            }
            if (CdpHelper.IsUnsafeReparsePoint(resolvedPath))
            {
                throw new InvalidOperationException("Refusing unsafe reparse point .lnk file");
            }
            FileInfo fi = new FileInfo(resolvedPath);
            if (!fi.Exists) throw new FileNotFoundException("Shortcut file not found", resolvedPath);
            if (fi.Length > MaxFileBytes)
            {
                throw new InvalidDataException("Refusing oversized .lnk file");
            }
            using (FileStream fs = new FileStream(resolvedPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (fs.Length > MaxFileBytes)
                {
                    throw new InvalidDataException("Refusing oversized .lnk file");
                }
                int len = (int)fs.Length;
                byte[] bytes = new byte[len];
                int readTotal = 0;
                while (readTotal < len)
                {
                    int n = fs.Read(bytes, readTotal, len - readTotal);
                    if (n <= 0) break;
                    readTotal += n;
                }
                if (readTotal != len)
                {
                    byte[] trimmed = new byte[readTotal];
                    Buffer.BlockCopy(bytes, 0, trimmed, 0, readTotal);
                    return trimmed;
                }
                return bytes;
            }
        }

        public static WindowsLnkInfo ReadFile(string lnkPath)
        {
            string resolvedPath;
            byte[] bytes = ReadRawLnkBytesSafely(lnkPath, out resolvedPath);
            return ParseBuffer(bytes, resolvedPath);
        }

        private static bool BytesEqual(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            for (int i = 0; i < a.Length; i++)
            {
                if (a[i] != b[i]) return false;
            }
            return true;
        }

        public static void WriteArguments(string lnkPath, string nextArguments)
        {
            string resolvedPath;
            byte[] origBytes = ReadRawLnkBytesSafely(lnkPath, out resolvedPath);
            byte[] updatedBytes = UpdateArguments(origBytes, nextArguments);
            if (BytesEqual(origBytes, updatedBytes)) return;

            string dir = Path.GetDirectoryName(resolvedPath);
            string tmpPath = Path.Combine(
                dir,
                "." + Path.GetFileName(resolvedPath) + "." + Process.GetCurrentProcess().Id + "." + Guid.NewGuid().ToString("N") + ".tmp"
            );
            try
            {
                using (FileStream fs = new FileStream(tmpPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    fs.Write(updatedBytes, 0, updatedBytes.Length);
                    fs.Flush(true);
                }
                if (CdpHelper.IsUnsafeReparsePoint(resolvedPath))
                {
                    throw new InvalidOperationException("Refusing unsafe reparse point .lnk file");
                }
                CdpHelper.ClearReadOnlyAndHiddenAttributes(resolvedPath);
                CdpHelper.AtomicReplaceFile(tmpPath, resolvedPath);
            }
            finally
            {
                try
                {
                    if (File.Exists(tmpPath)) File.Delete(tmpPath);
                }
                catch { }
            }
        }

        private static void SaveNewShortcutOnCurrentThread(
            string fullLnkPath,
            string targetPath,
            string arguments,
            string workingDir,
            string description
        )
        {
            object comObj = null;
            try
            {
                comObj = new ShellLinkCoClass();
                IShellLinkW link = (IShellLinkW)comObj;
                if (!string.IsNullOrEmpty(targetPath)) link.SetPath(targetPath);
                if (!string.IsNullOrEmpty(arguments)) link.SetArguments(arguments);
                if (!string.IsNullOrEmpty(workingDir)) link.SetWorkingDirectory(workingDir);
                if (!string.IsNullOrEmpty(description)) link.SetDescription(description);
                System.Runtime.InteropServices.ComTypes.IPersistFile persist =
                    (System.Runtime.InteropServices.ComTypes.IPersistFile)comObj;
                persist.Save(fullLnkPath, true);
            }
            finally
            {
                if (comObj != null && Marshal.IsComObject(comObj))
                {
                    try { Marshal.FinalReleaseComObject(comObj); } catch { }
                }
            }
        }

        public static void SaveNewShortcut(
            string lnkPath,
            string targetPath,
            string arguments,
            string workingDir,
            string description
        )
        {
            if (string.IsNullOrEmpty(lnkPath)) throw new ArgumentException("Empty shortcut path");
            string fullLnkPath = Path.GetFullPath(lnkPath);
            string parentDir = Path.GetDirectoryName(fullLnkPath);
            if (string.IsNullOrEmpty(parentDir) || CdpHelper.IsUnsafeReparsePoint(parentDir))
            {
                throw new InvalidOperationException("Refusing unsafe reparse point parent directory");
            }
            if (CdpHelper.IsUnsafeReparsePoint(fullLnkPath))
            {
                throw new InvalidOperationException("Refusing unsafe reparse point shortcut target");
            }
            if (!Directory.Exists(parentDir))
            {
                Directory.CreateDirectory(parentDir);
            }
            if (File.Exists(fullLnkPath))
            {
                CdpHelper.ClearReadOnlyAndHiddenAttributes(fullLnkPath);
            }

            if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA)
            {
                SaveNewShortcutOnCurrentThread(fullLnkPath, targetPath, arguments, workingDir, description);
                return;
            }

            Exception threadEx = null;
            Thread staThread = new Thread(() =>
            {
                try
                {
                    SaveNewShortcutOnCurrentThread(fullLnkPath, targetPath, arguments, workingDir, description);
                }
                catch (Exception ex)
                {
                    threadEx = ex;
                }
            });
            staThread.SetApartmentState(ApartmentState.STA);
            staThread.IsBackground = true;
            staThread.Start();
            staThread.Join();
            if (threadEx != null)
            {
                throw new InvalidOperationException("Failed to save Windows shortcut: " + threadEx.Message, threadEx);
            }
        }
    }
}
