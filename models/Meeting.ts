import mongoose, { Schema, Document, Model } from 'mongoose';

interface ISpeaker {
  speakerId: string;
  name: string;
  color: string;
}

interface ITranscript {
  text: string;
  timestamp: number;
  speakerId: string;
  speaker: string;
}

interface IActionItem {
  item: string;
  owner?: string;
}

interface ITranslatedCaption {
  language: string;
  text: string;
  timestamp: number;
  speakerId: string;
}

interface IMeeting extends Document {
  meetingId: string;
  hostId: string;
  hostEmail: string;
  title: string;
  description?: string;
  isPrivate: boolean;
  chatEnabled: boolean;
  recordingEnabled: boolean;
  endedAt?: Date | null;
  joinCount: number;
  activeSessionStartedAt?: Date | null;
  activeSessionEndsAt?: Date | null;
  planSnapshot?: 'free' | 'pro' | 'business' | 'enterprise';
  maxParticipants?: number | null;
  maxMeetingMinutes?: number | null;
  lastSessionAt?: Date;
  lastRecordingAt?: Date;
  recorded?: boolean;
  recordedBy?: string;
  recordedByEmail?: string;
  recordingDuration?: string;
  recordingDurationSeconds?: number;
  recordingDate?: string;
  recordingStatus?: string;
  // AI Assistant fields
  aiEnabled?: boolean;
  aiLanguage?: string;
  transcript?: ITranscript[];
  summary?: string;
  keyNotes?: string[];
  keyDecisions?: string[];
  actionItems?: IActionItem[];
  translatedCaptions?: ITranslatedCaption[];
  speakerLabels?: ISpeaker[];
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    hostId: {
      type: String,
      required: true,
    },
    hostEmail: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    chatEnabled: {
      type: Boolean,
      default: true,
    },
    recordingEnabled: {
      type: Boolean,
      default: true,
    },
    joinCount: {
      type: Number,
      default: 0,
    },
    endedAt: { type: Date, default: null },
    activeSessionStartedAt: {
      type: Date,
      default: null,
    },
    activeSessionEndsAt: {
      type: Date,
      default: null,
    },
    planSnapshot: {
      type: String,
      enum: ['free', 'pro', 'business', 'enterprise'],
      default: 'free',
    },
    maxParticipants: {
      type: Number,
      default: null,
    },
    maxMeetingMinutes: {
      type: Number,
      default: null,
    },
    lastSessionAt: {
      type: Date,
      default: null,
    },
    lastRecordingAt: {
      type: Date,
      default: null,
    },
    recorded: {
      type: Boolean,
      default: false,
    },
    recordedBy: {
      type: String,
      default: '',
    },
    recordedByEmail: {
      type: String,
      default: '',
    },
    recordingDuration: {
      type: String,
      default: '',
    },
    recordingDurationSeconds: {
      type: Number,
      default: 0,
    },
    recordingDate: {
      type: String,
      default: '',
    },
    recordingStatus: {
      type: String,
      default: '',
    },
    aiEnabled: {
      type: Boolean,
      default: false,
    },
    aiLanguage: {
      type: String,
      default: 'en',
    },
    transcript: [
      {
        text: String,
        timestamp: Number,
        speakerId: String,
        speaker: String,
      },
    ],
    summary: {
      type: String,
      default: '',
    },
    keyNotes: [String],
    keyDecisions: [String],
    actionItems: [
      {
        item: String,
        owner: String,
      },
    ],
    translatedCaptions: [
      {
        language: String,
        text: String,
        timestamp: Number,
        speakerId: String,
      },
    ],
    speakerLabels: [
      {
        speakerId: String,
        name: String,
        color: String,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Meeting: Model<IMeeting> =
  mongoose.models.Meeting || mongoose.model<IMeeting>('Meeting', MeetingSchema);

export default Meeting;
