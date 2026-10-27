
import os
from pathlib import Path


def consultar_estado_truenas():
    resultado = {
        "servicio": "TrueNAS",
        "modo": "solo lectura",
        "origen": "contenedor Docker DEV",
    }

    # Memoria visible desde /proc.
    memoria = {}

    with open("/proc/meminfo", "r") as archivo:
        for linea in archivo:
            partes = linea.split()

            if len(partes) >= 2:
                memoria[partes[0].rstrip(":")] = int(partes[1])

    resultado["memoria"] = {
        "total_gb": round(memoria.get("MemTotal", 0) / 1048576, 2),
        "disponible_gb": round(
            memoria.get("MemAvailable", 0) / 1048576, 2
        ),
        "origen": "/proc/meminfo",
    }

    # CPU visible desde Docker.
    resultado["cpu"] = {
        "procesadores_visibles": os.cpu_count(),
        "origen": "contenedor Docker",
    }

    # Tiempo de actividad del kernel.
    with open("/proc/uptime", "r") as archivo:
        segundos = float(archivo.read().split()[0])

    resultado["actividad"] = {
        "dias": round(segundos / 86400, 2),
        "origen": "/proc/uptime",
    }

    # Límites aplicados al contenedor.
    limites = {}

    for nombre, ruta in {
        "memoria": "/sys/fs/cgroup/memory.max",
        "cpu": "/sys/fs/cgroup/cpu.max",
    }.items():
        archivo = Path(ruta)

        if archivo.is_file():
            limites[nombre] = archivo.read_text().strip()

    resultado["limites_docker"] = limites

    return resultado
