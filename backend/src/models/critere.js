// models/critere.js
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const CritereSchema = new Schema(
  {
    session: { type: Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    famille: { type: String, required: true, trim: true },
    critere: { type: String, required: true, trim: true },
    // aligne l’enum avec Session.trainingLevels
    niveau:  { type: String, required: true, enum: ['شارة خشبية', 'تمهيدية'], trim: true },
    maxnote:   { type: Number, default: 1, min: 1 },
    rank:   { type: Number, min: 1 },
  },
  { timestamps: true }
);

// unicité: un même critère ne peut pas être redéfini deux fois pour la même session/niveau/famille
CritereSchema.index({ session: 1, niveau: 1, famille: 1, critere: 1 }, { unique: true });

// petit “sanitize”
CritereSchema.pre('save', function (next) {
  if (typeof this.famille === 'string') this.famille = this.famille.trim();
  if (typeof this.critere === 'string') this.critere = this.critere.trim();
  if (typeof this.niveau  === 'string') this.niveau  = this.niveau.trim();
  next();
});

module.exports = model('Critere', CritereSchema);
