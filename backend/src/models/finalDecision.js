// models/finalDecision.js
const mongoose = require('mongoose');

const finalDecisionApprovalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['director', 'trainer'], required: true },
    approvedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const finalDecisionSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    formation: { type: mongoose.Schema.Types.ObjectId, ref: 'Formation', required: true },
    trainee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    affectation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SessionAffectation',
      required: true,
    },

    // totaux calculés à partir de Evaluation.items
    totalNote: { type: Number, required: true },
    totalMax: { type: Number, required: true },

    // décision finale (peut être null tant que le directeur n’a rien choisi)
    decision: {
      type: String,
      enum: ['success', 'retake', 'incompatible'],
      default: null,
    },
    comment: { type: String, default: '', maxlength: 2000 },
    commentedAt: { type: Date, default: null },

    // workflow
    status: {
      type: String,
      enum: ['draft', 'pending_team', 'validated'],
      default: 'draft',
    },

    approvals: [finalDecisionApprovalSchema],
  },
  { timestamps: true }
);

const FinalDecision = mongoose.model('FinalDecision', finalDecisionSchema);
module.exports = FinalDecision;
