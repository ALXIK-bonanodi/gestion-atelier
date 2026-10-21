/* ==========================================================================
   bead-core.js — Bona Nodi · moteur 3D de perles (rocailles & co)
   Module ES partagé par l'éditeur d'atelier et le visualiseur boutique.
   Unités : millimètres. Axe du trou d'une perle = axe X local.
   Dépend de three.js via une importmap :
     "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
     "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
   ========================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const DEG = Math.PI / 180;
/* Vue « de face » : les breloques pendent selon Y et s'étalent dans le plan YZ (éventail),
   leur face peinte / leur profil regarde +X. Légèrement au-dessus pour donner du relief. */
const DIR_FACE = new THREE.Vector3(1, 0.12, 0).normalize();
const AXE_X = new THREE.Vector3(1, 0, 0);

/* --------------------------------------------------------------------------
   1. TYPES DE PERLES
   D = diamètre extérieur, H = hauteur (longueur le long du trou),
   trou = diamètre du trou, n = « carré » du profil (2 = tore rond,
   7 = cylindre type Delica). Ajoute tes propres types avec ajouterTypePerle().
   -------------------------------------------------------------------------- */
export const TYPES_PERLES = {
  'rocaille-15': { nom: 'Rocaille 15/0', forme: 'rocaille', D: 1.5, H: 1.0, trou: 0.6, n: 2.4 },
  'rocaille-11': { nom: 'Rocaille 11/0', forme: 'rocaille', D: 2.1, H: 1.4, trou: 0.8, n: 2.4 },
  'rocaille-8':  { nom: 'Rocaille 8/0',  forme: 'rocaille', D: 3.0, H: 2.1, trou: 1.1, n: 2.4 },
  'rocaille-6':  { nom: 'Rocaille 6/0',  forme: 'rocaille', D: 4.0, H: 2.8, trou: 1.5, n: 2.4 },
  'delica-11':   { nom: 'Delica 11/0',   forme: 'rocaille', D: 1.6, H: 1.3, trou: 0.8, n: 7 },
  'ronde-3':     { nom: 'Ronde 3 mm',    forme: 'ronde',    D: 3.0, H: 2.7, trou: 0.8 },
  'ronde-4':     { nom: 'Ronde 4 mm',    forme: 'ronde',    D: 4.0, H: 3.7, trou: 1.0 },
  'plate-4':     { nom: 'Perle plate 4 mm', forme: 'rocaille', D: 4.0, H: 1.3, trou: 0.9, n: 5 },
  'plate-6':     { nom: 'Perle plate 6 mm', forme: 'rocaille', D: 6.0, H: 1.6, trou: 1.0, n: 5 },
  'plate-8':     { nom: 'Perle plate 8 mm', forme: 'rocaille', D: 8.0, H: 1.9, trou: 1.2, n: 5 },
  // étoiles hématite : plates, pointes vives ; étoile nacre : plus petite, bombée, pointes rondes
  'etoile-8':       { nom: 'Étoile hématite 7,5 mm', forme: 'etoile', D: 7.5, H: 2.4, trou: 1.0, interieur: 0.45, bombe: 0.16 },
  'etoile-6':       { nom: 'Étoile hématite 6 mm', forme: 'etoile', D: 6.0, H: 2.2, trou: 0.9, interieur: 0.45, bombe: 0.16 },
  'etoile-nacre-6': { nom: 'Étoile nacre 6 mm', forme: 'etoile', D: 6.0, H: 2.6, trou: 0.9, interieur: 0.62, bombe: 0.36 },
  'oeil-6':      { nom: 'Perle œil 6 mm', forme: 'disque',  D: 6.0, H: 2.2, trou: 0.9 },
  // perle lettre ronde et plate (photo du sac) : trou dans la tranche, lettre sur une face
  'lettre-7':    { nom: 'Perle lettre 7 mm', forme: 'lettre', D: 7.0, H: 3.8, trou: 1.2 },
  'oeil-4':      { nom: 'Perle œil 4 mm', forme: 'disque',  D: 4.0, H: 1.8, trou: 0.8 },
  // perle de culture d'eau douce, forme tonneau un peu irrégulière (photo : ≈ 7 × 9 mm)
  'culture-8':   { nom: 'Perle de culture 7 × 9 mm', forme: 'perle', D: 7.0, H: 9.0, trou: 0.6 },
  // breloque en argile ronde et plate, bords arrondis, piton à œil en haut (≈ 30 mm : citron ≈ 0,6 × poisson de 5 cm fermoir compris)
  'argile-30':   { nom: 'Breloque argile ronde 30 mm', forme: 'argile', D: 30, H: 5, trou: 0, arrondi: 1.5 },
};

const cacheGeo = new Map();

export function ajouterTypePerle(id, def) {
  TYPES_PERLES[id] = def;
  const g = cacheGeo.get(id);
  if (g) { g.dispose(); cacheGeo.delete(id); }
}

export function typePerle(id) {
  return TYPES_PERLES[id] || TYPES_PERLES['rocaille-11'];
}

/* Puissance signée pour les superellipses */
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/* Profil (rayon, hauteur) parcouru dans le sens anti-horaire,
   pour que les normales de LatheGeometry pointent vers l'extérieur. */
function profilRocaille(T, seg) {
  const ri = T.trou / 2, ro = T.D / 2;
  const rm = (ri + ro) / 2, a = (ro - ri) / 2, b = T.H / 2;
  const n = T.n || 2.4;
  const pts = [];
  for (let k = 0; k <= seg; k++) {
    const t = (k % seg) / seg * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    // côté trou plus droit que le bombé extérieur, comme une vraie rocaille
    const eX = c >= 0 ? 2 / n : 2 / (n * 2.5);
    const eY = c >= 0 ? 2 / n : 2 / (n * 2.5);
    pts.push(new THREE.Vector2(rm + a * spow(c, eX), b * spow(s, eY)));
  }
  return pts;
}

function profilPerle(T, seg) {                      // ovale allongé dans l'axe du trou, deux légers bourrelets
  const R = T.D / 2, h = T.H / 2, ri = T.trou / 2, n = Math.round(seg * 1.4), pts = [];
  for (let k = 0; k <= n; k++) {
    const t = -Math.PI / 2 + Math.PI * k / n, y = h * Math.sin(t);
    const r = Math.max(ri + 0.05, R * Math.pow(Math.cos(t), 0.8) * (1 + 0.035 * Math.cos(3 * t + 0.6)));
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(ri, h * 0.98), new THREE.Vector2(ri, -h * 0.98), pts[0].clone());
  return pts.reverse();
}
function profilRonde(T, seg) {
  const R = T.D / 2, ri = T.trou / 2, h = Math.min(T.H / 2, R * 0.98);
  const p0 = Math.asin(h / R);
  const pts = [];
  const nArc = Math.round(seg * 0.6);
  for (let k = 0; k <= nArc; k++) {
    const p = -p0 + (2 * p0) * k / nArc;
    pts.push(new THREE.Vector2(R * Math.cos(p), R * Math.sin(p)));
  }
  // chanfrein du trou en haut, paroi du trou, chanfrein en bas
  const ch = Math.min(0.15, (R * Math.cos(p0) - ri) * 0.4);
  pts.push(new THREE.Vector2(ri + ch, h));
  pts.push(new THREE.Vector2(ri, h - ch));
  pts.push(new THREE.Vector2(ri, -h + ch));
  pts.push(new THREE.Vector2(ri + ch, -h));
  pts.push(pts[0].clone());
  return pts;
}

/* Géométrie d'une perle, mise en cache par type. Trou orienté selon X. */
export function geometriePerle(id, detail = 1) {
  const cle = id + '@' + detail;
  if (cacheGeo.has(cle)) return cacheGeo.get(cle);
  const T = typePerle(id);
  if (T.forme === 'lettre') {
    // disque aux bords arrondis, faces dans le plan XY (trou selon X, dans la tranche)
    const b = 0.7, c = new THREE.Shape(); c.absarc(0, 0, T.D / 2 - b, 0, Math.PI * 2, false);
    const g = new THREE.ExtrudeGeometry(c, { depth: T.H - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 5, curveSegments: 40 });
    g.translate(0, 0, -(T.H - 2 * b) / 2);
    g.computeVertexNormals(); g.computeBoundingSphere();
    cacheGeo.set(cle, g);
    return g;
  }
  if (T.forme === 'argile') {
    // galet plat aux bords arrondis, faces dans le plan XY ; UV à plat : le bord prend la couleur de l'écorce
    const b = T.arrondi ?? 1.5, R = T.D / 2, c = new THREE.Shape(); c.absarc(0, 0, R - b, 0, Math.PI * 2, false);
    const g = new THREE.ExtrudeGeometry(c, { depth: T.H - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 6, curveSegments: 72 });
    g.translate(0, 0, -(T.H - 2 * b) / 2);
    // Seule la face avant (z < 0, celle que voit la caméra) est peinte ; le verso est de la
    // couleur de la tranche (le contour du motif), comme sur tes breloques.
    const pos = g.attributes.position, uv = g.attributes.uv;
    let zMax = -Infinity; for (let i = 0; i < pos.count; i++) zMax = Math.max(zMax, pos.getZ(i));
    const rTranche = 0.485;                                   // rayon (en UV) où le dessin a la couleur du contour
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, y), k = r > R * 0.985 ? 0.985 * R / r : 1;
      if (z >= zMax - 1e-4) uv.setXY(i, 0.5 + rTranche, 0.5);                       // verso : uni, couleur du contour
      else if (z > 1e-4) { const a = Math.atan2(y, x); uv.setXY(i, 0.5 + rTranche * Math.cos(a), 0.5 + rTranche * Math.sin(a)); }
      else uv.setXY(i, 0.5 + x * k / T.D, 0.5 + y * k / T.D);
    }
    g.computeVertexNormals(); g.computeBoundingSphere();
    cacheGeo.set(cle, g);
    return g;
  }
  if (T.forme === 'etoile') {
    // étoile bombée à 5 branches, une pointe dans l'axe du trou (X)
    const R = T.D / 2, r = R * (T.interieur ?? 0.48), b = T.H * (T.bombe ?? 0.36);
    const forme = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, rr = (i % 2 ? r : R) - b * 0.55;
      i ? forme.lineTo(rr * Math.cos(a), rr * Math.sin(a)) : forme.moveTo(rr, 0);
    }
    forme.closePath();
    const g = new THREE.ExtrudeGeometry(forme, { depth: Math.max(0.05, T.H - 2 * b), bevelEnabled: true,
      bevelThickness: b, bevelSize: b * (T.bombe > 0.3 ? 0.8 : 0.45), bevelSegments: 5, curveSegments: 4 });
    g.translate(0, 0, -(T.H - 2 * b) / 2);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    cacheGeo.set(cle, g);
    return g;
  }
  if (T.forme === 'disque') {
    // pastille plate (perle œil) : faces planes au bon UV pour le motif, tranche unie
    const g = new THREE.CylinderGeometry(T.D / 2, T.D / 2, T.H, Math.round(40 * detail), 1);
    const nTranche = (Math.round(40 * detail) + 1) * 2;
    const uv = g.attributes.uv;
    for (let i = 0; i < nTranche; i++) uv.setXY(i, 0.5, 0.012);
    g.rotateZ(-Math.PI / 2);
    g.computeBoundingSphere();
    cacheGeo.set(cle, g);
    return g;
  }
  const seg = Math.round(28 * detail), tours = Math.round(32 * detail);
  const profil = T.forme === 'ronde' ? profilRonde(T, seg) : T.forme === 'perle' ? profilPerle(T, seg) : profilRocaille(T, seg);
  const g = new THREE.LatheGeometry(profil, tours);
  g.rotateZ(-Math.PI / 2);          // axe du tour (Y) -> X
  g.computeBoundingSphere();
  cacheGeo.set(cle, g);
  return g;
}

/* Lettre imprimée sur la face d'une perle lettre (décalque) : lisible le long du fil */
const cacheDecal = new Map(), cacheMatLettre = new Map();
function geoDecalLettre(type) {
  if (cacheDecal.has(type)) return cacheDecal.get(type);
  const T = typePerle(type);
  const g = new THREE.CircleGeometry(T.D * 0.4, 40);
  g.rotateY(Math.PI); g.rotateZ(Math.PI);           // face côté -Z local (+X monde), lettre couchée le long du fil
  g.translate(0, 0, -(T.H / 2 + 0.04));
  cacheDecal.set(type, g);
  return g;
}
function matLettre(ch, couleur = '#c9ccd2') {
  const cle = ch + couleur;
  if (cacheMatLettre.has(cle)) return cacheMatLettre.get(cle);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '600 168px "Arial Rounded MT Bold", Arial, Helvetica, sans-serif';
  const gr = x.createLinearGradient(0, 40, 0, 216); gr.addColorStop(0, '#f4f5f7'); gr.addColorStop(0.5, couleur); gr.addColorStop(1, '#8d9096');
  x.lineWidth = 10; x.strokeStyle = '#5c5f66'; x.strokeText(ch, 128, 138);
  x.fillStyle = gr; x.fillText(ch, 128, 138);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshPhysicalMaterial({ map: t, transparent: true, alphaTest: 0.3, metalness: 0.75, roughness: 0.25, clearcoat: 0.6 });
  cacheMatLettre.set(cle, m);
  return m;
}

/* --------------------------------------------------------------------------
   2. CATALOGUE DE COULEURS & MATÉRIAUX
   Une couleur catalogue : { ref, nom, hex, finition, texture? }
   finition : opaque | transparent | mat | metallique | irise | argente | nacre
   texture  : URL d'image (photo de ta perle) — optionnelle, teintée en blanc.
   -------------------------------------------------------------------------- */
export const FINITIONS = {
  opaque: 'Opaque', transparent: 'Transparent', mat: 'Mat',
  metallique: 'Métallique / galvanisé', irise: 'Irisé (AB)', 'irise-metal': 'Hématite irisée', hematite: 'Hématite', petrole: 'Métal pétrole',
  argente: 'Intérieur argenté', nacre: 'Nacré / ceylan', oeil: 'Perle œil (motif)', argile: 'Argile peinte (motif)',
};

/* --------------------------------------------------------------------------
   Motifs peints des breloques argile (tranche de fruit vue de face).
   Dessinés dans un canvas : servent de texture 3D et de pastille de choix.
   Motif inconnu = disque uni de la couleur hex (pour tes futures couleurs unies).
   -------------------------------------------------------------------------- */
