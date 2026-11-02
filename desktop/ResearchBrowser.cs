using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Dyanari.Desktop;

// Fixed Google search/extraction workflow. No arbitrary scripts, account actions or
// page navigation tools are exposed to the model. Source articles use Node's DNS-pinned reader.
internal sealed class ResearchBrowser : IDisposable
{
    private readonly Form owner;
    private readonly string origin;
    private readonly HttpClient client = new() { Timeout = TimeSpan.FromSeconds(5) };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 750 };
    private WebView2? browser;
    private CoreWebView2Environment? environment;
    private string? job;
    private string? sourceHost;
    private bool resolving;
    private string? destination;
    private bool working, disposed;
    public ResearchBrowser(Form owner, string origin, string token)
    {
        this.owner = owner; this.origin = origin;
        client.DefaultRequestHeaders.Add("X-Dyanari-Token", token);
        timer.Tick += async (_, _) => await Tick(); timer.Start();
    }
    private bool Allowed(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !uri.IsDefaultPort || uri.UserInfo.Length != 0) return false;
        return uri.Host == "www.google.com" || uri.Host == "consent.google.com" || uri.Host == "www.gstatic.com" || uri.Host == "ssl.gstatic.com" || (sourceHost != null && (uri.Host == sourceHost || uri.Host == "challenges.cloudflare.com" || uri.Host == "static.lexicanum.com" || uri.Host == "cdnjs.cloudflare.com"));
    }
    private async Task<bool> Active()
    {
        if (disposed || job == null) return false;
        try { using var value = await client.GetFromJsonAsync<JsonDocument>(origin + "/api/research/status?id=" + job); return value?.RootElement.GetProperty("active").GetBoolean() == true; }
        catch { return false; }
    }
    private async Task Initialize()
    {
        if (browser != null) return;
        environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dyanari", "ResearchWebView2"));
        var options = environment.CreateCoreWebView2ControllerOptions(); options.IsInPrivateModeEnabled = true;
        browser = new WebView2 { Size = new Size(1024, 768), Location = new Point(-1200, -1000), TabStop = false };
        owner.Controls.Add(browser); browser.CreateControl();
        await browser.EnsureCoreWebView2Async(environment, options); browser.Visible = false;
        var core = browser.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsWebMessageEnabled = false; core.Settings.AreDefaultScriptDialogsEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false; core.Settings.IsGeneralAutofillEnabled = false;
        core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        core.DownloadStarting += (_, e) => e.Cancel = true;
        core.NewWindowRequested += (_, e) => e.Handled = true;
        core.NavigationStarting += (_, e) => {
            if (e.Uri != "about:blank" && !Allowed(e.Uri)) {
                e.Cancel = true;
                if (resolving && Uri.TryCreate(e.Uri, UriKind.Absolute, out var target) && target.Scheme == "https" && target.IsDefaultPort && target.UserInfo.Length == 0) destination = e.Uri;
            }
        };
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += async (_, e) =>
        {
            using var deferral = e.GetDeferral();
            if (!Allowed(e.Request.Uri) || !await Active())
                e.Response = environment.CreateWebResourceResponse(null, 403, "Research access denied", "Content-Type: text/plain");
        };
    }
    private async Task Tick()
    {
        if (working || disposed) return; working = true;
        try
        {
            using var pending = await client.GetFromJsonAsync<JsonDocument>(origin + "/api/research/pending");
            if (pending == null || !pending.RootElement.TryGetProperty("job", out var request) || request.ValueKind == JsonValueKind.Null) return;
            job = request.GetProperty("id").GetString(); var query = request.GetProperty("query").GetString()!;
            var pageMode = request.TryGetProperty("kind", out var kind) && kind.GetString() == "page";
            resolving = kind.ValueKind == JsonValueKind.String && kind.GetString() == "redirect"; destination = null;
            var pageAddress = pageMode || resolving ? request.GetProperty("url").GetString()! : "";
            sourceHost = pageMode ? new Uri(pageAddress).Host : null;
            if (pageMode && sourceHost != "wh40k.lexicanum.com" && sourceHost != "www.warhammer-community.com") throw new IOException("Unsupported browser source");
            await Initialize(); if (!await Active()) return;
            browser!.CoreWebView2.Navigate(pageMode || resolving ? pageAddress : "https://www.google.com/search?hl=en&num=8&q=" + Uri.EscapeDataString(query));
            object? result = null; bool consentAttempted = false;
            for (int i = 0; i < 100; i++)
            {
                await Task.Delay(500); if (!await Active()) break;
                if (resolving && destination != null) { result = new { redirect = destination }; break; }
                var raw = await browser.CoreWebView2.ExecuteScriptAsync("JSON.stringify({url:location.href,text:(document.body?.innerText||'').slice(0,16000),results:Array.from(document.querySelectorAll('a')).filter(a=>a.querySelector('h3')).slice(0,12).map(a=>({url:a.href,title:a.querySelector('h3').innerText,snippet:(a.closest('div.MjjYud')||a.parentElement?.parentElement||a).innerText.slice(0,1500)}))})");
                var json = JsonSerializer.Deserialize<string>(raw); if (json == null) continue;
                using var page = JsonDocument.Parse(json); var pageUrl = page.RootElement.GetProperty("url").GetString() ?? "";
                var text = page.RootElement.GetProperty("text").GetString() ?? "";
                if (pageMode)
                {
                    if (text.Contains("Verify you are human", StringComparison.OrdinalIgnoreCase)) { result = new { error = "The source requires human verification. No verification was bypassed." }; break; }
                    if (Uri.TryCreate(pageUrl, UriKind.Absolute, out var loaded) && loaded.Host == sourceHost && text.Length > 500 && !text.Contains("Just a moment", StringComparison.OrdinalIgnoreCase) && !text.Contains("Enable JavaScript and cookies", StringComparison.OrdinalIgnoreCase))
                    {
                        var articleRaw = await browser.CoreWebView2.ExecuteScriptAsync("JSON.stringify({title:document.title.slice(0,250),text:(document.querySelector('#mw-content-text')||document.querySelector('article')||document.querySelector('main')||document.body).innerText.slice(0,30000)})");
                        using var article = JsonDocument.Parse(JsonSerializer.Deserialize<string>(articleRaw)!);
                        result = new { page = article.RootElement.Clone() }; break;
                    }
                    continue;
                }
                if (pageUrl.StartsWith("https://consent.google.com/") && !consentAttempted)
                {
                    // Decline optional cookies in this anonymous, isolated search profile only.
                    await browser.CoreWebView2.ExecuteScriptAsync("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.trim()==='Reject all')?.click()"); consentAttempted = true; continue;
                }
                if (pageUrl.Contains("/sorry/") || text.Contains("unusual traffic", StringComparison.OrdinalIgnoreCase)) { result = new { error = "Google requires a human verification step. No verification was bypassed; try again later." }; break; }
                var rows = page.RootElement.GetProperty("results");
                if (pageUrl.StartsWith("https://www.google.com/search") && rows.GetArrayLength() > 0) { result = new { results = rows.Clone() }; break; }
            }
            if (await Active())
            {
                using var response = await client.PostAsJsonAsync(origin + "/api/research/result", new { id = job, result = result ?? new { error = "Google did not return readable results; a consent, verification or layout change may need attention." } });
            }
        }
        catch (Exception)
        {
            if (job != null && !disposed) try { using var response = await client.PostAsJsonAsync(origin + "/api/research/result", new { id = job, result = new { error = "Background Google browser failed. Retry from the desktop application." } }); } catch { }
        }
        finally
        {
            if (job != null && browser?.CoreWebView2 != null && !disposed) { browser.CoreWebView2.Stop(); browser.CoreWebView2.Navigate("about:blank"); }
            job = null; sourceHost = null; resolving = false; destination = null; working = false;
        }
    }
    public void Dispose() { disposed = true; timer.Stop(); timer.Dispose(); browser?.Dispose(); client.Dispose(); }
}
