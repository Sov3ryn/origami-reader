using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Win32;

static class SetupLauncher {
    static bool WebViewPresent() {
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine }) {
            using (var root = RegistryKey.OpenBaseKey(hive, RegistryView.Registry32))
            using (var key = root.OpenSubKey(@"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}")) {
                Version version;
                if (key != null && Version.TryParse(Convert.ToString(key.GetValue("pv")), out version) && version > new Version(0,0,0,0)) return true;
            }
        }
        return false;
    }
    static bool VisualCppPresent() {
        using (var root = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
        using (var key = root.OpenSubKey(@"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64")) {
            return key != null && Convert.ToInt32(key.GetValue("Installed", 0)) == 1 && Convert.ToInt32(key.GetValue("Minor", 0)) >= 44;
        }
    }
    static void InstallDependency(string root, string filename, string arguments, string name) {
        if (MessageBox.Show("Origami Reader needs " + name + ". Install the included Microsoft runtime now?", "Origami Reader Installer", MessageBoxButtons.OKCancel, MessageBoxIcon.Information) != DialogResult.OK)
            throw new OperationCanceledException("Setup was cancelled before installing dependencies.");
        var start = new ProcessStartInfo(Path.Combine(root, "prerequisites", filename), arguments);
        start.UseShellExecute = true;
        using (var process = Process.Start(start)) {
            process.WaitForExit();
            if (process.ExitCode == 3010) throw new Exception("Microsoft's runtime requires a restart. Restart Windows, then open Origami Reader Installer again.");
            if (process.ExitCode != 0 && process.ExitCode != 1638) throw new Exception(name + " installation returned code " + process.ExitCode + ".");
        }
    }
    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        try {
            var root = AppDomain.CurrentDomain.BaseDirectory;
            if (!Environment.Is64BitOperatingSystem) throw new Exception("This package requires 64-bit Windows.");
            if (!File.Exists(Path.Combine(root, "payload", "manifest.json"))) throw new Exception("Extract the entire ZIP before starting setup. Keep the payload, bootstrap and prerequisites folders beside this launcher.");
            if (!VisualCppPresent()) InstallDependency(root, "VC_redist.x64.exe", "/install /passive /norestart", "Microsoft Visual C++ Runtime");
            if (!WebViewPresent()) InstallDependency(root, "MicrosoftEdgeWebView2RuntimeInstallerX64.exe", "/silent /install", "Microsoft Edge WebView2");
            if (!WebViewPresent()) throw new Exception("WebView2 is still unavailable. Restart Windows or install it from Microsoft's official WebView2 page.");
            Process.Start(new ProcessStartInfo(Path.Combine(root, "origami-installer-ui.exe")) { UseShellExecute = true, WorkingDirectory = root });
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Origami Reader Installer", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
