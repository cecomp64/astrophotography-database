"""
SSL certificate generation for HTTPS support.
Generates self-signed certificates for local network sync with PWA.
"""
import os
import datetime
import socket
import logging
from pathlib import Path
from typing import Tuple

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

logger = logging.getLogger(__name__)


def get_local_ips() -> list[str]:
    """Get all local IP addresses for this machine."""
    ips = ["127.0.0.1", "localhost"]
    try:
        hostname = socket.gethostname()
        ips.append(hostname)
        # Get all IPs associated with the hostname
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("::"):
                ips.append(ip)
    except Exception as e:
        logger.warning(f"Could not get local IPs: {e}")

    # Also try to get the primary local IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary_ip = s.getsockname()[0]
        s.close()
        if primary_ip not in ips:
            ips.append(primary_ip)
    except Exception:
        pass

    return ips


def generate_self_signed_cert(
    cert_dir: Path,
    cert_name: str = "server",
    valid_days: int = 365
) -> Tuple[Path, Path]:
    """
    Generate a self-signed certificate and private key.

    Args:
        cert_dir: Directory to store the certificate files
        cert_name: Base name for the certificate files
        valid_days: Number of days the certificate is valid

    Returns:
        Tuple of (cert_path, key_path)
    """
    cert_dir = Path(cert_dir)
    cert_dir.mkdir(parents=True, exist_ok=True)

    cert_path = cert_dir / f"{cert_name}.crt"
    key_path = cert_dir / f"{cert_name}.key"

    # Generate private key
    logger.info("Generating RSA private key...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Get local IPs for Subject Alternative Names
    local_ips = get_local_ips()
    logger.info(f"Including IPs in certificate: {local_ips}")

    # Build Subject Alternative Names
    san_list = []
    for ip in local_ips:
        try:
            # Try to parse as IP address
            san_list.append(x509.IPAddress(
                __import__("ipaddress").ip_address(ip)
            ))
        except ValueError:
            # It's a hostname
            san_list.append(x509.DNSName(ip))

    # Also add common Tailscale patterns
    san_list.append(x509.DNSName("*.ts.net"))
    san_list.append(x509.DNSName("*.tailscale.net"))

    # Generate certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Local"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Local"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Astrophotography Database"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=valid_days))
        .add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False,
        )
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=0),
            critical=True,
        )
        .sign(private_key, hashes.SHA256())
    )

    # Write private key
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    logger.info(f"Private key written to: {key_path}")

    # Write certificate
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    logger.info(f"Certificate written to: {cert_path}")

    return cert_path, key_path


def ensure_ssl_certs(cert_dir: Path) -> Tuple[Path, Path]:
    """
    Ensure SSL certificates exist, generating them if needed.

    Args:
        cert_dir: Directory to store/find certificates

    Returns:
        Tuple of (cert_path, key_path)
    """
    cert_path = cert_dir / "server.crt"
    key_path = cert_dir / "server.key"

    if cert_path.exists() and key_path.exists():
        logger.info(f"Using existing SSL certificates from {cert_dir}")
        return cert_path, key_path

    logger.info(f"Generating new SSL certificates in {cert_dir}")
    return generate_self_signed_cert(cert_dir)