export const MOTIFS_ARGILE = {
  citron: { nom: 'citron', hex: '#e8c11c' },
  tomate: { nom: 'tomate', hex: '#c42318' },
  myrtille: { nom: 'myrtille', hex: '#3a62a0' },
};
export function motifArgile(texte) {
  const t = norm(texte);
  return Object.keys(MOTIFS_ARGILE).find(k => t.includes(k)) || null;
}
function hasard(graine) {                                   // pseudo-aléatoire répétable (même rendu à chaque fois)
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function dessinerArgile(x, motif, hex = '#d9c9b0', S = 512) {
  const C = S / 2, rnd = hasard(motif === 'tomate' ? 7 : motif === 'citron' ? 3 : motif === 'myrtille' ? 5 : 11);
  const rond = (r, col, cx = C, cy = C) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  const coups = (n, r0, r1, cols, l = 0.05, w = 0.012, alpha = 0.22) => {   // coups de pinceau : peinture à la main
    x.save(); x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = (r0 + (r1 - r0) * Math.sqrt(rnd())) * C, d = rnd() * Math.PI * 2;
      const px = C + r * Math.cos(a), py = C + r * Math.sin(a), L = (0.4 + rnd()) * l * S;
      x.globalAlpha = alpha * (0.4 + rnd() * 0.6); x.strokeStyle = cols[i % cols.length]; x.lineWidth = (0.5 + rnd()) * w * S;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + L * Math.cos(d), py + L * Math.sin(d)); x.stroke();
    }
    x.restore();
  };
  x.clearRect(0, 0, S, S);
  x.save(); x.beginPath(); x.arc(C, C, C, 0, Math.PI * 2); x.clip();
  if (motif === 'citron') {
    rond(C, '#e8c11c');                                     // écorce (et tranche du galet)
    coups(140, 0.9, 1, ['#f2d544', '#c99a10']);
    rond(C * 0.88, '#f7f1d2');                              // peau blanche
    rond(C * 0.83, '#f3dc4e');                              // pulpe
    const n = 10;
    x.save(); x.strokeStyle = '#f7f1d2'; x.lineCap = 'round';
    for (let i = 0; i < n; i++) {                           // membranes entre les quartiers
      const a = (i + rnd() * 0.15) / n * Math.PI * 2;
      x.lineWidth = S * (0.011 + rnd() * 0.005);
      x.beginPath(); x.moveTo(C + C * 0.1 * Math.cos(a), C + C * 0.1 * Math.sin(a)); x.lineTo(C + C * 0.82 * Math.cos(a), C + C * 0.82 * Math.sin(a)); x.stroke();
    }
    x.restore();
    for (let i = 0; i < n; i++) {                           // jus : petites vésicules plus claires dans chaque quartier
      const a0 = (i + 0.5) / n * Math.PI * 2;
      for (let k = 0; k < 14; k++) {
        const a = a0 + (rnd() - 0.5) * 0.4, r = C * (0.2 + rnd() * 0.58);
        x.save(); x.globalAlpha = 0.35; x.strokeStyle = rnd() < 0.5 ? '#faf0a0' : '#e2c22a'; x.lineWidth = S * 0.008; x.lineCap = 'round';
        x.beginPath(); x.moveTo(C + r * Math.cos(a), C + r * Math.sin(a)); x.lineTo(C + (r + C * 0.07) * Math.cos(a), C + (r + C * 0.07) * Math.sin(a)); x.stroke(); x.restore();
      }
    }
    rond(C * 0.1, '#f7f1d2');                               // cœur
    for (let i = 0; i < 4; i++) {                           // quelques pépins
      const a = (i * 2.6 + 0.7) / 10 * Math.PI * 2, r = C * 0.3;
      x.save(); x.translate(C + r * Math.cos(a), C + r * Math.sin(a)); x.rotate(a); x.fillStyle = '#efe4b8';
      x.beginPath(); x.ellipse(0, 0, S * 0.022, S * 0.011, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
  } else if (motif === 'tomate') {
    rond(C, '#c42318');                                     // peau (et tranche du galet)
    coups(140, 0.92, 1, ['#a51a12', '#d8392a']);
    rond(C * 0.93, '#d8382a');                              // chair
    coups(200, 0, 0.93, ['#e2503c', '#c22a1c', '#e8604a'], 0.04, 0.01, 0.16);
    const n = 4;
    for (let i = 0; i < n; i++) {                           // loges en quartiers arrondis : gelée et graines
      const a = (i + 0.06 * (rnd() - 0.5)) / n * Math.PI * 2 + 0.4, da = Math.PI / n - 0.27, r0 = C * 0.27, r1 = C * 0.76;
      const loge = (k, col) => {
        x.fillStyle = col; x.beginPath();
        x.arc(C, C, r1 - k * C * 0.05, a - da + k * 0.05, a + da - k * 0.05);
        x.arc(C, C, r0 + k * C * 0.05, a + da - k * 0.05, a - da + k * 0.05, true);
        x.closePath(); x.lineJoin = 'round'; x.lineWidth = C * 0.08; x.strokeStyle = col; x.stroke(); x.fill();
      };
      loge(0, '#e45a44'); loge(1.2, '#ec7a5e'); loge(2.4, '#f29575');
      for (let k = 0; k < 11; k++) {                        // graines dispersées dans la gelée
        const t = a + (rnd() - 0.5) * da * 1.5, r = C * (0.34 + rnd() * 0.32);
        const gx = C + r * Math.cos(t), gy = C + r * Math.sin(t);
        x.save(); x.translate(gx, gy); x.rotate(t + (rnd() - 0.5));
        x.fillStyle = 'rgba(250,215,170,.55)'; x.beginPath(); x.ellipse(0, 0, S * 0.02, S * 0.013, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#f5df9c'; x.beginPath(); x.ellipse(0, 0, S * 0.013, S * 0.0075, 0, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
    rond(C * 0.2, '#e4614c');                               // cœur clair
    coups(30, 0, 0.2, ['#f08a72', '#d84a3a'], 0.03, 0.01, 0.3);
  } else if (motif === 'myrtille') {
    // myrtille vue de dessus : bleu marbré, pruine blanchâtre au pinceau sec, couronne à 6 pétales bleu nuit
    rond(C, '#335d9c');
    coups(260, 0, 1, ['#4b7bbb', '#2b4d86', '#6190cb'], 0.06, 0.02, 0.35);
    for (let i = 0; i < 14; i++) {                          // taches de pruine claire
      const a = rnd() * Math.PI * 2, r = C * (0.3 + rnd() * 0.6);
      x.save(); x.globalAlpha = 0.18 + rnd() * 0.12; x.fillStyle = '#c4d6ec';
      x.beginPath(); x.ellipse(C + r * Math.cos(a), C + r * Math.sin(a), C * (0.08 + rnd() * 0.12), C * (0.05 + rnd() * 0.06), rnd() * 3, 0, Math.PI * 2); x.fill(); x.restore();
    }
    coups(220, 0, 1, ['#c9daee', '#e0eaf5', '#a6bfe0'], 0.07, 0.006, 0.35);     // traits secs clairs
    coups(70, 0.86, 1, ['#1f3a6c', '#26467e'], 0.05, 0.02, 0.45);                 // bord plus sombre
    const couronne = (k, col) => {                          // étoile à 6 branches, pointes arrondies
      x.fillStyle = x.strokeStyle = col; x.lineJoin = 'round'; x.lineWidth = C * 0.11 * k; x.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 6, r = C * k * (i % 2 ? 0.3 : 0.46) * (0.97 + rnd() * 0.06);
        i ? x.lineTo(C + r * Math.cos(a), C + r * Math.sin(a)) : x.moveTo(C + r * Math.cos(a), C + r * Math.sin(a));
      }
      x.closePath(); x.stroke(); x.fill();
    };
    couronne(1.12, '#a9c3e4');                              // rebord clair (relief modelé)
    couronne(1, '#162a58');                                 // couronne bleu nuit
    rond(C * 0.27, '#3a67aa');                              // creux central
    coups(50, 0, 0.27, ['#5f8dca', '#2c5292', '#a9c3e4'], 0.03, 0.008, 0.35);
    rond(C * 0.05, '#0f1b3a');                              // point au centre
  } else {
    rond(C, hex);
    const c = new THREE.Color(hex);
    coups(320, 0, 1, ['#' + c.clone().offsetHSL(0, 0, 0.06).getHexString(), '#' + c.clone().offsetHSL(0, 0, -0.06).getHexString()]);
  }
  x.restore();
}
const cacheApercuArgile = new Map();
/* Pastille du choix client (image) */
export function apercuArgile(motif, hex) {
  const cle = motif + '|' + hex;
  if (cacheApercuArgile.has(cle)) return cacheApercuArgile.get(cle);
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  dessinerArgile(x, motif, hex, 128);
  // relief du galet comme en 3D : reflet en haut à gauche, ombre du bord arrondi
  const r = x.createRadialGradient(44, 40, 4, 64, 64, 66);
  r.addColorStop(0, 'rgba(255,255,255,.45)'); r.addColorStop(0.35, 'rgba(255,255,255,.08)');
  r.addColorStop(0.8, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.28)');
  x.fillStyle = r; x.beginPath(); x.arc(64, 64, 64, 0, Math.PI * 2); x.fill();
  const url = cv.toDataURL('image/png');
  cacheApercuArgile.set(cle, url);
  return url;
}

/* Ta planche de rocailles, dans l'ordre (ligne par ligne). Teinte et finition relevées
   sur ta photo des pastilles : servent tant que meta.hex / meta.finition ne sont pas
   renseignés dans materiaux. Le nom doit correspondre à la colonne variante. */
export const PLANCHE_ROCAILLES = [
  ['rouge 1', '#c8101a', 'opaque'],     ['rouge 2', '#7a0a10', 'argente'],    ['rouge 3', '#a51030', 'irise'],       ['rouge 4', '#6e1e2a', 'transparent'],
  ['orange 1', '#e2400a', 'opaque'],    ['orange 2', '#a8160a', 'argente'],   ['orange 3', '#d0561a', 'transparent'], ['marron', '#4a2a10', 'argente'],
  ['jaune 1', '#e5a000', 'opaque'],     ['jaune 2', '#d8c000', 'transparent'], ['pêche 1', '#b0604e', 'argente'],    ['pêche 2', '#ff9a7a', 'opaque'],
  ['bleu 1', '#10a39c', 'opaque'],      ['bleu 2', '#1f86a8', 'argente'],     ['bleu 3', '#1a14a0', 'opaque'],       ['bleu 4', '#141a40', 'opaque'],
  ['rose 1', '#f0288f', 'opaque'],      ['rose 2', '#f04ab8', 'transparent'], ['vert 1', '#7a9418', 'argente'],      ['vert 2', '#1a3a14', 'argente'],
  ['violet 1', '#6a0a60', 'opaque'],    ['violet 2', '#9a78c0', 'nacre'],     ['violet 3', '#a8586a', 'argente'],    ['violet 4', '#8a6a80', 'transparent'],
  ['blanc', '#eef2ec', 'opaque'],       ['noir', '#0a0c10', 'opaque'],
  ['argent 1', '#cfd0ca', 'metallique'], ['argent 2', '#4a4a48', 'metallique'], ['doré', '#b07818', 'metallique'],
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const PLANCHE = new Map(PLANCHE_ROCAILLES.map(([n, hex, finition], i) => [norm(n), { hex, finition, ordre: i }]));
export const COULEURS_PAR_NOM = {
  ...Object.fromEntries(PLANCHE_ROCAILLES.map(([n, hex]) => [norm(n), hex])),
  'rouge': '#c0392b', 'orange': '#e2470e', 'jaune': '#f1c40f', 'peche': '#ff9a7a', 'bleu': '#1f86a8', 'rose': '#e91e8c',
  'vert': '#27ae60', 'violet': '#8e44ad', 'argent': '#cfd0cc', 'dore': '#c9973a', 'or': '#c9973a', 'gris': '#808080',
  'turquoise': '#16a6a0', 'beige': '#e8d5b7', 'bronze': '#8a6a3a',
};
export function couleurParNom(nom) {
  const l = norm(nom);
  if (COULEURS_PAR_NOM[l]) return COULEURS_PAR_NOM[l];
  const cles = Object.keys(COULEURS_PAR_NOM).sort((a, b) => b.length - a.length);
  for (const k of cles) if (l.includes(k)) return COULEURS_PAR_NOM[k];
  let h = 0; for (let i = 0; i < l.length; i++) h = l.charCodeAt(i) + ((h << 5) - h);
  return '#' + new THREE.Color().setHSL((Math.abs(h) % 360) / 360, 0.55, 0.55).getHexString();
}
export function devinerFinition(texte) {
  const t = String(texte || '').toLowerCase();
  if (/intérieur argent|silver.?lined/.test(t)) return 'argente';
  if (/argent|silver|galva|métal|metal|chrom|doré|\bor\b|bronze|cuivr/.test(t)) return 'metallique';
  if (/iris|\bab\b|aurore/.test(t)) return 'irise';
  if (/transp|cristal|crystal/.test(t)) return 'transparent';
  if (/\bmat\b|matte|givr/.test(t)) return 'mat';
  if (/nacr|ceylan/.test(t)) return 'nacre';
  return 'opaque';
}

/* Catalogue d'exemple au format de ta base (refs #PR… provisoires).
   Sur le site, il est remplacé par la table materiaux ; les zones retrouvent
   leur couleur par le nom de variante (bleu 2, bleu 3, argent 1…). */
export const CATALOGUE_DEMO = [
  ...PLANCHE_ROCAILLES.map(([nom, hex, finition], i) => ({ ref: '#PR-ex' + String(i + 1).padStart(2, '0'), nom, hex, finition })),
  { ref: '#PV-ex01', nom: 'plate noir',   hex: '#0d0e10', finition: 'opaque', categorie: 'Perles verre' },
  { ref: '#PV-ex03', nom: 'plate blanche', hex: '#f4f2ec', finition: 'opaque', categorie: 'Perles verre' },
  // petite perle plate blanche posée entre une perle heishi et la rocaille (œil « double perle plate »)
  { ref: '#PV-ex04', nom: 'plate blanche 4 mm', hex: '#f4f2ec', finition: 'opaque', categorie: 'Perles verre', perle: 'plate-4' },
  // perles heishi (plates colorées) : refs à créer ; double = la petite blanche s'ajoute automatiquement
  { ref: '#PH-ex01', nom: 'heishi marron', hex: '#6a3a22', finition: 'opaque', categorie: 'Perles heishi', perle: 'plate-6', double: true },
  { ref: '#PH-ex02', nom: 'heishi bleu',   hex: '#9fcde3', finition: 'opaque', categorie: 'Perles heishi', perle: 'plate-6', double: true },
  { ref: '#PH-ex03', nom: 'heishi vert',   hex: '#7d8a3a', finition: 'opaque', categorie: 'Perles heishi', perle: 'plate-6', double: true },
  // perles étoile relevées sur tes photos (refs #PE à confirmer)
  // les 3 perles étoile du listing ; la métal pétrole a des reflets rose doré qui changent selon l'angle
  { ref: '#PE-ex01', nom: 'étoile nacre',        hex: '#ece7da', finition: 'nacre',    categorie: 'Perles étoile', perle: 'etoile-nacre-6' },
  { ref: '#PE-ex02', nom: 'étoile métal argent', hex: '#6e6c6e', finition: 'hematite', categorie: 'Perles étoile', perle: 'etoile-8' },
  { ref: '#PE-ex03', nom: 'étoile métal pétrole', hex: '#d9a088', finition: 'petrole', categorie: 'Perles étoile', perle: 'etoile-8' },
  { ref: '#PL-ex01', nom: 'lettres blanches', hex: '#f6f4ee', finition: 'opaque', categorie: 'Perles lettre', perle: 'lettre-7' },
  { ref: '#PM-ex01', nom: 'ronde argentée 4 mm', hex: '#d6d8dd', finition: 'metallique', categorie: 'Perles métal', perle: 'ronde-4' },
  { ref: '#PM-ex02', nom: 'ronde argentée 3 mm', hex: '#d6d8dd', finition: 'metallique', categorie: 'Perles métal', perle: 'ronde-3' },
].map(c => ({ categorie: 'Perles de rocailles', ...c }));

/* Perles de culture d'exemple (refs #PC à créer, sous-catégorie « Perles de culture ») */
export const CULTURE_DEMO = [
  { ref: '#PC-ex01', nom: 'perle de culture rose', hex: '#d9b0a6', finition: 'nacre', categorie: 'Perles de culture', perle: 'culture-8' },
];
CATALOGUE_DEMO.push(...CULTURE_DEMO);

/* Motifs argile d'exemple (refs #AG provisoires, à créer dans materiaux avec sc « Argile ») */
export const ARGILE_DEMO = [
  { ref: '#AG-ex01', nom: 'citron', hex: MOTIFS_ARGILE.citron.hex, finition: 'argile', motif: 'citron', categorie: 'Breloques argile', perle: 'argile-30' },
  { ref: '#AG-ex02', nom: 'tomate', hex: MOTIFS_ARGILE.tomate.hex, finition: 'argile', motif: 'tomate', categorie: 'Breloques argile', perle: 'argile-30' },
  { ref: '#AG-ex03', nom: 'myrtille', hex: MOTIFS_ARGILE.myrtille.hex, finition: 'argile', motif: 'myrtille', categorie: 'Breloques argile', perle: 'argile-30' },
];
CATALOGUE_DEMO.push(...ARGILE_DEMO);
/* Motifs argile : tes fiches bijoux « argile citron », « argile tomate »… deviennent les choix du client
   (ref = ref du bijou, donc la note atelier et la production pointent sur la bonne fiche).
   Sans fiche argile dans la base : motifs d'exemple. */
export function catalogueArgileDepuisBijoux(bijoux = []) {
  const vus = new Set();                                   // une seule entrée par motif
  return bijoux.filter(b => /argile/i.test([b.nom, b.variante].join(' ')) && !b.is_mat)
    .filter(b => { const k = motifArgile([b.nom, b.variante].join(' ')) || norm(b.variante || b.nom); return !vus.has(k) && vus.add(k); })
    .map(b => {
    const texte = [b.nom, b.variante].filter(Boolean).join(' '), motif = motifArgile(texte);
    const nom = motif || String(b.variante || b.nom).replace(/breloque|argile/gi, '').trim() || texte;
    return { ref: b.ref, bij_id: b.id, nom, hex: (motif && MOTIFS_ARGILE[motif].hex) || couleurParNom(nom), finition: 'argile', motif,
      perle: 'argile-30', categorie: 'Breloques argile', bijou: true, pv: b.pv, enStock: true, ordre: 1000 };
  });
}
/* Formes chainmail : la fiche bijou (composition) dont le nom contient la forme (« croix »…)
   devient un choix ; chaque forme a son générateur d'anneaux. Ajoute ici les prochaines formes. */
export const FORMES_CHAINMAIL = {
  croix: { nom: 'croix', gen: () => genCroixByzantine() },
};
export const formeChainmail = texte => { const t = norm(texte); return Object.keys(FORMES_CHAINMAIL).find(k => t.includes(k)) || null; };
export const CHAINMAIL_DEMO = [
  { ref: '#CM-ex01', nom: 'croix', hex: '#b4b6ba', finition: 'chainmail', forme: 'croix', categorie: 'Breloques chainmail' },
];
export function catalogueChainmailDepuisBijoux(bijoux = []) {
  // une seule entrée par forme : plusieurs fiches peuvent contenir « croix » (composition, variations…) ;
  // on garde la fiche composition, sinon la première
  const parForme = new Map();
  for (const b of bijoux) {
    const forme = formeChainmail([b.nom, b.variante].join(' '));
    if (!forme) continue;
    const deja = parForme.get(forme);
    if (!deja || (b.is_mat && !deja.b.is_mat)) parForme.set(forme, { b, forme });
  }
  return [...parForme.values()].map(({ b, forme }) => ({
    ref: b.ref, bij_id: b.id, nom: FORMES_CHAINMAIL[forme].nom, hex: '#b4b6ba', finition: 'chainmail', forme,
    categorie: 'Breloques chainmail', bijou: true, pv: b.pv, enStock: true, ordre: 1001 }));
}
export function completerCatalogue(catalogue, bijoux = []) {
  let base = catalogue.filter(c => !['argile', 'chainmail'].includes(c.finition) || !/-ex\d/.test(c.ref));
  const argile = catalogueArgileDepuisBijoux(bijoux), maille = catalogueChainmailDepuisBijoux(bijoux);
  // motifs de tes fiches bijoux argile, + les motifs d'exemple qui n'ont pas encore de fiche (ex. myrtille)
  if (argile.length) base = [...base.filter(c => c.finition !== 'argile'), ...argile,
    ...ARGILE_DEMO.filter(d => !argile.some(a => a.motif === d.motif) && !base.some(c => c.finition === 'argile' && c.motif === d.motif && !/-ex\d/.test(c.ref)))];
  else if (!base.some(c => c.finition === 'argile')) base = [...base, ...ARGILE_DEMO];
  if (maille.length) base = [...base.filter(c => c.finition !== 'chainmail'), ...maille];
  else if (!base.some(c => c.finition === 'chainmail')) base = [...base, ...CHAINMAIL_DEMO];
  if (!base.some(c => /culture/i.test(c.categorie || ''))) base = [...base, ...CULTURE_DEMO];
  if (!base.some(c => c.double)) base = [...base, ...CATALOGUE_DEMO.filter(c => c.double)];             // heishi d'exemple
  // perles plates noire et blanche des yeux : toujours proposées (exemples tant que ta base n'en a pas sous un nom « plat… noir/blanc »)
  const plate = (c, coul) => /\bplat/.test(texteCatalogue(c)) && new RegExp(coul).test(norm(c.nom)) && c.perle !== 'plate-4' && !c.double;
  if (!base.some(c => plate(c, 'noir'))) base = [...base, ...CATALOGUE_DEMO.filter(c => c.ref === '#PV-ex01')];
  if (!base.some(c => plate(c, 'blanc'))) base = [...base, ...CATALOGUE_DEMO.filter(c => c.ref === '#PV-ex03')];
  if (!base.some(c => /plate/.test(norm(c.nom)) && /blanc/.test(norm(c.nom)) && c.perle === 'plate-4'))
    base = [...base, ...CATALOGUE_DEMO.filter(c => c.ref === '#PV-ex04')];                             // petite blanche de l'œil double
  return base;
}

/* Pastille d'une forme chainmail : les anneaux vus de face, en acier */
const cacheApercuMaille = new Map();
export function apercuChainmail(forme) {
  if (cacheApercuMaille.has(forme)) return cacheApercuMaille.get(forme);
  if (typeof document === 'undefined') return null;
  const A = (FORMES_CHAINMAIL[forme] || FORMES_CHAINMAIL.croix).gen();
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(54, 50, 6, 64, 64, 70); g.addColorStop(0, '#fbf6ee'); g.addColorStop(1, '#e8dccb');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const a of A) { y0 = Math.min(y0, a.p[1] - a.R - a.e); y1 = Math.max(y1, a.p[1] + a.R + a.e); z0 = Math.min(z0, a.p[2] - a.R - a.e); z1 = Math.max(z1, a.p[2] + a.R + a.e); }
  const k = 112 / Math.max(y1 - y0, z1 - z0), cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const traits = [];
  for (const a of A) {                                   // contour de chaque anneau projeté (vue de face, axe X vers soi)
    const n = new THREE.Vector3().fromArray(a.n).normalize();
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    for (let i = 0; i < 48; i++) {
      const t0 = i / 48 * Math.PI * 2, t1 = (i + 1) / 48 * Math.PI * 2;
      const P = t => new THREE.Vector3().fromArray(a.p).addScaledVector(u, a.R * Math.cos(t)).addScaledVector(v, a.R * Math.sin(t));
      const p0 = P(t0), p1 = P(t1);
      traits.push({ d: p0.x + p1.x, p0, p1, e: a.e });
    }
  }
  traits.sort((a, b) => a.d - b.d);
  x.lineCap = 'round';
  for (const t of traits) {
    const l = Math.max(0, Math.min(1, 0.5 + t.d / 8));
    x.strokeStyle = `rgb(${Math.round(95 + 120 * l)},${Math.round(98 + 120 * l)},${Math.round(104 + 120 * l)})`;
    x.lineWidth = t.e * 2 * k;
    x.beginPath();
    x.moveTo(64 + (t.p0.y - cy) * k, 64 + (t.p0.z - cz) * k); x.lineTo(64 + (t.p1.y - cy) * k, 64 + (t.p1.z - cz) * k); x.stroke();
  }
  const url = cv.toDataURL('image/png');
  cacheApercuMaille.set(forme, url);
  return url;
}

/* --------------------------------------------------------------------------
   Fiche bijou d'une breloque (prix + ref pour la note atelier et la production)
   modele.bijZone   : la zone dont le choix EST la fiche bijou (argile : citron, tomate)
   modele.bijParMode: lettres { 1: 'texte cherché', 2: '…' } (fiches « 1 mot » / « 2 mots »)
   modele.bij_ref   : ref exacte (#BIJ-001), sinon modele.bijNom : texte cherché (« croix »)
   Le prix vient du pv de la fiche ; sans pv, du prix du modèle.
   -------------------------------------------------------------------------- */
export async function chargerBijouxBoutique(sb) {
  const { data, error } = await sb.from('bijoux').select('id,ref,nom,variante,pv,is_mat');   // colonnes autorisées à la clé publique
  if (error) throw error;
  return (data || []).map(b => ({ id: b.id, ref: b.ref, nom: b.nom || '', variante: b.variante || '', pv: b.pv, is_mat: !!b.is_mat }));
}
export function trouverBijou(bijoux, motif) {
  if (!motif) return null;
  const re = new RegExp(norm(motif));
  const ok = bijoux.filter(b => re.test(norm([b.nom, b.variante].join(' '))));
  return ok.find(b => !b.is_mat) || ok[0] || null;
}
export function bijouBreloque(modele, { couleurs = {}, texte = null, bijoux = [] } = {}) {
  const parRef = new Map(bijoux.map(b => [b.ref, b]));
  const mode = texte?.mode === 2 ? 2 : 1;
  let row = null, ref = '';
  if (modele.bijZone) {
    ref = couleurs[modele.bijZone] || (modele.zones || []).find(z => z.id === modele.bijZone)?.defaut || '';
    row = parRef.get(ref) || null;
    if (!row) ref = '';                                       // motif d'exemple : pas encore de fiche
  }
  if (!row && modele.bijParMode) row = trouverBijou(bijoux, modele.bijParMode[mode]);
  if (!row && modele.bij_ref) row = parRef.get(modele.bij_ref) || null;
  if (!row && modele.bijNom) row = trouverBijou(bijoux, modele.bijNom);
  const pv = row?.pv != null && row.pv !== '' ? parseFloat(row.pv) : NaN;
  const prix = pv > 0 ? pv : (modele.prixParMode?.[mode] ?? modele.prix ?? 0);
  return { ref: row?.ref || ref || modele.bij_ref || '', id: row?.id || null, nom: row ? [row.nom, row.variante].filter(Boolean).join(' · ') : '', prix };
}

/* Fermoirs d'exemple (refs #FM provisoires) : remplacés par ceux de ta base */
export const FERMOIRS_DEMO = [
  { ref: '#FB001', nom: 'Fermoir breloque petit', type: 'mousqueton', taille: 12, metal: 'argent' },
  { ref: '#FB002', nom: 'Fermoir breloque grand', type: 'mousqueton', taille: 18, metal: 'argent' },
  // accroches de bundle (refs provisoires, tailles estimées sur ta photo)
  { ref: '#FR-ex01', nom: 'Fermoir rond grand', type: 'anneau-ressort', taille: 15, metal: 'argent' },
  { ref: '#FR-ex02', nom: 'Fermoir mini rond', type: 'anneau-ressort', taille: 11, metal: 'argent' },
  { ref: '#MP-ex01', nom: 'Mousqueton porte-clés', type: 'mousqueton-pivot', taille: 34, metal: 'argent' },
];
/* Rôle d'un fermoir : breloque (s'accroche au bijou) ou accroche de bundle (porte les breloques) */
export const estAccroche = f => f && (f.type === 'anneau-ressort' || f.type === 'mousqueton-pivot' || f.type === 'anneau');
/* Tailles mesurées sur tes photos quand le libellé ne donne pas les mm */
const TAILLES_CONNUES = { '#FB001': 12, '#FB002': 18 };

const tailleDefaut = (type, t) => type === 'anneau-ressort' ? (/petit|mini/.test(t) ? 11 : 15)
  : type === 'mousqueton-pivot' ? 34 : type === 'anneau' ? 25 : (/grand/.test(t) ? 18 : 12);
/* Une ligne `materiaux` de fermoir -> { ref, nom, type, taille (mm), metal } (lu dans le libellé) */
export function fermoirDepuisMateriau(l) {
  const t = [l.designation, l.variante, l.sc].filter(Boolean).join(' ').toLowerCase();
  const mm = t.match(/(\d+(?:[.,]\d+)?)\s*mm/);
  const metal = /dor|\bor\b|gold/.test(t) ? 'or' : /bronze/.test(t) ? 'bronze' : /cuivr/.test(t) ? 'cuivre' : /noir/.test(t) ? 'noir' : 'argent';
  const type = /breloque/.test(t) ? 'mousqueton'
    : /rond|ressort|marin|spring/.test(t) ? 'anneau-ressort'
    : /pivot|porte.?cl|snap/.test(t) && /mousq/.test(t) ? 'mousqueton-pivot'
    : /anneau|porte.?cl/.test(t) && !/mousq/.test(t) ? 'anneau' : 'mousqueton';
  return {
    ref: l.ref || String(l.id), mat_id: l.id,
    nom: [l.designation, l.variante].filter(Boolean).join(' – ') || l.ref,
    // nom montré au client : la désignation seule (la variante, ex. « moyen a », sert à ta gestion)
    nomClient: String(l.designation || l.variante || l.ref).replace(/\s*\d+([.,]\d+)?\s*mm\b/i, '').trim(),
    type,
    taille: mm ? parseFloat(mm[1].replace(',', '.')) : TAILLES_CONNUES[l.ref] ?? tailleDefaut(type, t), metal,
    prix: l.prix != null ? parseFloat(l.prix) : null, stock: l.qty ?? null,
    enStock: l.qty == null ? true : l.qty > 0,
  };
}

/* Variantes d'une même référence (#AI001, #AI001b…) : même stock, seuls la quantité
   achetée, le prix ou le fournisseur changent (comme dans ton listing matériaux).
   Le configurateur n'en garde qu'une, stock additionné ; les autres refs y renvoient. */
export const baseRef = ref => String(ref || '').replace(/[a-z]+$/i, '');
export const ALIAS_VARIANTES = new Map();               // ref variante -> ref gardée
export function regrouperVariantes(liste) {
  const groupes = new Map();
  for (const x of liste || []) {
    const b = /-ex\d/.test(x.ref) ? x.ref : baseRef(x.ref);
    if (!groupes.has(b)) groupes.set(b, []);
    groupes.get(b).push(x);
  }
  const out = [];
  for (const [b, xs] of groupes) {
    if (xs.length === 1) { out.push(xs[0]); continue; }
    const garde = xs.find(x => x.ref === b) || [...xs].sort((u, v) => String(u.ref).localeCompare(String(v.ref)))[0];
    const stocks = xs.map(x => x.stock);
    const stock = stocks.some(v => v == null) ? null : stocks.reduce((t, v) => t + (+v || 0), 0);
    const nomClient = garde.nomClient && String(garde.nomClient).replace(/\s*[–-]?\s*moyen\s+[a-z]\b/i, '').trim();
    out.push({ ...garde, ...(nomClient ? { nomClient } : {}), stock, enStock: stock == null ? true : stock > 0, variantes: xs.map(x => x.ref) });
    xs.forEach(x => x.ref !== garde.ref && ALIAS_VARIANTES.set(x.ref, garde.ref));
  }
  return out;
}
const refGardee = r => ALIAS_VARIANTES.get(r) || r;

/* Adaptateur pour ta table `materiaux` (+ réglage boutique `perles_images`).
   ref = #PR001…, nom = variante. Couleur : meta.hex si renseigné, sinon la
   photo de la bibliothèque perles (moyenne calculée au chargement), sinon le nom. */
export function catalogueDepuisMateriaux(lignes, perlesImages = {}) {
  return (lignes || []).map(l => {
    let meta = l.meta;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = null; } }
    meta = meta || {};
    const img = perlesImages?.[l.id] || {};
    const nom = l.variante || l.designation || l.sc || l.ref;
    const argile = /argile/i.test([l.mc, l.sc, l.designation].join(' ')) || meta.finition === 'argile';
    const motif = argile ? (meta.motif || motifArgile(nom) || null) : null;
    if (argile) return {
      ref: l.ref || String(l.id), mat_id: l.id, nom, hex: meta.hex || (motif && MOTIFS_ARGILE[motif].hex) || couleurParNom(nom),
      finition: 'argile', motif, perle: meta.perle || 'argile-30', ordre: 1000, visible: img.visible !== false,
      categorie: l.sc || 'Breloques argile', stock: l.qty ?? null, enStock: l.qty == null ? true : l.qty > 0, teinteFixe: true,
    };
    return {
      ref: l.ref || String(l.id), mat_id: l.id, nom, designation: l.designation || '',
      hex: meta.hex || meta.couleur || null,
      hexNom: couleurParNom(nom),
      finition: meta.finition || PLANCHE.get(norm(nom))?.finition || (/[ée]toile/i.test([l.sc, l.designation].join(' ')) ? (/p[ée]trole|iris/i.test(nom) ? 'petrole' : /nacr/i.test(nom) ? 'nacre' : /m[ée]tal|argent|h[ée]matite/i.test(nom) ? 'hematite' : null) : null)
        || devinerFinition([l.designation, l.variante].join(' ')),
      ordre: PLANCHE.get(norm(nom))?.ordre ?? 999,
      texture: meta.texture || null,
      swatch: img.swatch || meta.image || l.image_url || null,      // photo de la référence (fiche matériau de l'app)
      perle: meta.perle || (/[ée]toile/i.test([l.sc, l.designation, l.variante].join(' ')) ? (/nacr/i.test(nom + ' ' + (l.designation || '')) ? 'etoile-nacre-6' : 'etoile-8') : undefined),
      double: meta.double ?? /heishi/i.test([l.sc, l.designation, l.variante].join(' ')),
      visible: img.visible !== false,
      categorie: l.sc || l.mc || null,
      stock: l.qty ?? null,
      enStock: l.qty == null ? true : l.qty > 0,
    };
  }).filter(c => c.visible).map(c => c.finition === 'argile' ? c : ({ ...c, hex: c.hex || c.hexNom, teinteFixe: !!c.hex || PLANCHE.has(norm(c.nom)) }))
    .sort((a, b) => a.ordre - b.ordre);
}

/* Remplace la couleur « par nom » par la couleur médiane de la photo de la perle
   (seulement pour les refs sans meta.hex). À appeler une fois, en tâche de fond. */
export async function affinerCouleursDepuisPhotos(catalogue) {
  if (typeof document === 'undefined') return catalogue;
  const lire = url => new Promise(ok => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 24;
        const x = cv.getContext('2d', { willReadFrequently: true });
        const c = Math.min(im.width, im.height) * 0.5;      // centre de la photo
        x.drawImage(im, (im.width - c) / 2, (im.height - c) / 2, c, c, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data, r = [], g = [], b = [];
        for (let i = 0; i < d.length; i += 4) { r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); }
        const med = a => a.sort((p, q) => p - q)[a.length >> 1];
        ok('#' + [med(r), med(g), med(b)].map(v => v.toString(16).padStart(2, '0')).join(''));
      } catch { ok(null); }
    };
    im.onerror = () => ok(null);
    im.src = url;
  });
  await Promise.all(catalogue.filter(c => c.swatch && !c.teinteFixe && c.finition !== 'argile').map(async c => {
    const h = await lire(c.swatch); if (h) c.hex = h;
  }));
  return catalogue;
}

