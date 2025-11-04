// models/session.js
const { Schema, model } = require('mongoose');

const SessionSchema = new Schema({
  title:       { type: String, required: true },
  startDate:   { type: Date,   required: true },
  endDate:     { type: Date,   required: true },
  inscriptionStartDate: { type: Date, required: true },
  inscriptionEndDate:   { type: Date, required: true },

  trainingLevels: {
    type: [String],
    enum: ['شارة خشبية', 'تمهيدية'],
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

  isVisible: { type: Boolean, default: false }
}, { timestamps: true });

SessionSchema.index({ title: 1 }, { unique: true });

SessionSchema.pre('save', function (next) {
  if (this.isModified('title') && typeof this.title === 'string') {
    this.title = this.title.trim();
  }
  next();
});

module.exports = model('Session', SessionSchema);
