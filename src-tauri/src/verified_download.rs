// One published model file, downloaded to a .part file and checked against its
// size and SHA-256. Shared by the Related, voice note and handwriting models.
// The body is read on its own thread, so a connection that goes quiet is
// noticed (ureq has no timeout per read) and Cancel answers at once.
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::time::{Duration, Instant};

type Result<T> = std::result::Result<T, String>;

/// How long a download may go without receiving data before it stops.
const STALL: Duration = Duration::from_secs(60);

/// Downloads `url` to `part`. On success `part` holds the verified file and the
/// number of bytes is returned; on any failure `part` is removed.
/// `progress` receives the bytes received so far, about four times a second.
pub fn fetch(
    url: &str,
    part: &Path,
    size: u64,
    sha256: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<u64> {
    let response = ureq::get(url)
        .config()
        .timeout_connect(Some(Duration::from_secs(30)))
        .timeout_recv_response(Some(Duration::from_secs(60)))
        .build()
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;
    let mut body = response.into_body().into_reader();
    let (tx, rx) = std::sync::mpsc::sync_channel::<std::io::Result<Vec<u8>>>(4);
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 1 << 20];
        loop {
            match body.read(&mut buf) {
                Ok(n) => {
                    if tx.send(Ok(buf[..n].to_vec())).is_err() || n == 0 {
                        return;
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                    return;
                }
            }
        }
    });
    let mut out = std::fs::File::create(part).map_err(|e| e.to_string())?;
    let fail = |out: std::fs::File, message: String| -> Result<u64> {
        drop(out);
        let _ = std::fs::remove_file(part);
        Err(message)
    };
    let mut hash = Sha256::new();
    let mut got = 0u64;
    let mut last = Instant::now();
    let mut heard = Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst) {
            return fail(out, "Download cancelled.".into());
        }
        let chunk = match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(Ok(chunk)) => chunk,
            Ok(Err(e)) => return fail(out, format!("Download failed: {e}")),
            Err(RecvTimeoutError::Timeout) if heard.elapsed() < STALL => continue,
            Err(RecvTimeoutError::Timeout) => {
                return fail(
                    out,
                    "The download stopped receiving data. Try again.".into(),
                )
            }
            Err(RecvTimeoutError::Disconnected) => {
                return fail(out, "Download failed. Try again.".into())
            }
        };
        heard = Instant::now();
        if chunk.is_empty() {
            break;
        }
        if let Err(e) = out.write_all(&chunk) {
            return fail(out, e.to_string());
        }
        hash.update(&chunk);
        got += chunk.len() as u64;
        if got > size {
            break;
        }
        if last.elapsed().as_millis() > 250 {
            last = Instant::now();
            progress(got);
        }
    }
    if let Err(e) = out.flush() {
        return fail(out, e.to_string());
    }
    let digest: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != size || digest != sha256 {
        return fail(
            out,
            "The download did not match the published file. Try again.".into(),
        );
    }
    drop(out);
    Ok(got)
}
