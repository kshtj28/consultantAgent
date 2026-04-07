import { BroadAreaProgress, ReportRecord, DashboardStats } from '../fixtures/api-helpers';

export interface SessionData {
    sessionId: string;
    progress: BroadAreaProgress[];
    status: 'in_progress' | 'completed';
    transcript: Array<{
        subAreaId: string;
        questionId: string;
        question: string;
        answer: string | string[] | number | boolean;
        strategy: string;
    }>;
}

export interface ReportData {
    gapReports: ReportRecord[];
    consolidatedReport: ReportRecord | null;
    metrics: DashboardStats | null;
}

export interface InterviewWorld {
    apiToken: string;
    userRole: string;
    sessions: Record<string, SessionData>;
    reports: Record<string, ReportData>;
    currentStrategy: string;
    currentPage: string;
    broadAreaIds: string[];
    lastApiResponse: Response | null;
    lastApiStatus: number;
}

export function createWorld(): InterviewWorld {
    return {
        apiToken: '',
        userRole: '',
        sessions: {},
        reports: {},
        currentStrategy: '',
        currentPage: '',
        broadAreaIds: [],
        lastApiResponse: null,
        lastApiStatus: 0,
    };
}
