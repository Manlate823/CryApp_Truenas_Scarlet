"""Memoria persistente del puente; nunca almacena credenciales automáticamente."""
import os
import sqlite3
from datetime import datetime, timezone

DB = os.environ.get('BRIDGE_MEMORY_DB', '/data/v5/memoria.sqlite')

def conectar():
    con = sqlite3.connect(DB, timeout=10)
    con.execute('CREATE TABLE IF NOT EXISTS notas (id INTEGER PRIMARY KEY, proyecto TEXT NOT NULL, contenido TEXT NOT NULL, fecha TEXT NOT NULL)')
    return con

def guardar(proyecto, contenido):
    if not isinstance(proyecto, str) or not proyecto.strip() or len(proyecto) > 100:
        raise ValueError('Proyecto inválido')
    if not isinstance(contenido, str) or not contenido.strip() or len(contenido) > 12000:
        raise ValueError('Contenido inválido')
    fecha = datetime.now(timezone.utc).isoformat()
    with conectar() as con:
        cur = con.execute('INSERT INTO notas (proyecto, contenido, fecha) VALUES (?, ?, ?)', (proyecto.strip(), contenido.strip(), fecha))
        return {'id': cur.lastrowid, 'proyecto': proyecto.strip(), 'fecha': fecha}

def consultar(proyecto, limite=20):
    if not isinstance(proyecto, str) or not proyecto.strip() or len(proyecto) > 100:
        raise ValueError('Proyecto inválido')
    if type(limite) is not int or not 1 <= limite <= 50:
        raise ValueError('Límite inválido')
    with conectar() as con:
        filas = con.execute('SELECT id, contenido, fecha FROM notas WHERE proyecto = ? ORDER BY id DESC LIMIT ?', (proyecto.strip(), limite)).fetchall()
    return {'proyecto': proyecto.strip(), 'notas': [{'id': i, 'contenido': c, 'fecha': f} for i, c, f in filas]}
