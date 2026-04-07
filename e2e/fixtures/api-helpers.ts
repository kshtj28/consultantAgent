const API = 'http://localhost:3001';

export interface StartSessionResponse {
    sessionId: string;
    message: string;
    question: QuestionResponse;
    progress: BroadAreaProgress[];
    currentSubArea: string;
    selectedBroadAreas: string[];
}

export interface QuestionResponse {
    id: string;
    question: string;
    type: 'single_choice' | 'multi_choice' | 'scale' | 'open_ended' | 'yes_no';
    options?: string[];
    mode: string;
    categoryId: string;
    aiConfident?: boolean;
}

export interface AnswerPayload {
    questionId: string;
    question: string;
    answer: string | string[] | number | boolean;
    type: string;
    mode: string;
    subAreaId: string;
    aiConfident?: boolean;
}

export interface AnswerResponse {
    progress: BroadAreaProgress[];
    currentSubArea: string;
    completed?: boolean;
    nextQuestion?: QuestionResponse;
}

export interface SubAreaCoverage {
    subAreaId: string;
    name: string;
    questionsAnswered: number;
    aiConfident: boolean;
    status: 'not_started' | 'in_progress' | 'covered';
}

export interface BroadAreaProgress {
    broadAreaId: string;
    name: string;
    order: number;
    subAreas: SubAreaCoverage[];
    overallStatus: 'not_started' | 'in_progress' | 'covered';
}

export interface ReportRecord {
    reportId: string;
    name: string;
    type: string;
    sessionId: string;
    status: 'generating' | 'ready' | 'failed';
    createdAt: string;
    broadAreaId?: string;
    content?: any;
}

export interface DashboardStats {
    totalSessions: number;
    completedSessions: number;
    criticalIssues: number;
    criticalIssuesTrend: 'up' | 'down' | 'stable';
    discoveryPct: number;
    gapSeverity: string;
    avgRisk: number;
    maxRisk: number;
    automationPct: number;
    automationDelta: number;
    automationTrend: 'up' | 'down' | 'stable';
    estCompletion: string;
}

export interface BroadAreaConfig {
    id: string;
    name: string;
    description: string;
    order: number;
    icon: string;
    subAreas: Array<{ id: string; name: string; description: string }>;
}

async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await fetch(url, options);
        if (response.status === 503) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            lastError = new Error(`503 Service Unavailable after ${attempt + 1} attempts`);
            continue;
        }
        return response;
    }
    throw lastError || new Error('fetchWithRetry exhausted');
}

export class InterviewApiClient {
    constructor(
        private token: string,
        private baseUrl: string = API,
    ) {}

    private headers(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
        };
    }

    static async login(
        username = 'admin',
        password = 'admin',
    ): Promise<{ token: string; user: any }> {
        const res = await fetch(`${API}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status}`);
        return res.json();
    }

    async getBroadAreas(): Promise<BroadAreaConfig[]> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/categories/list`,
            { headers: this.headers() },
        );
        const data = await res.json();
        return data.broadAreas;
    }

    async setDomain(domainId: string): Promise<void> {
        await fetchWithRetry(`${this.baseUrl}/api/interview/config/domain`, {
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify({ domainId }),
        });
    }

    async startSession(
        depth: string,
        broadAreaIds: string[],
    ): Promise<StartSessionResponse> {
        const res = await fetchWithRetry(`${this.baseUrl}/api/interview/start`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({
                userId: 'e2e-test-user',
                selectedBroadAreas: broadAreaIds,
                depth,
                language: 'en',
            }),
        });
        if (!res.ok) throw new Error(`Start session failed: ${res.status} ${await res.text()}`);
        return res.json();
    }

    async getNextQuestion(
        sessionId: string,
        subAreaId?: string,
    ): Promise<{ question: QuestionResponse; progress: BroadAreaProgress[]; currentSubArea: string }> {
        const params = subAreaId ? `?subAreaId=${subAreaId}` : '';
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/${sessionId}/next-question${params}`,
            { headers: this.headers() },
        );
        if (!res.ok) throw new Error(`Get next question failed: ${res.status}`);
        return res.json();
    }

    async submitAnswer(
        sessionId: string,
        payload: AnswerPayload,
    ): Promise<AnswerResponse> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/${sessionId}/answer`,
            {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(payload),
            },
        );
        if (!res.ok) throw new Error(`Submit answer failed: ${res.status}`);
        return res.json();
    }

    async getProgress(
        sessionId: string,
    ): Promise<{ progress: BroadAreaProgress[]; currentSubArea: string; status: string }> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/${sessionId}/progress`,
            { headers: this.headers() },
        );
        if (!res.ok) throw new Error(`Get progress failed: ${res.status}`);
        return res.json();
    }

    async getSession(sessionId: string): Promise<any> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/${sessionId}`,
            { headers: this.headers() },
        );
        if (!res.ok) throw new Error(`Get session failed: ${res.status}`);
        return res.json();
    }

    async pauseSession(sessionId: string): Promise<any> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/${sessionId}/pause`,
            { method: 'POST', headers: this.headers() },
        );
        if (!res.ok) throw new Error(`Pause session failed: ${res.status}`);
        return res.json();
    }

    async switchCategory(
        sessionId: string,
        subAreaId: string,
    ): Promise<any> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/interview/${sessionId}/category`,
            {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ subAreaId }),
            },
        );
        if (!res.ok) throw new Error(`Switch category failed: ${res.status}`);
        return res.json();
    }

    async getReports(
        type?: string,
    ): Promise<{ reports: ReportRecord[]; total: number }> {
        const params = type ? `?type=${type}` : '';
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/reports${params}`,
            { headers: this.headers() },
        );
        if (!res.ok) throw new Error(`Get reports failed: ${res.status}`);
        return res.json();
    }

    async getDashboardStats(): Promise<DashboardStats> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/dashboard/stats`,
            { headers: this.headers() },
        );
        if (!res.ok) throw new Error(`Get dashboard stats failed: ${res.status}`);
        return res.json();
    }

    async waitForPipelineCompletion(
        sessionId: string,
        timeoutMs = 300_000,
    ): Promise<ReportRecord[]> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const { reports } = await this.getReports();
            const sessionReports = reports.filter((r) => r.sessionId === sessionId);
            if (sessionReports.length > 0 && sessionReports.every((r) => r.status !== 'generating')) {
                return sessionReports;
            }
            await new Promise((r) => setTimeout(r, 5_000));
        }
        throw new Error(`Pipeline did not complete within ${timeoutMs}ms for session ${sessionId}`);
    }

    async submitAnswerRaw(
        sessionId: string,
        payload: any,
    ): Promise<Response> {
        return fetch(`${this.baseUrl}/api/interview/${sessionId}/answer`, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }

    async fetchWithoutAuth(path: string): Promise<Response> {
        return fetch(`${this.baseUrl}${path}`);
    }

    async createUser(userData: {
        username: string;
        password: string;
        role: string;
        firstName?: string;
        lastName?: string;
    }): Promise<any> {
        const res = await fetchWithRetry(
            `${this.baseUrl}/api/auth/create-user`,
            {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(userData),
            },
        );
        if (!res.ok) throw new Error(`Create user failed: ${res.status}`);
        return res.json();
    }
}
