export type BillingCycle = 'monthly' | 'annual';
export type PlanKey = 'free' | 'pro' | 'business' | 'enterprise';
export type CreditPackKey = 'starter' | 'growth' | 'scale';

export type PlanFeatureKey =
  | 'rooms'
  | 'captions'
  | 'aiNotes'
  | 'recording'
  | 'files'
  | 'livestream'
  | 'whiteboard'
  | 'lms'
  | 'adminControls';

export type BillingPlan = {
  key: PlanKey;
  title: string;
  badge: string;
  description: string;
  audience: string;
  monthlyInr: number | null;
  annualInr: number | null;
  includedCredits: number | null;
  monthlyRooms: number | null;
  maxMeetingMinutes: number | null;
  seats: number | null;
  maxParticipants: number | null;
  storageGb: number | null;
  recommended?: boolean;
  features: Record<PlanFeatureKey, boolean>;
  highlights: string[];
  limits: {
    meetingMinutes: string;
    monthlyRooms: string;
    participants: string;
    seats: string;
    credits: string;
    captions: string;
    summaries: string;
    recordings: string;
    storage: string;
    fileSharing: string;
    livestreams: string;
    whiteboards: string;
    lms: string;
    adminControls: string;
  };
  profit: {
    assumedVariableCostInr: number | null;
    gatewayFeeInr: number | null;
    netBeforeFixedCostsInr: number | null;
    grossMarginPercent: number | null;
  };
};

export type CreditPack = {
  key: CreditPackKey;
  title: string;
  credits: number;
  amountInr: number;
  description: string;
  profit: BillingPlan['profit'];
};

const RAZORPAY_EFFECTIVE_FEE_RATE = 0.0236;
const VARIABLE_COST_PER_CREDIT_INR = 0.18;
const MONTHLY_SUPPORT_RESERVE_INR: Record<Exclude<PlanKey, 'enterprise'>, number> = {
  free: 0,
  pro: 120,
  business: 360,
};

function envNumber(name: string, fallback: number) {
  void name;
  return fallback;
}

function calculateProfit(monthlyPrice: number | null, includedCredits: number | null, planKey?: Exclude<PlanKey, 'enterprise'>) {
  if (monthlyPrice == null || includedCredits == null) {
    return {
      assumedVariableCostInr: null,
      gatewayFeeInr: null,
      netBeforeFixedCostsInr: null,
      grossMarginPercent: null,
    };
  }

  const variableCost = Math.round(includedCredits * VARIABLE_COST_PER_CREDIT_INR);
  const gatewayFee = Math.round(monthlyPrice * RAZORPAY_EFFECTIVE_FEE_RATE);
  const reserve = planKey ? MONTHLY_SUPPORT_RESERVE_INR[planKey] : 0;
  const netBeforeFixedCosts = monthlyPrice - variableCost - gatewayFee - reserve;

  return {
    assumedVariableCostInr: variableCost + reserve,
    gatewayFeeInr: gatewayFee,
    netBeforeFixedCostsInr: netBeforeFixedCosts,
    grossMarginPercent: monthlyPrice > 0 ? Math.round((netBeforeFixedCosts / monthlyPrice) * 100) : null,
  };
}

function calculatedTopUpProfit(amountInr: number, credits: number) {
  const variableCost = Math.round(credits * VARIABLE_COST_PER_CREDIT_INR);
  const gatewayFee = Math.round(amountInr * RAZORPAY_EFFECTIVE_FEE_RATE);
  const netBeforeFixedCosts = amountInr - variableCost - gatewayFee;

  return {
    assumedVariableCostInr: variableCost,
    gatewayFeeInr: gatewayFee,
    netBeforeFixedCostsInr: netBeforeFixedCosts,
    grossMarginPercent: Math.round((netBeforeFixedCosts / amountInr) * 100),
  };
}

const freeCredits = envNumber('FREE_PLAN_MINUTES', 0);
const proCredits = envNumber('PRO_PLAN_MINUTES', 1800);
const businessCredits = envNumber('PREMIUM_PLAN_MINUTES', 6000);

