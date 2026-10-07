import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

// Durable, server-authenticated room membership; presence heartbeats are ephemeral.
const schema = new Schema({
  meetingId: { type: String, required: true },
  userEmail: { type: String, required: true, lowercase: true },
}, { timestamps: true });
schema.index({ meetingId: 1, userEmail: 1 }, { unique: true });
const MeetingMember: Model<InferSchemaType<typeof schema>> = mongoose.models.MeetingMember || mongoose.model('MeetingMember', schema);
export default MeetingMember;
