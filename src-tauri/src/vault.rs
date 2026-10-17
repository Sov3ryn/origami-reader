//! Encryption for vaults and the parental PIN.
//!
//! A PIN is stretched with Argon2id (64 MiB, 3 passes) into a 256-bit key, and
//! vault content is sealed with XChaCha20-Poly1305. The book id is bound to
//! every sealed record, so records cannot be swapped between books. Nothing
//! that could recover a key is stored: a forgotten PIN cannot be reset.
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
pub type Result<T> = std::result::Result<T, String>;
pub type Key = [u8; 32];

const CHECK: &[u8] = b"origami-vault-check-v1";

pub fn valid_pin(pin: &str) -> Result<()> {
    if (4..=8).contains(&pin.len()) && pin.bytes().all(|b| b.is_ascii_digit()) {
        Ok(())
    } else {
        Err("Use a PIN of 4 to 8 digits.".into())
    }
}

pub fn random<const N: usize>() -> Result<[u8; N]> {
    let mut bytes = [0u8; N];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes)
}

pub fn derive(pin: &str, salt: &[u8]) -> Result<Key> {
    valid_pin(pin)?;
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(pin.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn seal(key: &Key, context: &str, plain: &[u8]) -> Result<String> {
    let nonce: [u8; 24] = random()?;
    let mut out = nonce.to_vec();
    out.extend(
        XChaCha20Poly1305::new(key.into())
            .encrypt(XNonce::from_slice(&nonce), Payload { msg: plain, aad: context.as_bytes() })
            .map_err(|_| "Encryption failed")?,
    );
    Ok(STANDARD.encode(out))
}

pub fn open(key: &Key, context: &str, sealed: &str) -> Result<Vec<u8>> {
    let data = STANDARD.decode(sealed).map_err(|_| "Damaged vault data")?;
    if data.len() < 24 + 16 {
        return Err("Damaged vault data".into());
    }
    XChaCha20Poly1305::new(key.into())
        .decrypt(XNonce::from_slice(&data[..24]), Payload { msg: &data[24..], aad: context.as_bytes() })
        .map_err(|_| "Wrong PIN or damaged vault data".into())
}

/// A new salt and the matching check value for a PIN.
pub fn create(pin: &str) -> Result<(String, String, Key)> {
    let salt: [u8; 16] = random()?;
    let key = derive(pin, &salt)?;
    Ok((STANDARD.encode(salt), seal(&key, "check", CHECK)?, key))
}

/// The key when the PIN matches the stored check value.
pub fn unlock(pin: &str, salt: &str, check: &str) -> Result<Key> {
    let salt = STANDARD.decode(salt).map_err(|_| "Damaged vault data")?;
    let key = derive(pin, &salt)?;
    match open(&key, "check", check) {
        Ok(v) if v == CHECK => Ok(key),
        _ => Err("That PIN is not correct.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pins_seal_and_reject() {
        assert!(valid_pin("123").is_err());
        assert!(valid_pin("123456789").is_err());
        assert!(valid_pin("12a4").is_err());
        let (salt, check, key) = create("2468").unwrap();
        assert_eq!(unlock("2468", &salt, &check).unwrap(), key);
        assert!(unlock("2469", &salt, &check).is_err());
        let sealed = seal(&key, "book-1", b"secret text").unwrap();
        assert!(!sealed.contains("secret"));
        assert_eq!(open(&key, "book-1", &sealed).unwrap(), b"secret text");
        assert!(open(&key, "book-2", &sealed).is_err());
    }
}
