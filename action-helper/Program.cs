using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Windows.Automation;
using Forms = System.Windows.Forms;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private delegate bool EnumCallback(IntPtr window, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr window, EnumCallback callback, IntPtr state);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window,int attribute,out int value,int size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    private record WindowInfo(string Id, string App, string Title, int Pid);
    private record ControlInfo(string Id, string Name, string Role, string? Value, string? Sha256, bool Editable, bool Invokable, bool Truncated);
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Contains("--fixture")) { Fixture(); return 0; }
            if (args.Contains("--self-test")) { Write(SelfTest()); return 0; }
            using var request = JsonDocument.Parse(Console.In.ReadToEnd()); var data = request.RootElement;
            var op = String(data, "operation");
            object result = op switch
            {
                "list" => new { windows = Windows() },
                "inspect" => Inspect(String(data, "window")),
                "launch" => Launch(String(data, "app"), data.TryGetProperty("file", out var f) ? f.GetString() : null),
                "set_text" => SetText(String(data, "window"), String(data, "control"), String(data, "expected_sha256"), String(data, "text")),
                "invoke" => Invoke(String(data, "window"), String(data, "control")),
                "sum" => Sum(data.GetProperty("a").GetInt32(), data.GetProperty("b").GetInt32()),
                _ => throw new InvalidOperationException("Unknown Windows operation")
            };
            Write(result); return 0;
        }
        catch (Exception e) { Write(new { error = e.Message }); return 1; }
    }
    private static string String(JsonElement data, string key) => data.GetProperty(key).GetString() ?? throw new InvalidOperationException("Missing " + key);
    private static void Write(object value) => Console.Write(JsonSerializer.Serialize(value, JsonOptions));
    private static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    private static string? App(Process process, bool fixture = false)
    {
        var executable = process.MainModule?.FileName ?? "";
        if (fixture && string.Equals(executable, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase) && process.MainWindowTitle == "Dyanari automation fixture") return "fixture";
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var store = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WindowsApps") + Path.DirectorySeparatorChar;
        if (process.ProcessName.Equals("Notepad", StringComparison.OrdinalIgnoreCase) &&
           (executable.Equals(Path.Combine(windows, "System32", "notepad.exe"), StringComparison.OrdinalIgnoreCase) || executable.StartsWith(store + "Microsoft.WindowsNotepad_", StringComparison.OrdinalIgnoreCase))) return "notepad";
        if ((process.ProcessName.Equals("CalculatorApp", StringComparison.OrdinalIgnoreCase) || process.ProcessName.Equals("Calculator", StringComparison.OrdinalIgnoreCase)) &&
           (executable.StartsWith(store + "Microsoft.WindowsCalculator_", StringComparison.OrdinalIgnoreCase) || executable.Equals(Path.Combine(windows, "System32", "calc.exe"), StringComparison.OrdinalIgnoreCase))) return "calculator";
        return null;
    }
    private static WindowInfo? Info(IntPtr handle, bool fixture = false)
    {
        if (!IsWindowVisible(handle)||(DwmGetWindowAttribute(handle,14,out var cloaked,sizeof(int))>=0&&cloaked!=0)) return null; GetWindowThreadProcessId(handle, out var pid);
        using var process = Process.GetProcessById((int)pid); var app = App(process, fixture); int appPid = (int)pid; long appStart = process.StartTime.ToUniversalTime().Ticks;
        if (app == null && process.ProcessName.Equals("ApplicationFrameHost", StringComparison.OrdinalIgnoreCase) && string.Equals(process.MainModule?.FileName, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "ApplicationFrameHost.exe"), StringComparison.OrdinalIgnoreCase))
        {
            var candidates = new Dictionary<int, (string App, long Started)>(); EnumChildWindows(handle, (child, _) => { try { GetWindowThreadProcessId(child, out var candidatePid); if (candidatePid != pid) { using var candidate = Process.GetProcessById((int)candidatePid); var candidateApp = App(candidate); if (candidateApp != null) candidates[(int)candidatePid] = (candidateApp, candidate.StartTime.ToUniversalTime().Ticks); } } catch { } return true; }, IntPtr.Zero);
            if (candidates.Count == 1) { var candidate = candidates.Single(); app = candidate.Value.App; appPid = candidate.Key; appStart = candidate.Value.Started; }
        }
        if (app == null) return null;
        var title = new StringBuilder(1024); GetWindowText(handle, title, title.Capacity);
        return new WindowInfo(handle.ToInt64() + ":" + pid + ":" + process.StartTime.ToUniversalTime().Ticks + ":" + appPid + ":" + appStart, app, title.ToString(), appPid);
    }
    private static List<WindowInfo> Windows()
    {
        var result = new List<WindowInfo>(); EnumWindows((handle, _) => { try { var info = Info(handle); if (info != null) result.Add(info); } catch { } return true; }, IntPtr.Zero); return result;
    }
    private static AutomationElement Target(string id, bool fixture = false)
    {
        var parts = id.Split(':'); if (parts.Length != 5 || !long.TryParse(parts[0], out var raw)) throw new InvalidOperationException("Invalid window identity");
        var handle = new IntPtr(raw); var current = Info(handle, fixture);
        if (current == null || current.Id != id) throw new InvalidOperationException("Window closed, changed identity or is outside the supported applications");
        return AutomationElement.FromHandle(handle);
    }
    private static string ControlId(AutomationElement element) => string.Join('.', element.GetRuntimeId());
    private static List<AutomationElement> Elements(AutomationElement root)
    {
        var result = new List<AutomationElement>(); var queue = new Queue<(AutomationElement Element, int Depth)>(); queue.Enqueue((root, 0)); var walker = TreeWalker.ControlViewWalker;
        var allowedPids = new HashSet<int> { root.Current.ProcessId }; try { var info = Info(new IntPtr(root.Current.NativeWindowHandle), true); if (info != null) allowedPids.Add(info.Pid); } catch { }
        while (queue.Count > 0 && result.Count < 250)
        {
            var item = queue.Dequeue(); try
            {
                if (item.Element.Current.IsPassword) continue; result.Add(item.Element); if (item.Depth >= 8) continue;
                var child = walker.GetFirstChild(item.Element); for (int n = 0; child != null && n < 100; n++) { if (allowedPids.Contains(child.Current.ProcessId)) queue.Enqueue((child, item.Depth + 1)); child = walker.GetNextSibling(child); }
            }
            catch (ElementNotAvailableException) { }
        }
        return result;
    }
    private static string? Value(AutomationElement element)
    {
        if (element.Current.IsPassword) throw new InvalidOperationException("Password controls are protected");
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) return ((ValuePattern)vp).Current.Value;
        if (element.TryGetCurrentPattern(TextPattern.Pattern, out var tp)) return ((TextPattern)tp).DocumentRange.GetText(32769);
        return null;
    }
    private static ControlInfo Describe(AutomationElement element)
    {
        var value = Value(element); bool truncated = value?.Length > 32768;
        var editable = !truncated && element.Current.IsEnabled && element.TryGetCurrentPattern(ValuePattern.Pattern, out var vp) && !((ValuePattern)vp).Current.IsReadOnly;
        var invokable = element.Current.IsEnabled && element.TryGetCurrentPattern(InvokePattern.Pattern, out _) && (element.Current.ControlType == ControlType.Button || element.Current.ControlType == ControlType.MenuItem);
        return new ControlInfo(ControlId(element), element.Current.Name[..Math.Min(element.Current.Name.Length, 300)], element.Current.ControlType.ProgrammaticName, value == null ? null : value[..Math.Min(value.Length, 4000)], value == null || truncated ? null : Hash(value), editable, invokable, truncated);
    }
    private static object Inspect(string id, bool fixture = false)
    {
        var root = Target(id, fixture); var controls = new List<ControlInfo>(); foreach (var element in Elements(root)) { try { controls.Add(Describe(element)); } catch { } }
        if (!fixture) { var permitted = PermittedButtons(root); controls = controls.Select(c => c with { Invokable = permitted.Contains(c.Id) }).ToList(); }
        return new { window = id, controls, truncated = controls.Count >= 250 };
    }
    private static HashSet<string> PermittedButtons(AutomationElement root)
    {
        var list = Elements(root); var info = Info(new IntPtr(root.Current.NativeWindowHandle));
        if (info?.App != "calculator" || !list.Any(e => e.Current.AutomationId == "equalButton") || !list.Any(e => e.Current.AutomationId == "plusButton")) return new HashSet<string>();
        var ids = new HashSet<string>(Enumerable.Range(0, 10).Select(i => "num" + i + "Button")) { "plusButton", "minusButton", "multiplyButton", "divideButton", "equalButton", "clearButton", "clearEntryButton", "backSpaceButton", "decimalSeparatorButton", "negateButton", "percentButton", "squareButton", "squareRootButton", "invertButton" };
        return list.Where(e => ids.Contains(e.Current.AutomationId) && Describe(e).Invokable).Select(ControlId).ToHashSet();
    }
    private static AutomationElement Control(string window, string id, bool fixture = false) => Elements(Target(window, fixture)).FirstOrDefault(e => ControlId(e) == id) ?? throw new InvalidOperationException("Control is no longer present; inspect the window again");
    private static object SetText(string window, string id, string expected, string text, bool fixture = false)
    {
        if (text.Length > 12000) throw new InvalidOperationException("Text exceeds the 12000-character limit"); var element = Control(window, id, fixture); var description = Describe(element);
        if (!description.Editable || description.Sha256 == null) throw new InvalidOperationException("This control does not support verified text editing through UI Automation");
        if (description.Sha256 != expected) throw new InvalidOperationException("Control text changed; inspect and approve again");
        ((ValuePattern)element.GetCurrentPattern(ValuePattern.Pattern)).SetValue(text); Thread.Sleep(150);
        var after = Value(Control(window, id, fixture)); if (after != text) throw new InvalidOperationException("The application did not retain the requested text; inspect before retrying");
        return new { changed = true, window, control = id, sha256 = Hash(after) };
    }
    private static object Invoke(string window, string id, bool fixture = false)
    {
        var element = Control(window, id, fixture); if (!Describe(element).Invokable || (!fixture && !PermittedButtons(Target(window)).Contains(id))) throw new InvalidOperationException("Only local Calculator arithmetic buttons are approved for Invoke");
        ((InvokePattern)element.GetCurrentPattern(InvokePattern.Pattern)).Invoke(); return new { invoked = true, window, control = id };
    }
    private static object Sum(int a, int b)
    {
        if (a < 0 || b < 0 || a > 9999 || b > 9999) throw new InvalidOperationException("Calculator sum supports integers from 0 to 9999");
        var windows=Windows().Where(w=>w.App=="calculator").ToList();if(windows.Count==0){Launch("calculator",null);windows=Windows().Where(w=>w.App=="calculator").ToList();}if(windows.Count!=1)throw new InvalidOperationException("A unique Calculator window is required");var window=windows[0];
        AutomationElement Button(string name) => Elements(Target(window.Id)).FirstOrDefault(e => e.Current.AutomationId == name) ?? throw new InvalidOperationException("Calculator must be in a local arithmetic mode; missing " + name);
        void Press(string name) { var element = Button(name); Invoke(window.Id, ControlId(element)); Thread.Sleep(100); }
        Button("equalButton"); Button("plusButton"); Press("clearButton"); foreach (var digit in a.ToString(System.Globalization.CultureInfo.InvariantCulture)) Press("num" + digit + "Button"); Press("plusButton"); foreach (var digit in b.ToString(System.Globalization.CultureInfo.InvariantCulture)) Press("num" + digit + "Button"); Press("equalButton"); Thread.Sleep(200);
        var display = Elements(Target(window.Id)).FirstOrDefault(e => e.Current.AutomationId == "CalculatorResults") ?? throw new InvalidOperationException("Calculator result display was not found");
        var observed = (Value(display) ?? display.Current.Name).Replace(",", "").Replace("\u200e", "").Replace("\u200f", "");
        var numbers=System.Text.RegularExpressions.Regex.Matches(observed,@"[-+]?\d[\d.\u00a0\u202f]*");
        var displayed=numbers.Count==0?"":numbers[numbers.Count-1].Value.Replace("\u00a0","").Replace("\u202f","");
        if(!decimal.TryParse(displayed,System.Globalization.NumberStyles.Number,System.Globalization.CultureInfo.InvariantCulture,out var actual)||actual!=a+b)throw new InvalidOperationException("Calculator result could not be verified: "+observed);
        return new { verified = true, app = "calculator", window = window.Id, expression = a + " + " + b, result = a + b, observed };
    }
    private static object Launch(string app, string? file)
    {
        string executable = app switch { "notepad" => "notepad.exe", "calculator" => "calc.exe", _ => throw new InvalidOperationException("Only Notepad and Calculator are supported") };
        if (file != null && (app != "notepad" || !Path.IsPathFullyQualified(file) || !File.Exists(file))) throw new InvalidOperationException("Invalid note file");
        var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", executable)) { UseShellExecute = false, RedirectStandardOutput=true, RedirectStandardError=true }; if (file != null) info.ArgumentList.Add(file);
        using var process = Process.Start(info) ?? throw new InvalidOperationException("Application could not start"); Thread.Sleep(1000);
        var windows = Windows().Where(w => w.App == app).ToList(); for (int i = 0; windows.Count == 0 && i < 8; i++) { Thread.Sleep(500); windows = Windows().Where(w => w.App == app).ToList(); }
        if (windows.Count == 0) throw new InvalidOperationException("Launch requested but no supported visible window was found yet; inspect Windows again");
        return new { launched = true, app, windows };
    }
    private static void Fixture()
    {
        Forms.Application.EnableVisualStyles(); Forms.Application.SetCompatibleTextRenderingDefault(false); var form = new Forms.Form { Text = "Dyanari automation fixture", Width = 460, Height = 250 };
        var text = new Forms.TextBox { AccessibleName = "Fixture text", Name = "noteText", Text = "Original fixture text", Left = 20, Top = 25, Width = 380 };
        var label = new Forms.Label { AccessibleName = "Fixture result", Text = "Waiting", Left = 20, Top = 130, Width = 380 };
        var button = new Forms.Button { AccessibleName = "Apply fixture", Text = "Apply", Left = 20, Top = 75, Width = 150 }; button.Click += (_, _) => { label.Text = "Applied: " + text.Text; label.AccessibleName = label.Text; }; form.Controls.AddRange(new Forms.Control[] { text, button, label }); Forms.Application.Run(form);
    }
    private static object SelfTest()
    {
        using var child = Process.Start(new ProcessStartInfo(Environment.ProcessPath!) { ArgumentList = { "--fixture" }, UseShellExecute = false, CreateNoWindow = true }) ?? throw new InvalidOperationException("Fixture did not start");
        try
        {
            WindowInfo? info = null; for (int i = 0; i < 60; i++) { Thread.Sleep(100); child.Refresh(); if (child.MainWindowHandle != IntPtr.Zero) { try { info = Info(child.MainWindowHandle, true); } catch { } if (info != null) break; } }
            if (info == null) throw new InvalidOperationException("Fixture window was not available"); var root = Target(info.Id, true);
            var text = Elements(root).First(e => e.Current.Name == "Fixture text"); var description = Describe(text);
            SetText(info.Id, description.Id, description.Sha256!, "Dyanari verified UI Automation", true);
            bool staleRejected = false; try { SetText(info.Id, description.Id, description.Sha256!, "Wrong", true); } catch { staleRejected = true; }
            var button = Elements(Target(info.Id, true)).First(e => e.Current.Name == "Apply fixture"); Invoke(info.Id, ControlId(button), true); Thread.Sleep(250);
            var applied = Elements(Target(info.Id, true)).Any(e => e.Current.Name == "Applied: Dyanari verified UI Automation");
            if (!staleRejected || !applied) throw new InvalidOperationException("UI Automation verification failed");
            return new { passed = true, realWindowsUiAutomation = true, textReplacementVerified = true, staleTextRejected = true, buttonInvocationVerified = true };
        }
        finally { if (!child.HasExited) { child.CloseMainWindow(); if (!child.WaitForExit(2000)) child.Kill(true); } }
    }
}
