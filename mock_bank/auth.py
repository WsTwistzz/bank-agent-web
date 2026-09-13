import base64
import hashlib
import hmac
import secrets
import struct
import time


def hash_password(password, salt=None):
    if len(password) < 8:
        raise ValueError("password must contain at least 8 characters")
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password, encoded):
    try:
        algorithm, salt, expected = encoded.split("$", 2)
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=2**14, r=8, p=1
        )
        return hmac.compare_digest(actual, base64.b64decode(expected))
    except (AttributeError, ValueError):
        return False


def new_totp_secret():
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp(secret, timestamp=None):
    timestamp = time.time() if timestamp is None else timestamp
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded, casefold=True)
    counter = struct.pack(">Q", int(timestamp // 30))
    digest = hmac.new(key, counter, hashlib.sha1).digest()
    offset = digest[-1] & 15
    number = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{number:06d}"


def verify_totp(secret, code, timestamp=None):
    timestamp = time.time() if timestamp is None else timestamp
    return any(hmac.compare_digest(totp(secret, timestamp + drift), str(code))
               for drift in (-30, 0, 30))
