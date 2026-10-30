// Marks pictures made with Origami's image models as AI-generated, in two
// ways nobody sees: an invisible TrustMark watermark in the pixels when a
// cover or portrait is made, and AI metadata when it is saved as a file
// (Saved artwork). TrustMark is by Adobe, MIT code and weights
// (image_mark/LICENSE-TrustMark.txt); image_mark/bch.rs is its Rust BCH code,
// unchanged. The rest follows TrustMark's Rust encoder for variant Q.
use image::imageops::FilterType;
use std::path::PathBuf;
use tauri::AppHandle;

// Only its encoder is used here.
#[allow(dead_code)]
mod bch;

pub type Result<T> = std::result::Result<T, String>;

/// The 61 data bits (TrustMark's BCH-5 version): the first 61 bits of
/// SHA-256("Origami Reader: AI-generated image, version 1").
pub const PAYLOAD: &str = "0011100111001011011100100101000010001000100011001000111111111";
const ENCODER: &str = "encoder_Q.onnx";
const SIZE: usize = 256;
// TrustMark's normal strength.
const STRENGTH: f32 = 0.95;

/// The encoder ships with the app in runtime/trustmark; in development it is
/// read from .local/trustmark.
fn model_dir() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join("runtime").join("trustmark");
    if beside.join(ENCODER).is_file() {
        return Some(beside);
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.local/trustmark");
    (cfg!(debug_assertions) && dev.join(ENCODER).is_file()).then_some(dev)
}

/// The 100 bits TrustMark embeds: the data, 35 BCH-5 error-correction bits and
/// the version "0001".
fn encoded_bits(data: &str) -> String {
    const DATA: usize = 61;
    const ECC: usize = 35;
    let mut padded = data.to_string();
    padded.push_str(&"0".repeat(DATA - data.len() + (8 - DATA % 8)));
    let bytes: Vec<u8> = padded
        .as_bytes()
        .chunks(8)
        .map(|c| c.iter().fold(0u8, |byte, bit| byte << 1 | (bit - b'0')))
        .collect();
    let mut state = bch::bch_init(5, bch::POLYNOMIAL);
    let ecc: String = bch::bch_encode(&mut state, &bytes).iter().map(|b| format!("{b:08b}")).collect();
    format!("{data}{}0001", &ecc[..ECC])
}

/// The picture as TrustMark's input: 256 x 256, channels first, in [-1, 1].
fn model_input(img: &image::RgbImage) -> Vec<f32> {
    let small = image::imageops::resize(img, SIZE as u32, SIZE as u32, FilterType::Triangle);
    let n = SIZE * SIZE;
    let mut out = vec![0.0f32; 3 * n];
    for (i, p) in small.pixels().enumerate() {
        for c in 0..3 {
            out[c * n + i] = p[c] as f32 / 255.0 * 2.0 - 1.0;
        }
    }
    out
}

/// Adds the watermark to a PNG and returns the new PNG.
pub fn watermark_png(app: &AppHandle, png: &[u8]) -> Result<Vec<u8>> {
    let dir = model_dir().ok_or("The image watermark model is missing.")?;
    let env = crate::embed::runtime_env(app)?;
    let mut session = ort::session::Session::builder(env)
        .map_err(|e| e.to_string())?
        .with_intra_threads(4)
        .map_err(|e| e.to_string())?
        .commit_from_file(dir.join(ENCODER))
        .map_err(|e| e.to_string())?;
    mark(&mut session, png)
}

