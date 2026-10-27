#!/usr/bin/env bash
set -Eeuo pipefail

# Extrae el ZIP de desarrollo V5 en una carpeta dedicada sin sobrescribir archivos.
BASE="/mnt/Almacenamiento_HDD/Manlate_AI_Bridge"
ZIP_PATH="${1:-}"
DEST="${2:-$BASE/V5_Desarrollo}"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "${EUID}" -eq 0 ]] || fail "Ejecuta el script con sudo bash extraer_v5.sh"
command -v python3 >/dev/null 2>&1 || fail "Python 3 no está disponible."

if [[ -z "$ZIP_PATH" ]]; then
  [[ -d "$BASE" ]] || fail "No encuentro la carpeta $BASE. Sube allí el ZIP de V5."
  mapfile -t CANDIDATOS < <(find "$BASE" -maxdepth 1 -type f -name 'Manlate_AI_Bridge_V5_Desarrollo*.zip' -print)
  [[ "${#CANDIDATOS[@]}" -eq 1 ]] || fail "Deja un solo ZIP llamado Manlate_AI_Bridge_V5_Desarrollo*.zip en $BASE o pasa su ruta como primer argumento."
  ZIP_PATH="${CANDIDATOS[0]}"
fi

python3 - "$ZIP_PATH" "$DEST" "${SUDO_USER:-}" <<'PY'
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, BadZipFile
import os, shutil, stat, sys, tempfile

archive = Path(sys.argv[1])
dest = Path(sys.argv[2])
owner = sys.argv[3]
root_name = "Manlate_AI_Bridge_V5"
required = {
    "README.md", "compose.yaml", ".env.example", "instalar_v5.sh",
    "desarrollo/server_v5.py", "desarrollo/github_v5.py",
    "desarrollo/memoria_v5.py", "desarrollo/Dockerfile.ssh",
    "desarrollo/test_v5.py",
}
max_files = 100
max_total = 50 * 1024 * 1024
max_file = 10 * 1024 * 1024

if not archive.is_file():
    raise SystemExit("No encontré el ZIP indicado.")
if dest.exists() or dest.is_symlink():
    raise SystemExit(f"La carpeta de destino ya existe; no sobrescribí nada: {dest}")
if not dest.parent.is_dir():
    raise SystemExit(f"No existe la carpeta padre del destino: {dest.parent}")

stage = Path(tempfile.mkdtemp(prefix=".manlate-v5-extract-", dir=dest.parent))
try:
    try:
        zf = ZipFile(archive)
    except (BadZipFile, OSError):
        raise SystemExit("El archivo no es un ZIP válido.") from None
    with zf:
        entries = zf.infolist()
        if not entries or len(entries) > max_files:
            raise SystemExit("El ZIP está vacío o contiene demasiados archivos.")
        total = sum(i.file_size for i in entries)
        if total > max_total:
            raise SystemExit("El ZIP excede el tamaño permitido para este paquete.")
        found = set()
        for info in entries:
            name = info.filename
            if "\\" in name or name.startswith("/") or "\x00" in name:
                raise SystemExit("El ZIP contiene una ruta insegura.")
            relative = PurePosixPath(name)
            if any(part in ("", ".", "..") for part in relative.parts):
                raise SystemExit("El ZIP contiene una ruta insegura.")
            if not relative.parts or relative.parts[0] != root_name:
                raise SystemExit("El ZIP no tiene la carpeta raíz esperada de V5.")
            mode = (info.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(mode):
                raise SystemExit("El ZIP contiene un enlace simbólico; extracción cancelada.")
            if info.file_size > max_file:
                raise SystemExit("Un archivo del ZIP supera el tamaño permitido.")
            target = stage.joinpath(*relative.parts)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                raise SystemExit("El ZIP contiene nombres duplicados; extracción cancelada.")
            with zf.open(info, "r") as src, target.open("xb") as dst_file:
                shutil.copyfileobj(src, dst_file)
            target.chmod(0o755 if target.name.endswith(".sh") else 0o644)
            found.add("/".join(relative.parts[1:]))
        missing = required - found
        if missing:
            raise SystemExit("El ZIP no contiene todos los archivos V5 requeridos.")
    extracted = stage / root_name
    if not extracted.is_dir():
        raise SystemExit("No encontré la carpeta principal de V5 dentro del ZIP.")
    extracted.rename(dest)
    if owner:
        try:
            import pwd, grp
            account = pwd.getpwnam(owner)
            gid = grp.getgrnam(owner).gr_gid
            for item in [dest, *dest.rglob("*")]:
                os.chown(item, account.pw_uid, gid, follow_symlinks=False)
        except (KeyError, OSError):
            pass
    print("ZIP validado y extraído:", dest)
    print("Archivos extraídos:", len(found))
    print("Credenciales incluidas: NO")
    print("Contenedores modificados: NO")
    print("Instalación ejecutada: NO")
finally:
    shutil.rmtree(stage, ignore_errors=True)
PY
