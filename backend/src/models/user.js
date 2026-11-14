
// models/user.js (CommonJS)

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { normalizeWhatsApp } = require('../utils/whatsapp');

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    nom: {
      type: String,
      required: true,
      trim: true
    },

    prenom: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    idScout: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[0-9]{10}$/
    },

    region: {
      type: String,
      required: true,
      trim: true
    },

    niveau: {
      type: String,
      required: true,
      trim: true
    },

    role: {
      type: String,
      enum: ['user', 'moderator', 'admin', 'trainer'],
      default: 'user',
      required: true
    },

    signatureUrl: {
      type: String,
      default: null
    },

    // Facultatif pour les anciens comptes
    // Obligatoire via les routes register / me/whatsapp
    whatsapp: {
      type: String,
      trim: true,
      default: undefined,
      validate: {
        validator: function (value) {
          if (value === undefined || value === null) {
            return true;
          }

          return normalizeWhatsApp({
            whatsapp: value
          }) === value;
        },
        message: 'Numéro WhatsApp invalide'
      }
    }
  },
  {
    timestamps: true
  }
);

// Index unique sur les numéros renseignés
UserSchema.index(
  { whatsapp: 1 },
  {
    unique: true,
    partialFilterExpression: {
      whatsapp: { $type: 'string' }
    },
    name: 'whatsapp_unique'
  }
);

// Hash du mot de passe
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(
      this.password,
      salt
    );
    next();
  } catch (error) {
    next(error);
  }
});

// Comparaison du mot de passe
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Ne jamais exposer le mot de passe
UserSchema.set('toJSON', {
  transform: (_, ret) => {
    delete ret.password;
    return ret;
  }
});

module.exports = mongoose.model('User', UserSchema);
