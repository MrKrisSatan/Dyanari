using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
internal static class Program {
 [STAThread] static void Main(string[] args) {
  ApplicationConfiguration.Initialize();
  try {
   if (!Environment.Is64BitOperatingSystem || System.Runtime.InteropServices.RuntimeInformation.OSArchitecture != System.Runtime.InteropServices.Architecture.X64) throw new Exception("This installer supports Windows x64. ARM64, Linux and macOS require separate builds.");
   var root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Dyanari","setup",Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
   foreach(var name in new[]{"setup.ps1","uninstall.ps1","models.json","Dyanari.exe","setup-voicestudio.ps1","VOICESTUDIO.md"}) { using var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("DyanariSetup."+name) ?? throw new Exception("Missing setup payload: "+name); using var output=File.Create(Path.Combine(root,name)); input.CopyTo(output); }
   var p=new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","powershell.exe")){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardOutput=true};
   p.Environment["PSModulePath"]=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"WindowsPowerShell","v1.0","Modules")+";"+Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"WindowsPowerShell","Modules");
   foreach(var a in new[]{"-NoProfile","-STA","-ExecutionPolicy","Bypass","-File",Path.Combine(root,"setup.ps1")}) p.ArgumentList.Add(a);
   if(args.Contains("--self-test")) {p.ArgumentList.Add("-SelfTest");p.ArgumentList.Add("-Report");p.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory,"installer-self-test.json"));}
   using var child=Process.Start(p)!; var errors=child.StandardError.ReadToEndAsync(); var outputText=child.StandardOutput.ReadToEndAsync(); child.WaitForExit(); Environment.ExitCode=child.ExitCode;
   var log=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Dyanari","setup-last.log");File.WriteAllText(log,outputText.GetAwaiter().GetResult()+errors.GetAwaiter().GetResult());
   if(args.Contains("--self-test") && child.ExitCode!=0 && !File.Exists(Path.Combine(AppContext.BaseDirectory,"installer-self-test.json"))) File.WriteAllText(Path.Combine(AppContext.BaseDirectory,"installer-self-test.json"),System.Text.Json.JsonSerializer.Serialize(new{passed=false,error=File.ReadAllText(log)}));
   if(child.ExitCode!=0 && !args.Contains("--self-test")) MessageBox.Show("Setup did not finish. Your existing Dyanari memory has been preserved. Run setup again to retry.","Dyanari Setup");
   // Keep failed payloads for diagnosis; remove only our own successfully used files.
   if(child.ExitCode==0) { foreach(var name in new[]{"setup.ps1","uninstall.ps1","models.json","Dyanari.exe","setup-voicestudio.ps1","VOICESTUDIO.md"}) File.Delete(Path.Combine(root,name)); Directory.Delete(root); }
  } catch(Exception e) {if(args.Contains("--self-test")) File.WriteAllText(Path.Combine(AppContext.BaseDirectory,"installer-self-test.json"),System.Text.Json.JsonSerializer.Serialize(new {passed=false,error=e.Message})); else MessageBox.Show(e.Message,"Dyanari Setup");Environment.ExitCode=1;}
 }
}
