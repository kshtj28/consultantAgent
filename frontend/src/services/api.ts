const API_BASE = '/api';

function getToken(): string | null {
    return localStorage.getItem('token');
}

function authHeaders(): Record<string, string> {
    const token = getToken();
    return token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
        : { 'Content-Type': 'application/json' };
}

export class LLMWarmingUpError extends Error {
    public readonly code = 'LLM_WARMING_UP';
    constructor(message: string) {
        super(message);
        this.name = 'LLMWarmingUpError';
    }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...options,
        headers: { ...authHeaders(), ...options?.headers },
    });
    const data = await res.json();
    if (!res.ok) {
        if (data.code === 'LLM_WARMING_UP' || data.code === 'GPU_SCALE_UP_FAILED') {
            throw new LLMWarmingUpError(data.error || 'AI engine is warming up');
        }
        throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as T;
}

// ─── Auth ──────────────────────────────────────────────────

export async function validateToken() {
    return request<{ valid: boolean; user: { userId: string; username: string; role: string } }>(
        `${API_BASE}/auth/validate`,
    );
}

export async function saveLanguagePreference(language: string): Promise<void> {
    await request('/auth/preferences', { method: 'PUT', body: JSON.stringify({ language }) });
}

export async function saveModelPreference(preferredModel: string): Promise<void> {
    await request(`${API_BASE}/settings/model`, { method: 'PUT', body: JSON.stringify({ defaultModel: preferredModel }) });
}

// ─── Sessions ──────────────────────────────────────────────

export interface SessionSummary {
    id: string;
    type: 'interview' | 'readiness' | 'interview_session';
    status: 'in_progress' | 'completed' | 'abandoned';
    startedAt: string;
    lastActivityAt: string;
    currentCategory?: string;
    progress: { completed: number; total: number };
    title: string;
    gapCount?: number;
    highGapCount?: number;
    riskScore?: number;
}

export async function fetchSessions() {
    return request<{ sessions: SessionSummary[] }>(`${API_BASE}/sessions/all`);
}

// ─── Readiness ─────────────────────────────────────────────

export interface FinancialArea {
    id: string;
    name: string;
    description?: string;
}

export interface AreaProgress {
    areaId: string;
    name: string;
    questionsAnswered: number;
    status: 'not_started' | 'in_progress' | 'completed';
    insights: string[];
}

export interface BroadAreaInfo {
    id: string;
    name: string;
    description: string;
    order: number;
    icon: string;
    subAreas: { id: string; name: string; description: string }[];
}

export interface SubAreaCoverage {
    subAreaId: string;
    name: string;
    questionsAnswered: number;
    aiConfident: boolean;
    status: 'not_started' | 'in_progress' | 'covered';
}

export interface BroadAreaProgressInfo {
    broadAreaId: string;
    name: string;
    order: number;
    subAreas: SubAreaCoverage[];
    overallStatus: 'not_started' | 'in_progress' | 'covered';
}

export interface GeneratedQuestion {
    id: string;
    text: string;
    type: 'single_choice' | 'multi_choice' | 'scale' | 'open_ended' | 'yes_no';
    options?: string[];
    mode?: string;
    areaId?: string;
}

export interface ReadinessSession {
    sessionId: string;
    status: string;
    selectedAreas?: string[];
    currentArea?: string;
    createdAt?: string;
}

export async function fetchBroadAreas(): Promise<{ broadAreas: BroadAreaInfo[] }> {
    return request('/api/interview/categories/list');
}

export async function startInterviewSession(userId: string, selectedBroadAreas: string[], model?: string, selectedSubAreas?: string[], language?: string): Promise<any> {
    return request('/api/interview/start', {
        method: 'POST',
        body: JSON.stringify({ userId, selectedBroadAreas, model, selectedSubAreas, language }),
    });
}

export async function getInterviewSessionData(sessionId: string): Promise<any> {
    return request(`/api/interview/${sessionId}`);
}

export async function translateInterviewHistory(sessionId: string, language: string, model?: string) {
    return request<{ success: boolean; responses: Record<string, any[]> }>(
        `/api/interview/${sessionId}/translate-history`,
        { method: 'POST', body: JSON.stringify({ language, model }) }
    );
}

export async function getNextInterviewQuestion(sessionId: string, model?: string, language?: string): Promise<any> {
    const searchParams = new URLSearchParams();
    if (model) searchParams.set('model', model);
    if (language) searchParams.set('language', language);
    const qs = searchParams.toString();
    return request(`/api/interview/${sessionId}/next-question${qs ? `?${qs}` : ''}`);
}

