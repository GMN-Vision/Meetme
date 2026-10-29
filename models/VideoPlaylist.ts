import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVideoPlaylistItem {
  id: string;
  url: string;
  title: string;
  addedBy?: string;
  addedAt: Date;
  playedAt?: Date | null;
}

export interface IVideoPlaylist extends Document {
  meetingId: string;
  items: IVideoPlaylistItem[];
  currentIndex: number | null;
  playing: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlaylistItemSchema = new Schema<IVideoPlaylistItem>(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    title: { type: String, default: '' },
    addedBy: { type: String, default: '' },
    addedAt: { type: Date, default: Date.now },
    playedAt: { type: Date, default: null },
  },
  { _id: false }
);

const VideoPlaylistSchema = new Schema<IVideoPlaylist>(
  {
    meetingId: { type: String, required: true, unique: true, index: true },
    items: { type: [PlaylistItemSchema], default: [] },
    currentIndex: { type: Number, default: null },
    playing: { type: Boolean, default: false },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

const VideoPlaylist: Model<IVideoPlaylist> =
  mongoose.models.VideoPlaylist ||
  mongoose.model<IVideoPlaylist>('VideoPlaylist', VideoPlaylistSchema);

export default VideoPlaylist;
