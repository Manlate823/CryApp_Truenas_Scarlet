
import os
import json
import hashlib
import tempfile
from pathlib import Path
from datetime import datetime, timezone

BASE = Path("/cryapp_dev")
CODIGO = BASE / "codigo"
RESPALDOS = BASE / "respaldos"
REGISTROS = BASE / "registros"

EXTENSIONES = {".html", ".css", ".js", ".json", ".py", ".md"}
MODULOS = {"web", "backend", "admin"}
MAX_BYTES = 2097152


def _hash(datos):
    return hashlib.sha256(datos).hexdigest()


def _resolver(ruta):
    if not isinstance(ruta, str):
        raise ValueError("Ruta invalida")

    partes = Path(ruta).parts

    if (
        len(partes) < 2
        or partes[0] not in MODULOS
        or any(p in ("", ".", "..") or p.startswith(".") for p in partes)
        or Path(ruta).is_absolute()
    ):
        raise ValueError("Ruta no autorizada")

    if Path(ruta).suffix.lower() not in EXTENSIONES:
        raise ValueError("Extension no autorizada")

    destino = CODIGO.joinpath(*partes)

    if destino.is_symlink():
        raise ValueError("Enlace simbolico bloqueado")

    actual = CODIGO

    for parte in partes[:-1]:
        actual = actual / parte
        if actual.is_symlink():
            raise ValueError("Directorio simbolico bloqueado")

    if not destino.is_file():
        raise ValueError("Archivo no encontrado")

    return destino


def _leer_seguro(ruta):
    fd = os.open(
        ruta,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    )

    try:
        import stat
        info = os.fstat(fd)

        if not stat.S_ISREG(info.st_mode):
            raise ValueError("Archivo especial bloqueado")

        if info.st_size > MAX_BYTES:
            raise ValueError("Archivo demasiado grande")

        datos = os.read(fd, MAX_BYTES + 1)

        if len(datos) > MAX_BYTES:
            raise ValueError("Archivo demasiado grande")

        return datos
    finally:
        os.close(fd)


def editar_archivo_cryapp(ruta, contenido, sha256_esperado):
    if not isinstance(contenido, str):
        raise ValueError("Contenido invalido")

    nuevos = contenido.encode("utf-8")

    if len(nuevos) > MAX_BYTES:
        raise ValueError("Contenido demasiado grande")

    destino = _resolver(ruta)
    anteriores = _leer_seguro(destino)

    actual_hash = _hash(anteriores)

    if actual_hash != sha256_esperado:
        raise ValueError("El archivo cambio desde su lectura")

    if _hash(nuevos) == actual_hash:
        return {
            "estado": "sin_cambios",
            "ruta": ruta,
            "sha256": actual_hash
        }

    if not RESPALDOS.is_dir() or not REGISTROS.is_dir():
        raise ValueError("Directorios de respaldo no disponibles")

    marca = datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%S%fZ"
    )

    identificador = hashlib.sha256(
        (ruta + marca).encode()
    ).hexdigest()[:16]

    respaldo = RESPALDOS / (
        marca + "_" + identificador + ".bak"
    )

    fd_respaldo = os.open(
        respaldo,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600
    )

    try:
        with os.fdopen(fd_respaldo, "wb") as f:
            f.write(anteriores)
            f.flush()
            os.fsync(f.fileno())
    except Exception:
        respaldo.unlink(missing_ok=True)
        raise

    temporal = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=destino.parent,
            prefix=".cryapp_tmp_",
            delete=False
        ) as f:
            temporal = Path(f.name)
            f.write(nuevos)
            f.flush()
            os.fsync(f.fileno())

        os.chmod(temporal, 0o640)

        if _hash(_leer_seguro(destino)) != actual_hash:
            raise ValueError("El archivo cambio durante la edicion")

        os.replace(temporal, destino)
        temporal = None

        registro = {
            "fecha": marca,
            "ruta": ruta,
            "respaldo": respaldo.name,
            "sha256_anterior": actual_hash,
            "sha256_nuevo": _hash(nuevos)
        }

        log = REGISTROS / "ediciones.jsonl"

        with log.open("a", encoding="utf-8") as f:
            f.write(json.dumps(registro) + "\n")

        return {
            "estado": "modificado",
            **registro
        }

    finally:
        if temporal is not None:
            temporal.unlink(missing_ok=True)
