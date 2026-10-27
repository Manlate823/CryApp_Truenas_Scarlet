#!/usr/bin/env bash
set -Eeuo pipefail

# Instalador interactivo para TrueNAS SCALE. Instala V5 en paralelo; nunca elimina V4.
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
V4_CONTAINER="manlate-ai-bridge-oauth-dev"
V5_CONTAINER="manlate-ai-bridge-v5"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Falta el programa requerido: $1"; }
ask() {
  local label="$1" default="${2:-}" value
  if [[ -n "$default" ]]; then read -r -p "$label [$default]: " value; else read -r -p "$label: " value; fi
  printf '%s' "${value:-$default}"
}

[[ "${EUID}" -eq 0 ]] || fail "Ejecuta el instalador con sudo: sudo bash instalar_v5.sh"
need docker
need python3
need ssh-keygen
need getent
need visudo

docker compose version >/dev/null 2>&1 || fail "Docker Compose no está disponible."
docker inspect "$V4_CONTAINER" >/dev/null 2>&1 || fail "No encuentro el contenedor V4 '$V4_CONTAINER'; no modifiqué nada."
docker network inspect ix-cloudflared_default >/dev/null 2>&1 || fail "No encuentro la red ix-cloudflared_default; no modifiqué nada."

# Lee sólo rutas montadas y los dos identificadores OAuth no secretos. Nunca imprime el entorno.
mapfile -t CURRENT < <(docker inspect "$V4_CONTAINER" | python3 -c '
import json,sys
x=json.load(sys.stdin)[0]
e={}
for item in x.get("Config",{}).get("Env",[]):
 k,sep,v=item.partition("=")
 if sep:e[k]=v
m={i.get("Destination"):i.get("Source") for i in x.get("Mounts",[])}
for value in (e.get("OAUTH_CLIENT_ID",""),e.get("OAUTH_ALLOWED_SUB",""),m.get("/run/secrets/oauth_client_secret",""),m.get("/cryapp_dev",""),m.get("/cryapp",""),m.get("/data/memoria.sqlite","")):
 print(value)
')
[[ "${#CURRENT[@]}" -eq 6 ]] || fail "No pude leer la configuración de V4."
OAUTH_CLIENT_ID="${CURRENT[0]}"
OAUTH_ALLOWED_SUB="${CURRENT[1]}"
OAUTH_SECRET_SOURCE="${CURRENT[2]}"
CRYAPP_DEV_PATH="${CURRENT[3]}"
CRYAPP_CODE_PATH="${CURRENT[4]}"
LEGACY_MEMORY_DB_PATH="${CURRENT[5]}"
[[ -n "$OAUTH_CLIENT_ID" && -n "$OAUTH_ALLOWED_SUB" && -f "$OAUTH_SECRET_SOURCE" ]] || fail "V4 no tiene OAuth o secreto montado como se esperaba."
[[ -d "$CRYAPP_DEV_PATH" && -d "$CRYAPP_CODE_PATH" && -f "$LEGACY_MEMORY_DB_PATH" ]] || fail "No están disponibles todas las rutas de proyecto/memoria montadas por V4."

printf '\nV5 se instalará como contenedor adicional. V4 seguirá intacta.\n'
printf 'La memoria V5 tendrá su propio volumen persistente.\n\n'
BRIDGE_PUBLIC_URL="$(ask 'URL HTTPS pública nueva para V5 (ej. https://manlate-ai-bridge-v5.jellyfinplux.uk)')"
[[ "$BRIDGE_PUBLIC_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || fail "La URL pública debe ser HTTPS y no contener rutas."
OAUTH_AUTHORIZATION_SERVER_URL="$(ask 'Emisor OAuth de Authentik' 'https://authentik.jellyfinplux.uk/application/o/manlate-ai-bridge/')"
[[ "$OAUTH_AUTHORIZATION_SERVER_URL" =~ ^https://[A-Za-z0-9./_-]+$ ]] || fail "URL del emisor OAuth inválida."
GITHUB_ALLOWED_REPOSITORIES="$(ask 'Repositorios GitHub permitidos, separados por coma' 'Manlate823/CryApp_Truenas_Scarlet')"
[[ "$GITHUB_ALLOWED_REPOSITORIES" =~ ^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)(,[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+))*$ ]] || fail "La lista de repositorios no tiene formato owner/repo."
GITHUB_ALLOWED_BRANCHES="$(ask 'Ramas GitHub permitidas, separadas por coma' 'desarrollo/manlate-ai-bridge-v5')"
[[ "$GITHUB_ALLOWED_BRANCHES" =~ ^[A-Za-z0-9._/-]+(,[A-Za-z0-9._/-]+)*$ && "$GITHUB_ALLOWED_BRANCHES" != *..* ]] || fail "La lista de ramas es obligatoria y tiene caracteres no permitidos."
GITHUB_TOKEN=""
read -r -s -p 'Token GitHub fine-grained (no se mostrará): ' GITHUB_TOKEN; printf '\n'
[[ -n "$GITHUB_TOKEN" && "$GITHUB_TOKEN" != *$'\n'* ]] || fail "El token GitHub está vacío o inválido."

SSH_USER_DEFAULT="${SUDO_USER:-truenas_admin}"
BRIDGE_SSH_HOST="$(ask 'IP o nombre de TrueNAS accesible desde Docker' '172.16.1.1')"
BRIDGE_SSH_USER="$(ask 'Usuario SSH de TrueNAS' "$SSH_USER_DEFAULT")"
BRIDGE_SSH_PORT="$(ask 'Puerto SSH' '22')"
[[ "$BRIDGE_SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$ ]] || fail "Host SSH inválido."
[[ "$BRIDGE_SSH_USER" =~ ^[A-Za-z_][A-Za-z0-9_-]{0,31}$ ]] || fail "Usuario SSH inválido."
[[ "$BRIDGE_SSH_PORT" =~ ^[0-9]+$ ]] && ((BRIDGE_SSH_PORT >= 1 && BRIDGE_SSH_PORT <= 65535)) || fail "Puerto SSH inválido."

account="$(getent passwd "$BRIDGE_SSH_USER" || true)"
[[ -n "$account" ]] || fail "El usuario SSH no existe localmente; no instalé la clave."
user_home="$(cut -d: -f6 <<<"$account")"
user_group="$(id -gn "$BRIDGE_SSH_USER")"
[[ -n "$user_home" && -d "$user_home" ]] || fail "No pude localizar el directorio del usuario SSH."
grep -Eq '^[[:space:]]*(@|#)includedir[[:space:]]+/etc/sudoers.d([[:space:]]|$)' /etc/sudoers || fail "sudoers no incluye /etc/sudoers.d; no cambié permisos."
host_key="/etc/ssh/ssh_host_ed25519_key.pub"
[[ -r "$host_key" ]] || fail "No encuentro la clave pública SSH local para verificar el host."

SECRETS="$ROOT/secrets"
mkdir -p "$SECRETS"
chmod 700 "$SECRETS"
BRIDGE_SSH_KEY_PATH="$SECRETS/bridge_ssh_key"
BRIDGE_KNOWN_HOSTS_PATH="$SECRETS/bridge_known_hosts"
GITHUB_TOKEN_PATH="$SECRETS/github_token"
OAUTH_CLIENT_SECRET_PATH="$OAUTH_SECRET_SOURCE"

if [[ ! -f "$BRIDGE_SSH_KEY_PATH" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C 'manlate-ai-bridge-v5' -f "$BRIDGE_SSH_KEY_PATH"
fi
pubkey="$(cat "$BRIDGE_SSH_KEY_PATH.pub")"
ssh_dir="$user_home/.ssh"
install -d -o "$BRIDGE_SSH_USER" -g "$user_group" -m 700 "$ssh_dir"
authorized="$ssh_dir/authorized_keys"
if [[ -f "$authorized" ]]; then
  cp -a "$authorized" "$authorized.bak-$(date +%Y%m%d-%H%M%S)"
fi
install -o "$BRIDGE_SSH_USER" -g "$user_group" -m 600 /dev/null "$authorized.tmp"
if [[ -f "$authorized" ]]; then cat "$authorized" > "$authorized.tmp"; fi
if ! grep -Fxq -- "$pubkey" "$authorized.tmp"; then printf '%s\n' "$pubkey" >> "$authorized.tmp"; fi
mv "$authorized.tmp" "$authorized"
chown "$BRIDGE_SSH_USER:$user_group" "$authorized"
chmod 600 "$authorized"

# El propietario pidió acceso total a la shell: la cuenta SSH queda con sudo root sin contraseña.
SUDOERS_FILE="/etc/sudoers.d/90-manlate-ai-bridge-v5"
if [[ -f "$SUDOERS_FILE" ]]; then
  cp -a "$SUDOERS_FILE" "$SUDOERS_FILE.bak-$(date +%Y%m%d-%H%M%S)"
fi
SUDOERS_TMP="$(mktemp /etc/sudoers.d/.manlate-ai-bridge-v5.XXXXXX)"
printf '%s ALL=(ALL:ALL) NOPASSWD: ALL\n' "$BRIDGE_SSH_USER" > "$SUDOERS_TMP"
chmod 0440 "$SUDOERS_TMP"
visudo -cf "$SUDOERS_TMP" >/dev/null || { rm -f "$SUDOERS_TMP"; fail "La regla sudo no pasó visudo; V4 sigue intacta."; }
mv "$SUDOERS_TMP" "$SUDOERS_FILE"
chmod 0440 "$SUDOERS_FILE"

read -r host_type host_public_key _ < "$host_key"
known_host="$BRIDGE_SSH_HOST"
[[ "$BRIDGE_SSH_PORT" == 22 ]] || known_host="[$BRIDGE_SSH_HOST]:$BRIDGE_SSH_PORT"
printf '%s %s %s\n' "$known_host" "$host_type" "$host_public_key" > "$BRIDGE_KNOWN_HOSTS_PATH"
printf '%s' "$GITHUB_TOKEN" > "$GITHUB_TOKEN_PATH"
unset GITHUB_TOKEN
chown 568:568 "$BRIDGE_SSH_KEY_PATH" "$GITHUB_TOKEN_PATH"
chmod 400 "$BRIDGE_SSH_KEY_PATH" "$GITHUB_TOKEN_PATH"
chmod 444 "$BRIDGE_KNOWN_HOSTS_PATH"

# Quote config values as Compose .env literals. Disallow line breaks and Compose interpolation.
write_env() {
  local key="$1" value="$2"
  [[ "$value" != *$'\n'* && "$value" != *'$'* ]] || fail "Valor inseguro para $key."
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s="%s"\n' "$key" "$value" >> "$ROOT/.env"
}
: > "$ROOT/.env"
chmod 600 "$ROOT/.env"
write_env OAUTH_CLIENT_ID "$OAUTH_CLIENT_ID"
write_env OAUTH_ALLOWED_SUB "$OAUTH_ALLOWED_SUB"
write_env BRIDGE_PUBLIC_URL "$BRIDGE_PUBLIC_URL"
write_env OAUTH_AUTHORIZATION_SERVER_URL "${OAUTH_AUTHORIZATION_SERVER_URL%/}"
write_env GITHUB_ALLOWED_REPOSITORIES "$GITHUB_ALLOWED_REPOSITORIES"
write_env GITHUB_ALLOWED_BRANCHES "$GITHUB_ALLOWED_BRANCHES"
write_env CRYAPP_DEV_PATH "$CRYAPP_DEV_PATH"
write_env CRYAPP_CODE_PATH "$CRYAPP_CODE_PATH"
write_env LEGACY_MEMORY_DB_PATH "$LEGACY_MEMORY_DB_PATH"
write_env OAUTH_CLIENT_SECRET_PATH "$OAUTH_CLIENT_SECRET_PATH"
write_env GITHUB_TOKEN_PATH "$GITHUB_TOKEN_PATH"
write_env BRIDGE_SSH_KEY_PATH "$BRIDGE_SSH_KEY_PATH"
write_env BRIDGE_KNOWN_HOSTS_PATH "$BRIDGE_KNOWN_HOSTS_PATH"
write_env BRIDGE_SHELL_ENABLED true
write_env BRIDGE_SSH_HOST "$BRIDGE_SSH_HOST"
write_env BRIDGE_SSH_USER "$BRIDGE_SSH_USER"
write_env BRIDGE_SSH_PORT "$BRIDGE_SSH_PORT"
write_env CLOUDFLARED_NETWORK ix-cloudflared_default

cd "$ROOT"
docker compose -f compose.yaml config -q || fail "Compose no valida; revisa .env. V4 no fue modificada."
docker compose -f compose.yaml up -d --build

printf '\nEsperando a que V5 esté saludable'
for _ in $(seq 1 30); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$V5_CONTAINER" 2>/dev/null || true)"
  [[ "$status" == healthy ]] && break
  [[ "$status" == unhealthy ]] && { docker logs --tail 40 "$V5_CONTAINER"; fail "V5 no pasó healthcheck; V4 sigue intacta."; }
  printf '.'
  sleep 2
done
printf '\n'
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$V5_CONTAINER" 2>/dev/null || true)" == healthy ]] || fail "V5 no quedó saludable. V4 sigue intacta."

printf '\nV5 instalado y saludable. V4 no se modificó.\n'
printf 'Permiso shell: root vía sudo sin contraseña para la cuenta SSH indicada.\n'
printf 'Clave SSH pública para referencia: %s\n' "$pubkey"
printf 'Memoria persistente: volumen Docker v5-memory\n'
if docker exec "$V5_CONTAINER" ssh -F /dev/null -T -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/run/secrets/bridge_known_hosts -o ConnectTimeout=8 -o ForwardAgent=no -o ClearAllForwardings=yes -i /run/secrets/bridge_ssh_key -p "$BRIDGE_SSH_PORT" "$BRIDGE_SSH_USER@$BRIDGE_SSH_HOST" id >/dev/null 2>&1; then
  printf 'Conexión SSH al host: verificada\n'
else
  printf 'Conexión SSH al host: pendiente de revisar red/SSH/permisos; V5 queda en línea y V4 sigue intacta.\n'
fi
printf 'Pendiente fuera del instalador: crear ruta del túnel Cloudflare para %s hacia http://manlate-ai-bridge-v5:8080 y registrar/verificar el dominio en OAuth/ChatGPT.\n' "$BRIDGE_PUBLIC_URL"
printf 'No se mostraron secretos.\n'
