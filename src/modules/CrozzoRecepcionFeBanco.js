/**
 * Crozzo — banco local de extracción FE (PDF + reconstrucción virtual + aprendizaje).
 * Cada análisis guarda snapshot completo en IndexedDB y alimenta memoria aprendida (localStorage).
 */
(function (global) {
  'use strict';

  var DB_NAME = 'crozzo_fe_banco_v1';
  var DB_VER = 1;
  var STORE = 'snapshots';
  var LS_INDEX = 'crozzo_fe_banco_index_v1';
  var LS_LEARNED = 'crozzo_fe_banco_learned_v1';
  var INDEX_MAX = 500;
  var TEXT_MAX = 50000;
  var BLOCKS_SAMPLE = 120;

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onerror = function () {
        reject(req.error || new Error('open failed'));
      };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('createdAt', 'createdAt', { unique: false });
          os.createIndex('nitNorm', 'proveedor.nitNorm', { unique: false });
          os.createIndex('source', 'source', { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
    return dbPromise;
  }

  function lsGet(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, val) {
    try {
      global.localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (_) {
      return false;
    }
  }

  function normNit(n) {
    return String(n || '').replace(/[^0-9]/g, '');
  }

  function normTxt(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function slugify(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
  }

  function cloneJson(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_) {
      return obj;
    }
  }

  function truncateText(text) {
    text = String(text || '');
    if (text.length <= TEXT_MAX) return text;
    return text.slice(0, TEXT_MAX) + '\n...[truncado ' + (text.length - TEXT_MAX) + ' caracteres]';
  }

  function summarizeBlocks(blocks, max) {
    if (!blocks || !blocks.length) return [];
    max = max || BLOCKS_SAMPLE;
    var out = [];
    for (var i = 0; i < blocks.length && out.length < max; i++) {
      var b = blocks[i];
      if (!b || !b.text) continue;
      out.push({
        text: String(b.text).slice(0, 200),
        page: b.page,
        x: Math.round(b.x || 0),
        y: Math.round(b.y || 0),
        font: b.font || '',
      });
    }
    return out;
  }

  function pickTopField(map) {
    if (!map) return '';
    var best = '';
    var bestN = 0;
    Object.keys(map).forEach(function (k) {
      if (map[k] > bestN) {
        bestN = map[k];
        best = k;
      }
    });
    return best;
  }

  var FUSION_CAMPOS = [
    { key: 'nitEmisor', tipo: 'nit', label: 'NIT', learned: 'nit' },
    { key: 'razonSocial', tipo: 'texto', label: 'Razón social', learned: 'razonSocial' },
    { key: 'representanteEmisor', tipo: 'texto', label: 'Representante', learned: 'representante' },
    { key: 'direccionEmisor', tipo: 'texto', label: 'Dirección', learned: 'direccion' },
    { key: 'telefonoEmisor', tipo: 'telefono', label: 'Teléfono', learned: 'telefono' },
    { key: 'emailEmisor', tipo: 'email', label: 'Correo', learned: 'email' },
    { key: 'numeroFactura', tipo: 'numero', label: 'Nº factura', learned: null },
    { key: 'fecha', tipo: 'fecha', label: 'Fecha', learned: null },
    { key: 'total', tipo: 'total', label: 'Total', learned: null },
    { key: 'cufe', tipo: 'cufe', label: 'CUFE', learned: null },
  ];

  var FE_KEY_TO_CATALOGO = {
    razonSocial: function (p) {
      return p.nombre || p.name || p.razonSocial || (p.legal && p.legal.razonSocial);
    },
    direccionEmisor: function (p) {
      return p.direccion || (p.legal && p.legal.direccion);
    },
    telefonoEmisor: function (p) {
      return p.telefono;
    },
    emailEmisor: function (p) {
      return p.email;
    },
    representanteEmisor: function (p) {
      return p.representante || (p.legal && p.legal.representanteLegal);
    },
    nitEmisor: function (p) {
      return p.nit || p.identificador;
    },
  };

  function pesoDeFuente(fuente) {
    fuente = String(fuente || '').toLowerCase();
    if (fuente.indexOf('pdf-texto') >= 0 || fuente === 'paso-1') return 9;
    if (fuente.indexOf('qr') >= 0 || fuente.indexOf('cufe') >= 0) return 10;
    if (fuente.indexOf('nube') >= 0) return 6;
    if (fuente.indexOf('dispositivo') >= 0) return 7;
    return 5;
  }

  function normCampoFusion(tipo, val) {
    if (val == null || val === '') return '';
    if (tipo === 'nit') return normNit(val);
    if (tipo === 'email') return normTxt(val);
    if (tipo === 'telefono') return String(val).replace(/\D/g, '').slice(-10);
    if (tipo === 'numero') return String(val).replace(/\D/g, '');
    if (tipo === 'total') {
      var n = Number(String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
      return isNaN(n) || !n ? '' : String(Math.round(n));
    }
    if (tipo === 'cufe') return String(val).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    if (tipo === 'fecha') return String(val).replace(/\s/g, '').slice(0, 10);
    return normTxt(val);
  }

  function displayCampoFusion(tipo, val) {
    if (val == null || val === '') return '';
    if (tipo === 'total') return Number(val) || 0;
    return String(val).trim();
  }

  function feBancoCandidatoDesdeProbe(probe, cascadeLevel) {
    probe = probe || {};
    var fe = cloneJson(probe.fe || {});
    var fuente = 'paso-' + ((cascadeLevel || 0) + 1);
    if (cascadeLevel === 0) fuente = 'pdf-texto';
    else if (fe._ocrAyudaFuente) fuente = String(fe._ocrAyudaFuente);
    if (fe._ocrRotacion) fuente += '-rot' + fe._ocrRotacion;
    if (probe.qrCufe && probe.qrCufe.cufeValidado) fuente += '+qr-cufe';
    return {
      fuente: fuente,
      cascadeLevel: cascadeLevel || 0,
      fe: fe,
      confidence: probe.confidence,
      extraccionScore: probe.extraccionScore,
      textLen: probe.textLen,
      likelyScanned: probe.likelyScanned,
      qrCufe: probe.qrCufe ? cloneJson(probe.qrCufe) : null,
      createdAt: new Date().toISOString(),
    };
  }

  function guessNitFromCandidatos(candidatos) {
    var counts = {};
    (candidatos || []).forEach(function (c) {
      var n = normNit(c.fe && c.fe.nitEmisor);
      if (n.length >= 8) counts[n] = (counts[n] || 0) + 1;
    });
    var best = '';
    var bestN = 0;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) {
        bestN = counts[k];
        best = k;
      }
    });
    return best;
  }

  function learnedBoostForCampo(vend, learnedKey, normVal) {
    if (!vend || !learnedKey || !normVal || !vend.fields || !vend.fields[learnedKey]) return 0;
    var freq = vend.fields[learnedKey][normVal] || vend.fields[learnedKey][normTxt(normVal)] || 0;
    if (freq >= 3) return 8;
    if (freq >= 2) return 5;
    if (freq >= 1) return 2;
    return 0;
  }

  function catalogoBoostForCampo(campoKey, normVal, catalogo) {
    if (!catalogo || !FE_KEY_TO_CATALOGO[campoKey]) return 0;
    var catVal = FE_KEY_TO_CATALOGO[campoKey](catalogo);
    if (!catVal) return 0;
    var catNorm = normCampoFusion(
      campoKey === 'nitEmisor'
        ? 'nit'
        : campoKey === 'telefonoEmisor'
          ? 'telefono'
          : campoKey === 'emailEmisor'
            ? 'email'
            : campoKey === 'total'
              ? 'total'
              : 'texto',
      catVal
    );
    return catNorm && catNorm === normVal ? 7 : 0;
  }

  function fusionConfianzaLabel(votos, gap) {
    if (votos >= 3 || (votos >= 2 && gap >= 4)) return 'alta';
    if (votos >= 2 || gap >= 2) return 'media';
    return 'baja';
  }

  function fusionPlausibilidadBonus(campoKey, valor, feBase) {
    var FD = global.CrozzoRecepcionFeDian;
    if (!FD || typeof FD.feAutoEvaluarExtraccion !== 'function') return 0;
    var feTry = Object.assign({}, feBase || {});
    feTry[campoKey] = valor;
    var ev = FD.feAutoEvaluarExtraccion(feTry, {}, {});
    var c = ev.campos && ev.campos[campoKey];
    if (!c) return 0;
    if (c.veredicto === 'plausible') return 10;
    if (c.veredicto === 'dudoso') return 2;
    return -14;
  }

  function feBancoFusionarCandidatos(candidatos, opts) {
    opts = opts || {};
    candidatos = candidatos || [];
    if (!candidatos.length) {
      return {
        fe: {},
        validacion: {},
        contrastes: [],
        confianzaGlobal: 0,
        candidatosUsados: 0,
      };
    }

    var learned = loadLearned();
    var catalogo = opts.proveedorCatalogo || null;
    var validacion = {};
    var contrastes = [];
    var feOut = {};
    var nitSlug = '';

    FUSION_CAMPOS.forEach(function (campo) {
      if (campo.key === 'nitEmisor') {
        nitSlug = guessNitFromCandidatos(candidatos);
      }
      var vend =
        nitSlug && learned.vendors && learned.vendors['nit_' + nitSlug]
          ? learned.vendors['nit_' + nitSlug]
          : null;

      var grupos = {};
      candidatos.forEach(function (cand) {
        var fe = cand.fe || {};
        if (cand.qrCufe && cand.qrCufe.cufe && campo.key === 'cufe' && !fe.cufe) {
          fe = Object.assign({}, fe, { cufe: cand.qrCufe.cufe });
        }
        var raw = fe[campo.key];
        if (raw == null || raw === '' || raw === 0) return;
        var nv = normCampoFusion(campo.tipo, raw);
        if (!nv) return;
        if (!grupos[nv]) {
          grupos[nv] = { valor: displayCampoFusion(campo.tipo, raw), score: 0, fuentes: [], votos: 0 };
        }
        var g = grupos[nv];
        g.votos++;
        g.score += pesoDeFuente(cand.fuente) + (cand.confidence || 0) * 0.06;
        g.fuentes.push({
          fuente: cand.fuente,
          nivel: cand.cascadeLevel,
          valor: raw,
        });
      });

      var keys = Object.keys(grupos);
      if (!keys.length) return;

      keys.forEach(function (k) {
        var g = grupos[k];
        g.score += learnedBoostForCampo(vend, campo.learned, k);
        g.score += catalogoBoostForCampo(campo.key, k, catalogo);
        g.score += fusionPlausibilidadBonus(campo.key, g.valor, feOut);
      });

      keys.sort(function (a, b) {
        var ga = grupos[a];
        var gb = grupos[b];
        if (gb.score !== ga.score) return gb.score - ga.score;
        return gb.votos - ga.votos;
      });

      var mejorKey = keys[0];
      var mejor = grupos[mejorKey];
      var segundo = keys.length > 1 ? grupos[keys[1]] : null;
      var gap = segundo ? mejor.score - segundo.score : mejor.score;

      feOut[campo.key] = mejor.valor;
      if (campo.key === 'nitEmisor') nitSlug = normNit(mejor.valor);

      var plausBonus = fusionPlausibilidadBonus(campo.key, mejor.valor, feOut);
      validacion[campo.key] = {
        label: campo.label,
        confianza: fusionConfianzaLabel(mejor.votos, gap),
        votos: mejor.votos,
        score: Math.round(mejor.score),
        fuentes: mejor.fuentes,
        ganador: mejor.valor,
        plausibilidad: plausBonus >= 8 ? 'plausible' : plausBonus >= 0 ? 'dudoso' : 'improbable',
      };

      if (keys.length > 1) {
        var alts = [];
        for (var ai = 1; ai < keys.length; ai++) {
          alts.push({
            valor: grupos[keys[ai]].valor,
            votos: grupos[keys[ai]].votos,
            fuentes: grupos[keys[ai]].fuentes.map(function (f) {
              return f.fuente;
            }),
          });
        }
        contrastes.push({
          campo: campo.label,
          key: campo.key,
          elegido: mejor.valor,
          confianza: validacion[campo.key].confianza,
          alternativas: alts,
        });
      }
    });

    var confSum = 0;
    var confN = 0;
    Object.keys(validacion).forEach(function (k) {
      var c = validacion[k].confianza;
      confSum += c === 'alta' ? 95 : c === 'media' ? 68 : 38;
      confN++;
    });

    return {
      fe: feOut,
      validacion: validacion,
      contrastes: contrastes,
      confianzaGlobal: confN ? Math.round(confSum / confN) : 0,
      candidatosUsados: candidatos.length,
      nitSlug: nitSlug,
    };
  }

  function feBancoAprenderDesdeFusion(fusion, opts) {
    opts = opts || {};
    if (!fusion || !fusion.fe) return loadLearned();
    var snapLite = {
      createdAt: new Date().toISOString(),
      reconstruccion: buildReconstruccionVirtual(fusion.fe),
      proveedor: {
        nitNorm: normNit(fusion.fe.nitEmisor),
        slug: slugify(fusion.fe.razonSocial),
      },
    };
    feBancoAprender(snapLite, opts);

    var learned = loadLearned();
    if (!learned.fusiones) learned.fusiones = { total: 0, porCampo: {} };
    learned.fusiones.total = (learned.fusiones.total || 0) + 1;

    Object.keys(fusion.validacion || {}).forEach(function (key) {
      var v = fusion.validacion[key];
      if (!v || v.confianza === 'baja') return;
      if (!learned.fusiones.porCampo[key]) learned.fusiones.porCampo[key] = { aciertos: 0, consenso: 0 };
      learned.fusiones.porCampo[key].consenso++;
      if (v.votos >= 2) learned.fusiones.porCampo[key].aciertos++;
    });

    if (!learned.fuentes) learned.fuentes = {};
    (fusion.candidatos || []).forEach(function (c) {
      var f = c.fuente || 'desconocido';
      if (!learned.fuentes[f]) learned.fuentes[f] = { usos: 0, scoreMedio: 0 };
      learned.fuentes[f].usos++;
      learned.fuentes[f].scoreMedio =
        ((learned.fuentes[f].scoreMedio || 0) * (learned.fuentes[f].usos - 1) + (c.extraccionScore || 0)) /
        learned.fuentes[f].usos;
    });

    learned.updatedAt = new Date().toISOString();
    saveLearned(learned);
    return learned;
  }

  function feBancoAprenderCorreccion(feCorregido, fusionAnterior, opts) {
    opts = opts || {};
    feCorregido = feCorregido || {};
    var learned = loadLearned();
    var nit = normNit(feCorregido.nitEmisor);
    var slug = nit ? 'nit_' + nit : slugify(feCorregido.razonSocial);
    if (!slug) return learned;
    if (!learned.vendors) learned.vendors = {};
    if (!learned.vendors[slug]) {
      learned.vendors[slug] = { samples: 0, fields: {}, nit: nit || null };
    }
    var v = learned.vendors[slug];
    v.samples = (v.samples || 0) + 1;
    v.lastCorreccion = new Date().toISOString();

    var mapFeLearned = {
      razonSocial: 'razonSocial',
      representanteEmisor: 'representante',
      direccionEmisor: 'direccion',
      telefonoEmisor: 'telefono',
      emailEmisor: 'email',
    };
    Object.keys(mapFeLearned).forEach(function (feKey) {
      var val = feCorregido[feKey];
      if (!val) return;
      var lk = mapFeLearned[feKey];
      if (!v.fields[lk]) v.fields[lk] = {};
      var nk = normTxt(val);
      v.fields[lk][nk] = (v.fields[lk][nk] || 0) + 5;
    });

    if (fusionAnterior && fusionAnterior.contrastes && fusionAnterior.contrastes.length) {
      if (!learned.correcciones) learned.correcciones = [];
      learned.correcciones.push({
        at: new Date().toISOString(),
        nit: nit,
        contrastes: fusionAnterior.contrastes.length,
        facturaId: opts.facturaId || null,
      });
      if (learned.correcciones.length > 80) learned.correcciones = learned.correcciones.slice(-80);
    }

    learned.updatedAt = new Date().toISOString();
    saveLearned(learned);
    return learned;
  }

  function hashBlob(blob) {
    if (!blob || !global.crypto || !global.crypto.subtle) return Promise.resolve(null);
    return blob.arrayBuffer().then(function (buf) {
      return global.crypto.subtle.digest('SHA-256', buf).then(function (hash) {
        return Array.from(new Uint8Array(hash))
          .map(function (b) {
            return b.toString(16).padStart(2, '0');
          })
          .join('');
      });
    });
  }

  function buildReconstruccionVirtual(fe) {
    fe = fe || {};
    return {
      proveedor: {
        razonSocial: fe.razonSocial || '',
        nit: fe.nitEmisor || '',
        representante: fe.representanteEmisor || '',
        direccion: fe.direccionEmisor || '',
        telefono: fe.telefonoEmisor || '',
        email: fe.emailEmisor || '',
        ciudad: fe.ciudadEmisor || '',
        departamento: fe.departamentoEmisor || '',
      },
      factura: {
        tipo: fe.tipoDocumento || '',
        numero: fe.numeroFactura || '',
        fecha: fe.fecha || '',
        total: fe.total || 0,
        cufe: fe.cufe || '',
      },
      comprador: fe.comprador || fe._compradorCheck || null,
      lineas: (fe.lineas || []).slice(0, 80),
    };
  }

  function feBuildExtraccionSnapshot(input) {
    input = input || {};
    var probe = input.probe || {};
    var fe = cloneJson(input.fe || probe.fe || {});
    var pack = input.pack || probe._packRef || {};
    var textFull = probe.text || pack.text || '';
    var qrCufe = probe.qrCufe || input.qrCufe || null;

    delete fe._ocrTexto;

    return {
      version: 1,
      id: input.id || 'fesnap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      createdAt: new Date().toISOString(),
      source: input.source || 'auto_detect',
      facturaId: input.facturaId || null,
      archivo: {
        nombre: input.nombreArchivo || '',
        mime: input.mime || 'application/pdf',
        bytes: input.bytes || 0,
        hash: input.fileHash || null,
        blobRef: input.blobRef || null,
      },
      extraccion: {
        fe: fe,
        confidence: probe.confidence,
        confidenceLabel: probe.confidenceLabel,
        fieldsFound: probe.fieldsFound || [],
        likelyScanned: probe.likelyScanned,
        textLen: probe.textLen,
        empresaEnFactura: probe.empresaEnFactura,
        autoEvaluacion: (probe.fe && probe.fe._autoEvaluacion) || input.autoEvaluacion || null,
        ok: probe.ok,
      },
      qr: probe.qr || (qrCufe && qrCufe.qr) || null,
      cufe: {
        valor: fe.cufe || (qrCufe && qrCufe.cufe) || null,
        validado: !!(qrCufe && qrCufe.cufeValidado),
        fuente: (qrCufe && qrCufe.cufeSource) || null,
        resolution: qrCufe ? cloneJson(qrCufe) : null,
        candidatos: probe.cufeCandidatos || (qrCufe && qrCufe.cufeCandidates) || [],
      },
      texto: {
        crudo: truncateText(textFull),
        ocrFuente: fe._ocrAyudaFuente || input.ocrFuente || null,
      },
      pdf: {
        fontStats: pack.fontStats || null,
        blockCount: pack.blockCount || 0,
        blocksSample: summarizeBlocks(pack.blocks, BLOCKS_SAMPLE),
      },
      proveedor: {
        catalogoMatchId: input.proveedorSugerido && input.proveedorSugerido.id,
        catalogoMatchNombre: input.proveedorSugerido && (input.proveedorSugerido.nombre || input.proveedorSugerido.name),
        coincidencias: (input.proveedoresCoincidentes || []).length,
        nitNorm: normNit(fe.nitEmisor),
        slug: slugify(fe.razonSocial) || null,
      },
      reconstruccion: buildReconstruccionVirtual(fe),
      fusion: input.fusion ? cloneJson(input.fusion) : null,
      candidatos: input.candidatos ? cloneJson(input.candidatos) : null,
      bolsaExtraccion: input.bolsaExtraccion || (input.fe && input.fe._bolsaExtraccion) || null,
      razonamiento: input.razonamiento || (input.fe && input.fe._razonamiento) || null,
      analisisCuatroPartes:
        input.analisisCuatroPartes ||
        (input.fe && input.fe._analisisCuatroPartes) ||
        (input.razonamiento && input.razonamiento.analisisCuatroPartes) ||
        null,
      razonamientoCoherencia:
        (input.razonamiento && input.razonamiento.coherencia) ||
        (input.fe && input.fe._razonamiento && input.fe._razonamiento.coherencia) ||
        null,
    };
  }

  function loadLearned() {
    return lsGet(LS_LEARNED, { version: 1, vendors: {}, totalSnapshots: 0 });
  }

  function saveLearned(data) {
    lsSet(LS_LEARNED, data);
  }

  function contrastWithCatalogo(recon, prov) {
    recon = recon || {};
    prov = prov || {};
    var r = recon.proveedor || {};
    var diff = {};
    var pairs = [
      ['razonSocial', prov.nombre || prov.name || prov.razonSocial || (prov.legal && prov.legal.razonSocial)],
      ['direccion', prov.direccion || (prov.legal && prov.legal.direccion)],
      ['telefono', prov.telefono],
      ['email', prov.email],
      ['representante', prov.representante || (prov.legal && prov.legal.representanteLegal)],
    ];
    pairs.forEach(function (p) {
      var ext = r[p[0]] || '';
      var cat = p[1] || '';
      if (ext && cat && normTxt(ext) !== normTxt(cat)) {
        diff[p[0]] = { extraido: ext, catalogo: cat };
      }
    });
    return diff;
  }

  function feBancoAprenderRazonamiento(snapshot, razonamiento) {
    razonamiento = razonamiento || (snapshot && snapshot.razonamiento) || null;
    if (!razonamiento || !razonamiento.preguntas || !razonamiento.preguntas.length) return loadLearned();
    var learned = loadLearned();
    if (!learned.razonamiento) {
      learned.razonamiento = { total: 0, patrones: {}, muestras: [] };
    }
    learned.razonamiento.total = (learned.razonamiento.total || 0) + 1;

    (razonamiento.preguntas || []).forEach(function (p) {
      var patKey = (p.fase || 'asignacion') + '|' + (p.patron || 'general');
      if (!learned.razonamiento.patrones[patKey]) {
        learned.razonamiento.patrones[patKey] = { usos: 0, plausible: 0, dudoso: 0, improbable: 0 };
      }
      var rec = learned.razonamiento.patrones[patKey];
      rec.usos++;
      if (p.confianza === 'plausible') rec.plausible++;
      else if (p.confianza === 'dudoso') rec.dudoso++;
      else rec.improbable++;
    });

    var nit =
      (snapshot.proveedor && snapshot.proveedor.nitNorm) ||
      normNit(snapshot.reconstruccion && snapshot.reconstruccion.proveedor && snapshot.reconstruccion.proveedor.nit);
    var slug =
      (nit ? 'nit_' + nit : '') ||
      (snapshot.proveedor && snapshot.proveedor.slug) ||
      slugify(snapshot.reconstruccion && snapshot.reconstruccion.proveedor && snapshot.reconstruccion.proveedor.razonSocial);
    if (slug) {
      if (!learned.vendors) learned.vendors = {};
      if (!learned.vendors[slug]) learned.vendors[slug] = { samples: 0, fields: {} };
      if (!learned.vendors[slug].razonamiento) learned.vendors[slug].razonamiento = [];
      learned.vendors[slug].razonamiento.push({
        at: snapshot.createdAt || new Date().toISOString(),
        coherencia: razonamiento.coherencia,
        preguntas: (razonamiento.preguntas || []).slice(0, 24).map(function (p) {
          return {
            fase: p.fase,
            patron: p.patron,
            pregunta: String(p.pregunta || '').slice(0, 120),
            confianza: p.confianza,
            campo: p.campo,
          };
        }),
        asignaciones: razonamiento.asignaciones || null,
      });
      if (learned.vendors[slug].razonamiento.length > 12) {
        learned.vendors[slug].razonamiento = learned.vendors[slug].razonamiento.slice(-12);
      }
    }

    learned.razonamiento.muestras = learned.razonamiento.muestras || [];
    learned.razonamiento.muestras.unshift({
      at: snapshot.createdAt || new Date().toISOString(),
      snapshotId: snapshot.id,
      coherencia: razonamiento.coherencia,
      totalPreguntas: razonamiento.preguntas.length,
      archivo: snapshot.archivo && snapshot.archivo.nombre,
    });
    if (learned.razonamiento.muestras.length > 60) {
      learned.razonamiento.muestras = learned.razonamiento.muestras.slice(0, 60);
    }

    learned.updatedAt = new Date().toISOString();
    saveLearned(learned);
    return learned;
  }

  function feBancoAprender(snapshot, opts) {
    opts = opts || {};
    if (!snapshot) return loadLearned();
    var learned = loadLearned();
    if (!learned.vendors) learned.vendors = {};

    var nit = snapshot.proveedor && snapshot.proveedor.nitNorm;
    var slug = (nit ? 'nit_' + nit : '') || snapshot.proveedor.slug || slugify(snapshot.reconstruccion.proveedor.razonSocial);
    if (!slug) {
      learned.totalSnapshots = (learned.totalSnapshots || 0) + 1;
      learned.updatedAt = new Date().toISOString();
      saveLearned(learned);
      return learned;
    }

    if (!learned.vendors[slug]) {
      learned.vendors[slug] = { samples: 0, fields: {}, aliases: {}, nit: nit || null };
    }
    var v = learned.vendors[slug];
    v.samples = (v.samples || 0) + 1;
    v.lastSeen = snapshot.createdAt;
    if (nit) v.nit = nit;

    var prov = snapshot.reconstruccion.proveedor || {};
    ['razonSocial', 'representante', 'direccion', 'telefono', 'email'].forEach(function (k) {
      var val = prov[k];
      if (!val) return;
      if (!v.fields[k]) v.fields[k] = {};
      var key = normTxt(val);
      v.fields[k][key] = (v.fields[k][key] || 0) + 1;
    });

    if (opts.proveedorCatalogo) {
      v.catalogoId = opts.proveedorCatalogo.id;
      v.ultimoContraste = contrastWithCatalogo(snapshot.reconstruccion, opts.proveedorCatalogo);
    }

    learned.totalSnapshots = (learned.totalSnapshots || 0) + 1;
    learned.updatedAt = new Date().toISOString();
    saveLearned(learned);
    return learned;
  }

  function feBancoApplyLearnedToFe(fe, pack, meta) {
    fe = fe || {};
    meta = meta || {};
    var learned = loadLearned();
    var vendors = learned.vendors || {};
    var nit = normNit(fe.nitEmisor);
    var slug = nit ? 'nit_' + nit : slugify(fe.razonSocial);
    var v = slug && vendors[slug];
    if (!v || (v.samples || 0) < 2) return fe;

    if (!fe.direccionEmisor && v.fields.direccion) {
      var dir = pickTopField(v.fields.direccion);
      if (dir) fe.direccionEmisor = dir.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    if (!fe.representanteEmisor && v.fields.representante) {
      var rep = pickTopField(v.fields.representante);
      if (rep) fe.representanteEmisor = rep.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    if (!fe.telefonoEmisor && v.fields.telefono) {
      fe.telefonoEmisor = pickTopField(v.fields.telefono);
    }
    if (!fe.emailEmisor && v.fields.email) {
      fe.emailEmisor = pickTopField(v.fields.email);
    }
    if (!fe.razonSocial && v.fields.razonSocial) {
      var rs = pickTopField(v.fields.razonSocial);
      if (rs) {
        fe.razonSocial = rs.toUpperCase();
        fe._razonSocialFromBanco = true;
      }
    }
    return fe;
  }

  function updateIndex(snapshot) {
    var idx = lsGet(LS_INDEX, { items: [] });
    idx.items = idx.items || [];
    idx.items.unshift({
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      nombre: snapshot.archivo && snapshot.archivo.nombre,
      nit: snapshot.proveedor && snapshot.proveedor.nitNorm,
      blobRef: snapshot.archivo && snapshot.archivo.blobRef,
      confidence: snapshot.extraccion && snapshot.extraccion.confidence,
      source: snapshot.source,
    });
    if (idx.items.length > INDEX_MAX) idx.items = idx.items.slice(0, INDEX_MAX);
    lsSet(LS_INDEX, idx);
  }

  function persistSnapshot(snapshot) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(snapshot);
        tx.oncomplete = function () {
          updateIndex(snapshot);
          resolve(snapshot);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function feBancoGetSnapshot(id) {
    if (!id) return Promise.resolve(null);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function feBancoGetIndex() {
    return lsGet(LS_INDEX, { items: [] });
  }

  function feBancoGetLearned() {
    return loadLearned();
  }

  function feBancoRegistrarContrasteCatalogo(snapshotId, proveedor) {
    if (!snapshotId || !proveedor) return Promise.resolve(null);
    return feBancoGetSnapshot(snapshotId).then(function (snap) {
      if (!snap) return null;
      snap.proveedor = snap.proveedor || {};
      snap.proveedor.catalogoMatchId = proveedor.id;
      snap.proveedor.catalogoMatchNombre = proveedor.nombre || proveedor.name;
      snap.proveedor.contrasteCatalogo = contrastWithCatalogo(snap.reconstruccion, proveedor);
      feBancoAprender(snap, { proveedorCatalogo: proveedor });
      return persistSnapshot(snap);
    });
  }

  function feBancoGuardarDesdeAnalisis(input) {
    input = input || {};
    var B = global.CrozzoBlobStore;
    var blob = input.blob;

    return hashBlob(blob)
      .catch(function () { return null; })
      .then(function (fileHash) {
        input.fileHash = fileHash;
        var snap = feBuildExtraccionSnapshot(input);
        if (!blob || !B || typeof B.putBlob !== 'function') {
          return persistSnapshot(snap).then(function (s) {
            feBancoAprender(s, input);
            feBancoAprenderRazonamiento(s, input.razonamiento || s.razonamiento);
            return s;
          });
        }
        return B.putBlob({
          nombre: input.nombreArchivo || 'factura.pdf',
          mime: input.mime || 'application/pdf',
          blob: blob,
          refTipo: 'fe_extraccion',
          proveedorId: input.proveedorSugerido && input.proveedorSugerido.id,
        }).then(function (rec) {
          snap.archivo.blobRef = rec.id;
          snap.archivo.bytes = rec.bytes;
          return persistSnapshot(snap).then(function (s) {
            feBancoAprender(s, input);
            feBancoAprenderRazonamiento(s, input.razonamiento || s.razonamiento);
            return s;
          });
        });
      });
  }

  global.CrozzoRecepcionFeBanco = {
    feBuildExtraccionSnapshot: feBuildExtraccionSnapshot,
    feBancoGuardarDesdeAnalisis: feBancoGuardarDesdeAnalisis,
    feBancoAprender: feBancoAprender,
    feBancoApplyLearnedToFe: feBancoApplyLearnedToFe,
    feBancoGetSnapshot: feBancoGetSnapshot,
    feBancoGetIndex: feBancoGetIndex,
    feBancoGetLearned: feBancoGetLearned,
    feBancoRegistrarContrasteCatalogo: feBancoRegistrarContrasteCatalogo,
    feBancoCandidatoDesdeProbe: feBancoCandidatoDesdeProbe,
    feBancoFusionarCandidatos: feBancoFusionarCandidatos,
    feBancoAprenderDesdeFusion: feBancoAprenderDesdeFusion,
    feBancoAprenderCorreccion: feBancoAprenderCorreccion,
    feBancoAprenderRazonamiento: feBancoAprenderRazonamiento,
    feBancoExportRazonamientoEntrenamiento: function () {
      var learned = loadLearned();
      return JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          razonamiento: learned.razonamiento || null,
          vendors: learned.vendors || {},
        },
        null,
        2
      );
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