export async function submitInterviewAnswer(sessionId: string, payload: {
    questionId: string;
    question: string;
    answer: string | string[] | number;
    type: string;
    mode?: string;
    subAreaId: string;
    aiConfident?: boolean;
    model?: string;
    language?: string;
}): Promise<any> {
    return request(`/api/interview/${sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function switchSubArea(sessionId: string, subAreaId: string): Promise<any> {
    return request(`/api/interview/${sessionId}/category`, {
        method: 'POST',
        body: JSON.stringify({ subAreaId }),
    });
}

export async function getInterviewProgressData(sessionId: string): Promise<any> {
    return request(`/api/interview/${sessionId}/progress`);
}

// ─── Deprecated readiness wrappers ────────────────────────

/** @deprecated Use fetchBroadAreas */
export async function fetchAreas() {
    const res = await fetchBroadAreas();
    return { areas: res.broadAreas };
}

/** @deprecated Use startInterviewSession */
export async function startReadinessSession(userId: string, model?: string) {
    return startInterviewSession(userId, [], model);
}

/** @deprecated Use submitInterviewAnswer */
export async function submitAnswer(sessionId: string, payload: any) {
    return submitInterviewAnswer(sessionId, payload);
}

/** @deprecated Use switchSubArea */
export async function switchArea(sessionId: string, areaId: string) {
    return switchSubArea(sessionId, areaId);
}

/** @deprecated Use getNextInterviewQuestion */
export async function getNextQuestion(sessionId: string, model?: string) {
    return getNextInterviewQuestion(sessionId, model);
}

/** @deprecated Use getInterviewSessionData */
export async function getSession(sessionId: string) {
    return getInterviewSessionData(sessionId);
}

/** @deprecated Use getInterviewProgressData */
export async function getSessionProgress(sessionId: string) {
    return getInterviewProgressData(sessionId);
}

/** @deprecated No longer needed — broad areas set at session creation */
export async function setSessionAreas(sessionId: string, _areas: string[]) {
    return getInterviewSessionData(sessionId);
}

// ─── Reports ───────────────────────────────────────────────

/** @deprecated Use generateInterviewReport instead */
export async function generateReadinessReport(sessionId: string, model?: string) {
    return generateInterviewReport(sessionId, model);
}

/** @deprecated Use generateInterviewReport instead */
export async function generateGapReport(sessionId: string, model?: string) {
    return generateInterviewReport(sessionId, model);
}

// ─── Interview (legacy wrappers) ──────────────────────────

/** @deprecated Use startInterviewSession */
export async function startInterview(userId: string, _depth?: string, model?: string) {
    return startInterviewSession(userId, [], model);
}

/** @deprecated Use getInterviewSessionData */
export async function getInterviewSession(sessionId: string) {
    return getInterviewSessionData(sessionId);
}

/** @deprecated Use getInterviewProgressData */
export async function getInterviewProgress(sessionId: string) {
    return getInterviewProgressData(sessionId);
}

/** @deprecated Use fetchBroadAreas */
export async function getInterviewCategories() {
    return fetchBroadAreas();
}

export async function generateInterviewReport(sessionId: string, model?: string) {
    return request<{ report: any; qaHistory: any[]; interviewProgress: any }>(
        `${API_BASE}/interview/${sessionId}/report`,
        { method: 'POST', body: JSON.stringify({ model }) },
    );
}

// ─── Documents ─────────────────────────────────────────────

export async function listDocuments(userId?: string) {
    const params = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request<{ documents: any[] }>(`${API_BASE}/documents${params}`);
}

export async function deleteDocument(documentId: string) {
    return request<{ success: boolean }>(`${API_BASE}/documents/${documentId}`, {
        method: 'DELETE',
    });
}

// ─── Configuration ─────────────────────────────────────────

export interface Language {
    code: string;
    name: string;
    direction?: string;
}

export interface Domain {
    id: string;
    name: string;
    description?: string;
}

export interface ModelConfig {
    id: string;
    provider: string;
    model: string;
    displayName: string;
}

export async function fetchLanguages(): Promise<{ languages: Language[] }> {
    return request('/api/interview/config/languages');
}

export async function fetchDomains(): Promise<{ domains: Domain[] }> {
    return request('/api/interview/config/domains');
}

export async function getActiveDomain(): Promise<{ domain: Domain; broadAreas: BroadAreaInfo[] }> {
    return request('/api/interview/config/domain');
}

export async function setActiveDomain(domainId: string): Promise<{ success: boolean; domain: Domain }> {
    return request('/api/interview/config/domain', {
        method: 'PUT',
        body: JSON.stringify({ domainId }),
    });
}

export async function fetchModels() {
    return request<{ models: ModelConfig[]; defaultModel?: any }>(`${API_BASE}/chat/models`);
}

// ─── Analysis ──────────────────────────────────────────────

export async function analyzeGap(focusArea: string, context?: string, model?: string) {
    return request<{ report: any }>(`${API_BASE}/chat/analyze/gap`, {
        method: 'POST',
        body: JSON.stringify({ focusArea, context, model }),
    });
}

export async function analyzeAutomation(processDescription: string, model?: string) {
    return request<{ opportunities: any }>(`${API_BASE}/chat/analyze/automation`, {
        method: 'POST',
        body: JSON.stringify({ processDescription, model }),
    });
}

export async function generatePlan(gaps: any[], timeline?: string, model?: string) {
    return request<{ plan: any }>(`${API_BASE}/chat/analyze/plan`, {
        method: 'POST',
        body: JSON.stringify({ gaps, timeline, model }),
    });
}

// ─── Admin ────────────────────────────────────────────────

export interface AuditLogEntry {
    auditId: string;
    userId: string;
    username: string;
    role: string;
    action: string;
    resource: string;
    resourceId: string | null;
    details: string;
    statusCode: number;
    ipAddress: string;
    timestamp: string;
}

export interface UserProfile {
    userId: string;
    username: string;
    firstName?: string;
    lastName?: string;
    organization?: string;
    department?: string;
    role: string;
    status?: string;
    createdAt: string;
    lastLoginAt?: string;
}

export async function fetchAuditLogs(params?: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    resource?: string;
    from?: string;
    to?: string;
}) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.userId) searchParams.set('userId', params.userId);
    if (params?.action) searchParams.set('action', params.action);
    if (params?.resource) searchParams.set('resource', params.resource);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const qs = searchParams.toString();
    return request<{ logs: AuditLogEntry[]; total: number; page: number; limit: number }>(
        `${API_BASE}/admin/audit-logs${qs ? `?${qs}` : ''}`,
    );
}

export async function fetchUsers() {
    return request<{ users: UserProfile[] }>(`${API_BASE}/users/profiles`);
}

export async function updateUser(userId: string, updates: Partial<UserProfile>) {
    return request<{ success: boolean }>(`${API_BASE}/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deactivateUser(userId: string) {
    return request<{ success: boolean }>(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
    });
}

export async function createUser(data: {
    username: string;
    password: string;
    role?: string;
    firstName?: string;
    lastName?: string;
    organization?: string;
    department?: string;
}) {
    return request<{ message: string; userId: string }>(`${API_BASE}/auth/create-user`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ─── Notifications ────────────────────────────────────────

export interface Notification {
    notificationId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    resourceType?: string;
    resourceId?: string;
    read: boolean;
    createdAt: string;
}

export async function fetchNotifications(page?: number, limit?: number) {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return request<{ notifications: Notification[]; total: number; unreadCount: number }>(
        `${API_BASE}/notifications${qs ? `?${qs}` : ''}`,
    );
}

export async function markNotificationRead(notificationId: string) {
    return request<{ success: boolean }>(`${API_BASE}/notifications/${notificationId}/read`, {
        method: 'PUT',
    });
}

export async function markAllNotificationsRead() {
    return request<{ success: boolean }>(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
    });
}

// ─── Search ───────────────────────────────────────────────

export interface SearchResult {
    type: string;
    id: string;
    title: string;
    snippet: string;
    url: string;
}

export async function globalSearch(q: string) {
    return request<{ results: SearchResult[] }>(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
}

// ─── Dashboard ────────────────────────────────────────────

export interface ProcessFlowStep {
    name: string;
    stepNumber: number;
    status: 'normal' | 'critical';
    avgDuration: number;
    durationUnit: 'hrs' | 'days';
}

export interface ProcessTypeEntry {
    name: string;
    value: number;
    percent: number;
}

export interface ProcessEfficiencyEntry {
    name: string;
    efficiency: number;
}

export interface ProcessFlow {
    title: string;
    steps: ProcessFlowStep[];
    totalCycleTime: number;
    cycleTimeUnit: string;
    criticalBottlenecks: number;
    automationOpportunity: 'Low' | 'Medium' | 'High';
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
    processFlow: ProcessFlow;
    processTypeDistribution: ProcessTypeEntry[];
    processEfficiency: ProcessEfficiencyEntry[];
}

export async function fetchDashboardStats() {
    return request<DashboardStats>(`${API_BASE}/dashboard/stats`);
}

export interface ExecutiveSummary {
    readinessScore: number;
    riskLevel: string;
    totalGaps: number;
    highGaps: number;
    mediumGaps: number;
    lowGaps: number;
    fitCount: number;
    partialCount: number;
    recommendations: { title: string; description: string; impact: string; effort: string; estimatedSavings?: string }[];
    automationSavings: string[];
    erpPath: string;
    clientName: string;
}

export async function fetchExecutiveSummary() {
    return request<ExecutiveSummary>(`${API_BASE}/dashboard/executive-summary`);
}

export interface CumulativeGapArea {
    id: string;
    name: string;
    gapCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    fitScore: number;
}

export interface CumulativeGapData {
    broadAreas: CumulativeGapArea[];
    totalGaps: number;
    gapsBySeverity: Record<string, number>;
    gapsByCategory: Record<string, number>;
    gaps: any[];
}

export async function fetchCumulativeGaps() {
    return request<CumulativeGapData>(`${API_BASE}/dashboard/cumulative-gaps`);
}

export async function updateDashboardMetrics(metrics: Record<string, unknown>) {
    return request<any>(`${API_BASE}/dashboard/metrics`, {
        method: 'PUT',
        body: JSON.stringify(metrics),
    });
}

export async function recomputeDashboardMetrics() {
    return request<any>(`${API_BASE}/dashboard/metrics/recompute`, {
        method: 'POST',
    });
}

export function subscribeToDashboardStream(
    onUpdate: (metrics: DashboardStats) => void,
    onError?: (err: Event) => void,
): EventSource {
    const token = getToken();
    const es = new EventSource(`${API_BASE}/dashboard/stream?token=${token}`);

    es.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'metrics_update' && data.metrics) {
                // Map stored shape to DashboardStats
                const m = data.metrics;
                onUpdate({
                    totalSessions: m.totalSessions,
                    completedSessions: m.completedSessions,
                    criticalIssues: m.criticalIssues.count,
                    criticalIssuesTrend: m.criticalIssues.trend,
                    discoveryPct: m.discoveryProgress.pct,
                    gapSeverity: m.gapSeverity.level,
                    avgRisk: m.gapSeverity.avgRisk,
                    maxRisk: m.gapSeverity.maxRisk,
                    automationPct: m.automationQuotient.currentPct,
                    automationDelta: m.automationQuotient.improvementDelta,
                    automationTrend: m.automationQuotient.trend,
                    estCompletion: m.discoveryProgress.estCompletion,
                    processFlow: m.processFlow,
                    processTypeDistribution: m.processTypeDistribution || [],
                    processEfficiency: m.processEfficiency || [],
                });
            }
        } catch {
            // Ignore parse errors for keepalive messages
        }
    };

    es.onerror = (err) => {
        if (onError) onError(err);
    };

    return es;
}

