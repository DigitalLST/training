// models/session.js
const mongoose = require('mongoose');

const TRAINING_LEVELS = [
  "تمهيدية",
  "شارة خشبية",
  "S1",
  "S2",
  "S3",
  "الدراسة الابتدائية"
];
const SessionSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  startDate:   { type: Date,   required: true },
  endDate:     { type: Date,   required: true },
  inscriptionStartDate: { type: Date, required: true },
  inscriptionEndDate:   { type: Date, required: true },

  trainingLevels: {
    type: [String],
    enum: TRAINING_LEVELS,
    default: [],
    required: true,
    validate: v => Array.isArray(v) && v.length > 0
  },

  branche: {
    type: [String],
    enum: ['رواد','جوالة','دليلات','كشافة','مرشدات','أشبال','زهرات','عصافير'],
    default: [],
    required: true,
    validate: v => Array.isArray(v) && v.length > 0
  },

  // 🆕 Organisateur (fixé par cet écran)
  organizer: { type: String, required: true, default: 'اللجنة الوطنية لتنمية القيادات' },

  isVisible: { type: Boolean, default: false },
  validations: {
    commissioner: {
      isValidated: { type: Boolean, default: false },
      validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      validatedAt: { type: Date, default: null },
    },
    president: {
      isValidated: { type: Boolean, default: false },
      validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      validatedAt: { type: Date, default: null },
    }
  }
}, { timestamps: true });

SessionSchema.index({ title: 1,organizer:1,startDate:1,endDate:1 }, { unique: true });

SessionSchema.pre('save', function (next) {
  if (this.isModified('title') && typeof this.title === 'string') {
    this.title = this.title.trim();
  }
  next();
});

module.exports = mongoose.model('Session', SessionSchema);
