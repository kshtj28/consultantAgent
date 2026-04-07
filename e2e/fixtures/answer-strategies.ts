import { QuestionResponse, AnswerPayload } from './api-helpers';

const WEAK_KEYWORDS = ['manual', 'none', 'no ', 'basic', 'spreadsheet', 'paper', 'ad hoc', 'informal'];
const STRONG_KEYWORDS = ['automated', 'ai', 'integrated', 'real-time', 'advanced', 'predictive', 'analytics', 'intelligent'];

const WEAK_OPEN_ENDED =
    'We handle this manually using spreadsheets and email. No formal process or system in place. Everything is done on a case-by-case basis with no standardization.';

const STRONG_OPEN_ENDED =
    'We use a fully automated system with real-time monitoring, AI-driven analytics, and integrated workflows across all departments. Our processes are standardized, continuously optimized, and benchmarked against industry best practices.';

const WEAK_BROAD_AREAS = ['order_to_cash', 'procure_to_pay', 'treasury_cash_management'];
const STRONG_BROAD_AREAS = ['record_to_report', 'compliance_controls'];

function scoreOption(option: string, keywords: string[]): number {
    const lower = option.toLowerCase();
    return keywords.reduce((score, kw) => score + (lower.includes(kw) ? 1 : 0), 0);
}

function pickLeastMature(options: string[]): string[] {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < options.length; i++) {
        const score = scoreOption(options[i], WEAK_KEYWORDS);
        if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    }
    return [options[bestIdx] || options[0]];
}

function pickMostMature(options: string[]): string[] {
    let bestIdx = options.length - 1;
    let bestScore = -1;
    for (let i = 0; i < options.length; i++) {
        const score = scoreOption(options[i], STRONG_KEYWORDS);
        if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    }
    return [options[bestIdx] || options[options.length - 1]];
}

function buildPayload(
    question: QuestionResponse,
    answer: string | string[] | number | boolean,
    subAreaId: string,
): AnswerPayload {
    return {
        questionId: question.id,
        question: question.question,
        answer,
        type: question.type,
        mode: question.mode || 'discovery',
        subAreaId,
    };
}

export type AnswerStrategyFn = (question: QuestionResponse, subAreaId: string) => AnswerPayload;

export function weakStrategy(question: QuestionResponse, subAreaId: string): AnswerPayload {
    switch (question.type) {
        case 'open_ended':
            return buildPayload(question, WEAK_OPEN_ENDED, subAreaId);
        case 'single_choice':
            return buildPayload(question, pickLeastMature(question.options || [])[0], subAreaId);
        case 'multi_choice':
            return buildPayload(question, pickLeastMature(question.options || []), subAreaId);
        case 'scale':
            return buildPayload(question, 1, subAreaId);
        case 'yes_no':
            return buildPayload(question, false, subAreaId);
        default:
            return buildPayload(question, WEAK_OPEN_ENDED, subAreaId);
    }
}

export function strongStrategy(question: QuestionResponse, subAreaId: string): AnswerPayload {
    switch (question.type) {
        case 'open_ended':
            return buildPayload(question, STRONG_OPEN_ENDED, subAreaId);
        case 'single_choice':
            return buildPayload(question, pickMostMature(question.options || [])[0], subAreaId);
        case 'multi_choice':
            return buildPayload(question, question.options || [], subAreaId);
        case 'scale':
            return buildPayload(question, 5, subAreaId);
        case 'yes_no':
            return buildPayload(question, true, subAreaId);
        default:
            return buildPayload(question, STRONG_OPEN_ENDED, subAreaId);
    }
}

export function mixedStrategy(question: QuestionResponse, subAreaId: string): AnswerPayload {
    const isStrongArea = STRONG_BROAD_AREAS.some((ba) => {
        return getBroadAreaForSubArea(subAreaId) === ba;
    });
    return isStrongArea
        ? strongStrategy(question, subAreaId)
        : weakStrategy(question, subAreaId);
}

const SUB_AREA_TO_BROAD_AREA: Record<string, string> = {
    accounts_receivable: 'order_to_cash',
    procurement_sourcing: 'procure_to_pay',
    purchase_order_management: 'procure_to_pay',
    vendor_management: 'procure_to_pay',
    accounts_payable: 'procure_to_pay',
    payment_execution: 'procure_to_pay',
    general_ledger: 'record_to_report',
    journal_entries_accruals: 'record_to_report',
    reconciliation: 'record_to_report',
    period_end_close: 'record_to_report',
    financial_reporting: 'record_to_report',
    financial_consolidation: 'record_to_report',
    management_reporting: 'record_to_report',
    treasury: 'treasury_cash_management',
    compliance_controls: 'compliance_controls',
};

export function getBroadAreaForSubArea(subAreaId: string): string {
    return SUB_AREA_TO_BROAD_AREA[subAreaId] || subAreaId;
}

export function getStrategyByName(name: string): AnswerStrategyFn {
    switch (name) {
        case 'weak': return weakStrategy;
        case 'strong': return strongStrategy;
        case 'mixed': return mixedStrategy;
        default: throw new Error(`Unknown strategy: ${name}`);
    }
}

export { WEAK_BROAD_AREAS, STRONG_BROAD_AREAS };
