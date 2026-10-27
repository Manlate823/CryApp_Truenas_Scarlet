
import hashlib

import cryapp_seguridad_edicion_v2 as seguridad
import cryapp_edicion_segura_v1 as edicion


def consultar_hash_cryapp(ruta):
    archivo = seguridad.validar_ruta(ruta)

    datos = edicion._leer_seguro(archivo)

    return {
        "ruta": ruta,
        "sha256": hashlib.sha256(datos).hexdigest(),
        "bytes": len(datos)
    }


def editar_archivo_cryapp(ruta, contenido, sha256_esperado):
    if not isinstance(sha256_esperado, str):
        raise ValueError("SHA-256 invalido")

    if len(sha256_esperado) != 64:
        raise ValueError("SHA-256 invalido")

    with seguridad.bloqueo_edicion():
        archivo = seguridad.validar_ruta(ruta)

        if archivo != edicion._resolver(ruta):
            raise ValueError("Rutas inconsistentes")

        return edicion.editar_archivo_cryapp(
            ruta,
            contenido,
            sha256_esperado
        )