export const BILLING_PLANS: BillingPlan[] = [
  {
    key: 'free',
    title: 'Free',
    badge: 'Start',
    description: 'A generous no-cost workspace for classes, catch-ups, and trying Melanam.',
    audience: 'For students, first meetings, and teams getting started.',
    monthlyInr: 0,
    annualInr: 0,
    includedCredits: freeCredits,
    monthlyRooms: null,
    maxMeetingMinutes: 180,
    seats: 1,
    maxParticipants: 25,
    storageGb: 1,
    features: {
      rooms: true,
      captions: false,
      aiNotes: false,
      recording: false,
      files: true,
      livestream: false,
      whiteboard: true,
      lms: true,
      adminControls: false,
    },
    highlights: ['3-hour meetings at no cost', '25 people can join each meeting', 'Excalidraw whiteboard included', 'File, media, and document sharing'],
    limits: {
      meetingMinutes: '3 hours per room',
      monthlyRooms: 'Unlimited rooms',
      participants: '25 participants per meeting',
      seats: '1 workspace seat',
      credits: 'No paid credits included',
      captions: 'Upgrade for captions',
      summaries: 'Not included',
      recordings: 'Not included',
      storage: '1 GB workspace storage',
      fileSharing: '100 MB per file, media, or document upload',
      livestreams: 'Not included',
      whiteboards: '1 Excalidraw board per meeting',
      lms: 'Student and instructor basics',
      adminControls: 'Not included',
    },
    profit: calculateProfit(0, freeCredits, 'free'),
  },
  {
    key: 'pro',
    title: 'Pro',
    badge: 'Most teams',
    description: 'The core paid plan for serious meetings, AI notes, recordings, and follow-up work.',
    audience: 'For creators, instructors, coaches, and small teams.',
    monthlyInr: 999,
    annualInr: 9990,
    includedCredits: proCredits,
    monthlyRooms: null,
    maxMeetingMinutes: 1440,
    seats: 25,
    maxParticipants: 150,
    storageGb: 50,
    recommended: true,
    features: {
      rooms: true,
      captions: true,
      aiNotes: true,
      recording: true,
      files: true,
      livestream: false,
      whiteboard: true,
      lms: true,
      adminControls: false,
    },
    highlights: ['24-hour meetings', 'AI summaries and action items', 'Live captions and recording', '1 GB file, media, and document uploads'],
    limits: {
      meetingMinutes: '24 hours per room',
      monthlyRooms: 'Unlimited rooms',
      participants: '150 participants per meeting',
      seats: '25 workspace seats',
      credits: `${proCredits} credits per month`,
      captions: 'Live captions and transcript credits',
      summaries: 'AI meeting notes included',
      recordings: 'Local recording and replay workflow',
      storage: '50 GB workspace storage',
      fileSharing: '1 GB per file, media, or document upload',
      livestreams: 'Upgrade to Business',
      whiteboards: 'Unlimited Excalidraw boards',
      lms: 'Full student and instructor LMS',
      adminControls: 'Basic member controls',
    },
    profit: calculateProfit(999, proCredits, 'pro'),
  },
  {
    key: 'business',
    title: 'Business',
    badge: 'Scale',
    description: 'Higher limits plus admin controls for organizations that run classes and client meetings every day.',
    audience: 'For institutes, agencies, and operating teams.',
    monthlyInr: 2999,
    annualInr: 29990,
    includedCredits: businessCredits,
    monthlyRooms: null,
    maxMeetingMinutes: 2880,
    seats: 100,
    maxParticipants: 500,
    storageGb: 250,
    features: {
      rooms: true,
      captions: true,
      aiNotes: true,
      recording: true,
      files: true,
      livestream: true,
      whiteboard: true,
      lms: true,
      adminControls: true,
    },
    highlights: ['48-hour meetings', 'YouTube livestreaming', 'Advanced AI notes and admin controls', '5 GB file, media, and document uploads'],
    limits: {
      meetingMinutes: '48 hours per room',
      monthlyRooms: 'Unlimited rooms',
      participants: '500 participants per meeting',
      seats: '100 workspace seats',
      credits: `${businessCredits} credits per month`,
      captions: 'Team caption credits',
      summaries: 'Advanced AI notes and tasks',
      recordings: 'Recording workspace and replay workflow',
      storage: '250 GB workspace storage',
      fileSharing: '5 GB per file, media, or document upload',
      livestreams: 'YouTube livestreaming included',
      whiteboards: 'Unlimited Excalidraw boards and templates',
      lms: 'Full LMS plus organization controls',
      adminControls: 'Plan, member, and policy controls',
    },
    profit: calculateProfit(2999, businessCredits, 'business'),
  },
  {
    key: 'enterprise',
    title: 'Enterprise',
    badge: 'Custom',
    description: 'Custom limits, private deployment, SSO, security review, and dedicated support.',
    audience: 'For large organizations and compliance-sensitive deployments.',
    monthlyInr: null,
    annualInr: null,
    includedCredits: null,
    monthlyRooms: null,
    maxMeetingMinutes: null,
    seats: null,
    maxParticipants: null,
    storageGb: null,
    features: {
      rooms: true,
      captions: true,
      aiNotes: true,
      recording: true,
      files: true,
      livestream: true,
      whiteboard: true,
      lms: true,
      adminControls: true,
    },
    highlights: ['Custom credits', 'SSO and audit support', 'Dedicated onboarding', 'Private deployment options'],
    limits: {
      meetingMinutes: 'Custom',
      monthlyRooms: 'Custom',
      participants: 'Custom',
      seats: 'Custom',
      credits: 'Custom',
      captions: 'Custom',
      summaries: 'Custom',
      recordings: 'Custom',
      storage: 'Custom',
      fileSharing: 'Custom',
      livestreams: 'Custom',
      whiteboards: 'Custom',
      lms: 'Custom',
      adminControls: 'Custom',
    },
    profit: calculateProfit(null, null),
  },
];

