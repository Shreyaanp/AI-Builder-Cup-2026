"""RFC 8291 single-record encryption and RFC 8292 VAPID; no vendor SDK or model calls."""

import base64
import json
import os
import struct
import time
from typing import Any
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .settings import Settings

# Subscription endpoints are untrusted input. No arbitrary hosts, ports or redirects (SSRF).
PUSH_HOSTS = {"fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"}


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def decode(value: str) -> bytes:
    return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)


def valid_endpoint(value: str) -> bool:
    try:
        url = urlsplit(value)
        return (
            url.scheme == "https"
            and url.hostname in PUSH_HOSTS
            and url.port in (None, 443)
            and not (url.username or url.password or url.fragment)
            and url.path.startswith("/")
            and len(url.path) > 1
        )
    except ValueError:
        return False


def public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


def derive(secret: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(secret)


def encrypt(payload: dict[str, Any], peer: bytes, auth: bytes) -> bytes:
    ephemeral = ec.generate_private_key(ec.SECP256R1())
    server = public_bytes(ephemeral.public_key())
    shared = ephemeral.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), peer)
    )
    ikm = derive(shared, auth, b"WebPush: info\x00" + peer + server, 32)
    salt = os.urandom(16)
    key = derive(ikm, salt, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = derive(ikm, salt, b"Content-Encoding: nonce\x00", 12)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode() + b"\x02"
    if len(body) > 3993:
        raise ValueError("Push payload too large")
    return (
        salt
        + struct.pack("!IB", 4096, len(server))
        + server
        + AESGCM(key).encrypt(nonce, body, None)
    )


def configured(settings: Settings) -> bool:
    if not (
        settings.web_push_enabled
        and settings.web_push_public_key
        and settings.web_push_private_key.get_secret_value()
        and settings.web_push_subject.startswith(("mailto:", "https://"))
    ):
        return False
    try:
        key = ec.derive_private_key(
            int.from_bytes(decode(settings.web_push_private_key.get_secret_value())), ec.SECP256R1()
        )
        return public_bytes(key.public_key()) == decode(settings.web_push_public_key)
    except (ValueError, TypeError):
        return False


async def send(settings: Settings, subscription: dict[str, Any], payload: dict[str, Any]) -> int:
    endpoint = subscription["endpoint"]
    if not valid_endpoint(endpoint):
        return 410
    key = ec.derive_private_key(
        int.from_bytes(decode(settings.web_push_private_key.get_secret_value())), ec.SECP256R1()
    )
    url = urlsplit(endpoint)
    claims = {
        "aud": f"{url.scheme}://{url.netloc}",
        "exp": int(time.time()) + 3600,
        "sub": settings.web_push_subject,
    }
    token = encode(b'{"typ":"JWT","alg":"ES256"}') + "." + encode(json.dumps(claims).encode())
    r, s = decode_dss_signature(key.sign(token.encode(), ec.ECDSA(hashes.SHA256())))
    token += "." + encode(r.to_bytes(32) + s.to_bytes(32))
    body = encrypt(
        payload, decode(subscription["keys"]["p256dh"]), decode(subscription["keys"]["auth"])
    )
    async with httpx.AsyncClient(timeout=10, follow_redirects=False, trust_env=False) as client:
        response = await client.post(
            endpoint,
            content=body,
            headers={
                "Authorization": f"vapid t={token}, k={settings.web_push_public_key}",
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                "TTL": "900",
                "Urgency": "normal",
            },
        )
    return response.status_code
