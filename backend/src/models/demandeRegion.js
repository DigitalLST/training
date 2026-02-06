// models/RegionSessionRequest.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const TRAINING_LEVELS = [
  "تمهيدية",
  "شارة خشبية",
  "S1",
  "S2",
  "S3",
  "الدراسة الابتدائية"
];

const STATUSES = ["SUBMITTED", "APPROVED", "REJECTED"];

const RegionSessionRequestSchema = new Schema(
  {
    // Mongo already creates _id automatically

    region: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true
    },

    training_levels: {
      type: [String],
      enum: TRAINING_LEVELS,
      required: true,
      index: true
    },
    startDate:   { type: Date,   required: true },
    endDate:     { type: Date,   required: true },
    // Keep it simple: optional, you decide when to fill it
    branche: {
      type: [String],
      default: []
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },

    status: {
      type: String,
      enum: STATUSES,
      default: "SUBMITTED",
      index: true
    },

    // Director name (string) - optional (no special rules)
    director_name: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120
    },

    participants_count: {
      type: Number,
      default:null,
      min: 1
    },

    created_by_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // Link to created Session after approval (optional)
    generated_session_id: {
      type: Schema.Types.ObjectId,
      ref: "Session",
      default: null,
      index: true
    }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

// Useful indexes for your list screens
RegionSessionRequestSchema.index({ region: 1, status: 1, created_at: -1 });
RegionSessionRequestSchema.index({ training_level: 1, status: 1, created_at: -1 });

module.exports = mongoose.model("RegionSessionRequest", RegionSessionRequestSchema);