// ─── Risks ────────────────────────────────────────────────

export interface RiskItem {
    id: string;
    severity: string;
    title: string;
    source: string;
    smeContact: { name: string; role: string };
    annualImpact: string;
    sessionId: string;
    timestamp: string;
}

export interface EngagementEntry {
    label: string;
    percent: number;
    color: 'green' | 'amber' | 'red';
}

export async function fetchRiskSummary() {
    return request<{ risks: RiskItem[]; engagement: EngagementEntry[]; totalRisks: number; overallEngagement: number }>(
        `${API_BASE}/risks/summary`,
    );
}

// ─── Reports (new) ────────────────────────────────────────
export interface ReportRecord {
    reportId: string;
    name: string;
    type: string;
    sessionId: string;
    generatedBy: string;
    status: 'generating' | 'ready' | 'failed';
    fileSize: string;
    downloadCount: number;
    createdAt: string;
}

export interface ReportStats {
    totalReports: number;
    thisMonth: number;
    totalDownloads: number;
    storageUsed: string;
}

export async function fetchReports(type?: string, page = 1, limit = 20) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (type && type !== 'all') params.set('type', type);
    return request<{ reports: ReportRecord[]; total: number }>(`${API_BASE}/reports?${params}`);
}

export async function fetchReportStats() {
    return request<ReportStats>(`${API_BASE}/reports/stats`);
}

