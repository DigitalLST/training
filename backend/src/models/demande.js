// models/demande.model.js
const mongoose = require('mongoose');

const CertifMiniSchema = new mongoose.Schema({
  title: { type: String, default: '' },   // certificationTitle
  code:  { type: String, default: '' },   // Training.code (L1/L2/…)
  date:  { type: Date },                  // Certif.date
}, { _id: false });

const DemandeSchema = new mongoose.Schema({
  session:   { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  applicantSnapshot: {
    idScout:   { type: String, default: '' }, // = idKachefa
    firstName: { type: String, default: '' },
    lastName:  { type: String, default: '' },
    email:     { type: String, default: '' },
    region:    { type: String, default: '' },
  },

  // ⬇️ snapshot des certifs au moment de la demande
  certifsSnapshot: { type: [CertifMiniSchema], default: [] },

  trainingLevel: { type: String, required: true },
  branche:       { type: String, required: true },

  statusRegion:   { type: String, enum: ['PENDING','APPROVED','REJECTED'], default: 'PENDING' },
  statusNational: { type: String, enum: ['PENDING','APPROVED','REJECTED'], default: 'PENDING' },
}, { timestamps: true });

DemandeSchema.index({ session: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model('Demande', DemandeSchema);
