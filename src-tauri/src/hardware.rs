// A local, read-only look at this computer's graphics and memory, so Origami can
// pick defaults that keep reading aloud responsive. Nothing leaves the computer.
use serde_json::{json, Value};
use std::process::{Command, Stdio};

fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.stdin(Stdio::null()).stderr(Stdio::null())
}

fn vendor(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.contains("nvidia") || n.contains("geforce") || n.contains("quadro") {
        "nvidia"
    } else if n.contains("amd") || n.contains("radeon") {
        "amd"
    } else if n.contains("intel") {
        "intel"
    } else if n.contains("apple") {
        "apple"
    } else {
        "other"
    }
}

// Shared-memory graphics report little or no dedicated video memory.
fn integrated(vendor: &str, vram_mb: u64) -> bool {
    match vendor {
        "nvidia" => false,
        "apple" => true,
        _ => vram_mb < 2048,
    }
}

fn gpu(name: &str, vram_mb: u64) -> Value {
    let v = vendor(name);
    json!({"name": name.trim(), "vendor": v, "vramMb": vram_mb, "integrated": integrated(v, vram_mb)})
}

pub fn fallback() -> Value {
    json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "gpus": [],
        "memoryMb": 0,
        "laptop": false,
        "threads": std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
    })
}

#[cfg(windows)]
fn detect(profile: &mut Value) {
    // The display class registry key has each adapter's full 64-bit video memory;
    // Win32_VideoController stops counting at 4 GB.
    const SCRIPT: &str = r#"$ErrorActionPreference='SilentlyContinue'
$g = @(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' | Where-Object { $_.DriverDesc } | ForEach-Object { [pscustomobject]@{ name = [string]$_.DriverDesc; vram = [uint64]($_.'HardwareInformation.qwMemorySize' | Select-Object -First 1) } })
$c = @((Get-CimInstance Win32_SystemEnclosure).ChassisTypes)
$b = @(Get-CimInstance Win32_Battery).Count
$m = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
[pscustomobject]@{ gpus = $g; chassis = $c; battery = $b; memory = $m } | ConvertTo-Json -Compress -Depth 3"#;
    let Ok(output) = hidden(Command::new("powershell.exe").args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        SCRIPT,
    ]))
    .output() else {
        return;
    };
    let Ok(data) = serde_json::from_slice::<Value>(&output.stdout) else {
        return;
    };
    let list = |v: &Value| match v {
        Value::Array(items) => items.clone(),
        Value::Null => vec![],
        other => vec![other.clone()],
    };
    profile["gpus"] = Value::Array(
        list(&data["gpus"])
            .iter()
            .map(|g| {
                gpu(
                    g["name"].as_str().unwrap_or("Graphics adapter"),
                    g["vram"].as_u64().unwrap_or(0) / (1024 * 1024),
                )
            })
            .collect(),
    );
    // Portable chassis types from the SMBIOS specification.
    let portable = [8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32];
    profile["laptop"] = json!(
        data["battery"].as_u64().unwrap_or(0) > 0
            || list(&data["chassis"])
                .iter()
                .any(|c| c.as_u64().is_some_and(|c| portable.contains(&c)))
    );
    profile["memoryMb"] = json!(data["memory"].as_u64().unwrap_or(0) / (1024 * 1024));
}

#[cfg(target_os = "linux")]
fn detect(profile: &mut Value) {
    use std::fs::read_to_string;
    let mut gpus = Vec::new();
    // NVIDIA reports its memory through its own tool when the driver is installed.
    if let Ok(output) = hidden(Command::new("nvidia-smi").args([
        "--query-gpu=name,memory.total",
        "--format=csv,noheader,nounits",
    ]))
    .output()
    {
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            if let Some((name, mb)) = line.rsplit_once(',') {
                gpus.push(gpu(name, mb.trim().parse().unwrap_or(0)));
            }
        }
    }
    if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
        for entry in entries.flatten() {
            let device = entry.path().join("device");
            let Ok(id) = read_to_string(device.join("vendor")) else { continue };
            let name = match id.trim() {
                "0x10de" => continue, // listed above when its driver is present
                "0x1002" => "AMD Radeon",
                "0x8086" => "Intel graphics",
                _ => continue,
            };
            let vram = read_to_string(device.join("mem_info_vram_total"))
                .ok()
                .and_then(|v| v.trim().parse::<u64>().ok())
                .unwrap_or(0)
                / (1024 * 1024);
            if !gpus.iter().any(|g| g["name"] == name && g["vramMb"] == vram) {
                gpus.push(gpu(name, vram));
            }
        }
    }
    profile["gpus"] = Value::Array(gpus);
    let battery = std::fs::read_dir("/sys/class/power_supply")
        .map(|d| {
            d.flatten()
                .any(|e| e.file_name().to_string_lossy().starts_with("BAT"))
        })
        .unwrap_or(false);
    let chassis = read_to_string("/sys/class/dmi/id/chassis_type")
        .ok()
        .and_then(|c| c.trim().parse::<u64>().ok())
        .is_some_and(|c| [8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32].contains(&c));
    profile["laptop"] = json!(battery || chassis);
    let memory = read_to_string("/proc/meminfo")
        .ok()
        .and_then(|m| {
            m.lines()
                .find(|l| l.starts_with("MemTotal:"))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|kb| kb.parse::<u64>().ok())
        })
        .unwrap_or(0);
    profile["memoryMb"] = json!(memory / 1024);
}

#[cfg(target_os = "macos")]
fn detect(profile: &mut Value) {
    let sysctl = |key: &str| {
        hidden(Command::new("sysctl").args(["-n", key]))
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default()
    };
    let memory = sysctl("hw.memsize").parse::<u64>().unwrap_or(0) / (1024 * 1024);
    profile["memoryMb"] = json!(memory);
    profile["laptop"] = json!(sysctl("hw.model").starts_with("MacBook"));
    profile["gpus"] = if std::env::consts::ARCH == "aarch64" {
        // Apple silicon shares memory between the processor and graphics.
        json!([gpu("Apple silicon", memory)])
    } else {
        json!([gpu("Intel Mac graphics", 0)])
    };
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn detect(_profile: &mut Value) {}

pub fn profile() -> Value {
    let mut profile = fallback();
    detect(&mut profile);
    profile
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapters_are_classified_by_vendor_and_dedicated_memory() {
        let nvidia = gpu("NVIDIA GeForce RTX 4080 SUPER", 16376);
        assert_eq!(nvidia["vendor"], "nvidia");
        assert_eq!(nvidia["integrated"], false);
        let apu = gpu("AMD Radeon(TM) Graphics", 512);
        assert_eq!(apu["vendor"], "amd");
        assert_eq!(apu["integrated"], true);
        assert_eq!(gpu("AMD Radeon RX 7800 XT", 16368)["integrated"], false);
        assert_eq!(gpu("Intel(R) UHD Graphics 620", 128)["integrated"], true);
        assert_eq!(gpu("Apple silicon", 16384)["integrated"], true);
    }
}
