using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Dyanari.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) => MessageBox.Show(e.Exception.Message, "Dyanari", MessageBoxButtons.OK, MessageBoxIcon.Error);
        if (args.Contains("--self-test"))
        {
            try { var location = Payload.Extract(); File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "desktop-self-test.json"), JsonSerializer.Serialize(new { passed = File.Exists(Path.Combine(location, "documents.mjs")) && File.Exists(Path.Combine(location, "document-worker.mjs")) && File.Exists(Path.Combine(location, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")) && File.Exists(Path.Combine(location, "node_modules/saxes/saxes.js")) && File.Exists(Path.Combine(location, "node.exe")) && File.Exists(Path.Combine(location, "server.mjs")) && File.Exists(Path.Combine(location,"Dyanari.Actions.exe")) && File.Exists(Path.Combine(location,"development.mjs")) && File.Exists(Path.Combine(location,"linked-projects.mjs")) && File.Exists(Path.Combine(location,"memory-ledger.mjs")) && File.Exists(Path.Combine(location,"agent-tasks.mjs")) && File.Exists(Path.Combine(location,"voicestudio.mjs")) && File.Exists(Path.Combine(location,"voicestudio-launch.py")) && File.Exists(Path.Combine(location,"setup-voicestudio.ps1")) && File.Exists(Path.Combine(location,"qwen-image.mjs")) && File.Exists(Path.Combine(location,"image-inspiration.mjs")) && File.Exists(Path.Combine(location,"image-catalog.json")) && File.Exists(Path.Combine(location,"image-runtime/uv.lock")) && File.Exists(Path.Combine(location,"image-runtime/dyanari_qwen_node.py")) && File.Exists(Path.Combine(location,"modly.mjs")) && File.Exists(Path.Combine(location,"modly-catalog.json")) && File.Exists(Path.Combine(location,"modly-runtime/worker.py")) && File.Exists(Path.Combine(location,"modly-runtime/shape/uv.lock")) && File.Exists(Path.Combine(location,"modly-runtime/trellis/uv.lock")) && File.Exists(Path.Combine(location,"public/mesh-viewer.js")), payload = location, version = "0.11.0" })); }
            catch (Exception e) { File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "desktop-self-test.json"), JsonSerializer.Serialize(new { passed = false, error = e.Message })); Environment.ExitCode = 1; }
            return;
        }
        var installedProfile = File.Exists(Path.Combine(AppContext.BaseDirectory, "installation.json"));
        var mutexName = installedProfile ? "Local\\Dyanari.Desktop.0.2" : "Local\\Dyanari.Portable." + Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(Path.GetFullPath(AppContext.BaseDirectory).ToUpperInvariant())))[..16];
        using var mutex = new Mutex(true, mutexName, out var first);
        if (!first) { MessageBox.Show("Dyanari is already open. Select her window from the taskbar.", "Dyanari"); return; }
        Application.Run(new CompanionWindow());
    }
}

internal static class Payload
{
    public static string Extract()
    {
        using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("Dyanari.app-payload.zip") ?? throw new IOException("Embedded application is missing.");
        var digest = Convert.ToHexString(SHA256.HashData(resource)).Substring(0, 16);
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dyanari", "app", digest);
        if (File.Exists(Path.Combine(root, ".ready"))) return root;
        Directory.CreateDirectory(root);
        resource.Position = 0;
        using var archive = new ZipArchive(resource, ZipArchiveMode.Read);
        foreach (var entry in archive.Entries)
        {
            var target = Path.GetFullPath(Path.Combine(root, entry.FullName));
            if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Invalid payload path.");
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, true);
        }
        File.WriteAllText(Path.Combine(root, ".ready"), digest);
        return root;
    }
}

