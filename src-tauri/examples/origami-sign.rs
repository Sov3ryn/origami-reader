// Signs update lists for Origami (see docs/UPDATES.md).
//
//   cargo run --example origami-sign -- keygen <secret-key-file>
//   cargo run --example origami-sign -- sign <secret-key-file> <manifest.json>
//   cargo run --example origami-sign -- content-keygen <content-key-file>
//   cargo run --example origami-sign -- encrypt <content-key-file> <in> <out>
//
// The content key encrypts update files so only copies of Origami built with
// it (ORIGAMI_UPDATE_CONTENT_KEY at build time) can open them. Keep it out of
// Git like the secret key.
//
// keygen writes a new secret key (keep it out of Git and off shared drives)
// and prints the public key to paste into UPDATE_PUBLIC_KEY in update.rs.
// sign writes <manifest.json>.sig next to the list.
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signer, SigningKey};

fn read_key(path: &str) -> SigningKey {
    let text = std::fs::read_to_string(path).expect("Could not read the secret key");
    let bytes: [u8; 32] = STANDARD
        .decode(text.trim())
        .expect("The secret key is not base64")
        .try_into()
        .expect("The secret key must be 32 bytes");
    SigningKey::from_bytes(&bytes)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["keygen", path] => {
            if std::path::Path::new(path).exists() {
                eprintln!("{path} already exists; not overwriting a key.");
                std::process::exit(1);
            }
            let mut seed = [0u8; 32];
            getrandom::getrandom(&mut seed).expect("No system randomness");
            let key = SigningKey::from_bytes(&seed);
            std::fs::write(path, STANDARD.encode(seed)).expect("Could not write the key");
            println!("Secret key written to {path}. Keep it safe; it cannot be recovered.");
            println!("Public key (UPDATE_PUBLIC_KEY): {}", STANDARD.encode(key.verifying_key().to_bytes()));
        }
        ["sign", key, manifest] => {
            let key = read_key(key);
            let bytes = std::fs::read(manifest).expect("Could not read the update list");
            let sig = STANDARD.encode(key.sign(&bytes).to_bytes());
            std::fs::write(format!("{manifest}.sig"), &sig).expect("Could not write the signature");
            println!("Signed {manifest}");
            println!("Public key: {}", STANDARD.encode(key.verifying_key().to_bytes()));
        }
        ["content-keygen", path] => {
            if std::path::Path::new(path).exists() {
                eprintln!("{path} already exists; not overwriting a key.");
                std::process::exit(1);
            }
            let mut key = [0u8; 32];
            getrandom::getrandom(&mut key).expect("No system randomness");
            std::fs::write(path, STANDARD.encode(key)).expect("Could not write the key");
            println!("Content key written to {path}. Build releases with ORIGAMI_UPDATE_CONTENT_KEY set to its contents.");
        }
        ["encrypt", key, input, output] => {
            use chacha20poly1305::{aead::{Aead, KeyInit}, XChaCha20Poly1305, XNonce};
            let text = std::fs::read_to_string(key).expect("Could not read the content key");
            let bytes: [u8; 32] = STANDARD.decode(text.trim()).expect("The content key is not base64").try_into().expect("The content key must be 32 bytes");
            let mut nonce = [0u8; 24];
            getrandom::getrandom(&mut nonce).expect("No system randomness");
            let plain = std::fs::read(input).expect("Could not read the file to encrypt");
            let sealed = XChaCha20Poly1305::new(&bytes.into()).encrypt(XNonce::from_slice(&nonce), plain.as_slice()).expect("Encryption failed");
            let mut out = b"OGU1".to_vec();
            out.extend_from_slice(&nonce);
            out.extend_from_slice(&sealed);
            std::fs::write(output, out).expect("Could not write the encrypted file");
            println!("Encrypted {input} -> {output}");
        }
        ["public", key] => println!("{}", STANDARD.encode(read_key(key).verifying_key().to_bytes())),
        _ => {
            eprintln!("Usage: origami-sign keygen <key-file> | sign <key-file> <manifest.json> | public <key-file> | content-keygen <file> | encrypt <content-key> <in> <out>");
            std::process::exit(2);
        }
    }
}
