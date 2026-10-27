"""Acceso acotado a GitHub Contents API; el token solo se lee desde un secreto."""
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
MAX_CONTENT = 2 * 1024 * 1024
FORBIDDEN_PARTS = {".git", ".github", "secrets", "secret", "password", "credential", "token", "oauth", ".env", "private", "key", "pem"}


def _config():
    raw = os.environ.get("GITHUB_ALLOWED_REPOSITORIES", "")
    repos = {x.strip().lower() for x in raw.split(",") if x.strip()}
    branch_raw = os.environ.get("GITHUB_ALLOWED_BRANCHES", "")
    branches = {x.strip() for x in branch_raw.split(",") if x.strip()}
    token_path = os.environ.get("GITHUB_TOKEN_FILE", "/run/secrets/github_token")
    try:
        with open(token_path, "r", encoding="utf-8") as secret_file:
            token = secret_file.read().strip()
    except OSError:
        token = ""
    if not token:
        raise ValueError("Secreto de GitHub no configurado")
    if not repos:
        raise ValueError("Lista de repositorios permitidos vacía")
    if not branches:
        raise ValueError("Lista de ramas permitidas vacía")
    return repos, branches, token


def _valid_repo(repo, allowed):
    if not isinstance(repo, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Repositorio inválido")
    if repo.lower() not in allowed:
        raise ValueError("Repositorio fuera de la lista autorizada")
    return repo


def _valid_branch(branch, allowed):
    if not isinstance(branch, str) or not branch or len(branch) > 200 or branch.startswith("-") or ".." in branch or "\\" in branch:
        raise ValueError("Rama inválida")
    if branch not in allowed:
        raise ValueError("Rama fuera de la lista autorizada")
    return branch


def _valid_path(path, allow_empty=False):
    if allow_empty and path == "":
        return ""
    if not isinstance(path, str) or not path or len(path) > 500 or path.startswith("/") or "\\" in path or "\x00" in path:
        raise ValueError("Ruta inválida")
    parts = path.split("/")
    if any(p in ("", ".", "..") or p.lower() in FORBIDDEN_PARTS or p.lower().startswith(".env") for p in parts):
        raise ValueError("Ruta sensible o no autorizada")
    return path


def _request(method, url, token, payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "Manlate-AI-Bridge-V5",
    })
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Never return upstream bodies because they may include repository or auth details.
        raise ValueError("GitHub rechazó la operación (HTTP %s)" % exc.code) from None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise ValueError("No se pudo completar la solicitud a GitHub") from None


def listar_archivos(repo, ruta="", rama="main"):
    repos, branches, token = _config()
    repo = _valid_repo(repo, repos)
    rama = _valid_branch(rama, branches)
    ruta = _valid_path(ruta, allow_empty=True)
    parts = [urllib.parse.quote(x, safe="") for x in ruta.split("/")] if ruta else []
    url = API + "/repos/" + repo + "/contents" + ("/" + "/".join(parts) if parts else "") + "?ref=" + urllib.parse.quote(rama, safe="")
    data = _request("GET", url, token)
    if not isinstance(data, list):
        data = [data]
    files = []
    for item in data[:500]:
        if not isinstance(item, dict):
            continue
        name = item.get("name", "")
        if str(name).lower() in FORBIDDEN_PARTS or str(name).lower().startswith(".env"):
            continue
        files.append({"nombre": name, "tipo": item.get("type"), "ruta": item.get("path"), "sha": item.get("sha"), "bytes": item.get("size")})
    return {"repositorio": repo, "rama": rama, "archivos": files, "truncado": len(data) > 500}


def leer_archivo(repo, ruta, rama="main"):
    repos, branches, token = _config()
    repo = _valid_repo(repo, repos)
    rama = _valid_branch(rama, branches)
    ruta = _valid_path(ruta)
    url = API + "/repos/" + repo + "/contents/" + "/".join(urllib.parse.quote(x, safe="") for x in ruta.split("/")) + "?ref=" + urllib.parse.quote(rama, safe="")
    data = _request("GET", url, token)
    if data.get("type") != "file" or data.get("encoding") != "base64" or data.get("size", MAX_CONTENT + 1) > MAX_CONTENT:
        raise ValueError("Archivo no disponible o demasiado grande")
    try:
        content = base64.b64decode(data["content"], validate=False).decode("utf-8")
    except (KeyError, ValueError, UnicodeDecodeError):
        raise ValueError("El archivo no es texto UTF-8 legible") from None
    return {"repositorio": repo, "rama": rama, "ruta": ruta, "sha": data.get("sha"), "contenido": content}


def editar_archivo(repo, ruta, rama, contenido, sha_esperado, mensaje):
    repos, branches, token = _config()
    repo = _valid_repo(repo, repos)
    rama = _valid_branch(rama, branches)
    ruta = _valid_path(ruta)
    if not isinstance(contenido, str) or len(contenido.encode("utf-8")) > MAX_CONTENT:
        raise ValueError("Contenido inválido o demasiado grande")
    if not isinstance(sha_esperado, str) or not re.fullmatch(r"[0-9a-f]{40}", sha_esperado):
        raise ValueError("SHA esperado inválido; vuelve a leer el archivo antes de editar")
    if not isinstance(mensaje, str) or not mensaje.strip() or len(mensaje) > 200:
        raise ValueError("Mensaje de commit inválido")
    url = API + "/repos/" + repo + "/contents/" + "/".join(urllib.parse.quote(x, safe="") for x in ruta.split("/"))
    result = _request("PUT", url, token, {
        "message": mensaje.strip(), "content": base64.b64encode(contenido.encode("utf-8")).decode("ascii"),
        "sha": sha_esperado, "branch": rama,
    })
    commit = result.get("commit", {})
    return {"repositorio": repo, "rama": rama, "ruta": ruta, "sha": (result.get("content") or {}).get("sha"),
            "commit": commit.get("sha"), "url": (result.get("content") or {}).get("html_url"),
            "mensaje": "Cambio guardado en GitHub"}