export async function downloadReport(reportId: string) {
    return request<any>(`${API_BASE}/reports/${reportId}/download`);
}

export async function deleteReport(reportId: string) {
    return request<{ success: boolean }>(`${API_BASE}/reports/${reportId}`, {
        method: 'DELETE',
    });
}

export async function retryReport(reportId: string) {
    return request<{ success: boolean; message: string }>(`${API_BASE}/reports/${reportId}/retry`, {
        method: 'POST',
    });
}

export async function regenerateReport(reportId: string, overrides?: { erpPath?: string; modelId?: string }) {
    return request<{ success: boolean; message: string }>(`${API_BASE}/reports/${reportId}/regenerate`, {
        method: 'POST',
        body: JSON.stringify(overrides || {}),
    });
}

export async function downloadRTM(sessionId: string) {
    return request<{ rtm: any[] }>(`${API_BASE}/reports/${sessionId}/rtm`);
}

// ─── Settings ─────────────────────────────────────────────

export interface ProjectSettings {
    projectName: string;
    clientName: string;
    erpPath: string;
    industry: string;
    assessmentPeriod: string;
    timeZone: string;
    notifications: {
        criticalRiskAlerts: boolean;
        smeResponseUpdates: boolean;
        weeklySummary: boolean;
    };
    sessionTimeout: number;
    defaultModel?: string;
}

