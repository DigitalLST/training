// models/formation.model.js
const mongoose = require('mongoose');

const FormationSchema = new mongoose.Schema({
  // Contexte
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  sessionTitleSnapshot: { type: String, default: '' },

  niveau: { type: String, enum: [
  "تمهيدية",
  "شارة خشبية",
  "S1",
  "S2",
  "S3",
  "الدراسة الابتدائية"
], required: true, index: true },

  // Centre d'accueil
  centre: { type: mongoose.Schema.Types.ObjectId, ref: 'Centre', required: true, index: true },
  centreTitleSnapshot:  { type: String, default: '' },
  centreRegionSnapshot: { type: String, default: '' },

  // Intitulé de la formation
  nom: { type: String, required: true, trim: true },

  // ✅ Multi-branches
  branches: { type: [String], default: [], index: true },

  // 🔒 Clé technique pour assurer l'unicité logique (branches triées et jointes)
  _branchesHash: { type: String, default: '', select: false, index: true },
}, { timestamps: true });

/**
 * Normalisation avant sauvegarde :
 *  - trim du nom
 *  - nettoyage des branches (string -> trim, unique)
 *  - tri des branches pour stabilité
 *  - calcul du _branchesHash (ex: "جوالة|دليلات|كشافة")
 */
FormationSchema.pre('save', function (next) {
  // nom
  if (this.isModified('nom') && typeof this.nom === 'string') {
    this.nom = this.nom.trim();
  }

  // branches
  if (this.isModified('branches')) {
    const norm = (Array.isArray(this.branches) ? this.branches : [])
      .map(String)
      .map(s => s.trim())
      .filter(Boolean);

    // déduplication
    const uniq = Array.from(new Set(norm));
    // tri pour une représentation canonique
    uniq.sort((a, b) => a.localeCompare(b, 'ar')); // tri AR pour cohérence d’affichage

    this.branches = uniq;
    this._branchesHash = uniq.join('|'); // utilisé dans l’index d’unicité
  }

  next();
});

/**
 * Unicité logique :
 *  - Une formation est unique par (session, niveau, centre, nom, branches triées)
 *  - On utilise _branchesHash pour pouvoir indexer
 */
FormationSchema.index(
  { session: 1, niveau: 1, centre: 1, nom: 1, _branchesHash: 1 },
  { unique: true, name: 'uniq_formation_per_session_niveau_centre_nom_branches' }
);


module.exports = mongoose.model('Formation', FormationSchema);
