import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IMeetingParticipant extends Document {
  meetingId: string;
  participantKey: string;
  userEmail?: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingParticipantSchema = new Schema<IMeetingParticipant>(
  {
    meetingId: { type: String, required: true, index: true },
    participantKey: { type: String, required: true },
    userEmail: { type: String, lowercase: true, index: true },
    lastSeenAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

MeetingParticipantSchema.index({ meetingId: 1, participantKey: 1 }, { unique: true });
MeetingParticipantSchema.index({ meetingId: 1, lastSeenAt: 1 });
MeetingParticipantSchema.index({ meetingId: 1, userEmail: 1, lastSeenAt: 1 });

const MeetingParticipant: Model<IMeetingParticipant> =
  mongoose.models.MeetingParticipant ||
  mongoose.model<IMeetingParticipant>('MeetingParticipant', MeetingParticipantSchema);

export default MeetingParticipant;