export async function fetchProjectSettings() {
    return request<ProjectSettings>(`${API_BASE}/settings/project`);
}

export async function updateProjectSettings(settings: Partial<ProjectSettings>) {
    return request<ProjectSettings>(`${API_BASE}/settings/project`, {
        method: 'PUT',
        body: JSON.stringify(settings),
    });
}

export async function exportProjectData() {
    return request<any>(`${API_BASE}/settings/export`);
}

export async function archiveAssessments() {
    return request<{ archived: number; message: string }>(`${API_BASE}/settings/archive`, { method: 'POST' });
}

export async function deleteProjectData(confirmName: string) {
    return request<{ deleted: boolean; message: string }>(`${API_BASE}/settings/data`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmName }),
    });
}

// ─── Interview Pipeline ───────────────────────────────────

// Pause interview session
export async function pauseInterviewSession(sessionId: string): Promise<any> {
    return request(`${API_BASE}/interview/${sessionId}/pause`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    });
}

// Complete interview session explicitly
export async function completeInterviewSession(sessionId: string): Promise<any> {
    return request(`${API_BASE}/interview/${sessionId}/complete`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    });
}

// SME Engagement
export async function fetchSMEEngagement(): Promise<{ users: any[] }> {
    return request(`${API_BASE}/sme-engagement`, {
        headers: authHeaders(),
    });
}

// Insights
export async function fetchInsightsData(sessionId?: string): Promise<{ insights: any }> {
    const params = sessionId ? `?sessionId=${sessionId}` : '';
    return request(`${API_BASE}/insights${params}`, {
        headers: authHeaders(),
    });
}

// SSE subscriptions
export function subscribeToReportStream(
    onEvent: (event: any) => void,
    onError?: (err: Event) => void
): EventSource {
    const token = getToken();
    const es = new EventSource(`${API_BASE}/reports/stream?token=${token}`);

    es.addEventListener('report-status', (e: MessageEvent) => {
        onEvent(JSON.parse(e.data));
    });

    es.onerror = (err) => {
        onError?.(err);
    };

    return es;
}

export function subscribeToSMEStream(
    onEvent: (event: any) => void,
    onError?: (err: Event) => void
): EventSource {
    const token = getToken();
    const es = new EventSource(`${API_BASE}/sme-engagement/stream?token=${token}`);

    es.addEventListener('sme-engagement', (e: MessageEvent) => {
        onEvent(JSON.parse(e.data));
    });

    es.onerror = (err) => onError?.(err);
    return es;
}

export function subscribeToInsightsStream(
    onEvent: (event: any) => void,
    onError?: (err: Event) => void
): EventSource {
    const token = getToken();
    const es = new EventSource(`${API_BASE}/insights/stream?token=${token}`);

    es.addEventListener('insights-updated', (e: MessageEvent) => {
        onEvent(JSON.parse(e.data));
    });

    es.onerror = (err) => onError?.(err);
    return es;
}
