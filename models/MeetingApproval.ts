import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type MeetingApprovalType = 'video' | 'file' | 'present' | 'screen';
export type MeetingApprovalStatus = 'pending' | 'approved' | 'rejected' | 'used';

export interface IMeetingApproval extends Document {
  meetingId: string;
  type: MeetingApprovalType;
  requesterKey: string;
  requesterName: string;
  requesterEmail: string;
  payload: { itemId?: string; url?: string; path?: string; name?: string; size?: number };
  status: MeetingApprovalStatus;
  createdAt: Date;
  decidedAt?: Date;
  expiresAt: Date;
}

const MeetingApprovalSchema = new Schema<IMeetingApproval>({
  meetingId: { type: String, required: true, index: true },
  type: { type: String, enum: ['video', 'file', 'present', 'screen'], required: true },
  requesterKey: { type: String, required: true },
  requesterName: { type: String, required: true },
  requesterEmail: { type: String, default: '' },
  payload: {
    itemId: String,
    url: String,
    path: String,
    name: String,
    size: Number,
  },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'used'], default: 'pending' },
  decidedAt: Date,
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

MeetingApprovalSchema.index({ meetingId: 1, status: 1, createdAt: -1 });

const MeetingApproval: Model<IMeetingApproval> = mongoose.models.MeetingApproval || mongoose.model<IMeetingApproval>('MeetingApproval', MeetingApprovalSchema);
export default MeetingApproval;
