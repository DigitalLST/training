const { Schema, model } = require('mongoose');

const CentreSchema = new Schema({
  title:       { type: String, required: true },
  region:       { type: String, required: true },


}, { timestamps: true });
CentreSchema.index({ title: 1 }, { unique: true });
CentreSchema.pre('save', function (next) {
  if (this.isModified('title') && typeof this.title === 'string') {
    this.title = this.title.trim();
  }
  next();
});

module.exports = model('Centre', CentreSchema);