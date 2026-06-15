export interface CodexTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
}

export type StorageMode = "keychain" | "plaintext";

export interface CodexQuotaSummary {
  hourlyPercentage: number;
  hourlyWindowPresent?: boolean;
  hourlyRequestsLeft?: number;
  hourlyRequestsLimit?: number;
  hourlyWindowMinutes?: number;
  hourlyResetTime?: number;
  weeklyPercentage: number;
  weeklyWindowPresent?: boolean;
  weeklyRequestsLeft?: number;
  weeklyRequestsLimit?: number;
  weeklyWindowMinutes?: number;
  weeklyResetTime?: number;
  codeReviewPercentage: number;
  codeReviewWindowPresent?: boolean;
  codeReviewRequestsLeft?: number;
  codeReviewRequestsLimit?: number;
  codeReviewWindowMinutes?: number;
  codeReviewResetTime?: number;
  monthlyPercentage?: number;
  monthlyWindowPresent?: boolean;
  monthlyRequestsLeft?: number;
  monthlyRequestsLimit?: number;
  monthlyWindowMinutes?: number;
  monthlyResetTime?: number;
  additionalRateLimits?: CodexAdditionalQuotaLimit[];
  credits?: CodexCreditsSummary;
  rawData?: unknown;
}

export interface CodexAdditionalQuotaLimit {
  limitName: string;
  meteredFeature?: string;
  hourlyPercentage?: number;
  hourlyWindowPresent?: boolean;
  hourlyRequestsLeft?: number;
  hourlyRequestsLimit?: number;
  hourlyWindowMinutes?: number;
  hourlyResetTime?: number;
  weeklyPercentage?: number;
  weeklyWindowPresent?: boolean;
  weeklyRequestsLeft?: number;
  weeklyRequestsLimit?: number;
  weeklyWindowMinutes?: number;
  weeklyResetTime?: number;
}

export interface CodexCreditsSummary {
  hasCredits: boolean;
  unlimited: boolean;
  overageLimitReached: boolean;
  balance: string;
  approxLocalMessages: unknown[];
  approxCloudMessages: unknown[];
}

export interface CodexAccountRecord {
  id: string;
  email: string;
  accountId?: string;
  storageKey?: string;
  credentialsMissing?: boolean;
  planType?: string;
  isActive: boolean;
  tokens?: CodexTokens;
  quotaSummary?: CodexQuotaSummary;
  lastQuotaAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type StoredAccountRecord = Omit<CodexAccountRecord, "tokens">;

export interface SharedCodexAccountJson {
  email?: string;
  id?: string;
  tokens?: CodexTokens;
}