internal sealed class CompanionWindow : Form
{
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private readonly Label status = new() { Dock = DockStyle.Fill, Text = "DYANARI\n\nStarting your local companion…", ForeColor = Color.FromArgb(218, 195, 248), BackColor = Color.FromArgb(20, 17, 27), TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 20) };
    private Process? server;
    private Process? ownedOllama;
    private string origin = "";
    private bool closing;
    private bool shuttingDown;
    private bool shutdownComplete;
    private string apiToken = "";
    private ResearchBrowser? researchBrowser;
    public CompanionWindow()
    {
        Text = AppContext.BaseDirectory.Contains(".dyanari-test-", StringComparison.OrdinalIgnoreCase) ? "Dyanari TEST — disposable profile" : "Dyanari — Local Companion"; Width = 1240; Height = 860; MinimumSize = new Size(820, 620); StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(16, 16, 20); Controls.Add(status);
        Shown += async (_, _) => await StartAsync();
        FormClosing += async (_, e) =>
        {
            if (shutdownComplete || server is null || server.HasExited) return;
            e.Cancel = true; if (shuttingDown) return; shuttingDown = true;
            try
            {
                using var stopClient = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                using var request = new HttpRequestMessage(HttpMethod.Post, origin + "/api/stop") { Content = new StringContent("{\"shutdown\":true}", System.Text.Encoding.UTF8, "application/json") };
                request.Headers.Add("X-Dyanari-Token", apiToken); await stopClient.SendAsync(request);
                for (int i = 0; i < 30; i++) { try { var health = await stopClient.GetStringAsync(origin + "/api/health"); using var state = JsonDocument.Parse(health); if (!state.RootElement.GetProperty("busy").GetBoolean()) break; } catch { break; } await Task.Delay(100); }
            }
            catch { }
            finally { shutdownComplete = true; Close(); }
        };
        FormClosed += (_, _) => { closing = true; researchBrowser?.Dispose(); view.Dispose(); try { if (server is { HasExited: false }) server.Kill(true); } catch { } server?.Dispose(); try { if (ownedOllama is { HasExited: false }) ownedOllama.Kill(true); } catch { } ownedOllama?.Dispose(); };
    }
    private async Task StartAsync()
    {
        try
        {
            var payload = await Task.Run(Payload.Extract);
            var basePath = AppContext.BaseDirectory;
            var installed = File.Exists(Path.Combine(basePath, "installation.json"));
            var defaultModel = "";
            if (installed) { using var config = JsonDocument.Parse(File.ReadAllText(Path.Combine(basePath, "installation.json")).TrimStart('\uFEFF')); if (config.RootElement.TryGetProperty("defaultModel", out var model)) defaultModel = model.GetString() ?? ""; }
            var data = Path.Combine(basePath, "data");
            if (installed) data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dyanari", "data");
            try { Directory.CreateDirectory(data); var probe = Path.Combine(data, ".desktop-write-probe"); File.WriteAllText(probe, ""); File.Delete(probe); }
            catch { data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dyanari", "data"); Directory.CreateDirectory(data); }
            var ollama = Path.Combine(basePath, "runtime", "ollama", "ollama.exe");
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var ollamaPort = 11434;
            if (installed) { var socket = new TcpListener(IPAddress.Loopback, 0); socket.Start(); ollamaPort = ((IPEndPoint)socket.LocalEndpoint).Port; socket.Stop(); }
            var ollamaOrigin = "http://127.0.0.1:" + ollamaPort;
            try { if (installed) throw new IOException("Start isolated installed runtime"); await client.GetStringAsync(ollamaOrigin + "/api/version"); }
            catch
            {
                if (!File.Exists(ollama)) throw new IOException("Ollama is not running. Keep the runtime\\ollama folder beside Dyanari.exe, or start an installed local Ollama service.");
                var start = Hidden(ollama, basePath);
                start.ArgumentList.Add("serve"); start.Environment["OLLAMA_HOST"] = "127.0.0.1:" + ollamaPort;
                start.Environment["OLLAMA_MODELS"] = Path.Combine(data, "models"); start.Environment["OLLAMA_NO_CLOUD"] = "1";
                start.Environment["OLLAMA_MAX_LOADED_MODELS"] = "1"; start.Environment["OLLAMA_NUM_PARALLEL"] = "1";
                var service = Process.Start(start); if (installed) ownedOllama = service; else service?.Dispose();
            }
            var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
            origin = "http://127.0.0.1:" + port;
            var info = Hidden(Path.Combine(payload, "node.exe"), payload);
            info.ArgumentList.Add("--use-system-ca"); info.ArgumentList.Add("server.mjs");
            info.Environment["DYANARI_DATA"] = data; info.Environment["DYANARI_PORT"] = port.ToString(); info.Environment["DYANARI_DESKTOP"] = "1";
            info.Environment["DYANARI_HOME"] = basePath;
            info.Environment["DYANARI_OLLAMA"] = ollamaOrigin;
            if (!string.IsNullOrWhiteSpace(defaultModel)) info.Environment["DYANARI_DEFAULT_MODEL"] = defaultModel;
            info.RedirectStandardError = true; info.RedirectStandardOutput = true;
            server = Process.Start(info) ?? throw new IOException("Could not start Dyanari Core.");
            server.ErrorDataReceived += (_, e) => { if (e.Data != null) { try { File.AppendAllText(Path.Combine(data, "desktop-core.log"), e.Data + Environment.NewLine); } catch { } } };
            server.BeginErrorReadLine(); server.BeginOutputReadLine();
            bool ready = false;
            for (int n = 0; n < 100 && !closing; n++)
            {
                if (server.HasExited) throw new IOException("Dyanari Core stopped. See data\\desktop-core.log.");
                try { var r = await client.GetStringAsync(origin + "/api/health"); if (r.Contains("dyanari")) { ready = true; break; } } catch { }
                await Task.Delay(150);
            }
            if (!ready || closing) throw new IOException("Dyanari Core did not become ready.");
            var html = await client.GetStringAsync(origin + "/"); apiToken = Regex.Match(html, "name=\"token\"\\s+content=\"([a-f0-9]+)\"").Groups[1].Value;
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dyanari", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            Controls.Add(view); view.BringToFront();
            await view.EnsureCoreWebView2Async(environment);
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.NavigationStarting += (_, e) => { if (!IsLocal(e.Uri)) e.Cancel = true; };
            view.CoreWebView2.NewWindowRequested += (_, e) => e.Handled = true;
            view.CoreWebView2.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            view.CoreWebView2.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            view.CoreWebView2.WebResourceRequested += (_, e) => { if (!IsLocal(e.Request.Uri) && !e.Request.Uri.StartsWith("blob:" + origin) && !e.Request.Uri.StartsWith("data:")) e.Response = environment.CreateWebResourceResponse(null, 403, "External requests blocked", "Content-Type: text/plain"); };
            view.CoreWebView2.WebMessageReceived += async (_, e) =>
            {
                if (!IsLocal(e.Source)) return;
                var command = e.TryGetWebMessageAsString();
                if (command.StartsWith("open-source:"))
                {
                    try
                    {
                        using var data = JsonDocument.Parse(command["open-source:".Length..]);
                        if (data.RootElement.GetProperty("token").GetString() != apiToken) return;
                        var address = data.RootElement.GetProperty("url").GetString();
                        if (!Uri.TryCreate(address, UriKind.Absolute, out var source) || source.Scheme != "https" || !source.IsDefaultPort || source.UserInfo.Length != 0 || !source.Host.Contains('.') || IPAddress.TryParse(source.Host, out var parsedAddress) || source.Host.EndsWith(".local")) return;
                        Process.Start(new ProcessStartInfo(source.AbsoluteUri) { UseShellExecute = true });
                    }
                    catch { }
                    return;
                }
                if (command.StartsWith("save-mesh:"))
                {
                    string? temporary = null;
                    try
                    {
                        var parts = command.Split(':');
                        if (parts.Length != 3 || parts[1] != apiToken || !Guid.TryParse(parts[2], out var meshId)) throw new IOException("Invalid model save request");
                        using var save = new SaveFileDialog { Title = "Save Dyanari 3D model as", FileName = "Dyanari-model", Filter = "STL geometry, millimetres (*.stl)|*.stl|Wavefront OBJ geometry, millimetres (*.obj)|*.obj|PLY geometry, millimetres (*.ply)|*.ply|Original GLB scene (*.glb)|*.glb", AddExtension = true, OverwritePrompt = true };
                        if (save.ShowDialog(this) != DialogResult.OK) return;
                        var format = new[] { "stl", "obj", "ply", "glb" }[save.FilterIndex - 1];
                        if (!Path.GetExtension(save.FileName).Equals("." + format, StringComparison.OrdinalIgnoreCase)) throw new IOException("The filename extension must match the selected format");
                        using var download = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
                        using var request = new HttpRequestMessage(HttpMethod.Get, origin + "/api/mesh?id=" + meshId + "&format=" + format); request.Headers.Add("X-Dyanari-Token", apiToken);
                        using var response = await download.SendAsync(request, HttpCompletionOption.ResponseHeadersRead); response.EnsureSuccessStatusCode();
                        temporary = save.FileName + "." + Guid.NewGuid().ToString("N") + ".partial";
                        await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true)) { await response.Content.CopyToAsync(output); }
                        File.Move(temporary, save.FileName, true); temporary = null;
                        view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "mesh-saved", format }));
                    }
                    catch (Exception ex) { view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "mesh-save-error", error = ex.Message })); }
                    finally { if (temporary != null) try { File.Delete(temporary); } catch { } }
                    return;
                }
                if (command.StartsWith("capture-screen:"))
                {
                    try
                    {
                        using var request = new HttpRequestMessage(HttpMethod.Get, origin + "/api/state"); request.Headers.Add("X-Dyanari-Token", command.Substring("capture-screen:".Length));
                        using var captureClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) }; using var check = await captureClient.SendAsync(request); using var settings = JsonDocument.Parse(await check.Content.ReadAsStringAsync());
                        if (!check.IsSuccessStatusCode || !settings.RootElement.GetProperty("settings").GetProperty("screen").GetBoolean()) throw new IOException("Screen Vision is OFF");
                        var bounds = Screen.PrimaryScreen!.Bounds;
                        using var bitmap = new Bitmap(bounds.Width, bounds.Height); using (var graphics = Graphics.FromImage(bitmap)) graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                        var width = Math.Min(1280, bitmap.Width); using var scaled = new Bitmap(bitmap, new Size(width, bitmap.Height * width / bitmap.Width)); using var memory = new MemoryStream(); scaled.Save(memory, System.Drawing.Imaging.ImageFormat.Jpeg);
                        view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "screen-captured", image = Convert.ToBase64String(memory.ToArray()) }));
                    }
                    catch (Exception ex) { view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "capture-error", error = ex.Message })); }
                    return;
                }
                if (command != "choose-workspace") return;
                using var picker = new FolderBrowserDialog { Description = "Choose a workspace Dyanari may access", UseDescriptionForTitle = true };
                if (picker.ShowDialog(this) == DialogResult.OK) view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "workspace-picked", path = picker.SelectedPath }));
            };
            view.CoreWebView2.Navigate(origin);
            researchBrowser = new ResearchBrowser(this, origin, apiToken);
            status.Visible = false;
        }
        catch (Exception e) { if (!closing) { status.Text = "Dyanari could not start\n\n" + e.Message; status.Font = new Font("Segoe UI", 12); status.BringToFront(); } }
    }
    private bool IsLocal(string uri) => Uri.TryCreate(uri, UriKind.Absolute, out var value) && value.GetLeftPart(UriPartial.Authority) == origin;
    private static ProcessStartInfo Hidden(string file, string cwd) => new(file) { WorkingDirectory = cwd, UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
}