/* Retrouve la couleur par défaut d'une zone dans le vrai catalogue
   (par ref, sinon par nom de variante : « bleu 2 » → #PR0xx). */
/* Couleur d'après son nom, avec tolérance : « argent 1 » trouve « Argent 1 », « argenté 1 »,
   « rocaille argent 1 »… (chaque mot cherché doit commencer un mot du nom). */
export function refParNom(nom, liste) {
  if (!nom) return null;
  const n = norm(nom), mots = n.split(/[^a-z0-9]+/).filter(Boolean);
  const exact = liste.find(c => norm(c.nom) === n);
  if (exact) return exact.ref;
  const motsDe = c => norm([c.nom, c.designation].filter(Boolean).join(' ')).split(/[^a-z0-9]+/).filter(Boolean);
  const proche = liste.filter(c => { const m = motsDe(c); return mots.every(w => m.some(x => /^\d+$/.test(w) ? x === w : x.startsWith(w))); });
  return (proche.find(c => c.enStock !== false) || proche[0])?.ref || null;
}
export function resoudreDefauts(modele, catalogue, fermoirs = null) {
  const parRef = new Set(catalogue.map(c => c.ref));
  const fix = (ref, nom) => parRef.has(ref) ? ref : refParNom(nom, catalogue) || ref;
  const m = JSON.parse(JSON.stringify(modele));
  for (const z of m.zones || []) {
    z.defaut = fix(z.defaut, z.defautNom);
    if (z.double) z.double.k = fix(z.double.k, z.double.kNom);
    if (!parRef.has(z.defaut) && z.choixNoms?.length) {                // yeux : la perle plate noire par défaut
      const l = couleursProposees(z, catalogue);
      z.defaut = (l.find(c => /noir/.test(norm(c.nom))) || l.find(c => /noir/.test(texteCatalogue(c))) || l[0])?.ref || z.defaut;
    }
  }
  for (const g of m.groupes || []) for (const b of g.perles) if (b.k && !parRef.has(b.k) && b.kNom) b.k = fix(b.k, b.kNom);
  if (fermoirs?.length) {
    // fermoir d'exemple -> fermoir réel de même type et de taille la plus proche
    const proche = a => fermoirs.filter(f => f.type === (a.type || 'mousqueton'))
      .sort((x, y) => Math.abs(x.taille - (a.taille || 12)) - Math.abs(y.taille - (a.taille || 12)))[0];
    const refsF = new Set(fermoirs.map(f => f.ref));
    for (const g of m.groupes || []) for (const a of g.accessoires || []) {
      if (a.ref && refsF.has(a.ref)) continue;
      const f = proche(a); if (f) Object.assign(a, { ref: f.ref, taille: f.taille, metal: f.metal });
    }
    for (const o of m.options || []) if (o.type === 'fermoir') {
      // chaque choix d'exemple -> le fermoir réel de taille la plus proche (libellé et supplément gardés)
      const vus = new Set();
      o.choix = (o.choix || []).map(c => {
        if (refsF.has(c.ref)) return c;
        const ex = FERMOIRS_DEMO.find(f => f.ref === c.ref);
        const f = ex && proche(ex);
        return f ? { ...c, ref: f.ref } : null;
      }).filter(c => c && !vus.has(c.ref) && vus.add(c.ref));
      if (!o.choix.length) o.choix = fermoirs.filter(f => f.type === 'mousqueton').map(f => ({ ref: f.ref, supplement: 0 }));
      if (!refsF.has(o.defaut)) o.defaut = (proche({ taille: 12 }) || fermoirs[0]).ref;
    }
  }
  for (const o of m.options || []) if (o.type === 'perle' && o.choix?.length) {
    o.choix = o.choix.filter(c => parRef.has(c.ref));
    if (!o.choix.length) delete o.choix;
  }
  return m;
}

/* Couleurs proposées pour une zone : celles choisies dans l'éditeur (zone.choix),
   sinon tout le catalogue. Les perles œil ne sont proposées que pour les zones d'yeux. */
/* Texte d'une entrée du catalogue, sans accents ni majuscules : sous-catégorie, désignation, nom */
export const texteCatalogue = c => norm([c.categorie, c.designation, c.nom].filter(Boolean).join(' '));
/* « étoile », « verre|heishi »… trouvé dans la sous-catégorie, la désignation ou le nom (accents ignorés) */
export const correspondCategorie = (c, cats) => norm(cats).split('|').some(k => texteCatalogue(c).includes(k));

export function couleursProposees(zone, catalogue, parties = null) {
  let dispo = catalogue.filter(c => (c.finition === 'oeil') === !!zone.oeil)
    .filter(c => (c.finition === 'argile') === /argile/i.test(zone.categorie || ''))
    .filter(c => (c.finition === 'chainmail') === /chainmail/i.test(zone.categorie || ''));
  if (zone.choixNoms?.length) {
    // yeux : toutes les perles plates (nom, désignation ou sous-catégorie contenant « plat ») et toutes les heishi,
    // quelle que soit leur sous-catégorie ; la petite blanche de l'œil double n'est pas proposée seule
    const noms = new Set(zone.choixNoms.map(norm)), petite = norm(zone.double?.kNom || '');
    const roleYeux = c => { const d = c.lienDe && exemplesParRef().get(c.lienDe); return !!d && (d.double || /\bplat/.test(texteCatalogue(d))); };
    dispo = dispo.filter(c => (noms.has(norm(c.nom)) || c.double || /\bplat/.test(texteCatalogue(c)) || roleYeux(c))
      && c.perle !== 'plate-4' && (!petite || norm(c.nom) !== petite));
    const rang = c => c.double ? 3 : c.lienDe === '#PV-ex01' || /noir/.test(norm(c.nom)) ? 0 : c.lienDe === '#PV-ex03' || /blanc/.test(norm(c.nom)) ? 1 : 2;   // noire, blanche, autres plates, heishi
    dispo = [...dispo].sort((a, b) => rang(a) - rang(b));
    if (zone.choix?.length) { const set = new Set(zone.choix); return dispo.filter(c => set.has(c.ref)); }
    return dispo;                                                       // pas de restriction de l'ancien configurateur
  }
  if (zone.categorie) dispo = dispo.filter(c => !c.categorie || correspondCategorie(c, zone.categorie));
  if (zone.choix?.length) { const set = new Set(zone.choix); return dispo.filter(c => set.has(c.ref)); }
  // sinon : mêmes perles que la partie du configurateur boutique (enabled_mats)
  const partie = parties?.find(p => p.id === zone.id);
  if (partie?.enabled_mats?.length) { const set = new Set(partie.enabled_mats.map(String)); return dispo.filter(c => set.has(String(c.mat_id))); }
  return dispo;
}

const chargeurTex = new THREE.TextureLoader();

export function creerMateriau(couleur) {
  const c = new THREE.Color(couleur.hex || '#999999');
  const p = {
    color: c, roughness: 0.22, metalness: 0,
    clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1,
  };
  switch (couleur.finition) {
    case 'transparent':
      Object.assign(p, { transmission: 0.92, thickness: 1.2, ior: 1.52, roughness: 0.04,
        attenuationColor: c, attenuationDistance: 1.6, clearcoat: 1 });
      break;
    case 'mat':
      Object.assign(p, { roughness: 0.78, clearcoat: 0, envMapIntensity: 0.6 });
      break;
    case 'metallique':
      Object.assign(p, { metalness: 1, roughness: 0.28, clearcoat: 0.3 });
      break;
    case 'irise':
      Object.assign(p, { roughness: 0.18, metalness: 0.25, iridescence: 1,
        iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 820] });
      break;
    case 'argente':
      // verre teinté avec doublure miroir : couleur saturée + reflet métallique interne
      Object.assign(p, { metalness: 0.55, roughness: 0.12, clearcoat: 1,
        emissive: c.clone().multiplyScalar(0.18) });
      break;
    case 'nacre':
      Object.assign(p, { roughness: 0.35, sheen: 1, sheenRoughness: 0.3,
        sheenColor: new THREE.Color('#ffffff'), iridescence: 0.35, iridescenceIOR: 1.4 });
      break;
    case 'petrole':         // métal pétrole : or rose, reflets qui glissent du doré au rose selon l'angle
      Object.assign(p, { color: new THREE.Color('#d9a088'), metalness: 1, roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.08,
        iridescence: 0.9, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 440] });
      break;
    case 'irise-metal':     // hématite traitée : reflet métal + arc-en-ciel sur les arêtes
      Object.assign(p, { metalness: 0.9, roughness: 0.16, clearcoat: 0.6, iridescence: 1,
        iridescenceIOR: 1.9, iridescenceThicknessRange: [260, 900] });
      break;
    case 'hematite':
      Object.assign(p, { metalness: 0.85, roughness: 0.14, clearcoat: 0.8, clearcoatRoughness: 0.05 });
      break;
  }
  if (couleur.finition === 'oeil' && typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d'), rond = (r, col) => { x.fillStyle = col; x.beginPath(); x.arc(128, 128, r, 0, 7); x.fill(); };
    rond(128, couleur.hex);
    rond(70, couleur.anneau || '#f4f4f0');
    rond(52, couleur.pupille || '#0b0b0b');
    rond(16, '#c9ccd2');                                // fil qui traverse le trou
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  }
  if (couleur.finition === 'argile' && typeof document !== 'undefined') {
    // argile peinte à l'acrylique puis vernie : satiné, léger relief de pinceau
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    dessinerArgile(cv.getContext('2d'), couleur.motif, couleur.hex);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const bv = document.createElement('canvas'); bv.width = bv.height = 256;
    const bx = bv.getContext('2d'), rnd = hasard(5);
    bx.fillStyle = '#808080'; bx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      bx.globalAlpha = 0.08 + rnd() * 0.1; bx.fillStyle = rnd() < 0.5 ? '#fff' : '#000';
      bx.beginPath(); bx.ellipse(rnd() * 256, rnd() * 256, 2 + rnd() * 9, 1 + rnd() * 3, rnd() * 3.2, 0, Math.PI * 2); bx.fill();
    }
    const bump = new THREE.CanvasTexture(bv);
    return new THREE.MeshPhysicalMaterial({ map: t, bumpMap: bump, bumpScale: 0.6, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  }
  if (couleur.texture) {
    const t = chargeurTex.load(couleur.texture);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    p.map = t;
    p.color = new THREE.Color('#ffffff');
  }
  return new THREE.MeshPhysicalMaterial(p);
}

/* --------------------------------------------------------------------------
   3. GÉNÉRATEURS DE GROUPES (par rangées)
   Chaque perle locale : { t:type, p:[x,y,z], q:[x,y,z,w], z:zone|null,
                           r:rangée, c:colonne, a:angle° (tubes), k:ref fixe? }
   -------------------------------------------------------------------------- */
function quatDe(vers) {
  return new THREE.Quaternion().setFromUnitVectors(AXE_X, vers.clone().normalize()).toArray();
}
const arr = v => [ +v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4) ];

/* Tube par rangées circulaires (corps d'animal, tubulaire peyote/brick).
   rangs : nombre de perles par rangée, ex. [4,6,8,10,10,8,6]
   trou  : 'tangent' (trou suit la rangée, peyote) | 'axe' (trou parallèle au tube, brick/ladder)
   Angle 0° = dessus (+Y), ±180° = dessous. Le tube avance selon +Z. */
export function genTube({ type = 'rocaille-11', rangs = [6, 8, 8, 6], trou = 'tangent',
                          decalage = true, serrage = 1 } = {}) {
  const T = typePerle(type);
  const largeur = (trou === 'tangent' ? T.H * 1.04 : T.D * 0.98) * serrage;
  const pas = (trou === 'tangent' ? T.D * 0.86 : T.H * 1.04) * serrage;
  const out = [];
  let z = 0;
  rangs.forEach((n, r) => {
    n = Math.max(1, Math.round(n));
    const R = n === 1 ? 0 : largeur / (2 * Math.sin(Math.PI / n));
    for (let c = 0; c < n; c++) {
      const a = 2 * Math.PI * (c + (decalage && r % 2 ? 0.5 : 0)) / n;
      const pos = new THREE.Vector3(R * Math.sin(a), R * Math.cos(a), z);
      const dir = trou === 'tangent'
        ? new THREE.Vector3(Math.cos(a), -Math.sin(a), 0)
        : new THREE.Vector3(0, 0, 1);
      let deg = (a / DEG) % 360; if (deg > 180) deg -= 360;
      out.push({ t: type, p: arr(pos), q: quatDe(dir), z: null, r, c, a: +deg.toFixed(1) });
    }
    z += pas;
  });
  return out;
}

/* Nappe plate par rangées centrées (nageoire, queue, plaque brick/peyote plat).
   Rangées le long de X, empilées le long de +Y.
   trou : 'long' (trou le long de la rangée) | 'travers' (trou perpendiculaire) */
export function genNappe({ type = 'rocaille-11', rangs = [3, 4, 5], trou = 'long', serrage = 1 } = {}) {
  const T = typePerle(type);
  const largeur = (trou === 'long' ? T.H * 1.04 : T.D * 0.98) * serrage;
  const pas = (trou === 'long' ? T.D * 0.86 : T.H * 1.04) * serrage;
  const dir = trou === 'long' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const q = quatDe(dir);
  const out = [];
  rangs.forEach((n, r) => {
    n = Math.max(1, Math.round(n));
    for (let c = 0; c < n; c++) {
      out.push({ t: type, p: [ +((c - (n - 1) / 2) * largeur).toFixed(4), +(r * pas).toFixed(4), 0 ],
                 q, z: null, r, c, a: null });
    }
  });
  return out;
}

/* Arc de corde `corde` et de longueur `L` : renvoie la demi-ouverture θ (0 = plat) */
function ouverture(L, corde) {
  if (L <= corde * 1.001 || corde <= 0) return 0;
  const cible = L / corde;                     // θ / sin θ = L / corde
  let lo = 1e-4, hi = Math.PI * 0.92;
  if (hi / Math.sin(hi) < cible) return hi;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    (m / Math.sin(m) < cible) ? (lo = m) : (hi = m);
  }
  return (lo + hi) / 2;
}

/* Dessus-dessous (3D double épaisseur, fils croisés).
   Chaque rang = une couche du dessus + une couche du dessous, côte à côte,
   trous le long du rang (axe X). Les rangs s'enchaînent selon +Z.
   rangs : [{ d: perles dessus, s: perles dessous, b: perles de bord par côté (option) }]
   La couche la plus courte reste à plat ; la plus longue se bombe en arc,
   ce qui donne le volume (dos rebondi, ventre plus plat…).
   Chaque perle porte l:'dessus'|'dessous'|'bord', c = position depuis la gauche, n = nb dans sa couche. */
export function genDessusDessous({ type = 'rocaille-11', rangs = [{ d: 3, s: 3 }], serrage = 1, ecart = 1 } = {}) {
  const T = typePerle(type);
  const pasPerle = T.H * 1.04 * serrage;       // largeur d'une perle le long du rang
  const pasRang = T.D * 0.92 * serrage;        // distance entre deux rangs
  const sep = T.D * 0.95 * ecart;              // distance entre couche dessus et dessous
  const out = [];

  const couche = (n, corde, signe, z, r, l) => {
    if (n <= 0) return;
    const L = n * pasPerle;
    const th = ouverture(L, corde);
    for (let c = 0; c < n; c++) {
      let x, y, dir;
      if (th === 0) {
        x = (c - (n - 1) / 2) * pasPerle; y = 0; dir = new THREE.Vector3(1, 0, 0);
      } else {
        const R = corde / (2 * Math.sin(th));
        const phi = -th + (c + 0.5) * (2 * th / n);
        x = R * Math.sin(phi); y = R * Math.cos(phi) - R * Math.cos(th);
        dir = new THREE.Vector3(Math.cos(phi), -Math.sin(phi) * signe, 0);
      }
      const pos = new THREE.Vector3(x, signe * (sep / 2 + y), z);
      out.push({ t: type, p: arr(pos), q: quatDe(dir), z: null, r, c, n, l, a: null });
    }
  };

  rangs.forEach((rg, r) => {
    const d = Math.max(0, Math.round(rg.d ?? 0)), s = Math.max(0, Math.round(rg.s ?? 0));
    const z = r * pasRang;
    const mini = d && s ? Math.min(d, s) : Math.max(d, s);
    const corde = mini * pasPerle;
    couche(d, corde, +1, z, r, 'dessus');
    couche(s, corde, -1, z, r, 'dessous');
    const b = Math.max(0, Math.round(rg.b ?? 0));
    for (let k = 0; k < b; k++) for (const cote of [-1, 1]) {
      // perles de bord : entre les deux couches, trou vertical
      const y = b === 1 ? 0 : (k / (b - 1) - 0.5) * sep;
      out.push({ t: type, p: arr(new THREE.Vector3(cote * (corde / 2 + pasPerle * 0.55), y, z)),
                 q: quatDe(new THREE.Vector3(0, 1, 0)), z: null, r, c: cote < 0 ? k : b + k, n: 2 * b, l: 'bord', a: null });
    }
  });
  return out;
}

/* Notation dessus-dessous : "1/1, 2/2, 4/3x3, 5/4/1"
   d/s = perles dessus / dessous ; /b = perles de bord par côté ; xN = répéter N rangs.
   Un nombre seul "3" = 3 dessus / 3 dessous. Les préfixes "R5:" sont ignorés. */
export function lireRangsDD(txt) {
  const out = [];
  String(txt).replace(/R\s*\d+\s*:/gi, ' ').split(/[,;\n]+|\s{2,}/).map(t => t.trim()).filter(Boolean).forEach(tok => {
    const m = tok.replace(/\s+/g, '').match(/^(\d+)(?:\/(\d+))?(?:\/(\d+))?(?:x(\d+))?$/i);
    if (!m) return;
    const d = +m[1], s = m[2] != null ? +m[2] : d, b = m[3] != null ? +m[3] : 0;
    for (let i = 0; i < (+m[4] || 1); i++) out.push({ d, s, b });
  });
  return out;
}

export const ecrireRangsDD = rangs =>
  rangs.map(r => `${r.d}/${r.s}${r.b ? '/' + r.b : ''}`).join(', ');

/* Poisson en double épaisseur : les deux couches sont les FLANCS gauche et droit.
   - rang 1 (non doublé) : la bouche, `bouche` perles empilées au centre (le fermoir s'y accroche)
   - rangs suivants, doublés : chaque flanc est une colonne lue de haut en bas
     dos / ligne / ventre ; la ligne (ou l'œil) sépare le dos du ventre et reste
     alignée d'un rang à l'autre, ce qui dessine la silhouette depuis le patron
   - queue : `tiges` tiges de `perlesTige` perles en éventail
   Chaque perle porte l (gauche|droite|bouche|tige1…), s (dos|ligne|ventre|oeil),
   r = rang (1 = bouche), c = position depuis le haut (ou le long de la tige), n. */
