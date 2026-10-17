#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    // Direct shortcuts avoid opening a PowerShell console just to set config paths.
    let mut args = std::env::args_os().skip(1);
    while let Some(arg) = args.next() {
        let variable = if arg == "--worker-config" {
            Some("ORIGAMI_WORKER_CONFIG")
        } else if arg == "--cover-config" {
            Some("ORIGAMI_COVER_CONFIG")
        } else {
            None
        };
        if let Some(variable) = variable {
            if let Some(value) = args.next() {
                std::env::set_var(variable, value);
            }
        }
    }
    // WebKitGTK's DMA-BUF renderer often shows a blank window with NVIDIA's
    // proprietary driver on Linux; the regular renderer works everywhere.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && std::path::Path::new("/proc/driver/nvidia").exists()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    origami_lib::run();
}
