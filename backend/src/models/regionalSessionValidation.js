const mongoose = require('mongoose');

const RegionalFormationProgressSchema = new mongoose.Schema(
  {
    formation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Formation',
      required: true,
    },

    formationName: {
      type: String,
      default: '',
    },

    niveau: {
      type: String,
      default: '',
    },

    traineesCount: {
      type: Number,
      default: 0,
    },

    validatedCount: {
      type: Number,
      default: 0,
    },

    isValidated: {
      type: Boolean,
      default: false,
    },

    errorCode: {
      type: String,
      enum: ['NO_AFFECTATIONS', 'PARTIAL_VALIDATION', null],
      default: null,
    },

    errorMessage: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const RegionalSessionValidationSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      unique: true,
      index: true,
    },

    totalFormations: {
      type: Number,
      default: 0,
    },

    validatedFormations: {
      type: Number,
      default: 0,
    },

    isCompleted: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ['draft', 'in_progress', 'completed', 'error'],
      default: 'draft',
    },

    formations: {
      type: [RegionalFormationProgressSchema],
      default: [],
    },

    lastCheckedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegionalSessionValidation',RegionalSessionValidationSchema);