export function genPoisson({ type = 'rocaille-11', rangs = [], bouche = 2, tiges = 2, perlesTige = 5,
                             angleTige = 30, galbe = 0.07, serrage = 1, ecart = 0.62,
                             typeOeil = 'plate-6', typePupille = 'rocaille-11', ecartBouche = 0.9 } = {}) {
  const T = typePerle(type);
  if (typeOeil && /^oeil-/.test(typeOeil)) typeOeil = 'plate-6';   // anciens modèles
  const TO = typeOeil ? typePerle(typeOeil) : null;
  const TP = typePupille ? typePerle(typePupille) : null;
  const pas = T.H * 1.04 * serrage;            // une perle le long de la colonne
  const pasRang = T.D * 0.92 * serrage;        // d'un rang au suivant (axe +Z, vers la queue)
  const sep = T.D * ecart;                     // écart entre flancs au dos et au ventre
  const Y = new THREE.Vector3(0, 1, 0);
  const out = [];

  // Rang 1 : bouche
  for (let c = 0; c < bouche; c++) {
    // les perles de bouche s'écartent pour laisser passer l'œillet du fermoir, enfilé sur le fil entre elles
    const y = ((bouche - 1) / 2 - c) * pas + (bouche > 1 ? (c < bouche / 2 ? 1 : -1) * ecartBouche / 2 : 0);
    out.push({ t: type, p: [0, +y.toFixed(4), 0], q: quatDe(Y), z: null, r: 1, c, n: bouche,
               l: 'bouche', s: c < bouche / 2 ? 'dos' : 'ventre', a: null });
  }

  // Rangs doublés
  let zFin = 0;
  rangs.forEach((rg, i) => {
    const r = i + 2, z = (i + 1) * pasRang;
    zFin = z;
    const m = rg.oeil ? Math.max(1, rg.m || 1) : (rg.m || 0);
    const sections = [
      ...Array(rg.d || 0).fill('dos'),
      ...Array(m).fill(rg.oeil ? 'oeil' : 'ligne'),
      ...Array(rg.v || 0).fill('ventre'),
    ];
    const n = sections.length;
    if (!n) return;
    const L = n * pas, corde = L * (1 - galbe);
    const th = ouverture(L, corde);
    const R = th ? corde / (2 * Math.sin(th)) : 0;
    // position le long de la colonne (s = longueur d'arc depuis le haut)
    const point = sa => {
      if (!th) return { bombe: 0, y: L / 2 - sa, tx: 0, ty: -1 };
      const phi = th - sa / R;
      return { bombe: R * Math.cos(phi) - R * Math.cos(th), y: R * Math.sin(phi), tx: Math.sin(phi), ty: -Math.cos(phi) };
    };
    const decalY = 0;                                         // colonne centrée sur l'axe du poisson
    for (const cote of [-1, 1]) {
      sections.forEach((sec, c) => {
        const k = point((c + 0.5) * pas);
        if (sec === 'oeil' && TO) {
          // perle plate posée à plat sur le flanc (trou vers l'extérieur),
          // fermée par une rocaille par-dessus
          const l = cote < 0 ? 'gauche' : 'droite';
          const xPlate = sep / 2 + k.bombe + T.D * 0.32 + TO.H * 0.5;
          out.push({ t: typeOeil, p: arr(new THREE.Vector3(cote * xPlate, k.y + decalY, z)), q: [0, 0, 0, 1],
                     z: null, r, c, n, l, s: 'oeil', a: null });
          if (TP) out.push({ t: typePupille, p: arr(new THREE.Vector3(cote * (xPlate + TO.H * 0.5 + TP.H * 0.45), k.y + decalY, z)),
                     q: [0, 0, 0, 1], z: null, r, c, n, l, s: 'pupille', a: null });
          return;
        }
        const pos = new THREE.Vector3(cote * (sep / 2 + k.bombe), k.y + decalY, z);
        const dir = new THREE.Vector3(cote * k.tx, k.ty, 0);
        out.push({ t: type, p: arr(pos), q: quatDe(dir), z: null, r, c, n,
                   l: cote < 0 ? 'gauche' : 'droite', s: sec, a: null });
      });
    }
  });

  // Queue : tiges en éventail dans le plan du poisson
  const rQueue = rangs.length + 2;
  const z0 = zFin + pasRang * 0.55;
  for (let k = 0; k < tiges; k++) {
    const ang = (tiges === 1 ? 0 : angleTige * (1 - 2 * k / (tiges - 1))) * DEG;
    const dir = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang));
    for (let j = 0; j < perlesTige; j++) {
      const d = (j + 0.5) * pas;
      out.push({ t: type, p: arr(new THREE.Vector3(0, dir.y * d, z0 + dir.z * d)), q: quatDe(dir),
                 z: null, r: rQueue, c: j, n: perlesTige, l: 'tige' + (k + 1), s: 'ligne', a: null });
    }
  }
  return out;
}

/* Notation poisson : "3/0/1, 2/0/2, 2/(yeux)/2, 2/1/3x2"
   dos / ligne / ventre par flanc ; "(yeux)", "y" ou "o" au milieu = une perle d'œil.
   Virgules, points, points-virgules ou retours à la ligne séparent les rangs. */
export function lireRangsPoisson(txt) {
  const out = [];
  String(txt).replace(/R\s*\d+\s*:/gi, ' ').split(/[,;.\n]+/).map(t => t.replace(/\s+/g, '')).filter(Boolean).forEach(tok => {
    const m = tok.match(/^(\d+)\/(\d+|\(?(?:yeux|oeil|œil|y|o)\)?)\/(\d+)(?:x(\d+))?$/i);
    if (!m) return;
    const oeil = !/^\d+$/.test(m[2]);
    for (let i = 0; i < (+m[4] || 1); i++) out.push({ d: +m[1], m: oeil ? 1 : +m[2], v: +m[3], oeil });
  });
  return out;
}

export const ecrireRangsPoisson = rangs =>
  rangs.map(r => `${r.d}/${r.oeil ? '(yeux)' : r.m}/${r.v}`).join(', ');

/* --------------------------------------------------------------------------
   ACCESSOIRES MÉTAL (fermoir de porte-clef…)
   Rangés dans le groupe : g.accessoires = [{ type, metal, pos, rot }]
   Point d'accroche à l'origine, l'accessoire part vers -Z (devant la bouche).
   -------------------------------------------------------------------------- */
export const METAUX = { acier: '#b4b6ba', argent: '#d6d8dd', or: '#d8ad4f', bronze: '#a8713d', cuivre: '#c47a4f', noir: '#3a3a3e' };
export const TYPES_ACCESSOIRES = { mousqueton: 'Mousqueton', anneau: 'Anneau porte-clef' };
/* Longueurs usuelles de mousquetons (mm, anneau d'accroche compris) */
export const TAILLES_MOUSQUETON = [10, 12, 14, 18, 22];

class Helice extends THREE.Curve {
  constructor(R, cz, tours = 2) { super(); this.R = R; this.cz = cz; this.tours = tours; }
  getPoint(t, o = new THREE.Vector3()) {
    const a = t * Math.PI * 2 * this.tours;
    return o.set((t - 0.5) * 0.9, this.R * Math.sin(a), this.cz + this.R * Math.cos(a));
  }
}

/* Tube à rayon variable le long d'une courbe plane (plan YZ), section elliptique
   (épaisseur selon X = rayon × aplat). Bouts fermés. */
function tubeVariable(points, rayon, { aplat = 0.8, seg = 64, cotes = 14 } = {}) {
  const courbe = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const X = new THREE.Vector3(1, 0, 0);
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, P = courbe.getPointAt(t), T = courbe.getTangentAt(t);
    const N = new THREE.Vector3().crossVectors(X, T).normalize();
    const r = rayon(t);
    for (let j = 0; j < cotes; j++) {
      const a = j / cotes * Math.PI * 2, cx = r * aplat * Math.sin(a), cn = r * Math.cos(a);
      pos.push(P.x + cx + N.x * cn, P.y + N.y * cn, P.z + N.z * cn);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < cotes; j++) {
    const a = i * cotes + j, b = i * cotes + (j + 1) % cotes, c = a + cotes, d = b + cotes;
    idx.push(a, c, b, b, c, d);
  }
  for (const [i, sens] of [[0, -1], [seg, 1]]) {           // bouchons
    const P = courbe.getPointAt(i / seg), centre = pos.length / 3;
    pos.push(P.x, P.y, P.z);
    for (let j = 0; j < cotes; j++) {
      const a = i * cotes + j, b = i * cotes + (j + 1) % cotes;
      sens < 0 ? idx.push(centre, b, a) : idx.push(centre, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const cacheAcc = new Map(), cacheMetal = new Map();

/* Pièce de métal estampée : contour plan (x, y) extrudé avec arêtes arrondies,
   centrée en épaisseur. epais = épaisseur totale, arrondi = rayon des arêtes. */
function pieceMetal(forme, epais, arrondi) {
  const b = Math.min(arrondi, epais * 0.48);
  const g = new THREE.ExtrudeGeometry(forme, { depth: Math.max(0.01, epais - 2 * b), bevelEnabled: true,
    bevelThickness: b, bevelSize: b * 0.9, bevelSegments: 4, curveSegments: 28 });
  g.translate(0, 0, -(epais - 2 * b) / 2);
  return g;
}
/* Contour d'un ruban de largeur variable autour d'une ligne médiane (bouts arrondis) */
function ruban(points, largeur, n = 90) {
  const c = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  const g = [], d = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, P = c.getPointAt(t), T = c.getTangentAt(t), w = largeur(t) / 2;
    g.push(new THREE.Vector2(P.x - T.y * w, P.y + T.x * w));
    d.push(new THREE.Vector2(P.x + T.y * w, P.y - T.x * w));
  }
  const bout = (P, T, w, sens) => {                    // demi-cercle au bout
    const pts = [];
    for (let k = 1; k < 8; k++) {
      const a = sens * k / 8 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      pts.push(new THREE.Vector2(P.x + (-T.y * ca + T.x * sa) * w, P.y + (T.x * ca + T.y * sa) * w));
    }
    return pts;
  };
  const Pf = c.getPointAt(1), Tf = c.getTangentAt(1), P0 = c.getPointAt(0), T0 = c.getTangentAt(0);
  const pts = [...g, ...bout(Pf, Tf, largeur(1) / 2, 1), ...d.reverse(), ...bout(P0, T0.clone().negate(), largeur(0) / 2, 1)];
  return new THREE.Shape(pts);
}

/* Mousqueton (pince de homard) relevé point par point sur ta photo.
   Unités : longueur du fermoir ≈ 1.1 (anneau compris), puis mis à l'échelle (taille en mm).
   Repère photo : u vers la boucle, v vers le haut, origine = centre de l'anneau d'accroche. */
const MOUSQ = (() => {
  const c = [0.654, 0.373], Ro = 0.25, Ri = 0.19;
  const arc = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
    const a = (a0 + (a1 - a0) * i / n) * DEG; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
  return {
    // boucle + corps en une pièce (contour fermé ; l'ouverture est fermée par le doigt)
    corps: [...arc(Ro, 133, -95, 26),
      [0.56, 0.095], [0.46, 0.06], [0.35, 0.025], [0.22, -0.015], [0.1, -0.05], [0.03, -0.062], [0, 0], [0.02, 0.06],
      [0.07, 0.11], [0.14, 0.2], [0.2, 0.275], [0.235, 0.318], [0.27, 0.31], [0.35, 0.272], [0.44, 0.238], [0.53, 0.212],
      ...arc(Ri, -112, 133, 26)],
    doigt: [[0.462, 0.556], [0.345, 0.462], [0.262, 0.348]],         // gâchette
    nuque: [[0.05, 0.0], [0.2, 0.09], [0.4, 0.125]],                  // renflement torsadé près de l'anneau
    ergot: [[0.40, 0.025], [0.47, -0.055], [0.54, -0.105]],             // appui du pouce
    // œillet (rayons ext / int avant arrondi) : relevé sur le petit (12 mm) et le grand (≈ 18 mm)
    oeillet: taille => { const t = Math.min(1, Math.max(0, (taille - 12) / 6)); return [0.095 - 0.014 * t, 0.07 - 0.016 * t]; },
    angle: Math.atan2(c[1], c[0]),                                    // inclinaison anneau -> boucle
    long: 1.107,
  };
})();

function geosMousqueton(taille) {
  const k = taille / MOUSQ.long, ca = Math.cos(-MOUSQ.angle), sa = Math.sin(-MOUSQ.angle);
  // redresse le fermoir : l'axe anneau -> centre de boucle devient l'axe x
  const P = ([u, v]) => new THREE.Vector2((u * ca - v * sa) * k, (u * sa + v * ca) * k);
  const b = 0.017 * k;                                   // arrondi des arêtes
  const geos = [];
  const corps = new THREE.Shape(MOUSQ.corps.map(P));
  geos.push(pieceMetal(corps, 0.085 * k, b));
  const rub = (pts, l0, l1, ep) => {
    const pp = pts.map(P);
    return pieceMetal(ruban(pp.map(v => [v.x, v.y]), t => (l0 + (l1 - l0) * t) * k), ep * k, Math.min(b, ep * k * 0.45));
  };
  geos.push(rub(MOUSQ.nuque, 0.1, 0.045, 0.13));         // plus épais que le corps : donne le volume
  geos.push(rub(MOUSQ.doigt, 0.035, 0.035, 0.05));
  geos.push(rub(MOUSQ.ergot, 0.045, 0.03, 0.055));
  const [rOe, rIn] = MOUSQ.oeillet(taille);
  const an = new THREE.Shape(); an.absarc(0, 0, rOe * k, 0, Math.PI * 2, false);
  const tr = new THREE.Path(); tr.absarc(0, 0, rIn * k, 0, Math.PI * 2, true); an.holes.push(tr);
  geos.trouOeillet = rIn * k - b * 0.9;                 // rayon utile du trou
  geos.push(pieceMetal(an, 0.075 * k, b));
  return geos;
}

const RAYON_FIL = 0.16;
function geosAccessoire(type, taille = 12) {
  const cle = type + '@' + taille;
  if (cacheAcc.has(cle)) return cacheAcc.get(cle);
  const geos = [];
  if (type === 'mousqueton') {
    // Comme sur ta photo : l'œillet est enfilé sur le fil entre les 2 perles de bouche (fil selon Y).
    // Le fermoir est donc dans le plan XZ : vu par la tranche quand le poisson montre son flanc.
    const pieces = geosMousqueton(taille);
    const zE = -(pieces.trouOeillet - RAYON_FIL);       // le fil repose en haut du trou
    const versPoisson = new THREE.Matrix4().set(0, -1, 0, 0,  0, 0, 1, 0,  -1, 0, 0, 0,  0, 0, 0, 1);
    for (const g of pieces) {
      g.applyMatrix4(versPoisson);                      // long du fermoir -> -Z, travers -> X, épaisseur -> Y
      g.translate(0, 0, zE);
      g.computeVertexNormals();
      geos.push(g);
    }
  } else if (type === 'anneau') {
    const R = Math.max(7.5, taille / 2);
    geos.push(new THREE.TubeGeometry(new Helice(R, -R + 0.2), 160, 0.45, 8, false));
  }
  cacheAcc.set(cle, geos);
  return geos;
}
/* Fermoir rond à ressort (anneau marin), diamètre extérieur D (mm), proportions relevées sur ta photo :
   tube ≈ 0,1 D, trou ≈ 0,58 D, petits œillets ≈ 3 mm. Plan YZ, bas de l'anneau à l'origine.
   Les breloques pendent à l'œillet du bas (comme sur la photo du sac) ; l'œillet du haut prend la pièce suivante. */
function geosAnneauRessort(D) {
  const R = 0.4 * D, r = 0.1 * D, geos = [];
  const tore = new THREE.TorusGeometry(R, r, 18, 56); tore.rotateY(Math.PI / 2); tore.translate(0, 0, -R); geos.push(tore);
  const pt = phi => new THREE.Vector3(0, R * Math.sin(phi), -R + R * Math.cos(phi));
  const rad = phi => new THREE.Vector3(0, Math.sin(phi), Math.cos(phi));
  const tan = phi => new THREE.Vector3(0, Math.cos(phi), -Math.sin(phi));
  const Re = Math.max(1.0, 0.085 * D), re = Math.max(0.28, 0.03 * D);   // œillets ≈ 3 mm
  const bague = phi => {                                   // double collerette autour de l'anneau
    for (const d of [-0.42, 0.42]) {
      const g = new THREE.TorusGeometry(r * 1.12, r * 0.32, 10, 24);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan(phi)));
      g.translate(...pt(phi).add(tan(phi).multiplyScalar(d * r)).toArray()); geos.push(g);
    }
  };
  const oeillet = (phi, axe = null) => {                   // petit anneau soudé, axe = normale de son plan
    bague(phi);
    const g = new THREE.TorusGeometry(Re, re, 10, 28);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axe || tan(phi)));
    const c = pt(phi).add(rad(phi).multiplyScalar(r * 1.25 + Re * 0.8));
    g.translate(...c.toArray()); geos.push(g);
    return c;
  };
  const haut = oeillet(Math.PI);                           // reçoit le mousqueton
  oeillet(Math.PI * 0.55);
  const bas = oeillet(0, new THREE.Vector3(1, 0, 0));      // porte les breloques (plan YZ)
  // tirette à bille
  const phiT = Math.PI * 1.38; bague(phiT);
  const tige = new THREE.CylinderGeometry(0.03 * D, 0.03 * D, 0.22 * D, 10);
  tige.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rad(phiT)));
  tige.translate(...pt(phiT).add(rad(phiT).multiplyScalar(r + 0.11 * D)).toArray()); geos.push(tige);
  const bille = new THREE.SphereGeometry(0.055 * D, 14, 10);
  bille.translate(...pt(phiT).add(rad(phiT).multiplyScalar(r + 0.23 * D)).toArray()); geos.push(bille);
  return { geos, haut: haut.z, attache: { centre: bas.z, rayon: Re } };
}

/* Mousqueton porte-clés pivotant, longueur L (≈ 34 mm sur tes photos) :
   anneau tournant Ø ≈ 0,38 L, émerillon, boîtier riveté ≈ 0,31 L de large, boucle à doigt ≈ 0,32 L de large.
   Plan YZ, bas de l'anneau à l'origine ; les breloques pendent à l'anneau. */
function geosMousquetonPivot(L) {
  const geos = [];
  const R1 = 0.167 * L, r1 = 0.021 * L;
  const anneau = new THREE.TorusGeometry(R1, r1, 14, 48); anneau.rotateY(Math.PI / 2); anneau.translate(0, 0, -R1); geos.push(anneau);
  let z = -2 * R1 + r1 * 0.5;
  const axe = new THREE.CylinderGeometry(0.035 * L, 0.04 * L, 0.06 * L, 16); axe.rotateX(Math.PI / 2); axe.translate(0, 0, z - 0.03 * L); geos.push(axe);
  z -= 0.06 * L;
  const disque = new THREE.CylinderGeometry(0.07 * L, 0.07 * L, 0.025 * L, 22); disque.rotateX(Math.PI / 2); disque.translate(0, 0, z - 0.0125 * L); geos.push(disque);
  z -= 0.025 * L;
  const hB = 0.19 * L, lB = 0.31 * L;
  const boitier = new RoundedBoxGeometry(0.13 * L, lB, hB, 3, 0.02 * L); boitier.translate(0, 0, z - hB / 2); geos.push(boitier);
  const rivet = new THREE.CylinderGeometry(0.03 * L, 0.03 * L, 0.14 * L, 14); rivet.rotateZ(Math.PI / 2); rivet.translate(0, lB * 0.28, z - hB * 0.5); geos.push(rivet);
  z -= hB;
  // boucle allongée (stade) : côté gauche fixe + arrondi, côté droit = doigt mobile
  const rr = 0.028 * L, w = 0.16 * L - rr, lg = 0.19 * L, pts = [];
  pts.push(new THREE.Vector3(0, -w, z + 0.02 * L));
  for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(0, -w, z - lg * i / 6));
  for (let i = 1; i < 12; i++) { const a = Math.PI * i / 12; pts.push(new THREE.Vector3(0, -w * Math.cos(a), z - lg - w * Math.sin(a))); }
  pts.push(new THREE.Vector3(0, w, z - lg)); pts.push(new THREE.Vector3(0, w, z - lg + 0.04 * L));
  geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 90, rr, 12, false));
  const doigt = new THREE.CylinderGeometry(rr * 0.85, rr * 0.85, lg - 0.06 * L, 10); doigt.rotateX(Math.PI / 2);
  doigt.translate(0, w, z - lg / 2 + 0.005 * L); geos.push(doigt);
  return { geos, haut: z - lg - w, attache: { centre: -R1, rayon: R1 } };
}
const cacheAccroche = new Map();
function geosPiece(pc) {                                   // géométries réutilisées (pas recréées à chaque rendu)
  const cle = pc.type + '@' + (pc.taille || 0);
  if (!cacheAccroche.has(cle)) cacheAccroche.set(cle,
    pc.type === 'anneau-ressort' ? geosAnneauRessort(pc.taille || 15)
    : pc.type === 'mousqueton-pivot' ? geosMousquetonPivot(pc.taille || 33) : null);
  return cacheAccroche.get(cle);
}
export function piecesAccroche(pieces) {                   // empile les pièces de bas en haut
  let z = 0; const out = [];
  pieces.forEach((pc, i) => {
    const g = geosPiece(pc);
    if (!g) return;
    out.push({ ...pc, z, geos: g.geos, attache: g.attache });
    z += g.haut;
  });
  return out;
}

function matMetal(metal) {
  const hex = METAUX[metal] || metal || METAUX.argent;
  if (!cacheMetal.has(hex)) cacheMetal.set(hex, new THREE.MeshPhysicalMaterial({
    color: hex, metalness: 1, roughness: 0.18, clearcoat: 0.4, clearcoatRoughness: 0.1 }));
  return cacheMetal.get(hex);
}

/* Fil métallique de la queue : depuis le dernier rang de chaque flanc, les fils
   se rejoignent en V au départ des tiges puis traversent chaque tige jusqu'à la pointe. */
