"""Ejecución remota opcional en TrueNAS usando una identidad SSH configurada."""
import hashlib
import os
import re
import subprocess
import tempfile
import time

MAX_OUTPUT = 65536
MAX_COMMAND = 8192

def ejecutar(comando, tiempo=60):
    if os.environ.get('BRIDGE_SHELL_ENABLED') != 'true':
        raise ValueError('La shell está deshabilitada')
    if not isinstance(comando, str) or not comando.strip() or len(comando.encode()) > MAX_COMMAND or '\x00' in comando:
        raise ValueError('Comando inválido')
    if type(tiempo) is not int or not 1 <= tiempo <= 120:
        raise ValueError('Tiempo inválido')
    host = os.environ.get('BRIDGE_SSH_HOST', '')
    usuario = os.environ.get('BRIDGE_SSH_USER', '')
    puerto = os.environ.get('BRIDGE_SSH_PORT', '22')
    key = os.environ.get('BRIDGE_SSH_KEY', '/run/secrets/bridge_ssh_key')
    known = os.environ.get('BRIDGE_SSH_KNOWN_HOSTS', '/run/secrets/bridge_known_hosts')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]{0,252}', host) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,31}', usuario):
        raise ValueError('Servidor o usuario SSH no configurado')
    if not puerto.isdigit() or not 1 <= int(puerto) <= 65535:
        raise ValueError('Puerto SSH inválido')
    if not os.path.isfile(key) or not os.path.isfile(known):
        raise ValueError('Faltan la clave SSH o la lista de servidores conocidos')
    argv = ['ssh', '-F', '/dev/null', '-T', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile='+known,
            '-o', 'ConnectTimeout=10', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
            '-i', key, '-p', puerto, usuario+'@'+host, comando]
    inicio = time.monotonic()
    # Output goes to a temporary file rather than accumulating in memory.
    with tempfile.TemporaryFile() as output:
        try:
            p = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                               timeout=tiempo, check=False)
            codigo = p.returncode
            agotado = False
        except subprocess.TimeoutExpired:
            codigo = None
            agotado = True
        output.seek(0, os.SEEK_END)
        total = output.tell()
        output.seek(0)
        texto = output.read(MAX_OUTPUT).decode('utf-8', errors='replace')
    return {'codigo': codigo, 'agotado': agotado, 'salida': texto,
            'salida_truncada': total > MAX_OUTPUT, 'segundos': round(time.monotonic()-inicio, 2),
            'comando_sha256': hashlib.sha256(comando.encode()).hexdigest(),
            'aviso': 'La finalización de SSH no garantiza que procesos remotos hayan terminado.' if agotado else None}
