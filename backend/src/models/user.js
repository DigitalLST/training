// models/user.js (CommonJS)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // ou bcryptjs, mais le même partout

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    nom:      { type: String, required: true, trim: true },
    prenom:   { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    idScout:  { type: String, required: true, unique: true, trim: true, match: /^[0-9]{10}$/ },
    region:   { type: String, required: true, trim: true },
    niveau:   { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.set('toJSON', {
  transform: (_, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
