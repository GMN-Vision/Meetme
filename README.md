# Melanam - SaaS-Grade Video Conferencing Platform

A video conferencing application built with Next.js 14, TypeScript, Tailwind CSS, NextAuth email authentication, MongoDB, and Jitsi Meet.

Everyone uses the same email sign-in and account type. New users are registered through the same form. Open `/meetings` to start or join a call, `/meetings/recordings` for private and shared recordings, and `/meetings/notes` for AI summaries and transcripts. Recording, file sharing, captions, screen sharing, chat, whiteboards, and polls remain available under the existing plan limits.

The app focuses on video meetings and the records created from them. Existing dashboard bookmarks redirect to Meetings. Existing non-admin account roles normalize to `user` on their next session refresh; internal platform administration remains separate. Existing meeting files, recordings, and database collections remain intact.

## ðŸš€ Features

- âœ… One email sign-in for new and existing accounts
- âœ… Create and manage video meetings
- âœ… Join meetings via ID
- âœ… HD video conferencing with Jitsi
- âœ… Screen sharing
- âœ… Real-time chat
- âœ… Meeting recordings
- âœ… Responsive design with modern glass UI
- âœ… MongoDB database integration
- âœ… Fully TypeScript typed
- âœ… Zero external UI libraries (pure Tailwind CSS)

## ðŸ§± Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **Tailwind CSS** (styling)
- **Zustand** (state management)
- **NextAuth** (email magic links)

### Backend
- **Next.js API Routes**
- **MongoDB** (database)
- **Mongoose** (ODM)
- **Jitsi Meet** (video conferencing)

## ðŸ“ Project Structure

```
melanam/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â”œâ”€â”€ create-meeting/route.ts
â”‚   â”‚   â”œâ”€â”€ get-meeting/route.ts
â”‚   â”‚   â””â”€â”€ get-meetings/route.ts
â”‚   â”œâ”€â”€ room/
â”‚   â”‚   â””â”€â”€ [id]/page.tsx
â”‚   â”œâ”€â”€ meetings/page.tsx
â”‚   â”œâ”€â”€ sign-in/page.tsx
â”‚   â”œâ”€â”€ sign-up/page.tsx
â”‚   â”œâ”€â”€ page.tsx
â”‚   â”œâ”€â”€ layout.tsx
â”‚   â””â”€â”€ globals.css
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ Navbar.tsx
â”‚   â”œâ”€â”€ MeetingCard.tsx
â”‚   â”œâ”€â”€ JoinModal.tsx
â”‚   â”œâ”€â”€ Loader.tsx
â”‚   â””â”€â”€ AuthProvider.tsx
â”œâ”€â”€ hooks/
â”‚   â””â”€â”€ useScript.ts
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ auth-options.ts
â”‚   â”œâ”€â”€ auth.ts
â”‚   â””â”€â”€ db.ts
â”œâ”€â”€ models/
â”‚   â”œâ”€â”€ User.ts
â”‚   â””â”€â”€ Meeting.ts
â”œâ”€â”€ store/
â”‚   â””â”€â”€ useUserStore.ts
â”œâ”€â”€ middleware.ts
â”œâ”€â”€ tsconfig.json
â”œâ”€â”€ tailwind.config.ts
â”œâ”€â”€ postcss.config.js
â”œâ”€â”€ next.config.js
â”œâ”€â”€ package.json
â”œâ”€â”€ .env.local
â””â”€â”€ .gitignore
```

## âš™ï¸ Installation & Setup

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- SMTP credentials for sign-in emails
- Jitsi domain (or use meet.jit.si for testing)

### Step 1: Clone & Install Dependencies

```bash
# Navigate to project directory
cd melanam

# Install dependencies
npm install
```

### Step 2: Setup Environment Variables

Create `.env.local` file in the root directory:

```env
# Email Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-random-secret
EMAIL_TRANSPORT=smtp
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587
EMAIL_USER=your-smtp-user
EMAIL_PASS=your-smtp-password
EMAIL_FROM=meetings@example.com

# Jitsi Configuration
NEXT_PUBLIC_JITSI_DOMAIN=meet.myapp.com

# MongoDB
MONGODB_URI=mongodb://localhost:27017/melanam
```

#### Configure sign-in email:
Use your SMTP provider settings above. For local development only, `EMAIL_TRANSPORT=console` logs the magic link on the server instead of sending email.

#### MongoDB Setup:
**Option A: Local MongoDB**
```bash
# Install MongoDB (macOS with Homebrew)
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# MongoDB will run on mongodb://localhost:27017
```