export const CREDIT_PACKS: CreditPack[] = [
  {
    key: 'starter',
    title: 'Starter credits',
    credits: 300,
    amountInr: 299,
    description: 'For a few extra AI summaries, recordings, or caption sessions.',
    profit: calculatedTopUpProfit(299, 300),
  },
  {
    key: 'growth',
    title: 'Growth credits',
    credits: 1200,
    amountInr: 999,
    description: 'Best value for weekly classes and recurring client calls.',
    profit: calculatedTopUpProfit(999, 1200),
  },
  {
    key: 'scale',
    title: 'Scale credits',
    credits: 3600,
    amountInr: 2499,
    description: 'A larger reserve for busy teams and event weeks.',
    profit: calculatedTopUpProfit(2499, 3600),
  },
];

export const BILLING_PLAN_MAP = Object.fromEntries(BILLING_PLANS.map((plan) => [plan.key, plan])) as Record<PlanKey, BillingPlan>;
export const CREDIT_PACK_MAP = Object.fromEntries(CREDIT_PACKS.map((pack) => [pack.key, pack])) as Record<CreditPackKey, CreditPack>;

export function getPlanPrice(planKey: PlanKey, cycle: BillingCycle) {
  const plan = BILLING_PLAN_MAP[planKey];
  if (!plan) return null;
  return cycle === 'annual' ? plan.annualInr : plan.monthlyInr;
}

export function formatInr(value: number | null) {
  if (value == null) return 'Custom';
  return `Rs. ${new Intl.NumberFormat('en-IN').format(value)}`;
}

export function getAnnualSavings(planKey: PlanKey) {
  const plan = BILLING_PLAN_MAP[planKey];
  if (!plan?.monthlyInr || !plan?.annualInr) return 0;
  return plan.monthlyInr * 12 - plan.annualInr;
}

export function getIncludedCredits(planKey: PlanKey) {
  return BILLING_PLAN_MAP[planKey]?.includedCredits ?? 0;
}

export function getCreditPackAmount(packKey: CreditPackKey) {
  return CREDIT_PACK_MAP[packKey]?.amountInr ?? null;
}

export function getPayAsYouGoRatePerHour() {
  return envNumber('PAYG_RATE_INR_PER_HOUR', 59);
}

export function getPlanRank(planKey: PlanKey) {
  const ranks: Record<PlanKey, number> = {
    free: 0,
    pro: 1,
    business: 2,
    enterprise: 3,
  };

  return ranks[planKey] ?? 0;
}