fn mark(session: &mut ort::session::Session, png: &[u8]) -> Result<Vec<u8>> {
    let img = image::load_from_memory(png).map_err(|e| e.to_string())?.to_rgb8();
    let (w, h) = img.dimensions();
    // Pictures more than twice as long as they are wide need TrustMark's
    // centre crop. Origami's covers and portraits never are.
    if w > 2 * h || h > 2 * w {
        return Err("This picture shape is not watermarked.".into());
    }
    let input = model_input(&img);
    let bits: Vec<f32> = encoded_bits(PAYLOAD).bytes().map(|b| (b - b'0') as f32).collect();
    let picture = ort::value::Tensor::from_array(([1usize, 3, SIZE, SIZE], input.clone())).map_err(|e| e.to_string())?;
    let message = ort::value::Tensor::from_array(([1usize, 100], bits)).map_err(|e| e.to_string())?;
    let result = session
        .run(ort::inputs!["onnx::Concat_0" => picture, "onnx::Gemm_1" => message])
        .map_err(|e| e.to_string())?;
    let (_, out) = result["image"].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
    // The change the encoder made, kept small, stored in [0, 1] so it scales
    // to the picture's size the way TrustMark's does.
    let n = SIZE * SIZE;
    let mut residual = image::Rgb32FImage::new(SIZE as u32, SIZE as u32);
    for (i, p) in residual.pixels_mut().enumerate() {
        for c in 0..3 {
            let r = (STRENGTH * (out[c * n + i] - input[c * n + i])).clamp(-0.2, 0.2);
            p[c] = (r + 1.0) / 2.0;
        }
    }
    let residual = image::imageops::resize(&residual, w, h, FilterType::Triangle);
    let mut marked = img;
    for (p, r) in marked.pixels_mut().zip(residual.pixels()) {
        for c in 0..3 {
            let x = p[c] as f32 / 255.0 * 2.0 - 1.0;
            let v = ((x + r[c] * 2.0 - 1.0).min(1.0) + 1.0) / 2.0;
            p[c] = (v * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }
    let mut encoded = std::io::Cursor::new(Vec::new());
    marked
        .write_to(&mut encoded, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(encoded.into_inner())
}

// --- Metadata ---------------------------------------------------------------------------------

const DESCRIPTION: &str = "AI-generated image. Made with Origami Reader.";

/// IPTC's "trained algorithmic media" source type, as read by photo tools and platforms.
fn xmp() -> String {
    format!(
        "<?xpacket begin=\"\u{feff}\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\
<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\
<rdf:Description rdf:about=\"\" xmlns:Iptc4xmpExt=\"http://iptc.org/std/Iptc4xmpExt/2008-02-29/\" \
xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\
<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>\
<xmp:CreatorTool>Origami Reader</xmp:CreatorTool>\
<dc:description><rdf:Alt><rdf:li xml:lang=\"x-default\">{DESCRIPTION}</rdf:li></rdf:Alt></dc:description>\
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end=\"r\"?>"
    )
}

/// The file with the AI metadata added; a file it cannot read is returned unchanged.
pub fn tag_file(bytes: Vec<u8>, ext: &str) -> Vec<u8> {
    let tagged = match ext {
        "png" => tag_png(&bytes),
        "jpg" | "jpeg" => tag_jpeg(&bytes),
        "webp" => tag_webp(&bytes),
        _ => None,
    };
    tagged.unwrap_or(bytes)
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

fn png_chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut chunk = (data.len() as u32).to_be_bytes().to_vec();
    chunk.extend_from_slice(kind);
    chunk.extend_from_slice(data);
    let crc = crc32(&chunk[4..]);
    chunk.extend_from_slice(&crc.to_be_bytes());
    chunk
}

/// XMP (iTXt) and a plain description (tEXt), right after the header chunk.
fn tag_png(bytes: &[u8]) -> Option<Vec<u8>> {
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") || bytes.get(12..16) != Some(b"IHDR") {
        return None;
    }
    let ihdr_end = 8 + 12 + u32::from_be_bytes(bytes.get(8..12)?.try_into().ok()?) as usize;
    let mut itxt = b"XML:com.adobe.xmp\0\0\0\0\0".to_vec();
    itxt.extend_from_slice(xmp().as_bytes());
    let mut out = bytes.get(..ihdr_end)?.to_vec();
    out.extend(png_chunk(b"iTXt", &itxt));
    out.extend(png_chunk(b"tEXt", format!("Description\0{DESCRIPTION}").as_bytes()));
    out.extend(png_chunk(b"tEXt", b"Software\0Origami Reader"));
    out.extend_from_slice(bytes.get(ihdr_end..)?);
    Some(out)
}

/// An XMP segment (APP1) right after the start of the image.
fn tag_jpeg(bytes: &[u8]) -> Option<Vec<u8>> {
    if !bytes.starts_with(&[0xFF, 0xD8]) {
        return None;
    }
    let mut payload = b"http://ns.adobe.com/xap/1.0/\0".to_vec();
    payload.extend_from_slice(xmp().as_bytes());
    let mut out = vec![0xFF, 0xD8, 0xFF, 0xE1];
    out.extend_from_slice(&u16::try_from(payload.len() + 2).ok()?.to_be_bytes());
    out.extend(payload);
    out.extend_from_slice(&bytes[2..]);
    Some(out)
}

fn riff_chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut chunk = kind.to_vec();
    chunk.extend_from_slice(&(data.len() as u32).to_le_bytes());
    chunk.extend_from_slice(data);
    if data.len() % 2 == 1 {
        chunk.push(0);
    }
    chunk
}

/// An XMP chunk, which needs WebP's extended header (VP8X) with its XMP flag.
fn tag_webp(bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    let first = &bytes[12..16];
    let mut body = if first == b"VP8X" {
        let mut body = bytes[12..].to_vec();
        body[8] |= 0x04;
        body
    } else {
        let (width, height) = image::ImageReader::new(std::io::Cursor::new(bytes))
            .with_guessed_format()
            .ok()?
            .into_dimensions()
            .ok()?;
        // A lossless image says in its header whether it uses transparency.
        let alpha = first == b"VP8L" && bytes.get(24).is_some_and(|b| b & 0x10 != 0);
        let mut header = vec![0x04 | if alpha { 0x10 } else { 0 }, 0, 0, 0];
        header.extend_from_slice(&(width - 1).to_le_bytes()[..3]);
        header.extend_from_slice(&(height - 1).to_le_bytes()[..3]);
        let mut body = riff_chunk(b"VP8X", &header);
        body.extend_from_slice(&bytes[12..]);
        body
    };
    body.extend(riff_chunk(b"XMP ", xmp().as_bytes()));
    let mut out = b"RIFF".to_vec();
    out.extend_from_slice(&(body.len() as u32 + 4).to_le_bytes());
    out.extend_from_slice(b"WEBP");
    out.extend(body);
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bits_match_trustmark() {
        // TrustMark's own test vector (rust/src/bits.rs).
        let data = "1011011110011000111111000000011111011111011100000110110110111";
        assert_eq!(
            encoded_bits(data),
            "1011011110011000111111000000011111011111011100000110110110111000110010101101111010011011000010000001"
        );
        assert_eq!(encoded_bits(PAYLOAD).len(), 100);
    }

    fn sample() -> image::RgbImage {
        let cover = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/starter-library/covers");
        let file = std::fs::read_dir(cover).unwrap().flatten().find(|f| f.path().extension().is_some_and(|e| e == "webp")).unwrap();
        image::open(file.path()).unwrap().to_rgb8()
    }

    #[test]
    fn metadata_is_added_and_the_files_still_open() {
        let img = sample();
        for format in [image::ImageFormat::Png, image::ImageFormat::Jpeg, image::ImageFormat::WebP] {
            let mut bytes = std::io::Cursor::new(Vec::new());
            img.write_to(&mut bytes, format).unwrap();
            let ext = format.extensions_str()[0];
            let tagged = tag_file(bytes.into_inner(), ext);
            let text = String::from_utf8_lossy(&tagged);
            assert!(text.contains("trainedAlgorithmicMedia"), "{ext}");
            let back = image::load_from_memory(&tagged).unwrap().to_rgb8();
            assert_eq!(back.dimensions(), img.dimensions(), "{ext}");
        }
    }

    // Needs ORT_DYLIB_PATH and both models in .local/trustmark; skipped otherwise.
    #[test]
    fn watermark_is_invisible_and_survives_resizing_and_jpeg() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.local/trustmark");
        let Ok(ort_path) = std::env::var("ORT_DYLIB_PATH") else { return };
        if !dir.join(ENCODER).is_file() || !dir.join("decoder_Q.onnx").is_file() {
            return;
        }
        let env = ort::init_from(ort_path).unwrap().build().unwrap();
        let mut encoder = ort::session::Session::builder(&env).unwrap().commit_from_file(dir.join(ENCODER)).unwrap();
        let mut decoder = ort::session::Session::builder(&env).unwrap().commit_from_file(dir.join("decoder_Q.onnx")).unwrap();
        let img = sample();
        let mut png = std::io::Cursor::new(Vec::new());
        img.write_to(&mut png, image::ImageFormat::Png).unwrap();
        let marked = image::load_from_memory(&mark(&mut encoder, &png.into_inner()).unwrap()).unwrap().to_rgb8();
        // Invisible: peak signal-to-noise ratio well above 35 dB.
        let mse = img.as_raw().iter().zip(marked.as_raw()).map(|(a, b)| (*a as f64 - *b as f64).powi(2)).sum::<f64>() / img.as_raw().len() as f64;
        let psnr = 10.0 * (255.0f64.powi(2) / mse.max(1e-9)).log10();
        assert!(psnr > 35.0, "PSNR {psnr:.1} dB");
        let expected = encoded_bits(PAYLOAD);
        let mut decode = |picture: &image::RgbImage| {
            let input = ort::value::Tensor::from_array(([1usize, 3, SIZE, SIZE], model_input(picture))).unwrap();
            let result = decoder.run(ort::inputs!["image" => input]).unwrap();
            let (_, bits) = result["output"].try_extract_tensor::<f32>().unwrap();
            bits.iter().map(|b| if *b < 0.0 { '0' } else { '1' }).collect::<String>()
        };
        let flips = |got: String| got.chars().zip(expected.chars()).filter(|(a, b)| a != b).count();
        let (direct, unmarked) = (flips(decode(&marked)), flips(decode(&img)));
        assert!(direct <= 5, "direct");
        let (w, h) = marked.dimensions();
        let smaller = image::imageops::resize(&marked, w * 3 / 4, h * 3 / 4, FilterType::Triangle);
        let mut jpeg = std::io::Cursor::new(Vec::new());
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 80).encode_image(&smaller).unwrap();
        let reloaded = image::load_from_memory(&jpeg.into_inner()).unwrap().to_rgb8();
        let after = flips(decode(&reloaded));
        eprintln!("TrustMark: PSNR {psnr:.1} dB, bit errors {direct} direct, {after} after resize and JPEG, {unmarked} unmarked");
        assert!(after <= 5, "resized and JPEG");
        // An unmarked picture does not carry Origami's bits.
        assert!(unmarked > 5, "unmarked");
    }
}
