const mongoose = require('mongoose');

const ResetTokenSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: true },
  used:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// purge auto après expiration
ResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ResetToken', ResetTokenSchema);
