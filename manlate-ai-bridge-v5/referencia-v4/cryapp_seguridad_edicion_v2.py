
import os
import re
import stat
import fcntl
from pathlib import Path
from contextlib import contextmanager

BASE = Path("/cryapp_dev")
CODIGO = BASE / "codigo"

MODULOS = {"web", "backend", "admin"}
EXTENSIONES = {".html", ".css", ".js", ".json", ".py", ".md"}

PROHIBIDOS = {
    "secret", "password", "credential", "token",
    "private", "backup", "respaldo", "config",
    "lock", "key", "env", "oauth", "database",
    "cert", "pem", "ssh"
}

MAX_BYTES = 2097152


def validar_ruta(ruta):
    if not isinstance(ruta, str):
        raise ValueError("Ruta invalida")

    if not ruta or len(ruta) > 240:
        raise ValueError("Longitud de ruta invalida")

    if "\\" in ruta or "\x00" in ruta:
        raise ValueError("Caracteres no permitidos")

    if ruta.startswith("/"):
        raise ValueError("Ruta absoluta bloqueada")

    partes = ruta.split("/")

    if len(partes) < 2:
        raise ValueError("Ruta incompleta")

    if partes[0] not in MODULOS:
        raise ValueError("Modulo no autorizado")

    for parte in partes:
        if (
            not parte
            or parte in (".", "..")
            or parte.startswith(".")
        ):
            raise ValueError("Ruta no autorizada")

        if not re.fullmatch(r"[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*", parte):
            raise ValueError("Nombre no permitido")

        if any(p in parte.lower() for p in PROHIBIDOS):
            raise ValueError("Nombre sensible bloqueado")

    if Path(ruta).suffix.lower() not in EXTENSIONES:
        raise ValueError("Extension bloqueada")

    actual = CODIGO

    for parte in partes:
        actual = actual / parte

        if actual.is_symlink():
            raise ValueError("Enlace simbolico bloqueado")

    if not actual.is_file():
        raise ValueError("Archivo no encontrado")

    info = actual.stat()

    if not stat.S_ISREG(info.st_mode):
        raise ValueError("Archivo especial bloqueado")

    if info.st_size > MAX_BYTES:
        raise ValueError("Archivo demasiado grande")

    return actual


@contextmanager
def bloqueo_edicion():
    base = BASE / "registros"

    if not base.is_dir() or base.is_symlink():
        raise ValueError("Directorio de registros invalido")

    ruta = base / ".edicion.lock"

    fd = os.open(
        ruta,
        os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW,
        0o600
    )

    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
