from functools import lru_cache

from cryptography.fernet import Fernet

from app.core.config import get_settings


@lru_cache
def _fernet() -> Fernet:
    key = get_settings().session_encryption_key.get_secret_value()
    if not key:
        # Development fallback: derive an ephemeral key so sessions still work locally.
        # Production refuses to start without SESSION_ENCRYPTION_KEY (see config.get_settings).
        key = Fernet.generate_key().decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> bytes:
    return _fernet().encrypt(plaintext.encode("utf-8"))


def decrypt_secret(ciphertext: bytes) -> str:
    return _fernet().decrypt(ciphertext).decode("utf-8")
