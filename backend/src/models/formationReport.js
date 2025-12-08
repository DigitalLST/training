// models/formationReport.js
const mongoose = require('mongoose');

const FormationReportSchema = new mongoose.Schema(
  {
    formation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Formation',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // rôle de la personne qui rédige ce rapport
    role: {
      type: String,
      enum: ['director', 'coach'],
      required: true,
    },
    // 3 blocs de texte libres
    block1: { type: String, default: '' },
    block2: { type: String, default: '' },
    block3: { type: String, default: '' },

    // plus tard tu pourras utiliser ça pour la "signature" logique
    signedAt: { type: Date },
  },
  { timestamps: true }
);

// un utilisateur ne peut avoir qu'un rapport par formation et par rôle
FormationReportSchema.index({ formation: 1, user: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('FormationReport', FormationReportSchema);
