import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const schema = new Schema({
  path: { type: String, required: true, unique: true },
  meetingId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  ownerEmail: { type: String, required: true },
  workspace: { type: String, required: true, index: true },
  offset: { type: Number, default: 0 },
  ready: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

type SharedFileData = InferSchemaType<typeof schema>;
const SharedFile = (mongoose.models.SharedFile as Model<SharedFileData>) || mongoose.model('SharedFile', schema);
export default SharedFile;
