import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const line = new Schema({
  text: { type: String, required: true },
  timestamp: { type: Number, required: true },
  speakerId: String,
  speaker: String,
}, { _id: false });

const schema = new Schema({
  meetingId: { type: String, required: true, unique: true },
  hostEmail: { type: String, required: true, lowercase: true, index: true },
  title: { type: String, required: true },
  lines: { type: [line], default: [] },
  completedAt: { type: Date, default: null },
  sharedAt: Date,
  sharedWith: { type: [String], default: [], index: true },
}, { timestamps: true });

type MeetingTranscriptDocument = InferSchemaType<typeof schema>;
const MeetingTranscript: Model<MeetingTranscriptDocument> = mongoose.models.MeetingTranscript || mongoose.model('MeetingTranscript', schema);
export default MeetingTranscript;
