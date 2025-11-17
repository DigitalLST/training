const mongoose = require('mongoose');

const SessionAffectationSchema = new mongoose.Schema({
  formation: { type: mongoose.Schema.Types.ObjectId, ref: 'Formation', required: true, index: true },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
  role:    { type: String, enum: ['director','trainer','trainee'], required: true },
}, { timestamps: true });

// Un même user ne peut avoir qu'UN seul rôle par session (tu peux changer ce choix plus tard)
SessionAffectationSchema.index({ session: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('SessionAffectation', SessionAffectationSchema);