**Option B: MongoDB Atlas (Cloud)**
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free account
3. Create a new cluster
4. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/melanam`
5. Update `.env.local` with the connection string

#### Jitsi Domain:
**Option A: Public Jitsi (for testing)**
- Use `meet.jit.si` in `.env.local`
- Note: This is public and not suitable for production

**Option B: Self-hosted Jitsi (production)**
- Deploy Jitsi on your own server
- Follow: https://github.com/jitsi/jitsi-meet/blob/master/doc/manual-install.md
- Update `NEXT_PUBLIC_JITSI_DOMAIN` with your domain

### Step 3: Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## ðŸ” Authentication Flow

### Sign in or create an account
1. Open `/sign-in` and enter your email address.
2. Open the secure, single-use link sent to your inbox.
3. Continue to `/meetings`, or back to the invite you were opening.

`/sign-up` redirects to this same flow. No account-role selection is required. Meetings, recordings, and notes require sign-in; invitees can join eligible rooms as guests.

## ðŸŽ¥ How to Use

### Create a Meeting
1. Sign in or sign up
2. Go to Dashboard (`/meetings`)
3. Click "Create New Meeting"
4. Enter meeting title and description
5. Click "Create & Join"
6. Jitsi will open with your meeting room

### Join a Meeting
1. Sign in
2. Go to Dashboard
3. Click "Join Meeting"
4. Enter Meeting ID
5. Click "Join"

### In a Meeting
- ðŸŽ¤ Toggle microphone
- ðŸ“¹ Toggle camera
- ðŸ–¥ï¸ Share screen
- ðŸ’¬ Send messages
- ðŸ“ Annotations
- ðŸ”´ Record (if enabled)

## ðŸ“Š Database Models

### User Model
```typescript
{
  _id: ObjectId
  name: string
  email: string (unique)
  firebaseId: string (unique)
  createdAt: Date
  updatedAt: Date
}
```

### Meeting Model
```typescript
{
  _id: ObjectId
  meetingId: string (unique)
  hostId: string
  hostEmail: string
  title: string
  description: string
  createdAt: Date
  updatedAt: Date
}
```

## ðŸ”Œ API Routes

### POST `/api/create-meeting`
Create a new meeting.

**Request:**
```json
{
  "title": "Team Standup",
  "description": "Daily sync",
  "hostEmail": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "meetingId": "abc123xyz",
  "meeting": { /* meeting object */ }
}
```

### GET `/api/get-meeting?id={meetingId}`
Get meeting details.

**Response:**
```json
{
  "success": true,
  "meeting": { /* meeting object */ }
}
```

### GET `/api/get-meetings`
Get all meetings for current user (paginated).

**Response:**
```json
{
  "success": true,
  "meetings": [ /* array of meetings */ ]
}
```

## ðŸ§ª Testing the Complete Flow

### Scenario 1: Create and Join a Meeting
```bash
# 1. Start the app
npm run dev

# 2. Open http://localhost:3000

# 3. Sign up with test email
# - Go to /sign-up
# - Enter: test@example.com / password123
# - Click Sign Up

# 4. Create meeting on dashboard
# - Click "Create New Meeting"
# - Enter title: "Test Meeting"
# - Click "Create & Join"
# - Jitsi opens in fullscreen

# 5. Grant permissions
# - Allow camera and microphone access
# - See your video stream

# 6. Test features
# - Toggle camera/microphone
# - Share screen
# - Send chat messages
```

### Scenario 2: Join Existing Meeting
```bash
# 1. Create meeting (as user 1)
# 2. Copy the Meeting ID from URL bar
# 3. Sign in as different user
# 4. Click "Join Meeting" 
# 5. Paste Meeting ID
# 6. Click "Join"
# 7. Both users can see each other
```

## ðŸš¨ Troubleshooting

### Issue: "Meeting not found"
**Solution:** Ensure MongoDB is running and MONGODB_URI is correct
```bash
# Check MongoDB status
mongosh # or mongo for older versions
# Should connect without errors
```

### Issue: Jitsi not loading
**Solution:** Check if Jitsi domain is accessible
```bash
# Test Jitsi domain
curl -I https://meet.jit.si/external_api.js
# Should return 200 status
```

### Issue: Sign-in email does not arrive
**Solution:** Check the SMTP settings, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` in `.env.local`. Check your spam folder and server logs for delivery errors.

### Issue: "Cannot find module '@clerk/nextjs'"
**Solution:** Reinstall dependencies
```bash
rm -rf node_modules package-lock.json
npm install
```

## ðŸ—ï¸ Building for Production

### 1. Build the application
```bash
npm run build
```

### 2. Start production server
```bash
npm start
```

### 3. Deploy to Vercel (Recommended)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts to connect GitHub and deploy
```

### 4. Environment Variables on Production
Set these in your hosting platform (Vercel, Heroku, etc.):
- `NEXTAUTH_URL` and `NEXTAUTH_SECRET`
- SMTP settings: `EMAIL_TRANSPORT`, `EMAIL_SERVER_HOST`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM`
- `NEXT_PUBLIC_JITSI_DOMAIN`
- `MONGODB_URI`

## ðŸ“ˆ Performance Optimizations

- âœ… Dynamic imports for Jitsi script
- âœ… Image optimization with Next.js
- âœ… CSS-in-JS with Tailwind CSS
- âœ… Mongoose connection pooling
- âœ… Client-side state with Zustand
- âœ… API route caching

## ðŸ” Security Features

- âœ… NextAuth email authentication
- âœ… Middleware route protection
- âœ… Environment variable encryption
- âœ… CORS configured
- âœ… MongoDB injection prevention

## ðŸ“ License

MIT License - feel free to use this project for personal or commercial use.

## ðŸ¤ Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

## ðŸ“ž Support

For issues and questions:
1. Check troubleshooting section above
2. Review the email authentication setup above
3. Review Jitsi docs: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-start
4. Check MongoDB docs: https://docs.mongodb.com/

---

**Happy connecting! ðŸŽ‰**

