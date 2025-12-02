const mongoose = require('mongoose');

const evaluationItemSchema = new mongoose.Schema(
  {
    critere: { type: mongoose.Schema.Types.ObjectId, ref: 'Critere', required: true },
    famille: { type: String },
    note: { type: Number },
    maxnote: { type: Number },
  },
  { _id: false }
);

const evaluationApprovalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['director', 'trainer'], required: true },
    approvedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const evaluationSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    formation: { type: mongoose.Schema.Types.ObjectId, ref: 'Formation', required: true },
    trainee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // 🔗 alimenté dans /trainee & /trainee/approve
    affectation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SessionAffectation',
      required: true,
    },

    status: {
      type: String,
      enum: ['draft', 'pending_team', 'validated'],
      default: 'draft',
    },

    approvals: [evaluationApprovalSchema],

    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    validatedAt: { type: Date, default: null },

    items: [evaluationItemSchema],
    // ❌ plus de finalDecision ici, c’est déplacé dans FinalDecision
  },
  { timestamps: true }
);

const Evaluation = mongoose.model('Evaluation', evaluationSchema);
module.exports = Evaluation;
