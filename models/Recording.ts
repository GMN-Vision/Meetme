import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const schema = new Schema({
  recordingId: { type: String, required: true, unique: true },
  meetingId: { type: String, required: true, index: true },
  hostEmail: { type: String, required: true, lowercase: true, index: true },
  title: { type: String, required: true },
  scopeKey: { type: String, required: true, index: true },
  // Partial unique indexes serialize quota reservation across processes/rooms.
  activeScope: String,
  activeMeeting: String,
  month: { type: String, required: true },
  status: { type: String, enum: ['starting', 'recording', 'processing', 'ready', 'failed', 'expired'], default: 'starting' },
  startedAt: Date,
  stoppedAt: Date,
  maxDurationSeconds: { type: Number, required: true },
  maxBytes: { type: Number, required: true },
  durationSeconds: { type: Number, default: 0 },
  sizeBytes: { type: Number, default: 0 },
  retentionDays: { type: Number, required: true },
  expiresAt: Date,
  storagePath: String,
  sharedAt: Date,
  sharedWith: { type: [String], default: [], index: true },
  error: { type: String, default: '' },
}, { timestamps: true });
schema.index({ activeScope: 1 }, { unique: true, partialFilterExpression: { activeScope: { $type: 'string' } } });
schema.index({ activeMeeting: 1 }, { unique: true, partialFilterExpression: { activeMeeting: { $type: 'string' } } });
schema.index({ scopeKey: 1, month: 1 });
export type RecordingDocument = InferSchemaType<typeof schema>;
const Recording: Model<RecordingDocument> = mongoose.models.Recording || mongoose.model('Recording', schema);
export default Recording;