export function cheminsFil(g) {
  const P = b => new THREE.Vector3().fromArray(b.p);
  if (g.technique === 'lettres' || g.technique === 'pampille') return [[new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0, g.finFil || 0)]];
  const flancs = g.perles.filter(b => b.l === 'gauche' || b.l === 'droite');
  if (!flancs.length) return [];
  const rMax = Math.max(...flancs.map(b => b.r));
  const bout = cote => {
    const rang = flancs.filter(b => b.r === rMax && b.l === cote);
    return rang.find(b => b.s === 'ligne') || rang[Math.floor(rang.length / 2)];
  };
  const colonne = g.perles.filter(b => b.l === 'colonne').sort((a, b) => a.p[2] - b.p[2]);
  const ends = colonne.length ? [P(colonne[colonne.length - 1])] : [bout('gauche'), bout('droite')].filter(Boolean).map(P);
  const tiges = [...new Set(g.perles.filter(b => /^tige/.test(b.l || '')).map(b => b.l))].sort();
  const chemins = [];
  const bouche = g.perles.filter(b => b.l === 'bouche').map(P).sort((a, b) => a.y - b.y);
  if (bouche.length > 1) chemins.push([bouche[0], bouche[bouche.length - 1]]);
  tiges.forEach((nom, k) => {
    const perles = g.perles.filter(b => b.l === nom).sort((a, b) => a.c - b.c).map(P);
    if (!perles.length) return;
    const dir = perles.length > 1 ? perles[1].clone().sub(perles[0]) : new THREE.Vector3(0, 0, 1.4);
    const depart = perles[0].clone().addScaledVector(dir, -0.5);
    const pointe = perles[perles.length - 1].clone().addScaledVector(dir, 0.75);
    const origine = ends[k % ends.length];
    chemins.push([origine, depart, ...perles, pointe].filter(Boolean));
  });
  if (!tiges.length && ends.length === 2) {
    const milieu = ends[0].clone().add(ends[1]).multiplyScalar(0.5); milieu.z += 1.2;
    chemins.push([ends[0], milieu, ends[1]]);
  }
  return chemins;
}
/* Petites boucles du fil au bout de chaque arête (comme sur ta photo) */
export function bouclesArete(g) {
  const bouts = new Map();
  for (const b of g.perles) if (b.l === 'arete-g' || b.l === 'arete-d') {
    const cle = b.l + b.r, cur = bouts.get(cle);
    if (!cur || Math.abs(b.p[1]) > Math.abs(cur.p[1])) bouts.set(cle, b);
  }
  return [...bouts.values()].map(b => {
    const s = Math.sign(b.p[1]), T = typePerle(b.t);
    return new THREE.Vector3(b.p[0], b.p[1] + s * (T.H * 0.5 + 0.38), b.p[2]);
  });
}
function geoFil(points, rayon = RAYON_FIL) {
  const chemin = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) chemin.add(new THREE.LineCurve3(points[i], points[i + 1]));
  return new THREE.TubeGeometry(chemin, points.length * 12, rayon, 6, false);
}

export function construireAccessoire(acc) {
  const o = new THREE.Group();
  const mat = matMetal(acc.metal);
  for (const g of geosAccessoire(acc.type, acc.taille || 12)) o.add(new THREE.Mesh(g, mat));
  return o;
}

/* Une simple rangée droite (= nappe d'une seule rangée) */
export const genRangee = ({ type, n = 8, trou = 'long', serrage } = {}) =>
  genNappe({ type, rangs: [n], trou, serrage });

/* Analyse "4,6,8x3,10" -> [4,6,8,8,8,10] */
export function lireRangs(txt) {
  const out = [];
  String(txt).split(/[,;\s]+/).filter(Boolean).forEach(tok => {
    const m = tok.match(/^(\d+)(?:x(\d+))?$/i);
    if (m) for (let i = 0; i < (+m[2] || 1); i++) out.push(+m[1]);
  });
  return out;
}

/* --------------------------------------------------------------------------
   4. MODÈLE
   { version, nom, zones:[{id,nom,defaut:ref,repere:'#hex'}],
     groupes:[{id,nom,pos:[x,y,z],rot:[°x,°y,°z],cache?,perles:[…]}] }
   Configuration client : { dos:'REF', ventre:'REF', … }
   -------------------------------------------------------------------------- */
export function nouvelId(prefixe = 'g') {
  return prefixe + '-' + Math.random().toString(36).slice(2, 8);
}

/* Modèle d'exemple : le poisson Bona Nodi (flancs doublés, ligne de queue, 2 tiges, mousqueton). */
export const PATRON_DEMO = '3/0/1, 2/0/2, 2/(yeux)/2, 3/0/2, 2/1/2, 2/1/3, 2/1/3, 2/1/2, 2/1/2, 1/1/2, 1/1/2, 1/1/1, 1/1/1, 1/1/0';
export const OPTIONS_POISSON_DEMO = { bouche: 2, tiges: 2, perlesTige: 5, angleTige: 30, galbe: 0.07, ecart: 0.62,
  typeOeil: 'plate-6', typePupille: 'rocaille-11' };

/* Zones par partie : { dos, ligne, ventre } -> id de zone ; oeil = ref de couleur fixe */
export function zonerPoisson(perles, { dos = 'dos', ligne = 'queue', ventre = 'ventre', oeil = null, bouche = undefined, yeux = null, pupille = undefined, arete = undefined } = {}) {
  perles.forEach(b => {
    if (b.l === 'bouche' && bouche !== undefined) { b.z = bouche; return; }
    if (b.s === 'pupille') { b.z = pupille !== undefined ? pupille : (yeux || ligne); return; }
    if (b.s === 'oeil' && yeux) { b.z = yeux; return; }
    if (b.s === 'oeil') {
      if (oeil) { b.z = null; b.k = oeil; } else b.z = ligne ?? null;   // sans couleur d'œil : suit la ligne
      return;
    }
    b.z = ({ dos, ligne, ventre, arete: arete !== undefined ? arete : ligne })[b.s] ?? null;
  });
  return perles;
}

/* Arête de poisson : même tête que le poisson (rangs de tête), puis une colonne d'une perle
   avec des arêtes de part et d'autre, et la queue en tiges.
   aretes : perles par côté pour chaque arête, ex. [2, 2, 2]
   colonne : perles de colonne { avant, entre, apres } */
export const PATRON_TETE_ARETE = '3/0/1, 2/0/2, 2/(yeux)/2, 3/0/2, 2/1/2';
export function genArete({ type = 'rocaille-11', rangs = lireRangsPoisson(PATRON_TETE_ARETE), aretes = [2, 2, 2],
                           colonne = { avant: 1, entre: 1, apres: 2 }, tiges = 2, perlesTige = 5, angleTige = 30, ...tete } = {}) {
  const T = typePerle(type);
  const out = genPoisson({ type, rangs, tiges: 0, ...tete });
  const pasRang = T.D * 0.92 * (tete.serrage || 1);
  const pasCol = T.H * 1.04, pasArete = T.H * 1.04;
  const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
  let z = rangs.length * pasRang + pasRang * 0.5 + pasCol * 0.5;
  let r = rangs.length + 2, n = 0;
  const vertebre = () => {
    out.push({ t: type, p: [0, 0, +z.toFixed(4)], q: quatDe(Z), z: null, r, c: n++, n: 0, l: 'colonne', s: 'arete', a: null });
    const zz = z; z += pasCol; return zz;
  };
  for (let i = 0; i < (colonne.avant ?? 1); i++) vertebre();
  aretes.forEach((nb, k) => {
    const za = vertebre();
    for (const cote of [-1, 1]) for (let j = 0; j < nb; j++) {
      const y = cote * (T.D * 0.46 + (j + 0.5) * pasArete);
      out.push({ t: type, p: [0, +y.toFixed(4), +za.toFixed(4)], q: quatDe(Y), z: null, r: r + k, c: j, n: nb,
                 l: cote < 0 ? 'arete-d' : 'arete-g', s: 'arete', a: null });
    }
    if (k < aretes.length - 1) for (let i = 0; i < (colonne.entre ?? 1); i++) vertebre();
  });
  for (let i = 0; i < (colonne.apres ?? 2); i++) vertebre();
  const rQueue = r + aretes.length;
  const z0 = z - pasCol * 0.5 + 0.2;
  for (let k = 0; k < tiges; k++) {
    const ang = (tiges === 1 ? 0 : angleTige * (1 - 2 * k / (tiges - 1))) * DEG;
    const dir = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang));
    for (let j = 0; j < perlesTige; j++) {
      const d = (j + 0.5) * T.H * 1.04;
      out.push({ t: type, p: arr(new THREE.Vector3(0, dir.y * d, z0 + dir.z * d)), q: quatDe(dir),
                 z: null, r: rQueue, c: j, n: perlesTige, l: 'tige' + (k + 1), s: 'arete', a: null });
    }
  }
  return out;
}

export function modeleDemo() {
  const rangs = lireRangsPoisson(PATRON_DEMO);
  const perles = zonerPoisson(genPoisson({ type: 'rocaille-11', rangs, ...OPTIONS_POISSON_DEMO }),
    { bouche: 'bouche', yeux: 'yeux', pupille: 'pupille' });
  return {
    version: 11, nom: 'Petit poisson', slug: 'poisson-sardine', unite: 'mm',
    zones: [
      { id: 'dos',     nom: 'Dos',     defaut: '#PR-ex27', defautNom: 'argent 1', repere: '#3b82c4', categorie: 'rocaille' },
      { id: 'ventre',  nom: 'Ventre',  defaut: '#PR-ex14', defautNom: 'bleu 2',   repere: '#e0a43a', categorie: 'rocaille' },
      { id: 'queue',   nom: 'Queue',   defaut: '#PR-ex15', defautNom: 'bleu 3',   repere: '#c4467a', categorie: 'rocaille' },
      { id: 'yeux',    nom: 'Yeux (perle plate)', defaut: '#PV-ex01', defautNom: 'plate noir', repere: '#8a5cd1',
        groupe: 'Yeux', libelle: 'Perle plate', categorie: 'verre|heishi', choixNoms: ['plate noir', 'plate noire', 'plate blanche', 'plate blanc'],
        double: { t: 'plate-4', k: '#PV-ex04', kNom: 'plate blanche 4 mm' } },
      { id: 'pupille', nom: 'Yeux (rocaille)',    defaut: '#PR-ex27', defautNom: 'argent 1',   repere: '#2fa3b5',
        groupe: 'Yeux', libelle: 'Centre', categorie: 'rocaille' },
      { id: 'bouche',  nom: 'Bouche',  defaut: '#PR-ex05', defautNom: 'orange 1', repere: '#3aa776', categorie: 'rocaille' },
    ],
    prix: 15, bij_ref: '#BIJ-001',          // prix de base = pv du bijou #BIJ-001 (15 € par défaut si non lu)
    options: [
      { id: 'fermoir', type: 'fermoir', nom: 'Fermoir', defaut: '#FB001',
        choix: [{ ref: '#FB001', libelle: 'Petit', supplement: 0 }, { ref: '#FB002', libelle: 'Grand', supplement: 0 }] },
      { id: 'etoile', type: 'perle', nom: 'Perle étoile', perle: 'etoile-8', categorie: 'étoile', supplement: 0.5 },
      { id: 'accroche', type: 'accroche', nom: 'Porte-clés & bundle',
        choix: [
          { id: 'pivot', libelle: 'Mousqueton', pieces: ['#MP-ex01'], supplement: 2 },
          { id: 'rond', libelle: 'Rond', pieces: ['#FR-ex01'], supplement: 1.5 },
          { id: 'mini-rond', libelle: 'Mini rond', pieces: ['#FR-ex02'], supplement: 1 },
          { id: 'rond-pivot', libelle: 'Mousqueton + rond', pieces: ['#FR-ex01', '#MP-ex01'], supplement: 3.5 },
        ],
        // offre : le fermoir rond est offert dès 2 breloques à 15 € (le client reste libre de prendre un autre porte-clés)
        offre: { active: true, libelle: 'Fermoir rond offert', min: 2, prixMin: 15, piece: '#FR-ex01', remise: 1.5 } },
    ],
    groupes: [
      { id: 'g-poisson', nom: 'Poisson', technique: 'poisson', patron: PATRON_DEMO, type: 'rocaille-11',
        options: { ...OPTIONS_POISSON_DEMO }, pos: [0, 0, 0], rot: [0, 0, 0],
        accessoires: [{ ref: '#FB001', type: 'mousqueton', metal: 'argent', taille: 12, pos: [0, 0, 0], rot: [0, 0, 0] }],
        fil: { actif: true, metal: 'argent' },
        perles },
    ],
  };
}

export const OPTIONS_ARETE_DEMO = { bouche: 2, tiges: 2, perlesTige: 5, angleTige: 30, galbe: 0.07, ecart: 0.62,
  typeOeil: 'plate-6', typePupille: 'rocaille-11', aretes: [2, 2, 2], colonne: { avant: 1, entre: 1, apres: 2 } };
export function modeleAreteDemo() {
  const perles = zonerPoisson(genArete({ type: 'rocaille-11', rangs: lireRangsPoisson(PATRON_TETE_ARETE), ...OPTIONS_ARETE_DEMO }),
    { bouche: 'bouche', yeux: 'yeux', pupille: 'pupille', ligne: 'queue', arete: 'arete' });
  return {
    version: 11, nom: 'Arête', unite: 'mm', slug: 'arete',
    zones: [
      { id: 'dos',     nom: 'Tête (dos)',    defaut: '#PR-ex27', defautNom: 'argent 1', repere: '#3b82c4', categorie: 'rocaille' },   // comme le petit poisson
      { id: 'ventre',  nom: 'Tête (ventre)', defaut: '#PR-ex14', defautNom: 'bleu 2',   repere: '#e0a43a', categorie: 'rocaille' },
      { id: 'queue',   nom: 'Queue',         defaut: '#PR-ex15', defautNom: 'bleu 3',   repere: '#d4572e', categorie: 'rocaille' },
      { id: 'arete',   nom: 'Arête',         defaut: '#PR-ex27', defautNom: 'argent 1', repere: '#c4467a', categorie: 'rocaille' },
      { id: 'yeux',    nom: 'Yeux (perle plate)', defaut: '#PV-ex01', defautNom: 'plate noir', repere: '#8a5cd1',
        groupe: 'Yeux', libelle: 'Perle plate', categorie: 'verre|heishi', choixNoms: ['plate noir', 'plate noire', 'plate blanche', 'plate blanc'],
        double: { t: 'plate-4', k: '#PV-ex04', kNom: 'plate blanche 4 mm' } },
      { id: 'pupille', nom: 'Yeux (rocaille)', defaut: '#PR-ex27', defautNom: 'argent 1', repere: '#2fa3b5',
        groupe: 'Yeux', libelle: 'Centre', categorie: 'rocaille' },
      { id: 'bouche',  nom: 'Bouche',  defaut: '#PR-ex05', defautNom: 'orange 1', repere: '#3aa776', categorie: 'rocaille' },
    ],
    prix: 15, bij_ref: '', bijNom: 'arete',    // fiche bijou trouvée par son nom (« arête »), sinon 15 €
    options: [
      { id: 'fermoir', type: 'fermoir', nom: 'Fermoir', defaut: '#FB001',
        choix: [{ ref: '#FB001', libelle: 'Petit', supplement: 0 }, { ref: '#FB002', libelle: 'Grand', supplement: 0 }] },
      { id: 'etoile', type: 'perle', nom: 'Perle étoile', perle: 'etoile-8', categorie: 'étoile', supplement: 0.5 },
      { id: 'accroche', type: 'accroche', nom: 'Porte-clés & bundle',
        choix: [
          { id: 'pivot', libelle: 'Mousqueton', pieces: ['#MP-ex01'], supplement: 2 },
          { id: 'rond', libelle: 'Rond', pieces: ['#FR-ex01'], supplement: 1.5 },
          { id: 'mini-rond', libelle: 'Mini rond', pieces: ['#FR-ex02'], supplement: 1 },
          { id: 'rond-pivot', libelle: 'Mousqueton + rond', pieces: ['#FR-ex01', '#MP-ex01'], supplement: 3.5 },
        ],
        // offre : le fermoir rond est offert dès 2 breloques à 15 € (le client reste libre de prendre un autre porte-clés)
        offre: { active: true, libelle: 'Fermoir rond offert', min: 2, prixMin: 15, piece: '#FR-ex01', remise: 1.5 } },
    ],
    groupes: [
      { id: 'g-arete', nom: 'Arête', technique: 'arete', patron: PATRON_TETE_ARETE, type: 'rocaille-11',
        options: { ...OPTIONS_ARETE_DEMO }, pos: [0, 0, 0], rot: [0, 0, 0],
        accessoires: [{ ref: '#FB001', type: 'mousqueton', metal: 'argent', taille: 12, pos: [0, 0, 0], rot: [0, 0, 0] }],
        fil: { actif: true, metal: 'argent' }, perles },
    ],
  };
}

/* Breloque argile ronde et plate : un galet peint (motif au choix), piton à œil, fermoir breloque */
export function modeleArgileDemo() {
  const T = typePerle('argile-30');
  return {
    version: 10, nom: 'Breloque argile', slug: 'argile', unite: 'mm',
    zones: [
      { id: 'motif', nom: 'Motif', defaut: '#AG-ex01', defautNom: 'citron', repere: '#e8c11c', categorie: 'argile' },
    ],
    prix: 20, bij_ref: '', bijZone: 'motif',   // le motif choisi = la fiche bijou (argile citron, argile tomate…) ; 20 € si pv vide
    options: [
      { id: 'fermoir', type: 'fermoir', nom: 'Fermoir', defaut: '#FB001',
        choix: [{ ref: '#FB001', libelle: 'Petit', supplement: 0 }, { ref: '#FB002', libelle: 'Grand', supplement: 0 }] },
      { id: 'accroche', type: 'accroche', nom: 'Porte-clés & bundle',
        choix: [
          { id: 'pivot', libelle: 'Mousqueton', pieces: ['#MP-ex01'], supplement: 2 },
          { id: 'rond', libelle: 'Rond', pieces: ['#FR-ex01'], supplement: 1.5 },
          { id: 'mini-rond', libelle: 'Mini rond', pieces: ['#FR-ex02'], supplement: 1 },
          { id: 'rond-pivot', libelle: 'Mousqueton + rond', pieces: ['#FR-ex01', '#MP-ex01'], supplement: 3.5 },
        ],
        offre: { active: true, libelle: 'Fermoir rond offert', min: 2, prixMin: 15, piece: '#FR-ex01', remise: 1.5 } },
    ],
    groupes: [
      { id: 'g-argile', nom: 'Argile', technique: 'argile', type: 'argile-30', pos: [0, 0, 0], rot: [0, 0, 0],
        accessoires: [{ ref: '#FB001', type: 'mousqueton', metal: 'argent', taille: 12, pos: [0, 0, 0], rot: [0, 0, 0] }],
        fil: { actif: false }, oeillets: [[0, 0, 1.2]], comblement: false,
        perles: [{ t: 'argile-30', p: [0, 0, +(2.6 + T.D / 2).toFixed(3)], q: quatDe(new THREE.Vector3(0, 0, 1)),
                   z: 'motif', r: 0, c: 0, n: 0, l: 'argile', s: null, a: null }] },
    ],
  };
}
export const estArgile = m => !!m?.groupes?.some(g => g.technique === 'argile');

/* --------------------------------------------------------------------------
   CHAINMAIL : anneaux { p:[x,y,z] centre, n:[x,y,z] normale du plan, R rayon moyen, e rayon du fil }
   Croix : maille byzantine verticale, deux grands anneaux en bras, un anneau en haut
   (pris par le fermoir breloque) et un en bas. Fermoir en z = 0, la breloque pend vers +z.
   -------------------------------------------------------------------------- */
export function genCroixByzantine({ noeuds = 2, R = 3.0, e = 0.42, Rbras = 4.1, Rhaut = 4.1, Rbas = 2.1, beta = 32, prof = 0.42,
  pas = 4.1, theta = 20, recul = 1.05, decal = 0.38, ouvre = 17, affine = 0.08, echelle = 1.2 } = {}) {
  // relevé sur ta vidéo : 2 nœuds seulement, longs (≈ 5 rayons d'anneau d'un « H » au suivant),
  // corps ≈ 2 anneaux de large, bras ≈ 1,7 fois le diamètre des anneaux du corps, centrés sur le 1er nœud
  // DOUBLE BYZANTINE (relevé sur ta photo) : chaque nœud est centré sur un « H » (paire doublée, vue de face
  // couchée) ; de ce H partent 4 groupes de pétales doublés qui s'écartent VERS L'EXTÉRIEUR : en haut à gauche
  // et à droite, ils montent en s'ouvrant ; en bas, ils descendent en s'ouvrant. Entre deux nœuds, des paires
  // doublées verticales (vues par la tranche). Bras ≈ 9 mm enfoncés dans le 1er nœud, envergure ≈ 25 mm.
  [R, e, Rbras, Rhaut, Rbas] = [R, e, Rbras, Rhaut, Rbas].map(v => v * echelle);
  const A = [], P = pas * R, d = e * 2.1;                // d : écart entre deux anneaux doublés
  const an = (p, n, r = R) => A.push({ p: p.map(v => +v.toFixed(3)), n: n.map(v => +v.toFixed(4)), R: r, e });
  const groupe = (c, n, nb = 2, r = R) => {               // anneaux parallèles accolés le long de leur normale
    const l = Math.hypot(...n); n = n.map(v => v / l);
    for (let k = 0; k < nb; k++) { const o = (k - (nb - 1) / 2) * d; an([c[0] + n[0] * o, c[1] + n[1] * o, c[2] + n[2] * o], n, r); }
  };
  const sa = Math.sin(ouvre * DEG), ca = Math.cos(ouvre * DEG);
  // la maille est aussi épaisse que large : chaque groupe existe en avant ET en arrière (décalé en profondeur,
  // tourné de ±beta), pour que le côté et le dos soient aussi pleins que la face
  const cb = Math.cos(beta * DEG), sb = Math.sin(beta * DEG);
  const tourne = (n, k) => [n[0] * cb - n[1] * sb * k, n[0] * sb * k + n[1] * cb, n[2]];
  const epais = (c, n, nb = 2) => { for (const k of [-1, 1]) groupe([c[0] + k * prof * R, c[1], c[2]], tourne(n, k), nb); };
  const H = z => epais([0, 0, z], [sa * 0.5, 0, 1], 2);                        // le « H » du nœud
  const liaison = z => epais([0, 0, z], [sa, ca, 0], 2);                       // paires doublées verticales entre deux nœuds
  const zHaut = Rhaut - e * 0.4;
  an([0, 0, zHaut], [1, 0, 0], Rhaut);                   // anneau du haut : même taille que les bras (pris par le fermoir breloque)
  let z = zHaut + Rhaut * 0.6 + R * 0.9 - P / 2 + R * 1.6;   // le grand anneau du haut prend directement les pétales du 1er nœud
  const centres = [];
  for (let i = 0; i < noeuds; i++) {
    const f = 1 - affine * i;                            // le corps s'affine vers le bas
    z += P / 2;
    centres.push(z);
    H(z);
    const th = theta * DEG;
    for (const v of [-1, 1]) for (const s of [-1, 1]) {  // v : -1 en haut, +1 en bas ; s : côté gauche / droit
      // axe long du pétale : part du H vers l'extérieur (en haut : monte en s'ouvrant, en bas : descend en s'ouvrant)
      const u = [0, s * Math.sin(th), v * Math.cos(th)];
      const c = [0, s * decal * R * f + u[1] * recul * R * f, z + u[2] * recul * R];
      const w = [0, -u[2], u[1]];                        // perpendiculaire à l'axe dans le plan de face
      epais(c, [sa * (v * s > 0 ? 1 : -1), w[1] * ca, w[2] * ca], 2);
    }
    z += P / 2;
    liaison(z);
  }
  an([0, 0, z + R * 0.9 + Rbas * 0.6], [1, 0, 0], Rbas); // anneau du bas (porte la pampille)
  // bras : grands anneaux enfoncés d'un tiers dans les pétales du premier nœud
  const n1 = A.filter(a => Math.abs(a.p[2] - (centres[0] ?? z)) < P / 2);   // anneaux du premier nœud
  const demi = Math.max(...n1.map(a => Math.abs(a.p[1]) + a.R * Math.sqrt(Math.max(0, 1 - a.n[1] ** 2)) + a.e));
  const zb = centres[0] ?? z, yb = demi + Rbras * 0.55;          // bras centrés sur le 1er nœud, enfoncés dans ses pétales
  for (const s of [-1, 1]) an([0, s * yb, zb], [1, 0, 0], Rbras);
  return A;
}
/* Breloque chainmail : la forme (croix…) se choisit comme une couleur ; chaque forme = une fiche bijou composition */
export function modeleChainmailDemo() {
  return {
    version: 12, nom: 'Breloque chainmail', slug: 'chainmail', unite: 'mm',
    zones: [
      { id: 'forme', nom: 'Forme', defaut: '#CM-ex01', defautNom: 'croix', repere: '#b4b6ba', categorie: 'chainmail' },
    ],
    prix: 15, bij_ref: '', bijZone: 'forme',   // la forme choisie = la fiche composition (« croix ») ; 15 € si pv vide
    options: [
      { id: 'fermoir', type: 'fermoir', nom: 'Fermoir', defaut: '#FB001',
        choix: [{ ref: '#FB001', libelle: 'Petit', supplement: 0 }, { ref: '#FB002', libelle: 'Grand', supplement: 0 }] },
      // la pampille du bas (petite boule argentée) peut être remplacée par une perle de culture
      { id: 'pampille', type: 'perle', place: 'pampille', nom: 'Perle de culture en pampille', perle: 'culture-8', categorie: 'culture', supplement: 3 },
      { id: 'accroche', type: 'accroche', nom: 'Porte-clés & bundle',
        choix: [
          { id: 'pivot', libelle: 'Mousqueton', pieces: ['#MP-ex01'], supplement: 2 },
          { id: 'rond', libelle: 'Rond', pieces: ['#FR-ex01'], supplement: 1.5 },
          { id: 'mini-rond', libelle: 'Mini rond', pieces: ['#FR-ex02'], supplement: 1 },
          { id: 'rond-pivot', libelle: 'Mousqueton + rond', pieces: ['#FR-ex01', '#MP-ex01'], supplement: 3.5 },
        ],
        offre: { active: true, libelle: 'Fermoir rond offert', min: 2, prixMin: 15, piece: '#FR-ex01', remise: 1.5 } },
    ],
    groupes: [
      { id: 'g-chainmail', nom: 'Chainmail', technique: 'chainmail', metal: 'acier', zoneForme: 'forme', pos: [0, 0, 0], rot: [0, 0, 0],
        accessoires: [{ ref: '#FB001', type: 'mousqueton', metal: 'argent', taille: 12, pos: [0, 0, 0], rot: [0, 0, 0] }],
        fil: { actif: false }, comblement: false, perles: [], anneaux: genCroixByzantine(),
        pampille: { t: 'ronde-3', k: '#PM-ex02', kNom: 'ronde argentée 3 mm' } },
    ],
  };
}
export const modeleCroixDemo = modeleChainmailDemo;     // ancien nom
export const estChainmail = m => !!m?.groupes?.some(g => g.technique === 'chainmail');

