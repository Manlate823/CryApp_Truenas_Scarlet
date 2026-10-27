
import os
import stat
from pathlib import Path

BASE = "/cryapp"

MODULOS = {"web", "backend", "admin"}

EXTENSIONES = {
    ".html", ".css", ".js", ".json", ".py", ".md"
}

EXCLUIDOS = {
    ".git", "node_modules", "__pycache__",
    "dist", "build", "backups", "secrets",
    ".next", "coverage"
}

PROTEGIDOS = (
    "secret", "password", "credential",
    "token", "private", "backup",
    "respaldo", "config", "lock",
    "key", "env"
)

MAX_ARCHIVO = 100000
MAX_LISTADO = 200

FLAGS_DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
FLAGS_FILE = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK


def validar_ruta(ruta):
    if not isinstance(ruta, str) or not ruta:
        raise ValueError("Ruta no válida")

    if len(ruta) > 300 or "\x00" in ruta:
        raise ValueError("Ruta no válida")

    partes = ruta.split("/")

    if len(partes) < 2:
        raise ValueError("Ruta incompleta")

    if partes[0] not in MODULOS:
        raise ValueError("Módulo no autorizado")

    if any(
        not parte
        or parte in (".", "..")
        or parte.startswith(".")
        or parte.lower() in EXCLUIDOS
        for parte in partes
    ):
        raise ValueError("Ruta no autorizada")

    nombre = partes[-1].lower()

    if Path(nombre).suffix not in EXTENSIONES:
        raise ValueError("Extensión no permitida")

    if any(palabra in nombre for palabra in PROTEGIDOS):
        raise ValueError("Archivo protegido")

    return partes


def leer_archivo_cryapp(ruta):
    partes = validar_ruta(ruta)
    abiertos = []

    try:
        fd = os.open(BASE, FLAGS_DIR)
        abiertos.append(fd)

        for carpeta in partes[:-1]:
            fd = os.open(carpeta, FLAGS_DIR, dir_fd=fd)
            abiertos.append(fd)

        archivo_fd = os.open(
            partes[-1],
            FLAGS_FILE,
            dir_fd=fd
        )
        abiertos.append(archivo_fd)

        info = os.fstat(archivo_fd)

        if not stat.S_ISREG(info.st_mode):
            raise ValueError("No es un archivo regular")

        if info.st_size > MAX_ARCHIVO:
            raise ValueError("Archivo demasiado grande")

        contenido = bytearray()

        while len(contenido) <= MAX_ARCHIVO:
            bloque = os.read(
                archivo_fd,
                min(65536, MAX_ARCHIVO + 1 - len(contenido))
            )

            if not bloque:
                break

            contenido.extend(bloque)

        if len(contenido) > MAX_ARCHIVO:
            raise ValueError("Archivo demasiado grande")

        return {
            "ruta": ruta,
            "contenido": contenido.decode("utf-8"),
            "modo": "solo lectura"
        }

    except (OSError, UnicodeError) as error:
        raise ValueError("Archivo no disponible") from error

    finally:
        for descriptor in reversed(abiertos):
            os.close(descriptor)


def listar_archivos_cryapp():
    archivos = []

    for modulo in sorted(MODULOS):
        carpeta = Path(BASE) / modulo

        if not carpeta.is_dir() or carpeta.is_symlink():
            continue

        for raiz, directorios, nombres in os.walk(
            carpeta,
            followlinks=False
        ):
            directorios[:] = sorted(
                nombre for nombre in directorios
                if nombre.lower() not in EXCLUIDOS
                and not nombre.startswith(".")
                and not (Path(raiz) / nombre).is_symlink()
            )

            for nombre in sorted(nombres):
                ruta = Path(raiz) / nombre

                if ruta.is_symlink():
                    continue

                relativa = ruta.relative_to(BASE).as_posix()

                try:
                    validar_ruta(relativa)
                    info = ruta.stat()

                    if not stat.S_ISREG(info.st_mode):
                        continue

                    if info.st_size > MAX_ARCHIVO:
                        continue

                except (ValueError, OSError):
                    continue

                archivos.append(relativa)

                if len(archivos) >= MAX_LISTADO:
                    return {
                        "total": len(archivos),
                        "archivos": archivos,
                        "modo": "solo lectura"
                    }

    return {
        "total": len(archivos),
        "archivos": archivos,
        "modo": "solo lectura"
    }
