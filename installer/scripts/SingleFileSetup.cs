// Origami Reader setup as one file. The setup folder is a ZIP appended to
// this program, followed by a trailer: the ZIP's start (8 bytes,
// little-endian) and the marker "ORIGAMI1". Running it unpacks the folder
// into a temporary directory, starts setup from there, waits for it to
// close, then removes the temporary files.
//
// Built by installer/scripts/make-single-exe.ps1.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class SingleFileSetup {
    const string Marker = "ORIGAMI1";

    // A read-only view of part of a file, so the appended ZIP can be read in place.
    sealed class Slice : Stream {
        readonly Stream inner; readonly long start, length; long position;
        public Slice(Stream inner, long start, long length) { this.inner = inner; this.start = start; this.length = length; }
        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return length; } }
        public override long Position { get { return position; } set { position = value; } }
        public override int Read(byte[] buffer, int offset, int count) {
            long left = length - position;
            if (left <= 0) return 0;
            if (count > left) count = (int)left;
            inner.Position = start + position;
            int n = inner.Read(buffer, offset, count);
            position += n;
            return n;
        }
        public override long Seek(long offset, SeekOrigin origin) {
            position = origin == SeekOrigin.Begin ? offset : origin == SeekOrigin.Current ? position + offset : length + offset;
            return position;
        }
        public override void Flush() { }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }

    static void Extract(string target, Action<int> progress) {
        using (var file = File.OpenRead(Application.ExecutablePath)) {
            var trailer = new byte[16];
            file.Seek(-16, SeekOrigin.End);
            file.Read(trailer, 0, 16);
            if (Encoding.ASCII.GetString(trailer, 8, 8) != Marker) throw new Exception("This setup file is incomplete. Download it again.");
            long start = BitConverter.ToInt64(trailer, 0);
            using (var zip = new ZipArchive(new Slice(file, start, file.Length - 16 - start), ZipArchiveMode.Read)) {
                string root = Path.GetFullPath(target) + Path.DirectorySeparatorChar;
                int done = 0, total = zip.Entries.Count;
                foreach (var entry in zip.Entries) {
                    string path = Path.GetFullPath(Path.Combine(target, entry.FullName));
                    if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new Exception("This setup file is damaged. Download it again.");
                    if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(path); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    entry.ExtractToFile(path, true);
                    progress(++done * 100 / Math.Max(1, total));
                }
            }
        }
    }

    // Setup runs as origami-installer-ui.exe from the unpacked folder (the
    // launcher only checks prerequisites and starts it).
    static bool SetupRunning(string folder) {
        foreach (var p in Process.GetProcessesByName("origami-installer-ui")) {
            try { if (p.MainModule.FileName.StartsWith(folder, StringComparison.OrdinalIgnoreCase)) return true; }
            catch { }
        }
        return false;
    }

    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        string folder = Path.Combine(Path.GetTempPath(), "Origami-Setup-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        try {
            var form = new Form {
                Text = "Origami Reader Setup", Width = 420, Height = 150, FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterScreen,
                Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath)
            };
            var label = new Label { Text = "Preparing Origami Reader setup...", Left = 20, Top = 20, Width = 370 };
            var bar = new ProgressBar { Left = 20, Top = 50, Width = 370, Height = 20, Maximum = 100 };
            form.Controls.Add(label);
            form.Controls.Add(bar);
            Exception failure = null;
            form.Shown += delegate {
                new Thread(() => {
                    try { Extract(folder, p => form.BeginInvoke((Action)(() => bar.Value = Math.Min(100, p)))); }
                    catch (Exception e) { failure = e; }
                    form.BeginInvoke((Action)form.Close);
                }) { IsBackground = true }.Start();
            };
            Application.Run(form);
            if (failure != null) throw failure;
            var launcher = Directory.GetFiles(folder, "Origami Reader Installer.exe", SearchOption.AllDirectories).FirstOrDefault();
            if (launcher == null) throw new Exception("This setup file is damaged. Download it again.");
            using (var p = Process.Start(new ProcessStartInfo(launcher) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(launcher) })) {
                p.WaitForExit();
            }
            // Wait for the setup window to close before removing its files.
            Thread.Sleep(3000);
            while (SetupRunning(folder)) Thread.Sleep(2000);
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Origami Reader Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
        } finally {
            try { if (Directory.Exists(folder)) Directory.Delete(folder, true); } catch { }
        }
    }
}