/* Breloque perle de culture : la perle sur clou à boucle, petite boule argentée dessous, fermoir breloque */
export function modelePerleCultureDemo() {
  const T = typePerle('culture-8'), B = typePerle('ronde-3'), q = quatDe(new THREE.Vector3(0, 0, 1));
  const zP = 1.2 + T.H / 2, zB = 1.2 + T.H + 0.1 + B.H / 2;
  return {
    version: 12, nom: 'Breloque perle de culture', slug: 'perle-culture', unite: 'mm',
    zones: [
      { id: 'perle', nom: 'Perle de culture', defaut: '#PC-ex01', defautNom: 'perle de culture rose', repere: '#d9b0a6', categorie: 'culture' },
    ],
    prix: 5, bij_ref: '', bijNom: 'perle.*culture',  // fiche composition « perles de culture » ; 5 € si pv vide
    options: [
      { id: 'fermoir', type: 'fermoir', nom: 'Fermoir', defaut: '#FB001',
        choix: [{ ref: '#FB001', libelle: 'Petit', supplement: 0 }, { ref: '#FB002', libelle: 'Grand', supplement: 0 }] },
      { id: 'accroche', type: 'accroche', nom: 'Porte-clés & bundle',
        choix: [
          { id: 'pivot', libelle: 'Mousqueton', pieces: ['#MP-ex01'], supplement: 2 },
          { id: 'rond', libelle: 'Rond', pieces: ['#FR-ex01'], supplement: 1.5 },
          { id: 'mini-rond', libelle: 'Mini rond', pieces: ['#FR-ex02'], supplement: 1 },
          { id: 'rond-pivot', libelle: 'Mousqueton + rond', pieces: ['#FR-ex01', '#MP-ex01'], supplement: 3.5 },
        ],
        offre: { active: true, libelle: 'Fermoir rond offert', min: 2, prixMin: 15, piece: '#FR-ex01', remise: 1.5 } },
    ],
    groupes: [
      { id: 'g-perle', nom: 'Perle de culture', technique: 'pampille', pos: [0, 0, 0], rot: [0, 0, 0],
        accessoires: [{ ref: '#FB001', type: 'mousqueton', metal: 'argent', taille: 12, pos: [0, 0, 0], rot: [0, 0, 0] }],
        fil: { actif: true, metal: 'argent' }, comblement: false, boucles: [[0, 0, 0.05]], finFil: +(zB + B.H / 2).toFixed(3),
        perles: [
          { t: 'culture-8', p: [0, 0, +zP.toFixed(3)], q, z: 'perle', r: 0, c: 0, n: 0, l: 'pampille', s: null, a: null },
          { t: 'ronde-3', p: [0, 0, +zB.toFixed(3)], q, z: null, k: '#PM-ex02', kNom: 'ronde argentée 3 mm', partie: 'Arrêt', r: 0, c: 1, n: 0, l: 'pampille', s: null, a: null },
        ] },
    ],
  };
}
export const estPerleCulture = m => !!m?.groupes?.some(g => g.technique === 'pampille');

/* Anciens exemples encore enregistrés dans le navigateur ? */
export const estAncienneDemo = m => !!m && (['Poisson (exemple)', 'Poisson dessus-dessous (exemple)'].includes(m.nom)
  || (/Bona Nodi \(exemple\)$/.test(m.nom || '') && (m.version || 0) < 10));

/* Statistiques : nombre de perles par type et par couleur (utile pour le stock) */
export function compterPerles(modele, couleurs = {}) {
  const zones = Object.fromEntries((modele.zones || []).map(z => [z.id, z]));
  const parRef = {};
  for (const g of modele.groupes || []) for (const b of g.perles) {
    const ref = b.k || couleurs[b.z] || zones[b.z]?.defaut || '—';
    const cle = ref + '|' + b.t;
    parRef[cle] = (parRef[cle] || 0) + 1;
  }
  return Object.entries(parRef).map(([k, n]) => {
    const [ref, type] = k.split('|');
    return { ref, type, n };
  });
}

/* --------------------------------------------------------------------------
   5. SCÈNE 3D
   -------------------------------------------------------------------------- */
export class ScenePerles {
  constructor(conteneur, { catalogue = CATALOGUE_DEMO, detail = 1, autoRotation = false } = {}) {
    this.conteneur = conteneur;
    this.detail = detail;
    this.couleurs = {};
    this.vueZones = false;
    this.plates = [];
    this.maillages = [];
    this.cacheMat = new Map();
    this.definirCatalogue(catalogue);

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.style.display = 'block';
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
    conteneur.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(20, 40, 30);
    this.scene.add(sol, new THREE.AmbientLight(0xffffff, 0.25));

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
    this.camera.position.copy(DIR_FACE).multiplyScalar(60);     // de face : le motif se voit dès le départ
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = autoRotation;
    this.controls.autoRotateSpeed = 1.2;

    this.racine = new THREE.Group();
    this.scene.add(this.racine);

    // halo de surbrillance (perles survolées / sélectionnées)
    this.geoHalo = new THREE.SphereGeometry(1, 16, 12);
    this.matHalo = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    this.halo = null;

    this.raycaster = new THREE.Raycaster();
    this._ro = new ResizeObserver(() => this.redimensionner());
    this._ro.observe(conteneur);
    this.redimensionner();

    const boucle = () => {
      this._raf = requestAnimationFrame(boucle);
      if (this.enPause) return;                            // studio réseaux : il pilote lui-même le rendu
      this.controls.update();
      r.render(this.scene, this.camera);
    };
    boucle();
  }

  /* Fermoirs de ta base : l'accessoire d'un groupe prend taille / métal / forme de sa ref */
  definirFermoirs(fermoirs) {
    this.fermoirs = fermoirs || [];
    this.fermoirsParRef = Object.fromEntries(this.fermoirs.map(f => [f.ref, f]));
    if (this.modele) this.reconstruire();
  }
  /* Choix du client pour les options du modèle : { fermoir: '#FM…', etoile: '#PE…' | null } */
  definirOptions(choix) {
    this.choixOptions = { ...(choix || {}) };
    if (this.modele) this.rafraichir();
  }

  definirCatalogue(catalogue) {
    this.catalogue = catalogue || [];
    this.parRef = Object.fromEntries(this.catalogue.map(c => [c.ref, c]));
    for (const m of this.cacheMat.values()) m.dispose();
    this.cacheMat.clear();
    if (this.modele) this.reconstruire();
  }

  definirModele(modele, { cadrer = false } = {}) {
    this.modele = modele;
    this.zonesParId = Object.fromEntries((modele.zones || []).map(z => [z.id, z]));
    this._aplatir();
    this._extrasOptions();
    this.reconstruire();
    if (cadrer) this.cadrer();
  }

  /* couleurs : { idZone: ref } — ne touche pas au placement des perles */
  definirCouleurs(couleurs) {
    this.couleurs = { ...couleurs };
    this.reconstruire();
  }

  definirCouleurZone(zone, ref) {
    this.couleurs[zone] = ref;
    this.reconstruire();
  }

  refPour(b) {
    if (b.k) return b.k;
    if (b.z && this.couleurs[b.z]) return this.couleurs[b.z];
    const z = this.zonesParId?.[b.z];
    return z?.defaut || null;
  }

  _aplatir() {
    this.plates = [];
    this.ponts = [];
    this.matGroupes = [];
    const mg = new THREE.Matrix4(), m = new THREE.Matrix4();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const e = new THREE.Euler(), qg = new THREE.Quaternion();
    (this.modele.groupes || []).forEach((g, gi) => {
      if (g.cache) return;
      const rot = g.rot || [0, 0, 0];
      e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      mg.compose(new THREE.Vector3().fromArray(g.pos || [0, 0, 0]), qg.setFromEuler(e), s);
      this.matGroupes[gi] = mg.clone();
      if (gi === 0) this.matPremier = mg.clone();
      g.perles.forEach((b, bi) => {
        p.fromArray(b.p);
        q.fromArray(b.q || [0, 0, 0, 1]);
        m.compose(p, q, s).premultiply(mg);
        this.plates.push({ gi, bi, b, m: m.clone() });
      });
      // comblement : un « pont » entre chaque perle du flanc gauche et sa jumelle à droite
      if (g.comblement === false) return;
      const horsPont = b => b.s === 'oeil' || b.s === 'pupille';
      const droite = new Map();
      g.perles.forEach(b => { if (b.l === 'droite' && !horsPont(b)) droite.set(b.r + '|' + b.c, b); });
      g.perles.forEach(b => {
        if (b.l !== 'gauche' || horsPont(b)) return;
        const d = droite.get(b.r + '|' + b.c); if (!d) return;
        const len = d.p[0] - b.p[0]; if (len < 0.15) return;
        const mid = new THREE.Vector3((b.p[0] + d.p[0]) / 2, (b.p[1] + d.p[1]) / 2, (b.p[2] + d.p[2]) / 2);
        const T = typePerle(b.t);
        m.compose(mid, new THREE.Quaternion(), new THREE.Vector3(len, T.D * 0.4, T.D * 0.4)).premultiply(mg);
        this.ponts.push({ b, m: m.clone() });
      });
    });
  }

