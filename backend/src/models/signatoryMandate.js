// models/signatoryMandate.js
const mongoose = require('mongoose');

const SignatoryMandateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // type de mandat
    type: {
      type: String,
      enum: [
        'cn_president',        // Président comité national
        'cn_commissioner',     // Commissaire national
        'regional_president',  // Président comité régional
      ],
      required: true,
      index: true,
    },

    // pour les mandats régionaux uniquement
    region: {
      type: String,
      required: function () {
        return this.type === 'regional_president';
      },
    },

    // période de mandat
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }, // null = mandat en cours

    // optionnel : titres pour les certificats (FR/EN)
    titleFr: { type: String },
    titleEn: { type: String },
  },
  { timestamps: true }
);

// 1 seul mandat "actif" (endDate: null) par type + région
// - pour les types nationaux, region sera undefined / non renseigné
// - pour régional, region = code région
SignatoryMandateSchema.index(
  { type: 1, region: 1, endDate: 1 },
  {
    unique: true,
    partialFilterExpression: { endDate: null },
  }
);

module.exports = mongoose.model('SignatoryMandate', SignatoryMandateSchema);
