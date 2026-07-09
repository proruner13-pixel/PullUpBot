export type LeaderboardPeriod = "week" | "month" | "all";
export type LeaderboardScope = "global" | "friends" | "challenge";
export type ChallengeRanking =
    | "overall"
    | "pullups"
    | "pushups"
    | "plank"
    | "running";

export interface LeaderboardUser {
    id: string;
    name: string;
    handle: string;
    avatarId: string;
    isFriend: boolean;
    isCurrentUser?: boolean;
    scores: Record<ChallengeRanking, number>;
}