  /* Perles ajoutées par les options client (ex. perle étoile enfilée avant le fermoir) */
  _extrasOptions() {
    this.decalFermoir = {};                           // par groupe : place prise par les perles en option
    this.filsPampille = [];
    // pampille sous une breloque chainmail : petite boule argentée, ou la perle choisie en option
    (this.modele?.groupes || []).forEach((g, gi) => {
      const mg = this.matGroupes?.[gi];
      if (!g.pampille || !mg || g.cache) return;
      const o = (this.modele.options || []).find(x => x.type === 'perle' && x.place === 'pampille' && (x.gi ?? 0) === gi);
      const ref = o && this.choixOptions?.[o.id];
      const t = ref ? (this.parRef[ref]?.perle || o.perle || 'culture-8') : g.pampille.t;
      const k = ref || (this.parRef[g.pampille.k] ? g.pampille.k : this.catalogue.find(c => norm(c.nom) === norm(g.pampille.kNom || ''))?.ref || g.pampille.k);
      const T = typePerle(t), A = this._anneaux(g) || [];
      const zBas = A.length ? Math.max(...A.map(a => a.p[2] + a.R)) - 0.3 : 0;
      const z = zBas + 1.6 + T.H / 2;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, z), new THREE.Quaternion().fromArray(quatDe(new THREE.Vector3(0, 0, 1))), new THREE.Vector3(1, 1, 1)).premultiply(mg);
      this.plates.push({ gi: -1, bi: -1, b: { t, k, z: null, s: 'option', l: 'option' }, m });
      this.filsPampille.push({ gi, de: zBas - 0.4, a: z + T.H / 2 + 0.3 });
    });
    for (const o of this.modele?.options || []) {
      if (o.type !== 'perle' || o.place === 'texte' || o.place === 'pampille') continue;
      const ref = this.choixOptions?.[o.id];
      const gi = o.gi ?? 0, mg = this.matGroupes?.[gi];
      if (!ref || !mg) continue;
      const type = this.parRef[ref]?.perle || o.perle || 'etoile-8';
      const T = typePerle(type);
      const d = this.decalFermoir[gi] || 0;
      const z = -0.35 - d - T.H / 2;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, z),
        new THREE.Quaternion().fromArray(quatDe(new THREE.Vector3(0, 0, 1))), new THREE.Vector3(1, 1, 1)).premultiply(mg);
      this.plates.push({ gi: -1, bi: -1, b: { t: type, k: ref, z: null, s: 'option', l: 'option' }, m });
      this.decalFermoir[gi] = d + T.H + 0.15;
    }
  }

  /* À appeler après avoir déplacé/ajouté/supprimé des perles ou des groupes */
  rafraichir() {
    this._aplatir();
    this._extrasOptions();
    this.reconstruire();
  }

  _materiau(cle) {
    if (this.cacheMat.has(cle)) return this.cacheMat.get(cle);
    let mat;
    if (cle.startsWith('zone:')) {
      const z = this.zonesParId?.[cle.slice(5)];
      mat = new THREE.MeshStandardMaterial({ color: z?.repere || '#9a9a9a', roughness: 0.55 });
    } else if (cle === 'aucune' || !this.parRef[cle]) {
      mat = new THREE.MeshStandardMaterial({ color: '#b9b6b0', roughness: 0.6 });
    } else {
      mat = creerMateriau(this.parRef[cle]);
    }
    this.cacheMat.set(cle, mat);
    return mat;
  }

  /* Anneaux d'un groupe chainmail : ceux de la forme choisie par le client (croix…) */
  _anneaux(g) {
    if (!g.zoneForme) return g.anneaux;
    const ref = this.couleurs?.[g.zoneForme] || this.zonesParId?.[g.zoneForme]?.defaut;
    const f = this.parRef[ref]?.forme;
    if (!f || !FORMES_CHAINMAIL[f]) return g.anneaux;
    (this._cacheFormes ||= {})[f] ||= FORMES_CHAINMAIL[f].gen();
    return this._cacheFormes[f];
  }

  /* Œil « double perle plate » : une perle heishi (colorée) reçoit une petite perle plate blanche
     entre elle et la rocaille ; la rocaille recule d'autant. Refait à chaque changement de couleur. */
  _yeuxDoubles() {
    this.plates = this.plates.filter(e => !e.ajout);
    for (const e of this.plates) if (e.m0) { e.m.copy(e.m0); delete e.m0; }
    if (this.vueZones) return;
    const po = new THREE.Vector3(), pp = new THREE.Vector3();
    for (const e of [...this.plates]) {
      if (e.b.s !== 'oeil' || !this.parRef[this.refPour(e.b)]?.double) continue;
      const d = this.zonesParId?.[e.b.z]?.double || { t: 'plate-4' };
      const k = this.parRef[d.k] ? d.k : this.catalogue.find(c => norm(c.nom) === norm(d.kNom || 'plate blanche 4 mm'))?.ref || d.k;
      const pup = this.plates.find(p => p.gi === e.gi && p.b.s === 'pupille' && p.b.r === e.b.r && p.b.c === e.b.c && p.b.l === e.b.l);
      const T = typePerle(e.b.t), T2 = typePerle(d.t);
      po.setFromMatrixPosition(e.m);
      const dir = pup ? pp.setFromMatrixPosition(pup.m).clone().sub(po).normalize()
        : new THREE.Vector3().setFromMatrixColumn(e.m, 0).multiplyScalar(e.b.l === 'gauche' ? -1 : 1).normalize();
      const m = e.m.clone().setPosition(po.clone().addScaledVector(dir, (T.H + T2.H) / 2));
      this.plates.push({ gi: e.gi, bi: -1, b: { t: d.t, k, z: null, s: 'oeil2', l: e.b.l }, m, ajout: true });
      if (pup) { pup.m0 = pup.m.clone(); pup.m.setPosition(pp.addScaledVector(dir, T2.H * 0.9)); }
    }
  }

  reconstruire() {
    this._yeuxDoubles();
    for (const m of this.maillages) { this.racine.remove(m); m.dispose(); }
    this.maillages = [];
    for (const m of this.maillagesPonts || []) { this.racine.remove(m); m.dispose(); }
    this.maillagesPonts = [];
    if (!this.geoPont) { this.geoPont = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); this.geoPont.rotateZ(Math.PI / 2); }
    const paquetsPonts = new Map();
    for (const p of this.ponts || []) {
      const ref = this.vueZones ? (p.b.k ? p.b.k : 'zone:' + (p.b.z || '')) : (this.refPour(p.b) || 'aucune');
      if (!paquetsPonts.has(ref)) paquetsPonts.set(ref, []);
      paquetsPonts.get(ref).push(p.m);
    }
    for (const [ref, ms] of paquetsPonts) {
      const mesh = new THREE.InstancedMesh(this.geoPont, this._materiau(ref), ms.length);
      ms.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      this.racine.add(mesh); this.maillagesPonts.push(mesh);
    }
    for (const o of this.objAccessoires || []) this.racine.remove(o);
    this.objAccessoires = [];
    for (const g of this.geoFils || []) g.dispose();
    this.geoFils = [];
    const ml = new THREE.Matrix4(), el = new THREE.Euler(), un = new THREE.Vector3(1, 1, 1);
    (this.modele?.groupes || []).forEach((g, gi) => {
      if (g.cache || !this.matGroupes?.[gi]) return;
      if (g.fil && g.fil.actif !== false) {
        if (!this.geoBoucle) { this.geoBoucle = new THREE.TorusGeometry(0.34, RAYON_FIL * 0.8, 8, 20); this.geoBoucle.rotateY(Math.PI / 2); }
        for (const pt of [...bouclesArete(g), ...(g.boucles || []).map(a => new THREE.Vector3().fromArray(a))]) {
          const m = new THREE.Mesh(this.geoBoucle, matMetal(g.fil.metal || 'argent'));
          m.matrixAutoUpdate = false; m.matrix.copy(this.matGroupes[gi]).multiply(new THREE.Matrix4().makeTranslation(pt.x, pt.y, pt.z));
          this.racine.add(m); this.objAccessoires.push(m);
        }
        for (const pts of cheminsFil(g)) {
          const geo = geoFil(pts); this.geoFils.push(geo);
          const m = new THREE.Mesh(geo, matMetal(g.fil.metal || 'argent'));
          m.matrixAutoUpdate = false; m.matrix.copy(this.matGroupes[gi]);
          this.racine.add(m); this.objAccessoires.push(m);
        }
      }
      // chainmail : un maillage instancié par taille d'anneau
      const anneaux = this._anneaux(g);
      if (anneaux?.length) {
        const parTaille = new Map();
        for (const a of anneaux) { const k = a.R + '|' + a.e; if (!parTaille.has(k)) parTaille.set(k, []); parTaille.get(k).push(a); }
        const Zv = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), mm = new THREE.Matrix4();
        for (const [k, liste] of parTaille) {
          const [R, e] = k.split('|').map(Number);
          const ck = 'anneau|' + k;
          if (!cacheGeo.has(ck)) cacheGeo.set(ck, new THREE.TorusGeometry(R, e, 14, 48));
          const mesh = new THREE.InstancedMesh(cacheGeo.get(ck), matMetal(g.metal || 'acier'), liste.length);
          liste.forEach((a, i) => {
            q.setFromUnitVectors(Zv, new THREE.Vector3().fromArray(a.n).normalize());
            mm.compose(new THREE.Vector3().fromArray(a.p), q, new THREE.Vector3(1, 1, 1)).premultiply(this.matGroupes[gi]);
            mesh.setMatrixAt(i, mm);
          });
          mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
          this.racine.add(mesh); this.objAccessoires.push(mesh);
        }
      }
      for (const fp of (this.filsPampille || []).filter(f => f.gi === gi)) {   // clou de la pampille, boucle dans l'anneau du bas
        const geo = geoFil([new THREE.Vector3(0, 0, fp.de), new THREE.Vector3(0, 0, fp.a)]); this.geoFils.push(geo);
        const m = new THREE.Mesh(geo, matMetal('argent'));
        m.matrixAutoUpdate = false; m.matrix.copy(this.matGroupes[gi]);
        this.racine.add(m); this.objAccessoires.push(m);
      }
      // piton à œil planté dans le haut d'une breloque argile : l'anneau reçoit le fermoir breloque
      for (const pt of g.oeillets || []) {
        if (!this.geoPiton) {
          const anneau = new THREE.TorusGeometry(1.15, 0.3, 10, 28); anneau.rotateY(Math.PI / 2);
          const tige = new THREE.CylinderGeometry(0.32, 0.26, 3.2, 12); tige.rotateX(Math.PI / 2); tige.translate(0, 0, 2.6);
          this.geoPiton = [anneau, tige];
        }
        for (const geo of this.geoPiton) {
          const m = new THREE.Mesh(geo, matMetal(g.oeilletMetal || 'argent'));
          m.matrixAutoUpdate = false; m.matrix.copy(this.matGroupes[gi]).multiply(new THREE.Matrix4().makeTranslation(pt[0], pt[1], pt[2]));
          this.racine.add(m); this.objAccessoires.push(m);
        }
      }
      for (const acc0 of g.accessoires || []) {
        let acc = acc0;
        const optF = (this.modele.options || []).find(o => o.type === 'fermoir' && (o.gi ?? 0) === gi);
        const refF = (optF && this.choixOptions?.[optF.id]) || acc.ref;
        const f = refF && this.fermoirsParRef?.[refF];
        if (f) acc = { ...acc, ref: f.ref, type: f.type, taille: f.taille, metal: f.metal };
        if (!acc.type || acc.type === 'aucun') continue;
        const o = construireAccessoire(acc);
        const rot = acc.rot || [0, 0, 0];
        el.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
        const pos = new THREE.Vector3().fromArray(acc.pos || [0, 0, 0]);
        const decal = this.decalFermoir?.[gi] || 0;
        if (decal) {
          // perle(s) en option : le fil sort de la bouche, traverse la perle et porte l'œillet du fermoir
          pos.z -= decal;
          const geo = geoFil([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -decal)]); this.geoFils.push(geo);
          const fil = new THREE.Mesh(geo, matMetal(g.fil?.metal || 'argent'));
          fil.matrixAutoUpdate = false; fil.matrix.copy(this.matGroupes[gi]);
          this.racine.add(fil); this.objAccessoires.push(fil);
        }
        ml.compose(pos, new THREE.Quaternion().setFromEuler(el), un);
        o.matrixAutoUpdate = false;
        o.matrix.copy(this.matGroupes[gi]).multiply(ml);
        this.racine.add(o);
        this.objAccessoires.push(o);
      }
    });
    // accroche de bundle (anneau rond, mousqueton porte-clés) : repère du modèle, sans groupe
    if (this.modele?.support?.pieces?.length) {
      for (const pc of piecesAccroche(this.modele.support.pieces)) {
        const o = new THREE.Group();
        for (const g of pc.geos) o.add(new THREE.Mesh(g, matMetal(pc.metal || 'argent')));
        o.position.set(0, 0, pc.z);
        this.racine.add(o); this.objAccessoires.push(o);
      }
    }
    const paquets = new Map();
    this.plates.forEach((e, i) => {
      const ref = this.vueZones
        ? (e.b.k ? e.b.k : 'zone:' + (e.b.z || ''))
        : (this.refPour(e.b) || 'aucune');
      const cle = e.b.t + '|' + ref;
      if (!paquets.has(cle)) paquets.set(cle, []);
      paquets.get(cle).push(i);
    });
    // lettres imprimées sur les perles lettre
    const parLettre = new Map();
    this.plates.forEach(e => { if (e.b.lettre) { const k = e.b.t + '|' + e.b.lettre; if (!parLettre.has(k)) parLettre.set(k, []); parLettre.get(k).push(e.m); } });
    for (const [k, ms] of parLettre) {
      const [type, ch] = k.split('|');
      const mesh = new THREE.InstancedMesh(geoDecalLettre(type), matLettre(ch), ms.length);
      ms.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      this.racine.add(mesh); this.maillagesPonts.push(mesh);
    }
    for (const [cle, indices] of paquets) {
      const sep = cle.indexOf('|');
      const type = cle.slice(0, sep), ref = cle.slice(sep + 1);
      const mesh = new THREE.InstancedMesh(geometriePerle(type, this.detail), this._materiau(ref), indices.length);
      indices.forEach((idx, i) => mesh.setMatrixAt(i, this.plates[idx].m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.userData.indices = indices;
      this.racine.add(mesh);
      this.maillages.push(mesh);
    }
  }

  /* Index (dans this.plates) de la perle sous le pointeur, ou -1 */
  pointer(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.maillages, false);
    if (!hits.length) return -1;
    return hits[0].object.userData.indices[hits[0].instanceId];
  }

  surligner(indices = []) {
    if (this.halo) { this.scene.remove(this.halo); this.halo.dispose(); this.halo = null; }
    if (!indices.length) return;
    const h = new THREE.InstancedMesh(this.geoHalo, this.matHalo, indices.length);
    const sc = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    indices.forEach((idx, i) => {
      const e = this.plates[idx]; if (!e) return;
      const r = typePerle(e.b.t).D * 0.62;
      e.m.decompose(p, q, s);
      sc.compose(p, q, s.set(r, r, r));
      h.setMatrixAt(i, sc);
    });
    h.instanceMatrix.needsUpdate = true;
    h.computeBoundingSphere();
    h.renderOrder = 2;
    this.halo = h;
    this.scene.add(h);
  }

  /* Replace la caméra de face (garde la distance) : départ de la rotation automatique */
  deFace() {
    const d = this.camera.position.distanceTo(this.controls.target) || 60;
    this.camera.position.copy(this.controls.target).add(DIR_FACE.clone().multiplyScalar(d));
    this.camera.lookAt(this.controls.target);
  }

  cadrer(marge = 1.25) {
    const box = new THREE.Box3().setFromObject(this.racine);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const rayon = box.getBoundingSphere(new THREE.Sphere()).radius;
    const dist = rayon * marge / Math.sin(this.camera.fov * DEG / 2);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(dir.multiplyScalar(dist));
    this.camera.near = dist / 100; this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
  }

  redimensionner() {
    const w = this.conteneur.clientWidth || 300, h = this.conteneur.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* Rendu hors écran à une taille donnée (studio réseaux : story, post, vidéo qui tourne).
     angle = rotation (radians) autour de l'axe vertical, à partir de la vue actuelle.
     Avec restaurer:false la vue reste à cette taille (enchaîner les images d'une vidéo),
     puis restaurerVue(). Renvoie le canvas WebGL (fond transparent). */
  rendreVue({ largeur = 1080, hauteur = 1080, angle = 0, marge = 1.12, restaurer = true, deFace = true } = {}) {
    const r = this.renderer, cam = this.camera, ctl = this.controls;
    if (!this._vueSauvee) this._vueSauvee = { taille: r.getSize(new THREE.Vector2()), ratio: r.getPixelRatio(), pos: cam.position.clone(),
      cible: ctl.target.clone(), aspect: cam.aspect, near: cam.near, far: cam.far, halo: this.halo?.visible, pause: this.enPause };
    const v = this._vueSauvee;
    this.enPause = true;
    try {
    if (this.halo) this.halo.visible = false;
    const box = new THREE.Box3().setFromObject(this.racine);
    const c = box.isEmpty() ? v.cible.clone() : box.getCenter(new THREE.Vector3());
    const rayon = box.isEmpty() ? 20 : box.getBoundingSphere(new THREE.Sphere()).radius;
    const dir = (deFace ? DIR_FACE.clone() : v.pos.clone().sub(v.cible)).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
    cam.aspect = largeur / hauteur;
    const demiV = cam.fov * DEG / 2, demiH = Math.atan(Math.tan(demiV) * cam.aspect);
    const dist = rayon * marge / Math.sin(Math.min(demiV, demiH));
    cam.position.copy(c).add(dir.multiplyScalar(dist)); cam.lookAt(c);
    cam.near = dist / 100; cam.far = dist * 20; cam.updateProjectionMatrix();
    const t = r.getSize(new THREE.Vector2());
    if (r.getPixelRatio() !== 1) r.setPixelRatio(1);
    if (t.x !== largeur || t.y !== hauteur) r.setSize(largeur, hauteur, false);
    r.render(this.scene, cam);
    if (restaurer) { const el = document.createElement('canvas'); el.width = largeur; el.height = hauteur; el.getContext('2d').drawImage(r.domElement, 0, 0); this.restaurerVue(); return el; }
    return r.domElement;
    } catch (e) { this.restaurerVue(); throw e; }          // jamais de vue 3D figée
  }
  restaurerVue() {
    const v = this._vueSauvee; if (!v) return;
    const r = this.renderer, cam = this.camera;
    r.setPixelRatio(v.ratio); r.setSize(v.taille.x, v.taille.y, false);
    cam.position.copy(v.pos); cam.aspect = v.aspect; cam.near = v.near; cam.far = v.far; cam.lookAt(v.cible); cam.updateProjectionMatrix();
    if (this.halo) this.halo.visible = v.halo;
    this.enPause = v.pause; this._vueSauvee = null;
    this.redimensionner();
  }

  /* Image PNG du rendu actuel (miniature panier, aperçu commande…) */
  capture() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  detruire() {
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    this.controls.dispose();
    for (const m of this.maillages) m.dispose();
    for (const m of this.cacheMat.values()) m.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/* --------------------------------------------------------------------------
   6. BOUTIQUE (Supabase) — `sb` = ton client supabase-js
   Tables/vues créées par sql-modeles-3d.sql :
     modeles_3d      : modèles publiés (lecture publique), écriture admin seulement
     couleurs_perles : vue publique de `materiaux` (ref, nom, meta, en stock) sans prix
   -------------------------------------------------------------------------- */
/* Même sélection de perles que le configurateur boutique actuel */
export async function chargerCatalogueBoutique(sb) {
  const [mats, imgs] = await Promise.all([
    sb.from('materiaux').select('id,ref,mc,sc,designation,variante,qty,meta')
      .or('sc.ilike.%rocaille%,sc.ilike.%perle%,designation.ilike.%rocaille%,designation.ilike.%perle%,sc.ilike.%argile%,designation.ilike.%argile%,mc.ilike.%argile%')
      .order('ref'),
    sb.from('boutique_settings').select('value').eq('key', 'perles_images').maybeSingle(),
  ]);
  if (mats.error) throw mats.error;
  return regrouperVariantes(catalogueDepuisMateriaux(mats.data, imgs.data?.value || {}));
}
export async function chargerFermoirsBoutique(sb) {
  const { data, error } = await sb.from('materiaux').select('id,ref,mc,sc,designation,variante,qty')   // sans prix d'achat (non lisibles avec la clé publique)
    .or('sc.ilike.%fermoir%,sc.ilike.%breloque%,designation.ilike.%fermoir%,designation.ilike.%mousqueton%,variante.ilike.%mousqueton%')
    .order('ref');
  if (error) throw error;
  return regrouperVariantes((data || []).map(fermoirDepuisMateriau));
}
export async function chargerPrixBijou(sb, ref) {
  if (!ref) return null;
  const { data } = await sb.from('bijoux').select('pv').eq('ref', ref).maybeSingle();
  return data?.pv != null ? parseFloat(data.pv) : null;
}
/* Prix = prix de base du bijou + suppléments des options choisies */
export function prixConfiguration(modele, choixOptions = {}, prixBase = null) {
  let total = prixBase ?? modele.prix ?? 0;
  for (const o of modele.options || []) {
    const v = choixOptions[o.id];
    if (!v) continue;
    const c = o.choix?.find(x => x.ref === v);
    total += +(c?.supplement ?? o.supplement ?? 0) || 0;
  }
  return Math.round(total * 100) / 100;
}

/* Parties du configurateur boutique (pour reprendre leurs perles autorisées) */
export async function chargerPartiesConfigurateur(sb, idModele = 'sardine') {
  const { data } = await sb.from('boutique_settings').select('value').eq('key', 'configurateur_modeles').maybeSingle();
  const modeles = data?.value || [];
  return (modeles.find(m => m.id === idModele) || modeles[0])?.parties || [];
}
export async function chargerModeleBoutique(sb, slug, { brouillon = false } = {}) {
  let q = sb.from('modeles_3d').select('donnees, publie').eq('slug', slug);
  if (!brouillon) q = q.eq('publie', true);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data?.donnees || null;
}
export async function listerModelesBoutique(sb) {
  const { data, error } = await sb.from('modeles_3d').select('slug, nom, publie, updated_at').order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function enregistrerModeleBoutique(sb, { slug, modele, publie = false, bij_id = null }) {
  const { error } = await sb.from('modeles_3d').upsert({
    slug, nom: modele.nom || slug, donnees: modele, publie, bij_id: bij_id || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'slug' });
  if (error) throw error;
}
/* Garde-fou côté client : ne garde que des couleurs autorisées pour chaque zone */
export function validerConfiguration(modele, catalogue, config, parties = null) {
  const propre = {};
  for (const z of modele.zones || []) {
    const ok = couleursProposees(z, catalogue, parties).filter(c => c.enStock !== false).map(c => c.ref);
    // La couleur de départ du modèle reste affichée même épuisée (le modèle ne change pas) :
    // la pastille est barrée et la commande demande une autre couleur.
    const tous = couleursProposees(z, catalogue, parties);
    const defaut = tous.some(c => c.ref === z.defaut) ? z.defaut : refParNom(z.defautNom, tous);
    propre[z.id] = ok.includes(config[z.id]) ? config[z.id]
      : (config[z.id] === undefined || config[z.id] === defaut) && defaut ? defaut : ok[0] ?? defaut ?? null;
  }
  return propre;
}

/* Couleurs choisies qui sont en rupture : [{ zone, nom }] (bloque la commande) */
export function couleursEpuisees(modele, catalogue, couleurs = {}) {
  const parRef = new Map(catalogue.map(c => [c.ref, c]));
  return (modele.zones || []).filter(z => z.client !== false && parRef.get(couleurs[z.id])?.enStock === false)
    .map(z => ({ zone: z.id, zoneNom: z.libelle || z.nom, nom: parRef.get(couleurs[z.id]).nom }));
}

/* --------------------------------------------------------------------------
   7. COMMANDE SUR MESURE (formulaire client -> bon de commande / facture)
   -------------------------------------------------------------------------- */
/* Lignes de la commande à partir des choix du client.
   prestation : lignes chiffrées (bijou, fermoir, options) ;
   creation   : fiche atelier, nombre de perles par partie, couleur et référence. */
export function lignesCommande(modele, { catalogue = [], fermoirs = [], couleurs = {}, options = {}, prixBase = null, bijRef = null } = {}) {
  const parRef = Object.fromEntries(catalogue.map(c => [c.ref, c]));
  const fermParRef = Object.fromEntries(fermoirs.map(f => [f.ref, f]));
  const zones = Object.fromEntries((modele.zones || []).map(z => [z.id, z]));
  const base = prixBase ?? modele.prix ?? 0;
  const prestation = [{ designation: (modele.nom || 'Bijou').replace(/\s*\(exemple\)\s*$/i, '') + ' — création sur mesure',
                        ref: bijRef || modele.bij_ref || '', qte: 1, pu: base }];
  const optF = (modele.options || []).find(o => o.type === 'fermoir');
  const accBase = modele.groupes?.[0]?.accessoires?.[0];
  const refF = (optF && options[optF.id]) || accBase?.ref;
  if (refF) {
    const f = fermParRef[refF], c = optF?.choix?.find(x => x.ref === refF);
    prestation.push({ designation: 'Fermoir breloque ' + (c?.libelle || (f?.taille >= 15 ? 'grand' : 'petit')).toLowerCase(),
                      ref: refF, qte: 1, pu: +(c?.supplement ?? 0) || 0 });
  }
  for (const o of modele.options || []) {
    if (o.type !== 'perle' || !options[o.id]) continue;
    const c = parRef[options[o.id]];
    prestation.push({ designation: (o.nom || 'Perle') + ' — ' + (c?.nom || options[o.id]), ref: options[o.id], qte: 1, pu: +(o.supplement ?? 0) || 0 });
  }
  prestation.forEach(l => { l.total = Math.round(l.qte * l.pu * 100) / 100; });

  // fiche de création : perles comptées sur le modèle
  const cpt = new Map();
  for (const g of modele.groupes || []) for (const b of g.perles) {
    if (b.option) continue;                              // compté avec son option
    const ref = b.k || couleurs[b.z] || zones[b.z]?.defaut || '—';
    const partie = b.lettre ? 'Lettres « ' + (modele.texte || '') + ' »' : b.k ? (b.partie || 'Détail fixe') : (zones[b.z]?.nom || 'Sans zone');
    const cle = partie + '|' + ref + '|' + b.t;
    cpt.set(cle, (cpt.get(cle) || 0) + 1);
    const d = zones[b.z]?.double;
    if (b.s === 'oeil' && d && parRef[ref]?.double) {           // petite perle plate blanche de l'œil double
      const k2 = parRef[d.k] ? d.k : catalogue.find(c => norm(c.nom) === norm(d.kNom || ''))?.ref || d.k;
      const c2 = 'Yeux (petite perle plate)|' + k2 + '|' + d.t;
      cpt.set(c2, (cpt.get(c2) || 0) + 1);
    }
  }
  const creation = [...cpt].map(([cle, n]) => {
    const [partie, ref, type] = cle.split('|');
    return { partie, couleur: parRef[ref]?.nom || ref, ref, perle: typePerle(type).nom, quantite: n };
  });
  if (refF) creation.push({ partie: 'Fermoir', couleur: fermParRef[refF]?.nom || '', ref: refF, perle: '—', quantite: 1 });
  for (const o of modele.options || []) if (o.type === 'perle' && options[o.id])
    creation.push({ partie: o.nom || 'Option', couleur: parRef[options[o.id]]?.nom || '', ref: options[o.id], perle: typePerle(o.perle || 'etoile-8').nom, quantite: 1 });

  const total = Math.round(prestation.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return { prestation, creation, total };
}

/* Envoi de la demande (fonction SQL creer_demande_perso) -> numéro de commande */
export async function envoyerDemande(sb, demande) {
  const { data, error } = await sb.rpc('creer_demande_perso', { p: demande });
  if (error) throw error;
  return typeof data === 'string' ? { numero: data, cle: null } : data;     // { numero, cle }
}
/* Relit une personnalisation enregistrée (lien de reprise), sans aucune donnée client */
export async function chargerPersonnalisation(sb, cle) {
  const { data, error } = await sb.rpc('lire_personnalisation', { p_cle: cle });
  if (error) throw error;
  return data;                                                               // { numero, choix, created_at } ou null
}
export async function listerDemandes(sb) {
  const { data, error } = await sb.from('demandes_perso').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function majDemande(sb, id, champs) {
  const { error } = await sb.from('demandes_perso').update(champs).eq('id', id);
  if (error) throw error;
}

/* --------------------------------------------------------------------------
   8. BUNDLE : une accroche (fermoir rond, mousqueton porte-clés…) qui porte
      une ou plusieurs breloques (poisson, arête…), chacune avec ses couleurs.
   -------------------------------------------------------------------------- */
/* Où se pose le fil de l'accroche dans la boucle du fermoir breloque (repère de la breloque) */
function pointAccrocheBreloque(modele, options, fermParRef, parRef) {
  const optF = (modele.options || []).find(o => o.type === 'fermoir');
  const acc = modele.groupes?.[0]?.accessoires?.[0];
  const f = fermParRef[(optF && options[optF.id]) || acc?.ref];
  const L = f?.taille || acc?.taille || 12;
  let decal = 0;
  for (const o of modele.options || []) if (o.type === 'perle' && !['texte', 'pampille'].includes(o.place) && options[o.id])
    decal += typePerle(parRef[options[o.id]]?.perle || o.perle || 'etoile-8').H + 0.15;
  return -(0.049 * L - RAYON_FIL) - decal - 0.835 * L;
}

/* Demi-largeur angulaire d'une breloque vue depuis son point d'accroche (rad) */
function demiAngleBreloque(modele, zAcc) {
  let h = 0.12;
  for (const g of modele.groupes || []) {
    const gy = g.pos?.[1] || 0, gz = g.pos?.[2] || 0;
    for (const b of g.perles || []) {
      const T = typePerle(b.t), R = T.forme === 'argile' ? T.D / 2 : T.D / 2 + 0.2;
      for (let k = 0; k < 12; k++) {                     // contour de la perle dans le plan du bundle
        const y = Math.abs(b.p[1] + gy + R * Math.cos(k * Math.PI / 6)), z = b.p[2] + gz + R * Math.sin(k * Math.PI / 6) - zAcc;
        if (z > 1) h = Math.max(h, Math.atan2(y, z));
      }
    }
    for (const r of g.anneaux || []) {                   // chainmail
      const y = Math.abs(r.p[1] + gy) + r.R + r.e, z = r.p[2] + gz - zAcc;
      if (z > 1) h = Math.max(h, Math.atan2(y, z));
    }
  }
  return Math.min(h, 0.75);
}

/* breloques : [{ modele, couleurs, options }] ; pieces : fermoirs de l'accroche, de bas en haut.
   Renvoie un modèle unique (zones préfixées b0:, b1:…) + couleurs + options pour la scène. */
export function composerBundle({ breloques, pieces = [], fermoirs = [], catalogue = [] }) {
  const fermParRef = Object.fromEntries(fermoirs.map(f => [f.ref, f]));
  const parRef = Object.fromEntries(catalogue.map(c => [c.ref, c]));
  const att = piecesAccroche(pieces)[0]?.attache || { centre: 0, rayon: 0 };
  const n = breloques.length;
  const out = { version: 8, nom: 'Bundle', zones: [], groupes: [], options: [], support: pieces.length ? { pieces } : null };
  const couleurs = {}, options = {};
  const e = new THREE.Euler(), q = new THREE.Quaternion(), un = new THREE.Vector3(1, 1, 1);
  // éventail : chaque breloque prend un angle à la mesure de sa largeur vue depuis l'accroche
  // (un galet d'argile de 30 mm s'écarte bien plus qu'un petit poisson de 9 mm)
  const zAccs = breloques.map(br => pointAccrocheBreloque(br.modele, br.options || {}, fermParRef, parRef));
  const demiAngles = breloques.map((br, i) => demiAngleBreloque(br.modele, zAccs[i]));
  const ECART = 0.07, thetas = [];
  demiAngles.forEach((h, i) => thetas.push(i ? thetas[i - 1] + demiAngles[i - 1] + h + ECART : 0));
  const milieu = n ? (thetas[0] + thetas[n - 1]) / 2 : 0;
  const ouverture = n ? (thetas[n - 1] - thetas[0]) / 2 : 0;
  const serre = ouverture > 1.25 ? 1.25 / ouverture : 1;   // beaucoup de breloques : l'éventail se resserre (elles se chevauchent un peu)
  breloques.forEach((br, i) => {
    const pre = 'b' + i + ':';
    const m = br.modele;
    // point de l'anneau (ou de l'œillet) où pend la breloque, et éventail pour qu'elles ne se chevauchent pas
    const k = i - (n - 1) / 2;
    const a = n > 1 ? k * Math.min(0.5, 1.2 / n) : 0;
    const A = new THREE.Vector3(0, att.rayon * Math.sin(a), att.centre + att.rayon * Math.cos(a));
    const th = n > 1 ? -(thetas[i] - milieu) * serre : 0;
    const zAcc = zAccs[i];
    const rotX = new THREE.Matrix4().makeRotationX(th);
    const local = new THREE.Vector3(0, 0, zAcc).applyMatrix4(rotX);
    const M = new THREE.Matrix4().makeTranslation(A.x - local.x, A.y - local.y, A.z - local.z).multiply(rotX);
    const gi0 = out.groupes.length;
    for (const g of m.groupes || []) {
      const rot = g.rot || [0, 0, 0];
      const Mg = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(g.pos || [0, 0, 0]),
        q.setFromEuler(e.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG)), un);
      const W = M.clone().multiply(Mg);
      const p = new THREE.Vector3(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
      W.decompose(p, qq, sc);
      const ee = new THREE.Euler().setFromQuaternion(qq);
      out.groupes.push({ ...g, id: pre + g.id, ...(g.zoneForme ? { zoneForme: pre + g.zoneForme } : {}), pos: p.toArray(), rot: [ee.x / DEG, ee.y / DEG, ee.z / DEG],
        perles: g.perles.map(b => ({ ...b, z: b.z ? pre + b.z : b.z })) });
    }
    for (const z of m.zones || []) out.zones.push({ ...z, id: pre + z.id, breloque: i });
    for (const o of m.options || []) if (o.type !== 'accroche') out.options.push({ ...o, id: pre + o.id, gi: gi0 });
    for (const [k, v] of Object.entries(br.couleurs || {})) couleurs[pre + k] = v;
    for (const [k, v] of Object.entries(br.options || {})) options[pre + k] = v;
  });
  return { modele: out, couleurs, options };
}

/* Offre bundle applicable ? (assez de breloques au prix demandé, et la pièce offerte est dans l'accroche) */
export function offreApplicable(offre, accroche, prixBreloques) {
  if (!offre || !accroche) return false;
  const n = prixBreloques.filter(p => (+p || 0) >= (offre.prixMin ?? 0)).length;
  return n >= (offre.min ?? 2) && (accroche.pieces || []).includes(offre.piece);
}

/* Lignes de commande d'un bundle : chaque breloque + les pièces de l'accroche */
export function lignesCommandeBundle({ breloques, accroche = null, catalogue = [], fermoirs = [] }) {
  const fermParRef = Object.fromEntries(fermoirs.map(f => [f.ref, f]));
  const prestation = [], creation = [];
  const plusieurs = breloques.length > 1 || !!accroche;
  breloques.forEach((br, i) => {
    const L = lignesCommande(br.modele, { catalogue, fermoirs, couleurs: br.couleurs, options: br.options, prixBase: br.prixBase, bijRef: br.bijRef });
    const pre = plusieurs ? 'Breloque ' + (i + 1) + ' · ' : '';
    L.prestation.forEach(l => prestation.push({ ...l, designation: pre + l.designation }));
    L.creation.forEach(l => creation.push({ ...l, partie: (plusieurs ? 'B' + (i + 1) + ' · ' : '') + l.partie }));
  });
  if (accroche) {
    (accroche.pieces || []).forEach((ref, k) => {
      const f = fermParRef[ref];
      const pu = k === 0 ? +(accroche.supplement || 0) : 0;
      prestation.push({ designation: (k === 0 ? (accroche.libelle || 'Accroche') + ' — ' : '') + (f ? f.nom.replace(/\s*\d+([.,]\d+)?\s*mm/i, '') : ref),
                        ref, qte: 1, pu, total: pu });
      creation.push({ partie: 'Accroche', couleur: f?.nom || '', ref, perle: '—', quantite: 1 });
    });
    const offre = accroche.offre;
    if (offreApplicable(offre, accroche, breloques.map(b => b.prixBase ?? b.modele.prix))) {
      const remise = Math.min(+offre.remise || 0, +accroche.supplement || 0);
      if (remise > 0) prestation.push({ designation: 'Offre bundle — ' + (offre.libelle || 'remise'), ref: offre.piece, qte: 1, pu: -remise, total: -remise });
    }
  }
  const total = Math.round(prestation.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return { prestation, creation, total };
}

/* Accroches proposées (option 'accroche' du modèle), refs ramenées aux fermoirs réels */
export function accrochesProposees(modele, fermoirs) {
  const o = (modele.options || []).find(x => x.type === 'accroche');
  if (!o) return null;
  const refs = new Set(fermoirs.map(f => f.ref));
  const proche = ex => fermoirs.filter(f => f.type === ex.type).sort((a, b) => Math.abs(a.taille - ex.taille) - Math.abs(b.taille - ex.taille))[0];
  const choix = (o.choix || []).map(c => ({ ...c, pieces: (c.pieces || []).map(r => {
    if (refs.has(r)) return r;
    const ex = FERMOIRS_DEMO.find(f => f.ref === r); const f = ex && proche(ex);
    return f?.ref || null;
  }) })).filter(c => c.pieces.length && c.pieces.every(Boolean));
  let offre = o.offre?.active ? { ...o.offre } : null;
  if (offre && !refs.has(offre.piece)) { const ex = FERMOIRS_DEMO.find(f => f.ref === offre.piece); offre.piece = (ex && proche(ex))?.ref || null; }
  if (offre && !offre.piece) offre = null;
  return choix.length ? { ...o, choix, offre } : null;
}

/* Modèles publiés, proposés au client (poisson, arête…) */
export async function listerModelesPublies(sb) {
  const { data, error } = await sb.from('modeles_3d').select('slug, nom, donnees').eq('publie', true).order('nom');
  if (error) throw error;
  return (data || []).map(r => ({ ...r.donnees, slug: r.slug, nom: r.donnees?.nom || r.nom })).sort(ordreModeles);
}
/* --------------------------------------------------------------------------
   RUPTURES DE STOCK gérées depuis l'app de gestion (onglet 📦 Ruptures) :
   table config, clé « configurateur_ruptures » = liste de refs (matériaux, fiches bijoux,
   fermoirs) et de « modele:<slug> » pour retirer une breloque entière.
   S'ajoute au stock à 0 (qty), qui rend déjà un élément épuisé.
   -------------------------------------------------------------------------- */
export const CLE_RUPTURES = 'configurateur_ruptures';
export async function chargerRuptures(sb) {
  const { data, error } = await sb.from('config').select('value').eq('key', CLE_RUPTURES).maybeSingle();
  if (error) throw error;
  let v = data?.value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  return Array.isArray(v) ? v.map(String) : [];
}
export async function enregistrerRuptures(sb, liste) {
  const { error } = await sb.from('config').upsert({ key: CLE_RUPTURES, value: [...new Set(liste)] });
  if (error) throw error;
}
export function appliquerRuptures(liste, catalogue, fermoirs) {
  const r = new Set(liste);
  for (const c of catalogue) if (r.has(c.ref)) c.enStock = false;
  for (const f of fermoirs) if (r.has(f.ref)) f.enStock = false;
  return m => !r.has('modele:' + m.slug);                 // filtre des breloques encore proposées
}

/* --------------------------------------------------------------------------
   LIENS DES RÉFÉRENCES D'EXEMPLE (onglet 🔗 Références de l'app de gestion)
   config « configurateur_liens » = { '#PV-ex01': '#PV004', '#AG-ex01': '#BIJ-030', … }
   La vraie référence prend la place de l'exemple partout : choix proposés, couleurs
   par défaut des modèles, fermoirs, note atelier, fiche de fabrication.
   -------------------------------------------------------------------------- */
export const CLE_LIENS = 'configurateur_liens';
export async function chargerLiens(sb) {
  const { data, error } = await sb.from('config').select('value').eq('key', CLE_LIENS).maybeSingle();
  if (error) throw error;
  let v = data?.value;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = {}; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
export async function enregistrerLiens(sb, liens) {
  const propre = Object.fromEntries(Object.entries(liens).filter(([k, v]) => k && v));
  const { error } = await sb.from('config').upsert({ key: CLE_LIENS, value: propre });
  if (error) throw error;
}
export const estExemple = ref => /-ex\d/.test(String(ref || ''));
/* toutes les entrées d'exemple (catalogue + fermoirs), pour savoir quel rôle reprend la vraie référence */
export const exemplesParRef = () => new Map([...CATALOGUE_DEMO, ...ARGILE_DEMO, ...CHAINMAIL_DEMO, ...CULTURE_DEMO, ...FERMOIRS_DEMO].map(x => [x.ref, x]));
/* Matériaux liés qui ne sont pas dans la sélection habituelle (autre sous-catégorie) */
export async function chargerMateriauxParRefs(sb, refs) {
  if (!refs.length) return [];
  const { data, error } = await sb.from('materiaux').select('id,ref,mc,sc,designation,variante,qty,meta').in('ref', refs);
  if (error) throw error;
  return data || [];
}
/* Remplace les refs d'exemple liées dans un modèle (zones, options, fermoirs, lettres, pampille…) */
export function relierModele(modele, liens = {}) {
  if (!Object.keys(liens).length && !ALIAS_VARIANTES.size) return modele;
  return JSON.parse(JSON.stringify(modele), (k, v) => typeof v === 'string' && (liens[v] || ALIAS_VARIANTES.has(v)) ? refGardee(liens[v] || v) : v);
}
/* La vraie référence reprend le rôle de l'exemple ; l'entrée d'exemple disparaît */
export function appliquerLiens(liens = {}, { catalogue, fermoirs, bijoux = [], lignesEnPlus = [] }) {
  const ex = exemplesParRef();
  let cat = [...catalogue], ferm = [...fermoirs];
  for (const [refEx, refLien] of Object.entries(liens)) {
    const d = ex.get(refEx); if (!d || !refLien) continue;
    const refVraie = refGardee(refLien);                    // une variante (#…b) renvoie à la ref gardée
    if (FERMOIRS_DEMO.includes(d)) {                       // fermoir / porte-clés
      if (!ferm.some(f => f.ref === refVraie)) {
        const l = lignesEnPlus.find(x => x.ref === refVraie), b = bijoux.find(x => x.ref === refVraie);
        if (l) ferm.push({ ...fermoirDepuisMateriau(l), type: d.type, taille: fermoirDepuisMateriau(l).taille || d.taille });
        else if (b) ferm.push({ ...d, ref: b.ref, bij_id: b.id, nom: [b.nom, b.variante].filter(Boolean).join(' – '),   // composition (fiche bijou)
          nomClient: b.nom || d.nom, prix: b.pv != null ? +b.pv : null, bijou: true, stock: null, enStock: true });
      } else ferm = ferm.map(f => f.ref === refVraie ? { ...f, type: d.type } : f);
      ferm = ferm.filter(f => f.ref !== refEx);
      continue;
    }
    let r = cat.find(c => c.ref === refVraie);
    if (!r) {
      const b = bijoux.find(x => x.ref === refVraie), l = lignesEnPlus.find(x => x.ref === refVraie);
      if (b) r = { ...d, ref: b.ref, bij_id: b.id, pv: b.pv, bijou: true, enStock: true };
      else if (l) r = catalogueDepuisMateriaux([l])[0] || null;
      if (r) cat.push(r);
    }
    if (!r) continue;
    // rôle de l'exemple : forme de la perle, œil double, motif argile, forme chainmail, finition spéciale
    r.lienDe = refEx;                                       // garde le rôle de l'exemple (ex. perle plate des yeux)
    for (const k of ['double', 'perle', 'motif', 'forme']) if (d[k] !== undefined) r[k] = d[k];
    if (['argile', 'chainmail', 'petrole', 'nacre', 'hematite', 'irise-metal'].includes(d.finition)) r.finition = d.finition;
    if (d.finition === 'argile' || d.finition === 'chainmail') r.categorie = d.categorie;
    cat = cat.filter(c => c.ref !== refEx);
  }
  return { catalogue: cat, fermoirs: ferm };
}

/* Ordre d'affichage : le petit poisson d'abord (champ « ordre » du modèle, sinon cette liste) */
export const ORDRE_MODELES = ['poisson-sardine', 'arete', 'lettres', 'argile', 'chainmail', 'perle-culture'];
export function ordreModeles(a, b) {
  const rang = m => m.ordre ?? (ORDRE_MODELES.includes(m.slug) ? ORDRE_MODELES.indexOf(m.slug) + 1 : 100);
  return rang(a) - rang(b) || String(a.nom).localeCompare(String(b.nom), 'fr');
}

/* --------------------------------------------------------------------------
   9. BRELOQUE PERLES LETTRES : 1 mot, ou 2 mots séparés par une perle étoile.
      8 lettres au plus au total. Fil vertical, fermoir breloque en haut.
   -------------------------------------------------------------------------- */
export function normaliserMot(m) {
  return String(m || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
}
export function verifierTexte(texte, max = 8) {
  const mode = texte?.mode === 2 ? 2 : 1;
  const mots = (texte?.mots || []).slice(0, mode).map(normaliserMot);
  const n = mots.reduce((s, m) => s + m.length, 0);
  if (!mots[0]) return { mots, n, erreur: 'Écris ton mot (lettres A à Z).' };
  if (mode === 2 && !mots[1]) return { mots, n, erreur: 'Écris ton deuxième mot.' };
  if (n > max) return { mots, n, erreur: `${n} lettres : ${max} au maximum.` };
  return { mots, n, erreur: null };
}

export function modeleLettresDemo() {
  const m = {
    version: 11, nom: 'Breloque lettre', slug: 'lettres', unite: 'mm', prix: 2, bij_ref: '',
    bijParMode: { 1: 'lettre.*1 mot', 2: 'lettre.*2 mots' },   // fiches bijoux « breloque lettre 1 mot » / « 2 mots »
    lettres: { max: 8, ref: '#PL-ex01', refNom: 'lettres blanches',
      haut: [{ t: 'rocaille-11', k: '#PR-ex27', kNom: 'argent 1' }, { t: 'ronde-4', k: '#PM-ex01', kNom: 'ronde argentée 4 mm' }],
      bas: [{ t: 'ronde-3', k: '#PM-ex02', kNom: 'ronde argentée 3 mm' }] },
    zones: [],
    options: [
      { id: 'fermoir', type: 'fermoir', nom: 'Fermoir', defaut: '#FB001',
        choix: [{ ref: '#FB001', libelle: 'Petit', supplement: 0 }, { ref: '#FB002', libelle: 'Grand', supplement: 0 }] },
      { id: 'etoile', type: 'perle', place: 'texte', nom: 'Perle étoile', perle: 'etoile-8', categorie: 'étoile', supplement: 0.5 },
    ],
    groupes: [{ id: 'g-lettres', nom: 'Lettres', technique: 'lettres', type: 'lettre-7', pos: [0, 0, 0], rot: [0, 0, 0],
      accessoires: [{ ref: '#FB001', type: 'mousqueton', metal: 'argent', taille: 12, pos: [0, 0, 0], rot: [0, 0, 0] }],
      fil: { actif: true, metal: 'argent' }, perles: [] }],
  };
  const r = construireLettres(m, { mode: 2, mots: ['BONA', 'NODI'] }, { etoile: '#PE-ex02' });   // étoile métal argent comme sur ta photo
  r.nom = m.nom;                                         // le texte d'exemple ne fait pas partie du nom du modèle
  return r;
}

/* Construit la breloque à partir du texte du client (le modèle publié sert de gabarit) */
export function construireLettres(gabarit, texte, options = {}, catalogue = []) {
  const m = JSON.parse(JSON.stringify(gabarit));
  const L = m.lettres || {};
  const parRef = new Map(catalogue.map(c => [c.ref, c])), parNom = new Map(catalogue.map(c => [norm(c.nom), c.ref]));
  const ref = (r, nom) => (!catalogue.length || parRef.has(r)) ? r : (nom && parNom.get(norm(nom))) || r;
  const refLettre = ref(L.ref, L.refNom) || catalogue.find(c => /lettre/i.test(c.categorie || ''))?.ref || L.ref;
  const { mots } = verifierTexte(texte, L.max || 8);
  const etoile = (m.options || []).find(o => o.type === 'perle' && o.place === 'texte');
  const refEtoile = texte?.mode === 2 ? options[etoile?.id] : null;
  const Z = new THREE.Vector3(0, 0, 1), q = quatDe(Z);
  const perles = [];
  let z = 0.45, c = 0;
  const poser = (t, extra) => {
    const T = typePerle(t);
    let long = T.H, decal = 0;
    if (T.forme === 'lettre') long = T.D;
    if (T.forme === 'etoile') { const R = T.D / 2, r = R * (T.interieur ?? 0.48); long = R + r; decal = -(R - r) / 2; }
    perles.push({ t, p: [0, 0, +(z + long / 2 + decal).toFixed(4)], q, z: null, r: 1, c: c++, n: 0, l: 'texte', s: null, a: null, ...extra });
    z += long + 0.12;
  };
  for (const h of L.haut || []) poser(h.t, { k: ref(h.k, h.kNom), kNom: h.kNom, partie: 'Intercalaire' });
  mots.forEach((mot, i) => {
    if (i === 1 && refEtoile) poser(parRef.get(refEtoile)?.perle || etoile?.perle || 'etoile-8', { k: refEtoile, option: true });
    for (const ch of mot) poser('lettre-7', { k: refLettre, lettre: ch });
  });
  for (const b of L.bas || []) poser(b.t, { k: ref(b.k, b.kNom), kNom: b.kNom, partie: 'Intercalaire' });
  const g = m.groupes[0];
  g.perles = perles;
  g.finFil = z + 0.2;
  g.boucles = [[0, 0, 0.05], [0, 0, z + 0.5]];        // boucle du haut (prend l'œillet du fermoir) et arrêt du bas
  m.texte = mots.join(refEtoile ? ' ★ ' : ' ');
  m.nom = (gabarit.nom || 'Breloque lettre').replace(/\s*«.*$/, '') + (m.texte ? ' « ' + m.texte + ' »' : '');
  return m;
}
export const estLettres = m => !!m?.lettres || m?.groupes?.some(g => g.technique === 'lettres');

/* --------------------------------------------------------------------------
   10. NOTE « PERSONNALISATION SUR MESURE » (pour la commande Wix du client)
       Une note par breloque, courte (champ texte personnalisé Wix), avec
       les noms de couleurs et les références, + les articles du panier.
   -------------------------------------------------------------------------- */
const nomBreloque = m => (m.nom || 'Breloque').replace(/\s*\(exemple\)\s*$/i, '').replace(/\s*Bona Nodi\s*$/i, '');
export function noteBreloque(modele, { couleurs = {}, options = {}, catalogue = [], fermoirs = [], refs = true } = {}) {
  const parRef = Object.fromEntries(catalogue.map(c => [c.ref, c]));
  const fermParRef = Object.fromEntries(fermoirs.map(f => [f.ref, f]));
  const avec = ref => { const c = parRef[ref]; return (c?.nom || (refs ? ref : 'couleur choisie') || '—') + (refs && ref ? ' (' + ref + ')' : ''); };
  const morceaux = [nomBreloque(modele)];
  for (const z of modele.zones || []) {
    const ref = couleurs[z.id] || z.defaut;
    const nom = z.groupe ? z.groupe + ' ' + (z.libelle || '').toLowerCase() : z.nom;
    morceaux.push(nom.trim() + ' : ' + avec(ref));
  }
  const optF = (modele.options || []).find(o => o.type === 'fermoir');
  const refF = (optF && options[optF.id]) || modele.groupes?.[0]?.accessoires?.[0]?.ref;
  if (refF) {
    const f = fermParRef[refF], c = optF?.choix?.find(x => x.ref === refF);
    morceaux.push('fermoir ' + (c?.libelle || (f?.taille >= 15 ? 'grand' : 'petit')).toLowerCase() + (refs ? ' (' + refF + ')' : ''));
  }
  for (const o of modele.options || []) if (o.type === 'perle' && options[o.id])
    morceaux.push((o.place === 'texte' ? 'étoile du milieu : ' : o.place === 'pampille' ? 'pampille : ' : 'étoile dans la bouche : ') + avec(options[o.id]));
  return morceaux.join(' · ');
}

/* breloques : [{ modele, couleurs, options, prixBase }] ; accroche : { id, libelle, pieces, supplement, offre } */
export function notePersonnalisation({ breloques, accroche = null, catalogue = [], fermoirs = [], numero = '' }) {
  const fermParRef = Object.fromEntries(fermoirs.map(f => [f.ref, f]));
  const parRef = Object.fromEntries(catalogue.map(c => [c.ref, c]));
  const titre = 'Personnalisation sur mesure' + (numero ? ' ' + numero : '');
  const plusieurs = breloques.length > 1 || !!accroche;
  const articles = [];
  const ajouter = a => { const x = articles.find(y => y.cle === a.cle && !a.note && !y.note); x ? x.quantite++ : articles.push({ quantite: 1, ...a }); };
  const notesAtelier = [];
  const notes = breloques.map((b, i) => {
    const pre = titre + ' — ' + (plusieurs ? 'B' + (i + 1) + ' · ' : '');
    notesAtelier.push(pre + noteBreloque(b.modele, { ...b, catalogue, fermoirs, refs: true }));
    const note = pre + noteBreloque(b.modele, { ...b, catalogue, fermoirs, refs: false });   // le client ne voit que les noms
    ajouter({ cle: b.modele.slug, bij: b.bijRef || b.modele.bij_ref || '', libelle: nomBreloque(b.modele), prix: +(b.prixBase ?? b.modele.prix ?? 0), note });
    const optF = (b.modele.options || []).find(o => o.type === 'fermoir');
    const cF = optF?.choix?.find(c => c.ref === b.options?.[optF.id]);
    if (cF && +cF.supplement) ajouter({ cle: 'fermoir:' + cF.ref, libelle: fermParRef[cF.ref]?.nom || cF.ref, prix: +cF.supplement });
    for (const o of b.modele.options || []) if (o.type === 'perle' && b.options?.[o.id] && +o.supplement)
      ajouter({ cle: 'option:' + o.id, libelle: (o.nom || 'Perle') + ' — ' + (parRef[b.options[o.id]]?.nom || ''), prix: +o.supplement });
    return note;
  });
  let ligneAcc = '', ligneAccAtelier = '';
  if (accroche) {
    const offre = offreApplicable(accroche.offre, accroche, breloques.map(b => b.prixBase ?? b.modele.prix));
    const remise = offre ? Math.min(+accroche.offre.remise || 0, +accroche.supplement || 0) : 0;
    const prix = Math.max(0, (+accroche.supplement || 0) - remise);
    ajouter({ cle: 'accroche:' + accroche.id + (offre ? ':offre' : ''), libelle: accroche.libelle + (offre ? ' (offre)' : ''), prix });
    ligneAcc = 'Porte-clés : ' + accroche.libelle + (offre ? ' — ' + (accroche.offre.libelle || 'offre') : '');
    ligneAccAtelier = 'Porte-clés : ' + accroche.libelle + ' — ' + (accroche.pieces || []).map(r => (fermParRef[r]?.nom || r) + ' (' + r + ')').join(' + ')
      + (offre ? ' — ' + (accroche.offre.libelle || 'offre') : '');
  }
  const total = Math.round(articles.reduce((s, a) => s + a.prix * a.quantite, 0) * 100) / 100;
  const prixTxt = 'Total : ' + total.toFixed(2).replace('.', ',') + ' €';
  const texte = [titre, ligneAcc, ...notes.map(n => n.replace(titre + ' — ', '')), prixTxt].filter(Boolean).join('\n');
  const texteAtelier = [titre, ligneAccAtelier, ...notesAtelier.map(n => n.replace(titre + ' — ', '')), prixTxt].filter(Boolean).join('\n');
  return { titre, notes, notesAtelier, ligneAcc, ligneAccAtelier, articles, total, texte, texteAtelier };
}
