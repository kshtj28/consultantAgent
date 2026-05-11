import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';
import { broadcastConsolidationUpdate } from './reportSseService';
import { generateCompletion } from './llmService';
import { generateEmbedding } from './knowledgeBase';
import {
  buildStepExtractionPrompt,
  buildConflictResolutionPrompt,
  buildAsIsModelPrompt,
  type ExtractedStep,
} from '../prompts/multiSMEConsolidation.prompt';
import { getBroadAreas, getBroadArea } from './domainService';

export interface AvailableProcess {
  processId: string;        // broad-area id (or "loan-origination" for the demo)
  processName: string;
  smeCount: number;         // distinct SMEs who interviewed this area
  completedCount: number;   // sessions marked completed
  inProgressCount: number;
  hasRealData: boolean;
}

export async function listAvailableProcesses(): Promise<AvailableProcess[]> {
  const broadAreas = getBroadAreas();
  const sessionsRes = await opensearchClient.search({
    index: INDICES.CONVERSATIONS,
    body: {
      query: { bool: { must: [{ match: { sessionType: 'interview_session' } }] } },
      size: 1000,
    },
  });
  const sessions = sessionsRes.body.hits.hits
    .map((h: any) => h._source)
    .filter((s: any) => s && s.sessionId);

  const out: AvailableProcess[] = [];
  for (const ba of broadAreas) {
    // Count a session against this broad area only if it has actual answers for one of the
    // broad area's sub-areas. Sessions default to ALL broad areas on creation, so checking
    // selectedBroadAreas alone would make every process show the same SME count.
    const baSubAreaIds = new Set((ba.subAreas || []).map((s: any) => s.id));
    const matching = sessions.filter((s: any) => {
      const responses = s.responses || {};
      return Object.keys(responses).some(
        subId => baSubAreaIds.has(subId) && Array.isArray(responses[subId]) && responses[subId].length > 0
      );
    });
    const distinctSMEs = new Set(matching.map((s: any) => s.userId).filter(Boolean));
    const completed = matching.filter((s: any) => s.status === 'completed');
    const inProgress = matching.filter((s: any) => s.status !== 'completed');
    out.push({
      processId: ba.id,
      processName: ba.name,
      smeCount: distinctSMEs.size,
      completedCount: completed.length,
      inProgressCount: inProgress.length,
      // Use distinct SME count (not raw session count) — one user can have multiple sessions
      // for the same broad area, so session totals would over-report readiness.
      hasRealData: distinctSMEs.size >= MIN_SMES_FOR_REAL_PIPELINE,
    });
  }

  // Always surface the demo process as well so the user can see the showcase
  out.unshift({
    processId: 'loan-origination',
    processName: 'Loan Origination (Demo)',
    smeCount: 5,
    completedCount: 4,
    inProgressCount: 1,
    hasRealData: false,
  });

  return out;
}

function hasAnyAnswers(session: any): boolean {
  const responses = session.responses || {};
  for (const k of Object.keys(responses)) {
    if (Array.isArray(responses[k]) && responses[k].length > 0) return true;
  }
  return false;
}

export type StepStatus = 'consensus' | 'majority' | 'conflict' | 'unique';

export interface StakeholderEntry {
  userId: string;
  username: string;
  initials: string;
  color: string;
  role: string;
  seniority: 'junior' | 'mid' | 'senior';
  yearsExperience: number;
  sessionStatus: 'done' | 'active' | 'invited';
  turnsTaken: number;
  completePct: number;
  weight: number;
}

export interface PerSMEStepVersion {
  userId: string;
  username: string;
  initials: string;
  color: string;
  role: string;
  seniority: 'junior' | 'mid' | 'senior';
  weight: number;
  description: string;
  quote: string;
  recordedAt: string;
}

export interface ConsolidatedStep {
  stepId: string;
  order: number;
  label: string;
  description: string;
  status: StepStatus;
  confidence: number;
  mentionedByCount: number;
  totalSMEs: number;
  mentionedBy: Array<{ userId: string; username: string; initials: string; color: string }>;
  perSMEVersions: PerSMEStepVersion[];
  aiProposedMerge?: {
    proposed: string;
    rationale: string;
  };
  accepted: boolean;
  acceptedBy?: string;
  acceptedAt?: string;
}

export interface ConsolidationMetrics {
  interviewsCompletedLabel: string;
  interviewsCompleted: number;
  interviewsTotal: number;
  inProgress: number;
  consensusSteps: number;
  consensusPct: number;
  majoritySteps: number;
  conflicts: number;
  uniqueSteps: number;
  avgSemanticAlignment: number;
  stepsNeedingReview: number;
}

export interface MultiSMEConsolidation {
  consolidationId: string;
  processId: string;
  processName: string;
  department: string;
  division: string;
  stakeholders: StakeholderEntry[];
  metrics: ConsolidationMetrics;
  steps: ConsolidatedStep[];
  generatedAt: string;
  updatedAt: string;
}

export interface GenerateOptions {
  processId: string;
  sessionIds?: string[];
  forceMock?: boolean;
}

const SME_PALETTE = ['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#3B82F6'];

function buildMockConsolidation(processId: string): MultiSMEConsolidation {
  const now = new Date().toISOString();
  
  // Base configuration defaults (Loan Origination)
  let processName = 'Loan Origination';
  let department = 'Credit & Lending';
  let division = 'Credit & Lending Division';
  
  const stakeholders: StakeholderEntry[] = [
    { userId: 'sme-fa', username: 'Fatima Al-Saud', initials: 'FA', color: SME_PALETTE[0], role: 'Head of Credit & Lending', seniority: 'senior', yearsExperience: 14, sessionStatus: 'done', turnsTaken: 28, completePct: 96, weight: 1.5 },
    { userId: 'sme-oa', username: 'Omar Al-Qahtani',  initials: 'OA', color: SME_PALETTE[1], role: 'Senior Credit Analyst',     seniority: 'senior', yearsExperience: 9,  sessionStatus: 'done', turnsTaken: 24, completePct: 92, weight: 1.5 },
    { userId: 'sme-nf', username: 'Noura Al-Faisal',   initials: 'NF', color: SME_PALETTE[2], role: 'Credit Operations Lead',    seniority: 'mid',    yearsExperience: 7,  sessionStatus: 'done', turnsTaken: 19, completePct: 88, weight: 1.0 },
    { userId: 'sme-kr', username: 'Khalid Al-Rasheed', initials: 'KR', color: SME_PALETTE[3], role: 'Junior Credit Officer',     seniority: 'junior', yearsExperience: 2,  sessionStatus: 'done', turnsTaken: 14, completePct: 72, weight: 0.7 },
    { userId: 'sme-ld', username: 'Lina Al-Dosari',    initials: 'LD', color: SME_PALETTE[4], role: 'Credit Policy Officer',     seniority: 'mid',    yearsExperience: 5,  sessionStatus: 'active', turnsTaken: 9, completePct: 35, weight: 1.0 },
  ];

  let steps: ConsolidatedStep[] = [];

  const createPerSME = (allDoneSlice: any[], descFn: (s: any) => string, quoteFn: (s: any) => string) => allDoneSlice.map(s => ({
    userId: s.userId, username: s.username, initials: s.initials, color: s.color,
    role: stakeholders.find(x => x.userId === s.userId)!.role,
    seniority: stakeholders.find(x => x.userId === s.userId)!.seniority,
    weight: stakeholders.find(x => x.userId === s.userId)!.weight,
    description: descFn(s),
    quote: quoteFn(s),
    recordedAt: now,
  }));

  const lp = (processId || '').toLowerCase();
  if (lp === 'procure-to-pay' || lp === 'procure to pay' || lp === 'p2p') {
    processName = 'Procure to Pay (P2P)';
    department = 'Procurement & Finance';
    division = 'Finance Division';
    stakeholders[0] = { ...stakeholders[0], role: 'Head of Procurement', username: 'Sara Al-Mubarak', initials: 'SM' };
    stakeholders[1] = { ...stakeholders[1], role: 'Senior AP Accountant', username: 'Tariq Al-Hamad', initials: 'TH' };
    stakeholders[2] = { ...stakeholders[2], role: 'Supply Chain Manager', username: 'Ali Al-Hajj', initials: 'AH' };
    stakeholders[3] = { ...stakeholders[3], role: 'AP Clerk', username: 'Nasser Abbas', initials: 'NA' };
    stakeholders[4] = { ...stakeholders[4], role: 'Purchasing Officer', username: 'Lama Nasser', initials: 'LN' };
    
    const allDone = stakeholders.filter(s => s.sessionStatus === 'done').map(s => ({
      userId: s.userId, username: s.username, initials: s.initials, color: s.color,
    }));
    
    steps = [
      {
        stepId: 'p2p-01', order: 1,
        label: 'Purchase Requisition Creation',
        description: 'Business unit submits a purchase requisition in the ERP.',
        status: 'consensus', confidence: 95, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'User submits PR via portal.',
          () => 'Everything starts with a digital PR.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'p2p-02', order: 2,
        label: 'PR Approval Workflow',
        description: 'Multi-level approval based on cost center budgets.',
        status: 'majority', confidence: 85, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Budget approval routing.',
          () => 'Managers approve if within budget limits.'
        ),
        accepted: false,
      },
      {
        stepId: 'p2p-03', order: 3,
        label: 'PO Generation and Dispatch',
        description: 'Convert PR to PO and send to selected vendor.',
        status: 'unique', confidence: 0, mentionedByCount: 1, totalSMEs: 4, mentionedBy: [allDone[0]],
        perSMEVersions: createPerSME([allDone[0]],
          () => 'Automated PO generation for catalog items.',
          () => 'Catalog items don\'t need manual PO creation.'
        ),
        accepted: false,
      },
      {
        stepId: 'p2p-04', order: 4,
        label: 'Goods Receipt Note (GRN) Processing',
        description: 'Receiving team logs GRN upon material delivery.',
        status: 'consensus', confidence: 92, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Warehouse or requester logs GRN.',
          () => 'We confirm receipt before any invoice gets paid.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'p2p-05', order: 5,
        label: 'Invoice Matching (3-Way)',
        description: 'Accounts payable matches Invoice, PO, and GRN.',
        status: 'conflict', confidence: 61, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: [
          ...createPerSME([allDone[0]],
             () => 'Automated 3-way matching via OCR.',
             () => 'We use the OCR tool to auto-match.'
          ),
          ...createPerSME(allDone.slice(1),
             () => 'Manual 3-way matching in the AP module.',
             () => 'I still verify the mismatch manually.'
          )
        ],
        aiProposedMerge: {
          proposed: 'System attempts automated 3-way match via OCR; mismatches flagged for manual AP review.',
          rationale: 'Head of Procurement notes use of OCR, while AP staff highlight the manual validation. Merge reflects the actual hybrid operating model.'
        },
        accepted: false,
      }
    ];
  } else if (lp === 'order-to-cash' || lp === 'order to cash' || lp === 'o2c') {
    processName = 'Order to Cash (O2C)';
    department = 'Sales & Accounts Receivable';
    division = 'Commercial Division';
    stakeholders[0] = { ...stakeholders[0], role: 'VP of Sales', username: 'Majed Al-Sorour', initials: 'MS' };
    stakeholders[1] = { ...stakeholders[1], role: 'AR Supervisor', username: 'Reem Al-Otaibi', initials: 'RO' };
    stakeholders[2] = { ...stakeholders[2], role: 'Order Management Lead', username: 'Saad Al-Dossari', initials: 'SD' };
    stakeholders[3] = { ...stakeholders[3], role: 'Collections Agent', username: 'Abdul Aziz', initials: 'AA' };
    stakeholders[4] = { ...stakeholders[4], role: 'Billing Clerk', username: 'Fatmah Hassan', initials: 'FH' };
    
    const allDone = stakeholders.filter(s => s.sessionStatus === 'done').map(s => ({
      userId: s.userId, username: s.username, initials: s.initials, color: s.color,
    }));
    
    steps = [
      {
        stepId: 'o2c-01', order: 1,
        label: 'Sales Order Creation',
        description: 'Sales team enters order details based on customer PO.',
        status: 'consensus', confidence: 97, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Order created in CRM and synced to ERP.',
          () => 'We enter the PO details to create the SO.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'o2c-02', order: 2,
        label: 'Credit Limit Verification',
        description: 'System checks if customer has available credit.',
        status: 'conflict', confidence: 65, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: [
          ...createPerSME([allDone[0]],
             () => 'Soft block for credit limit, VP can override.',
             () => 'I can bypass the credit hold for strategic accounts.'
          ),
          ...createPerSME(allDone.slice(1),
             () => 'Hard block if credit limit exceeded.',
             () => 'The system strictly blocks orders without credit.'
          )
        ],
        aiProposedMerge: {
          proposed: 'System places a hard block on orders exceeding credit limits, subject to VP Sales override.',
          rationale: 'Sales team sees it as a hard block, but the VP clarified they retain override authority.'
        },
        accepted: false,
      },
      {
        stepId: 'o2c-03', order: 3,
        label: 'Order Fulfillment / Provisioning',
        description: 'Service or goods are provisioned for the customer.',
        status: 'majority', confidence: 82, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Fulfillment triggered after SO approval.',
          () => 'Warehouse gets the picklist automatically.'
        ),
        accepted: false,
      },
      {
        stepId: 'o2c-04', order: 4,
        label: 'Billing and Invoicing',
        description: 'Invoice is generated and sent to the customer.',
        status: 'consensus', confidence: 91, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Invoice generated via email/ZATCA integration.',
          () => 'We generate the tax invoice and email it.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'o2c-05', order: 5,
        label: 'Payment Receipt and Application',
        description: 'Customer payment is received and applied to the invoice.',
        status: 'majority', confidence: 88, mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'AR applies incoming bank transfers to open invoices.',
          () => 'Bank file is reconciled against customer account.'
        ),
        accepted: false,
      }
    ];
  } else {
    // Default / Loan Origination (existing code)
    const allDone = stakeholders.filter(s => s.sessionStatus === 'done').map(s => ({
      userId: s.userId, username: s.username, initials: s.initials, color: s.color,
    }));
    const onlyFA = allDone.filter(s => s.userId === 'sme-fa');
    
    steps = [
      {
        stepId: 'step-01', order: 1,
        label: 'Customer submits loan application via mobile app or branch portal',
        description: 'Initial intake of loan application from the customer through the mobile or branch channels.',
        status: 'consensus', confidence: 98,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Customer submits loan application via mobile app or branch portal.',
          () => 'Applications come in through the app or the branch.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'step-02', order: 2,
        label: 'Documents uploaded and validated (OCR + completeness check)',
        description: 'KYC and supporting documents are uploaded by the customer and run through OCR and completeness validation.',
        status: 'majority', confidence: 82,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Documents uploaded; OCR + completeness check applied.',
          () => 'We OCR everything before it moves on.'
        ),
        accepted: false,
      },
      {
        stepId: 'step-03', order: 3,
        label: 'Credit bureau check via SIMAH API',
        description: 'Pull the applicant credit history and score from SIMAH.',
        status: 'consensus', confidence: 95,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'SIMAH pulled for credit history and score.',
          () => 'SIMAH is always the first external check.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'step-04', order: 4,
        label: 'Collateral valuation for secured products',
        description: 'Only mentioned by Fatima — applies for secured-product paths.',
        status: 'unique', confidence: 0,
        mentionedByCount: 1, totalSMEs: 4, mentionedBy: onlyFA,
        perSMEVersions: createPerSME(onlyFA,
          () => 'Collateral valuation conducted before final decision for secured products.',
          () => 'For secured loans the collateral team values the asset before we decide.'
        ),
        accepted: false,
      },
      {
        stepId: 'step-05', order: 5,
        label: 'Credit decision via AI scoring model',
        description: 'AI scoring model issues the credit decision; treatment of the model output diverges across SMEs.',
        status: 'conflict', confidence: 58,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: [
          ...createPerSME([allDone[0]],
            () => 'AI scoring with human override for exceptions.',
            () => 'The model decides unless it flags an anomaly.'
          ),
          ...createPerSME([allDone[1]],
            () => 'AI model proposes, credit officer reviews above SAR 500K.',
            () => 'Above 500K I always look at the file myself.'
          ),
          ...createPerSME([allDone[2]],
            () => 'Credit officer always reviews AI output before decision.',
            () => 'I prefer to see every file, even small ones.'
          ),
          ...createPerSME([allDone[3]],
            () => "Full manual credit check — I don't use the model.",
            () => 'I do the whole calculation by hand.'
          ),
        ],
        aiProposedMerge: {
          proposed: 'AI model produces score + SHAP explanation; auto-approve below SAR 500K, human review above — reconcile with SME4 who described a fully manual flow.',
          rationale: 'Senior SMEs (FA, OA) describe AI-led decisions with human exceptions; the junior officer (KR) reports a fully manual flow. Weighted toward seniors, the canonical step is AI-led with thresholded review; KR likely represents a training/onboarding deviation worth flagging.',
        },
        accepted: false,
      },
      {
        stepId: 'step-06', order: 6,
        label: 'KYC + sanctions screening (Nafath + watchlists)',
        description: 'Identity verification via Nafath and screening against domestic and international sanctions watchlists.',
        status: 'majority', confidence: 86,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Nafath identity check + sanctions screening.',
          () => 'Nafath plus the watchlist hit-check, every time.'
        ),
        accepted: false,
      },
      {
        stepId: 'step-07', order: 7,
        label: 'Offer letter generation and e-signature',
        description: 'System generates the offer letter and the customer e-signs it.',
        status: 'consensus', confidence: 94,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
          () => 'Offer letter generated and e-signed by customer.',
          () => 'Offer goes out, customer signs digitally.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
      {
        stepId: 'step-08', order: 8,
        label: 'Funds disbursement to customer account',
        description: 'Approved funds are disbursed to the customer account.',
        status: 'consensus', confidence: 99,
        mentionedByCount: 4, totalSMEs: 4, mentionedBy: allDone,
        perSMEVersions: createPerSME(allDone,
           () => 'Funds disbursed to the customer account.',
           () => 'Money lands in the customer account once everything checks out.'
        ),
        accepted: true, acceptedBy: 'facilitator', acceptedAt: now,
      },
    ];
  }

  const consensusSteps = steps.filter(s => s.status === 'consensus').length;
  const majoritySteps = steps.filter(s => s.status === 'majority').length;
  const conflicts = steps.filter(s => s.status === 'conflict').length;
  const uniqueSteps = steps.filter(s => s.status === 'unique').length;
  const stepsNeedingReview = steps.filter(s => !s.accepted).length;
  const consensusPct = steps.length > 0 ? Math.round((consensusSteps / steps.length) * 100) : 0;
  const avgSemanticAlignment = steps.length > 0 ? Math.round(
    steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length
  ) : 0;

  const interviewsCompleted = stakeholders.filter(s => s.sessionStatus === 'done').length;
  const inProgress = stakeholders.filter(s => s.sessionStatus === 'active').length;

  return {
    consolidationId: `consol-${processId}`,
    processId,
    processName,
    department,
    division,
    stakeholders,
    metrics: {
      interviewsCompletedLabel: `${interviewsCompleted}/${stakeholders.length}`,
      interviewsCompleted,
      interviewsTotal: stakeholders.length,
      inProgress,
      consensusSteps,
      consensusPct,
      majoritySteps,
      conflicts,
      uniqueSteps,
      avgSemanticAlignment,
      stepsNeedingReview,
    },
    steps,
    generatedAt: now,
    updatedAt: now,
  };
}

export async function generateMultiSMEConsolidation(opts: GenerateOptions): Promise<MultiSMEConsolidation | null> {
  let consolidation: MultiSMEConsolidation | null;

  if (opts.forceMock || opts.processId === 'loan-origination') {
    consolidation = buildMockConsolidation(opts.processId);
  } else {
    try {
      consolidation = await runRealConsolidation(opts);
    } catch (err: any) {
      console.warn(`[multi-sme] real pipeline failed for ${opts.processId}: ${err.message}`);
      consolidation = null;
    }
  }

  if (!consolidation) return null;

  // Persist + broadcast are best-effort. The consolidation is the source of truth
  // for the response — never let a downstream OpenSearch / SSE hiccup turn into a 500.
  try {
    await persistConsolidation(consolidation);
  } catch (err: any) {
    console.warn(`[multi-sme] persist failed (non-fatal): ${err.message}`);
  }
  try {
    broadcastConsolidationUpdate({
      consolidationId: consolidation.consolidationId,
      processId: consolidation.processId,
      type: 'generated',
      metrics: consolidation.metrics,
      updatedAt: consolidation.updatedAt,
    });
  } catch (err: any) {
    console.warn(`[multi-sme] broadcast failed (non-fatal): ${err.message}`);
  }
  return consolidation;
}

// ─── Real pipeline ─────────────────────────────────────────────────────

interface SMEStep {
  stakeholder: StakeholderEntry;
  step: ExtractedStep;
  embedding: number[];
}

interface SMEContext {
  stakeholder: StakeholderEntry;
  transcript: string;
  isComplete: boolean;
  turnsTaken: number;
  completePct: number;
}

const CLUSTER_SIMILARITY_THRESHOLD = 0.78;
const MIN_SMES_FOR_REAL_PIPELINE = 1;

async function runRealConsolidation(opts: GenerateOptions): Promise<MultiSMEConsolidation | null> {
  const smeContexts = await loadSMEContexts(opts);
  const completedSMEs = smeContexts.filter(s => s.transcript.trim().length > 0);
  if (completedSMEs.length < MIN_SMES_FOR_REAL_PIPELINE) {
    throw new Error(`Not enough SMEs with valid transcript data. Found ${completedSMEs.length}, need ${MIN_SMES_FOR_REAL_PIPELINE}. Raw contexts total: ${smeContexts.length}.`);
  }

  // 1. Per-SME step extraction via LLM
  const processName = inferProcessName(opts.processId);
  const now = new Date().toISOString();

  // ── Fast path: single SME ─────────────────────────────────────────────────
  // With 1 SME there is nothing to cluster — all steps are 'unique' by definition.
  // Skip embedding generation entirely so the feature works even when the
  // embedding service is unavailable.
  if (completedSMEs.length === 1) {
    const ctx = completedSMEs[0];
    let extracted: ExtractedStep[] = [];
    try {
      extracted = await extractStepsForSME(ctx, processName);
    } catch (err: any) {
      console.warn(`[multi-sme] single-SME step extraction failed: ${err.message}`);
    }
    if (extracted.length === 0) {
      console.warn(`[multi-sme] single-SME extraction yielded 0 steps. Injecting placeholder.`);
      extracted.push({
        order: 1,
        label: "Insufficient Application Data",
        description: "The AI reviewed the transcript but could not identify any formal business process steps. Please provide more detailed answers during the SME interviews.",
        quote: "No actionable process steps detected in transcript."
      });
    }

    const consolidatedSteps: ConsolidatedStep[] = extracted.map((step, idx) => ({
      stepId: `step-${uuidv4().slice(0, 8)}`,
      order: idx + 1,
      label: step.label,
      description: step.description,
      status: 'unique' as StepStatus,
      // Store confidence as an integer percentage (0-100) to match what computeMetrics
      // expects. Using 0.75 (decimal) caused Math.round to produce 1% in the UI.
      confidence: 75,
      mentionedByCount: 1,
      totalSMEs: 1,
      mentionedBy: [{ userId: ctx.stakeholder.userId, username: ctx.stakeholder.username, initials: ctx.stakeholder.initials, color: ctx.stakeholder.color }],
      perSMEVersions: [{
        userId: ctx.stakeholder.userId, username: ctx.stakeholder.username,
        initials: ctx.stakeholder.initials, color: ctx.stakeholder.color,
        role: ctx.stakeholder.role, seniority: ctx.stakeholder.seniority,
        weight: ctx.stakeholder.weight, description: step.description,
        quote: step.quote || '', recordedAt: now,
      }],
      accepted: false,
    }));

    return {
      consolidationId: `consol-${opts.processId}`,
      processId: opts.processId,
      processName,
      department: inferDepartment(completedSMEs),
      division: 'Unknown',
      stakeholders: [ctx.stakeholder],
      metrics: computeMetrics(consolidatedSteps, completedSMEs),
      steps: consolidatedSteps,
      generatedAt: now,
      updatedAt: now,
    };
  }
  // ── End fast path ─────────────────────────────────────────────────────────

  const allExtractedSteps: SMEStep[] = [];
  for (const ctx of completedSMEs) {
    let extracted: ExtractedStep[] = [];
    try {
      extracted = await extractStepsForSME(ctx, processName);
    } catch (err: any) {
      // Don't abort the whole pipeline for one SME's extraction failure — just skip them
      console.warn(`[multi-sme] step extraction failed for ${ctx.stakeholder.username}: ${err.message}`);
    }
    for (const step of extracted) {
      let embedding: number[];
      try {
        embedding = await generateEmbedding(`${step.label}. ${step.description}`);
      } catch (err: any) {
        console.warn(`[multi-sme] embedding failed for "${step.label}": ${err.message}`);
        continue;
      }
      allExtractedSteps.push({ stakeholder: ctx.stakeholder, step, embedding });
    }
  }

  if (allExtractedSteps.length === 0) {
    console.warn(`[multi-sme] no steps extracted for ${opts.processId} across all SMEs. Injecting placeholder.`);
    const fallbackStakeholder = completedSMEs[0].stakeholder;
    // Embedding the placeholder text is best-effort — if the embedding service is
    // unavailable (e.g. during a network outage) we fall back to a zero-vector so
    // the placeholder step still reaches the frontend instead of throwing.
    let placeholderEmbedding: number[];
    try {
      placeholderEmbedding = await generateEmbedding("Insufficient Application Data");
    } catch (embErr: any) {
      console.warn(`[multi-sme] placeholder embedding failed, using zero-vector: ${embErr.message}`);
      placeholderEmbedding = [];
    }
    allExtractedSteps.push({
      stakeholder: fallbackStakeholder,
      step: {
        order: 1,
        label: "Insufficient Application Data",
        description: "The AI reviewed the transcripts but could not identify any formal business process steps. Please provide more detailed, step-by-step answers during the SME interviews.",
        quote: "No actionable process steps detected in transcript."
      },
      embedding: placeholderEmbedding,
    });
  }

  // 2. Cluster equivalent steps across SMEs
  const clusters = clusterSteps(allExtractedSteps);
  if (clusters.length === 0) return null;

  // 3. Classify and build consolidated step records
  const totalSMEs = completedSMEs.length;
  const stakeholders = smeContexts.map(c => c.stakeholder);
  const consolidatedSteps: ConsolidatedStep[] = [];
  let order = 1;

  for (const cluster of clusters) {
    const status = classifyCluster(cluster, totalSMEs);
    const confidence = computeClusterConfidence(cluster, totalSMEs);
    const representativeMember = pickRepresentative(cluster);

    const perSMEVersions: PerSMEStepVersion[] = cluster.map(m => ({
      userId: m.stakeholder.userId,
      username: m.stakeholder.username,
      initials: m.stakeholder.initials,
      color: m.stakeholder.color,
      role: m.stakeholder.role,
      seniority: m.stakeholder.seniority,
      weight: m.stakeholder.weight,
      description: m.step.description,
      quote: m.step.quote,
      recordedAt: new Date().toISOString(),
    }));

    let aiProposedMerge: ConsolidatedStep['aiProposedMerge'] | undefined;
    if (status === 'conflict') {
      try {
        aiProposedMerge = await resolveConflict({
          stepLabel: representativeMember.step.label,
          versions: cluster.map(m => ({
            smeName: m.stakeholder.username,
            role: m.stakeholder.role,
            seniority: m.stakeholder.seniority,
            weight: m.stakeholder.weight,
            description: m.step.description,
            quote: m.step.quote,
          })),
        });
      } catch (err: any) {
        console.warn(`[multi-sme] conflict resolution failed for "${representativeMember.step.label}": ${err.message}`);
      }
    }

    consolidatedSteps.push({
      stepId: `step-${uuidv4().slice(0, 8)}`,
      order: order++,
      label: representativeMember.step.label,
      description: representativeMember.step.description,
      status,
      confidence,
      mentionedByCount: cluster.length,
      totalSMEs,
      mentionedBy: cluster.map(m => ({
        userId: m.stakeholder.userId,
        username: m.stakeholder.username,
        initials: m.stakeholder.initials,
        color: m.stakeholder.color,
      })),
      perSMEVersions,
      aiProposedMerge,
      accepted: false,
    });
  }

  // 4. Order steps by the average original SME order across the cluster
  consolidatedSteps.sort((a, b) => avgClusterOrder(a, allExtractedSteps) - avgClusterOrder(b, allExtractedSteps));
  consolidatedSteps.forEach((s, idx) => { s.order = idx + 1; });

  const metrics = computeMetrics(consolidatedSteps, smeContexts);

  return {
    consolidationId: `consol-${opts.processId}`,
    processId: opts.processId,
    processName,
    department: smeContexts[0]?.stakeholder ? inferDepartment(smeContexts) : 'Unknown',
    division: 'Unknown',
    stakeholders,
    metrics,
    steps: consolidatedSteps,
    generatedAt: now,
    updatedAt: now,
  };
}

async function loadSMEContexts(opts: GenerateOptions): Promise<SMEContext[]> {
  const must: any[] = [{ match: { sessionType: 'interview_session' } }];
  if (opts.sessionIds && opts.sessionIds.length > 0) {
    must.push({ terms: { sessionId: opts.sessionIds } });
  }

  const sessionsRes = await opensearchClient.search({
    index: INDICES.CONVERSATIONS,
    body: { query: { bool: { must } }, size: 200 },
  });
  let sessions = sessionsRes.body.hits.hits.map((h: any) => h._source).filter((s: any) => s && s.sessionId);

  const broadArea = getBroadArea(opts.processId);
  if (broadArea) {
    const baSubAreaIds = new Set((broadArea.subAreas || []).map((s: any) => s.id));

    // Strict pass: sessions with actual answers keyed to this broad area's sub-areas
    const strict = sessions.filter((s: any) => {
      const responses = s.responses || {};
      return Object.keys(responses).some(
        subId => baSubAreaIds.has(subId) && Array.isArray(responses[subId]) && responses[subId].length > 0
      );
    });

    if (strict.length > 0) {
      sessions = strict;
    } else {
      // Fallback: sessions that cover this broad area (via selectedBroadAreas) and have ANY answers.
      // Happens when the interview didn't reach these sub-areas sequentially. The transcript will
      // contain adjacent finance content; the LLM + Q&A extractor will still produce usable steps.
      console.warn(`[multi-sme] no process-specific responses for ${opts.processId}, using general finance sessions as fallback`);
      sessions = sessions.filter((s: any) =>
        Array.isArray(s.selectedBroadAreas) &&
        s.selectedBroadAreas.includes(opts.processId) &&
        hasAnyAnswers(s)
      );
    }
  }

  if (sessions.length === 0) return [];

  const userIds = Array.from(new Set(sessions.map((s: any) => s.userId).filter(Boolean)));
  const usersRes = await opensearchClient.search({
    index: INDICES.USERS,
    body: { query: { terms: { userId: userIds } }, size: 200 },
  });
  const users = new Map<string, any>(
    usersRes.body.hits.hits.map((h: any) => [h._source.userId, h._source])
  );

  // ── Deduplicate sessions per userId ──────────────────────────────────────────
  // A user can have multiple sessions for the same process (e.g. resumed later).
  // Without deduplication, the same SME appears twice on the Stakeholder Roster
  // and is counted twice in metrics. We merge all sessions for a given user into
  // a single synthetic session: responses are merged and transcripts concatenated.
  //
  // Pre-filter: discard sessions that have zero answers entirely. These are
  // sessions that were created but abandoned before the user answered anything.
  // They have no transcript content and must not appear as stakeholder cards.
  const sessionsWithAnswers = sessions.filter((s: any) => hasAnyAnswers(s));
  const sessionsToMerge = sessionsWithAnswers.length > 0 ? sessionsWithAnswers : sessions;

  const sessionsByUser = new Map<string, any>();
  for (const session of sessionsToMerge) {
    const uid = session.userId || session.sessionId; // fallback for anonymous sessions
    if (!sessionsByUser.has(uid)) {
      sessionsByUser.set(uid, { ...session });
    } else {
      // Merge responses: combine answer arrays per sub-area key
      const merged = sessionsByUser.get(uid);
      const incoming = session.responses || {};
      const existing = merged.responses || {};
      for (const subId of Object.keys(incoming)) {
        if (!existing[subId]) {
          existing[subId] = incoming[subId];
        } else if (Array.isArray(existing[subId]) && Array.isArray(incoming[subId])) {
          existing[subId] = [...existing[subId], ...incoming[subId]];
        }
      }
      merged.responses = existing;
      // Prefer 'completed' status if any session is completed
      if (session.status === 'completed') merged.status = 'completed';
    }
  }
  const deduplicatedSessions = Array.from(sessionsByUser.values());
  // ── End deduplication ────────────────────────────────────────────────────────

  const contexts: SMEContext[] = [];
  let paletteIdx = 0;
  for (const session of deduplicatedSessions) {
    const user = users.get(session.userId) || { userId: session.userId, username: session.userId, role: 'sme', department: 'Unknown' };
    const stakeholder = buildStakeholderEntry(user, session, paletteIdx++);
    const transcript = transcribeSession(session);
    const totalAnswers = Object.values(session.responses || {}).reduce(
      (sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0
    );
    contexts.push({
      stakeholder,
      transcript,
      isComplete: session.status === 'completed' || totalAnswers >= 1,
      turnsTaken: totalAnswers,
      completePct: Math.min(100, Math.max(20, totalAnswers * 20)),
    });
  }

  return contexts;
}

function buildStakeholderEntry(user: any, session: any, paletteIdx: number): StakeholderEntry {
  const username = user.username || session.userId || 'Unknown SME';
  const initials = username.split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase() || 'SM';
  const responses = session.responses || {};
  const totalAnswers = Object.values(responses).reduce(
    (sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0
  );
  const seniority: 'junior' | 'mid' | 'senior' = inferSeniority(user.role);
  return {
    userId: user.userId,
    username,
    initials,
    color: SME_PALETTE[paletteIdx % SME_PALETTE.length],
    role: humanizeRole(user.role || 'sme'),
    seniority,
    yearsExperience: user.yearsExperience || 0,
    sessionStatus: session.status === 'completed' ? 'done' : (totalAnswers > 0 ? 'active' : 'invited'),
    turnsTaken: totalAnswers,
    completePct: Math.min(100, totalAnswers * 5),
    weight: seniority === 'senior' ? 1.5 : seniority === 'junior' ? 0.7 : 1.0,
  };
}

function inferSeniority(role: string): 'junior' | 'mid' | 'senior' {
  const r = (role || '').toLowerCase();
  if (/(junior|associate|trainee|analyst i\b)/.test(r)) return 'junior';
  if (/(senior|lead|head|chief|principal|director|vp)/.test(r)) return 'senior';
  return 'mid';
}

function humanizeRole(role: string): string {
  if (!role) return 'SME';
  return role.split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function humanizeAnswer(answer: any): string {
  if (answer === null || answer === undefined) return '';
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (typeof answer === 'number') return String(answer);
  if (Array.isArray(answer)) {
    const items = answer.map(v => (typeof v === 'string' ? v : JSON.stringify(v)));
    return items.join(', ');
  }
  return String(answer);
}

function transcribeSession(session: any): string {
  const lines: string[] = [];
  const responses = session.responses || {};
  for (const subAreaId of Object.keys(responses)) {
    const answers = responses[subAreaId];
    if (!Array.isArray(answers) || answers.length === 0) continue;
    const subAreaName = findSubAreaName(subAreaId);
    if (subAreaName) lines.push(`## ${subAreaName}`);
    for (const a of answers) {
      if (!a.question) continue;
      const answerText = humanizeAnswer(a.answer);
      if (!answerText) continue;
      lines.push(`Q: ${a.question}`);
      lines.push(`A: ${answerText}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function findSubAreaName(subAreaId: string): string | null {
  for (const ba of getBroadAreas()) {
    const sub = (ba.subAreas || []).find((s: any) => s.id === subAreaId);
    if (sub) return (sub as any).name || null;
  }
  return null;
}

async function extractStepsForSME(ctx: SMEContext, processName: string): Promise<ExtractedStep[]> {
  const prompt = buildStepExtractionPrompt(ctx.transcript, ctx.stakeholder.role, processName);
  let llmSteps: ExtractedStep[] = [];
  try {
    const res = await generateCompletion([
      { role: 'system', content: 'You return only valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.1, maxTokens: 1500 });
    const parsed = safeParseJSON(res.content);
    const raw = parsed?.steps;
    if (Array.isArray(raw)) {
      llmSteps = raw
        .map((s: any, idx: number) => ({
          order: typeof s.order === 'number' ? s.order : idx + 1,
          label: String(s.label ?? '').trim(),
          description: String(s.description ?? '').trim(),
          quote: String(s.quote ?? '').trim(),
        }))
        .filter(s => s.label.length > 0);
    }
  } catch (err: any) {
    console.warn(`[multi-sme] LLM extraction failed for ${ctx.stakeholder.username}: ${err.message}`);
  }

  if (llmSteps.length > 0) return llmSteps;

  // LLM returned nothing — fall back to building steps directly from Q&A pairs in the transcript.
  // Each answered question represents one aspect of the process; use it as a process step.
  return buildStepsFromQA(ctx.transcript);
}

function buildStepsFromQA(transcript: string): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  let order = 1;
  const lines = transcript.split('\n');
  let currentQ = '';
  for (const line of lines) {
    if (line.startsWith('Q: ')) {
      currentQ = line.slice(3).trim();
    } else if (line.startsWith('A: ') && currentQ) {
      const answer = line.slice(3).trim();
      // Skip only truly empty/null answers
      if (!answer || answer === 'undefined' || answer === 'null') { currentQ = ''; continue; }
      const label = questionToStepLabel(currentQ);
      // For short answers (Yes/No, numbers, brief selections) enrich the description
      // with the question so it's meaningful as a process step.
      const description = answer.length >= 20
        ? answer.slice(0, 200)
        : `${currentQ.replace(/\?$/, '')}: ${answer}`.slice(0, 200);
      steps.push({
        order: order++,
        label,
        description,
        quote: description.slice(0, 180),
      });
      currentQ = '';
    }
  }
  return steps;
}

function questionToStepLabel(question: string): string {
  // Strip leading question words to produce a concise noun-phrase label
  return question
    .replace(/^(how does|how do|what is|what are|describe|explain|tell me about|walk me through)\s+/i, '')
    .replace(/\?$/, '')
    .trim()
    .slice(0, 100)
    // Capitalise first letter
    .replace(/^./, c => c.toUpperCase());
}

async function resolveConflict(input: {
  stepLabel: string;
  versions: Array<{
    smeName: string; role: string; seniority: 'junior' | 'mid' | 'senior';
    weight: number; description: string; quote: string;
  }>;
}): Promise<{ proposed: string; rationale: string } | undefined> {
  const prompt = buildConflictResolutionPrompt(input);
  const res = await generateCompletion([
    { role: 'system', content: 'You return only valid JSON.' },
    { role: 'user', content: prompt },
  ], { temperature: 0.2, maxTokens: 600 });
  const parsed = safeParseJSON(res.content);
  if (!parsed?.proposed) return undefined;
  return {
    proposed: String(parsed.proposed).trim(),
    rationale: String(parsed.rationale ?? '').trim(),
  };
}

function safeParseJSON(text: string): any {
  const { extractJSON } = require('../utils/jsonUtils');
  return extractJSON(text);
}

function clusterSteps(items: SMEStep[]): SMEStep[][] {
  const clusters: SMEStep[][] = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      const sims = cluster.map(c => cosineSimilarity(c.embedding, item.embedding));
      const maxSim = Math.max(...sims);
      const sameSME = cluster.some(c => c.stakeholder.userId === item.stakeholder.userId);
      if (maxSim >= CLUSTER_SIMILARITY_THRESHOLD && !sameSME) {
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }
  return clusters;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function classifyCluster(cluster: SMEStep[], totalSMEs: number): StepStatus {
  const uniqueSMEs = new Set(cluster.map(c => c.stakeholder.userId));
  const fraction = uniqueSMEs.size / totalSMEs;

  if (uniqueSMEs.size === 1) return 'unique';

  // Detect intra-cluster divergence — if pairwise similarity has high variance, flag conflict
  const internalAlignment = avgPairwiseSimilarity(cluster);
  if (uniqueSMEs.size >= 2 && internalAlignment < 0.86) return 'conflict';

  if (fraction >= 0.8) return 'consensus';
  return 'majority';
}

function avgPairwiseSimilarity(cluster: SMEStep[]): number {
  if (cluster.length < 2) return 1;
  let sum = 0, n = 0;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      sum += cosineSimilarity(cluster[i].embedding, cluster[j].embedding);
      n++;
    }
  }
  return n > 0 ? sum / n : 1;
}

function computeClusterConfidence(cluster: SMEStep[], totalSMEs: number): number {
  const uniqueSMEs = new Set(cluster.map(c => c.stakeholder.userId)).size;
  const coverage = uniqueSMEs / totalSMEs;
  const alignment = avgPairwiseSimilarity(cluster);
  if (uniqueSMEs === 1) return 0;
  return Math.round(((coverage * 0.5) + (alignment * 0.5)) * 100);
}

function pickRepresentative(cluster: SMEStep[]): SMEStep {
  // Pick the highest-weighted SME's version, ties broken by longer description
  return [...cluster].sort((a, b) => {
    if (b.stakeholder.weight !== a.stakeholder.weight) return b.stakeholder.weight - a.stakeholder.weight;
    return b.step.description.length - a.step.description.length;
  })[0];
}

function avgClusterOrder(consolidated: ConsolidatedStep, all: SMEStep[]): number {
  const userIds = new Set(consolidated.mentionedBy.map(m => m.userId));
  const orders = all
    .filter(s => userIds.has(s.stakeholder.userId) && s.step.label === consolidated.label)
    .map(s => s.step.order);
  if (orders.length === 0) return consolidated.order;
  return orders.reduce((a, b) => a + b, 0) / orders.length;
}

function computeMetrics(steps: ConsolidatedStep[], contexts: SMEContext[]): ConsolidationMetrics {
  const consensusSteps = steps.filter(s => s.status === 'consensus').length;
  const majoritySteps = steps.filter(s => s.status === 'majority').length;
  const conflicts = steps.filter(s => s.status === 'conflict').length;
  const uniqueSteps = steps.filter(s => s.status === 'unique').length;
  const interviewsCompleted = contexts.filter(c => c.stakeholder.sessionStatus === 'done').length;
  const inProgress = contexts.filter(c => c.stakeholder.sessionStatus === 'active').length;
  const avgSemanticAlignment = steps.length > 0
    ? Math.round(steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length)
    : 0;
  return {
    interviewsCompletedLabel: `${interviewsCompleted}/${contexts.length}`,
    interviewsCompleted,
    interviewsTotal: contexts.length,
    inProgress,
    consensusSteps,
    consensusPct: steps.length > 0 ? Math.round((consensusSteps / steps.length) * 100) : 0,
    majoritySteps,
    conflicts,
    uniqueSteps,
    avgSemanticAlignment,
    stepsNeedingReview: steps.filter(s => !s.accepted).length,
  };
}

function inferProcessName(processId: string): string {
  const broadArea = getBroadArea(processId);
  if (broadArea?.name) return broadArea.name;
  return processId
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function inferDepartment(contexts: SMEContext[]): string {
  // Pick the most common department among stakeholders
  const counts = new Map<string, number>();
  for (const c of contexts) {
    const dept = (c.stakeholder as any).department || 'Unknown';
    counts.set(dept, (counts.get(dept) || 0) + 1);
  }
  let best = 'Unknown', bestCount = 0;
  for (const [dept, count] of counts) {
    if (count > bestCount) { best = dept; bestCount = count; }
  }
  return best;
}

export async function fetchMultiSMEConsolidation(processId: string): Promise<MultiSMEConsolidation | null> {
  try {
    const exists = await opensearchClient.indices.exists({ index: INDICES.MULTI_SME_CONSOLIDATIONS });
    if (!exists.body) return null;

    const res = await opensearchClient.search({
      index: INDICES.MULTI_SME_CONSOLIDATIONS,
      body: {
        query: { match: { processId } },
        sort: [{ updatedAt: { order: 'desc', unmapped_type: 'date' } }],
        size: 1,
      },
    });
    const hit = res.body.hits.hits[0];
    return hit ? (hit._source as MultiSMEConsolidation) : null;
  } catch (err: any) {
    console.warn('Error fetching multi-SME consolidation:', err.message);
    return null;
  }
}

export async function acceptStep(consolidationId: string, stepId: string, userId: string): Promise<MultiSMEConsolidation | null> {
  const consolidation = await getConsolidationById(consolidationId);
  if (!consolidation) return null;

  const step = consolidation.steps.find(s => s.stepId === stepId);
  if (!step) return null;

  step.accepted = true;
  step.acceptedBy = userId;
  step.acceptedAt = new Date().toISOString();
  consolidation.metrics.stepsNeedingReview = consolidation.steps.filter(s => !s.accepted).length;
  consolidation.updatedAt = new Date().toISOString();

  await persistConsolidation(consolidation);
  broadcastConsolidationUpdate({
    consolidationId: consolidation.consolidationId,
    processId: consolidation.processId,
    type: 'step-accepted',
    stepId,
    metrics: consolidation.metrics,
    updatedAt: consolidation.updatedAt,
  });
  return consolidation;
}

export async function editStepVersion(
  consolidationId: string,
  stepId: string,
  newDescription: string,
  userId: string
): Promise<MultiSMEConsolidation | null> {
  const consolidation = await getConsolidationById(consolidationId);
  if (!consolidation) return null;

  const step = consolidation.steps.find(s => s.stepId === stepId);
  if (!step) return null;

  step.description = newDescription;
  step.label = newDescription.length <= 120 ? newDescription : step.label;
  step.accepted = true;
  step.acceptedBy = userId;
  step.acceptedAt = new Date().toISOString();
  consolidation.metrics.stepsNeedingReview = consolidation.steps.filter(s => !s.accepted).length;
  consolidation.updatedAt = new Date().toISOString();

  await persistConsolidation(consolidation);
  broadcastConsolidationUpdate({
    consolidationId: consolidation.consolidationId,
    processId: consolidation.processId,
    type: 'step-edited',
    stepId,
    metrics: consolidation.metrics,
    updatedAt: consolidation.updatedAt,
  });
  return consolidation;
}

export async function inviteSMEToConsolidation(
  consolidationId: string,
  invite: { username: string; role: string; seniority?: 'junior' | 'mid' | 'senior' }
): Promise<MultiSMEConsolidation | null> {
  const consolidation = await getConsolidationById(consolidationId);
  if (!consolidation) return null;

  const seniority = invite.seniority ?? 'mid';
  const newStakeholder: StakeholderEntry = {
    userId: `sme-${uuidv4().slice(0, 6)}`,
    username: invite.username,
    initials: invite.username.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
    color: SME_PALETTE[(consolidation.stakeholders.length) % SME_PALETTE.length],
    role: invite.role,
    seniority,
    yearsExperience: 0,
    sessionStatus: 'invited',
    turnsTaken: 0,
    completePct: 0,
    weight: seniority === 'senior' ? 1.5 : seniority === 'junior' ? 0.7 : 1.0,
  };
  consolidation.stakeholders.push(newStakeholder);
  consolidation.metrics.interviewsTotal = consolidation.stakeholders.length;
  consolidation.metrics.interviewsCompletedLabel = `${consolidation.metrics.interviewsCompleted}/${consolidation.stakeholders.length}`;
  consolidation.updatedAt = new Date().toISOString();

  await persistConsolidation(consolidation);
  broadcastConsolidationUpdate({
    consolidationId: consolidation.consolidationId,
    processId: consolidation.processId,
    type: 'sme-invited',
    metrics: consolidation.metrics,
    updatedAt: consolidation.updatedAt,
  });
  return consolidation;
}

export async function generateUnifiedBPMN(consolidationId: string, targetState: boolean = false): Promise<{ bpmnXml: string; note: string } | null> {
  const consolidation = await getConsolidationById(consolidationId);
  if (!consolidation) return null;

  // Use accepted steps first; fall back to ALL steps if fewer than 2 are accepted
  let stepsToRender = consolidation.steps.filter(s => s.accepted).length >= 2
    ? consolidation.steps.filter(s => s.accepted)
    : [...consolidation.steps].sort((a, b) => a.order - b.order);

  const note = stepsToRender.length === consolidation.steps.length && consolidation.steps.filter(s => s.accepted).length < 2
    ? 'Fewer than 2 steps are accepted — showing all steps. Accept steps in the Consolidated Process Flow to refine the diagram.'
    : 'Showing accepted steps only. Accept more steps in the Consolidated Process Flow to expand the diagram.';

  if (!targetState) {
    if (stepsToRender.length === 0) {
      // Don't hallucinate an AS-IS process if no steps exist
      const fallbackXml = buildBpmnXml(consolidation.processId, consolidation.processName, [], false);
      return { 
        bpmnXml: fallbackXml, 
        note: 'No interview data available yet to generate an AS-IS diagram. Please complete an SME interview.' 
      };
    }

    // AS-IS: Use LLM to build a structured swimlane model
    try {
      const prompt = buildAsIsModelPrompt(
        consolidation.processName,
        stepsToRender.map(s => ({ label: s.label, description: s.description }))
      );
      const res = await generateCompletion([
        { role: 'system', content: 'You are a BPMN process architect. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.2, maxTokens: 2000 });
      const { extractJSON } = require('../utils/jsonUtils');
      const model = extractJSON(res.content);
      if (model && model.nodes && model.flows) {
        const bpmnXml = buildSwimlaneXml(consolidation.processId, consolidation.processName, model);
        return { bpmnXml, note };
      }
    } catch (err: any) {
      console.warn('[bpmn] LLM swimlane generation failed, falling back to flat layout:', err.message);
    }
  }

  // TO-BE or AS-IS fallback: use the existing flat builder
  const bpmnXml = buildBpmnXml(consolidation.processId, consolidation.processName, stepsToRender, targetState);
  return { bpmnXml, note };
}

// ─── BPMN XML Builder ────────────────────────────────────────────────────────

/**
 * Builds a valid BPMN 2.0 XML string with:
 *  - bpmn:Process containing bpmn:StartEvent, one bpmn:SubProcess per phase,
 *    bpmn:EndEvent, and bpmn:SequenceFlow connectors
 *  - bpmndi:BPMNDiagram with auto-calculated layout (horizontal, left-to-right)
 *
 * Phase grouping: every PHASE_SIZE steps become one SubProcess. A sub-process
 * expands horizontally inside the main pool lane.
 */
function buildBpmnXml(processId: string, processName: string, steps: ConsolidatedStep[], targetState: boolean = false): string {
  const PHASE_SIZE = 4;                    // steps per subprocess
  const TASK_W = 140, TASK_H = 60;
  const TASK_GAP_X = 20, TASK_GAP_Y = 20;
  const SP_PAD_X = 30, SP_PAD_Y = 40;     // padding inside subprocess
  const SP_GAP_X = 80;                    // gap between subprocesses
  const START_X = 80, START_Y = 200;      // start event position
  const EVENT_R = 18;                      // radius of start/end circle
  const LANE_Y = 80;                       // top of the process lane

  function xmlId(raw: string) {
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  const procId = `Process_${xmlId(processId)}`;
  const defId  = `Definitions_${xmlId(processId)}`;

  // ── Split steps into phases ───────────────────────────────────────────────
  const phases: ConsolidatedStep[][] = [];
  for (let i = 0; i < steps.length; i += PHASE_SIZE) {
    phases.push(steps.slice(i, i + PHASE_SIZE));
  }

  // ── Calculate SubProcess widths ───────────────────────────────────────────
  interface PhaseLayout {
    spId: string;
    spX: number; spY: number; spW: number; spH: number;
    tasks: Array<{ taskId: string; label: string; x: number; y: number; w: number; h: number; isAi: boolean }>;
    inFlowId: string;
    outFlowId: string;
  }

  const phaseLayouts: PhaseLayout[] = [];
  let cursorX = START_X + EVENT_R * 2 + SP_GAP_X;
  const spY = LANE_Y + 60;
  const spH = SP_PAD_Y * 2 + TASK_H;

  phases.forEach((phase, pi) => {
    const spId = `SubProcess_Phase${pi + 1}`;
    const spW = SP_PAD_X * 2 + phase.length * (TASK_W + TASK_GAP_X) - TASK_GAP_X;
    const tasks = phase.map((step, si) => ({
      taskId: `Task_${xmlId(step.stepId)}`,
      label: step.label,
      x: cursorX + SP_PAD_X + si * (TASK_W + TASK_GAP_X),
      y: spY + SP_PAD_Y,
      w: TASK_W,
      h: TASK_H,
      isAi: !!step.aiProposedMerge,
    }));
    phaseLayouts.push({
      spId, spX: cursorX, spY, spW, spH,
      tasks,
      inFlowId: `Flow_to_SP${pi + 1}`,
      outFlowId: `Flow_from_SP${pi + 1}`,
    });
    cursorX += spW + SP_GAP_X;
  });

  const endX = cursorX + EVENT_R;
  const endY = START_Y;
  const startEventId = 'StartEvent_1';
  const endEventId   = 'EndEvent_1';
  const totalW = endX + EVENT_R * 2 + 80;
  const totalH = spY + spH + 120;

  // ── Task sequence flows inside each subprocess ───────────────────────────
  function taskFlows(pl: PhaseLayout): string {
    return pl.tasks.slice(0, -1).map((t, i) => {
      const fid = `Flow_${pl.spId}_T${i}`;
      return `    <bpmn:sequenceFlow id="${fid}" sourceRef="${t.taskId}" targetRef="${pl.tasks[i + 1].taskId}" />`;
    }).join('\n');
  }

  // ── BPMN semantic XML ─────────────────────────────────────────────────────
  const semanticLines: string[] = [];
  semanticLines.push(`  <bpmn:process id="${procId}" name="${escapeXml(processName)}" isExecutable="false">`);
  semanticLines.push(`    <bpmn:startEvent id="${startEventId}" name="Start" />`);

  phaseLayouts.forEach((pl, pi) => {
    const phaseName = phases.length > 1 ? `Phase ${pi + 1}` : processName;
    semanticLines.push(`    <bpmn:subProcess id="${pl.spId}" name="${escapeXml(phaseName)}" triggeredByEvent="false">`);
    semanticLines.push(`      <bpmn:startEvent id="${pl.spId}_Start" />`);
    pl.tasks.forEach(t => {
      semanticLines.push(`      <bpmn:task id="${t.taskId}" name="${escapeXml(t.label)}" />`);
    });
    semanticLines.push(`      <bpmn:endEvent id="${pl.spId}_End" />`);
    // inner flows: start→first task
    if (pl.tasks.length > 0) {
      semanticLines.push(`      <bpmn:sequenceFlow id="Flow_${pl.spId}_StoT0" sourceRef="${pl.spId}_Start" targetRef="${pl.tasks[0].taskId}" />`);
      semanticLines.push(taskFlows(pl));
      semanticLines.push(`      <bpmn:sequenceFlow id="Flow_${pl.spId}_TtoE" sourceRef="${pl.tasks[pl.tasks.length - 1].taskId}" targetRef="${pl.spId}_End" />`);
    }
    semanticLines.push(`    </bpmn:subProcess>`);

    // outer flow: prev element → this subprocess
    const prevRef = pi === 0 ? startEventId : phaseLayouts[pi - 1].spId;
    semanticLines.push(`    <bpmn:sequenceFlow id="${pl.inFlowId}" sourceRef="${prevRef}" targetRef="${pl.spId}" />`);
  });

  // last subprocess → end event
  if (phaseLayouts.length > 0) {
    const lastSP = phaseLayouts[phaseLayouts.length - 1];
    semanticLines.push(`    <bpmn:sequenceFlow id="Flow_to_End" sourceRef="${lastSP.spId}" targetRef="${endEventId}" />`);
  } else {
    semanticLines.push(`    <bpmn:sequenceFlow id="Flow_to_End" sourceRef="${startEventId}" targetRef="${endEventId}" />`);
  }
  semanticLines.push(`    <bpmn:endEvent id="${endEventId}" name="End" />`);
  semanticLines.push(`  </bpmn:process>`);

  // ── BPMNDI diagram section ────────────────────────────────────────────────
  const diagramLines: string[] = [];
  diagramLines.push(`  <bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
  diagramLines.push(`    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${procId}">`);

  // Start event shape
  diagramLines.push(`      <bpmndi:BPMNShape id="${startEventId}_di" bpmnElement="${startEventId}">`);
  diagramLines.push(`        <dc:Bounds x="${START_X}" y="${START_Y - EVENT_R}" width="${EVENT_R * 2}" height="${EVENT_R * 2}" />`);
  diagramLines.push(`      </bpmndi:BPMNShape>`);

  // SubProcess shapes + task shapes
  phaseLayouts.forEach(pl => {
    diagramLines.push(`      <bpmndi:BPMNShape id="${pl.spId}_di" bpmnElement="${pl.spId}" isExpanded="true">`);
    diagramLines.push(`        <dc:Bounds x="${pl.spX}" y="${pl.spY}" width="${pl.spW}" height="${pl.spH}" />`);
    diagramLines.push(`      </bpmndi:BPMNShape>`);

    // subprocess start/end events (small, inside)
    const innerStartX = pl.spX + 12, innerEndX = pl.spX + pl.spW - 30;
    const innerEventY = pl.spY + pl.spH / 2 - 9;
    diagramLines.push(`      <bpmndi:BPMNShape id="${pl.spId}_Start_di" bpmnElement="${pl.spId}_Start">`);
    diagramLines.push(`        <dc:Bounds x="${innerStartX}" y="${innerEventY}" width="18" height="18" />`);
    diagramLines.push(`      </bpmndi:BPMNShape>`);

    pl.tasks.forEach(t => {
      const colorAttr = (targetState && t.isAi) 
        ? ' bioc:stroke="#10b981" bioc:fill="#ecfdf5"' 
        : '';
      diagramLines.push(`      <bpmndi:BPMNShape id="${t.taskId}_di" bpmnElement="${t.taskId}"${colorAttr}>`);
      diagramLines.push(`        <dc:Bounds x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" />`);
      diagramLines.push(`      </bpmndi:BPMNShape>`);
    });

    diagramLines.push(`      <bpmndi:BPMNShape id="${pl.spId}_End_di" bpmnElement="${pl.spId}_End">`);
    diagramLines.push(`        <dc:Bounds x="${innerEndX}" y="${innerEventY}" width="18" height="18" />`);
    diagramLines.push(`      </bpmndi:BPMNShape>`);

    // inner task flows
    if (pl.tasks.length > 0) {
      // start → first task
      diagramLines.push(`      <bpmndi:BPMNEdge id="Flow_${pl.spId}_StoT0_di" bpmnElement="Flow_${pl.spId}_StoT0">`);
      diagramLines.push(`        <di:waypoint x="${innerStartX + 18}" y="${innerEventY + 9}" />`);
      diagramLines.push(`        <di:waypoint x="${pl.tasks[0].x}" y="${pl.tasks[0].y + pl.tasks[0].h / 2}" />`);
      diagramLines.push(`      </bpmndi:BPMNEdge>`);

      pl.tasks.slice(0, -1).forEach((t, i) => {
        const fid = `Flow_${pl.spId}_T${i}`;
        const next = pl.tasks[i + 1];
        diagramLines.push(`      <bpmndi:BPMNEdge id="${fid}_di" bpmnElement="${fid}">`);
        diagramLines.push(`        <di:waypoint x="${t.x + t.w}" y="${t.y + t.h / 2}" />`);
        diagramLines.push(`        <di:waypoint x="${next.x}" y="${next.y + next.h / 2}" />`);
        diagramLines.push(`      </bpmndi:BPMNEdge>`);
      });

      // last task → end
      const lastT = pl.tasks[pl.tasks.length - 1];
      diagramLines.push(`      <bpmndi:BPMNEdge id="Flow_${pl.spId}_TtoE_di" bpmnElement="Flow_${pl.spId}_TtoE">`);
      diagramLines.push(`        <di:waypoint x="${lastT.x + lastT.w}" y="${lastT.y + lastT.h / 2}" />`);
      diagramLines.push(`        <di:waypoint x="${innerEndX}" y="${innerEventY + 9}" />`);
      diagramLines.push(`      </bpmndi:BPMNEdge>`);
    }
  });

  // End event shape
  diagramLines.push(`      <bpmndi:BPMNShape id="${endEventId}_di" bpmnElement="${endEventId}">`);
  diagramLines.push(`        <dc:Bounds x="${endX}" y="${endY - EVENT_R}" width="${EVENT_R * 2}" height="${EVENT_R * 2}" />`);
  diagramLines.push(`      </bpmndi:BPMNShape>`);

  // Outer sequence flow edges (start → subprocesses → end)
  phaseLayouts.forEach((pl, pi) => {
    const prevRef = pi === 0 ? startEventId : phaseLayouts[pi - 1].spId;
    const prevX = pi === 0 ? START_X + EVENT_R * 2 : phaseLayouts[pi - 1].spX + phaseLayouts[pi - 1].spW;
    const prevY = pi === 0 ? START_Y : phaseLayouts[pi - 1].spY + phaseLayouts[pi - 1].spH / 2;
    const toY = pl.spY + pl.spH / 2;
    diagramLines.push(`      <bpmndi:BPMNEdge id="${pl.inFlowId}_di" bpmnElement="${pl.inFlowId}">`);
    diagramLines.push(`        <di:waypoint x="${prevX}" y="${prevY}" />`);
    diagramLines.push(`        <di:waypoint x="${pl.spX}" y="${toY}" />`);
    diagramLines.push(`      </bpmndi:BPMNEdge>`);
  });

  if (phaseLayouts.length > 0) {
    const lastPL = phaseLayouts[phaseLayouts.length - 1];
    diagramLines.push(`      <bpmndi:BPMNEdge id="Flow_to_End_di" bpmnElement="Flow_to_End">`);
    diagramLines.push(`        <di:waypoint x="${lastPL.spX + lastPL.spW}" y="${lastPL.spY + lastPL.spH / 2}" />`);
    diagramLines.push(`        <di:waypoint x="${endX}" y="${endY}" />`);
    diagramLines.push(`      </bpmndi:BPMNEdge>`);
  }

  diagramLines.push(`    </bpmndi:BPMNPlane>`);
  diagramLines.push(`  </bpmndi:BPMNDiagram>`);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<bpmn:definitions`,
    `  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"`,
    `  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"`,
    `  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"`,
    `  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"`,
    `  xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"`,
    `  id="${defId}"`,
    `  targetNamespace="http://bpmn.io/schema/bpmn"`,
    `  exporter="ERP Gap Analyzer" exporterVersion="1.0">`,
    semanticLines.join('\n'),
    diagramLines.join('\n'),
    `</bpmn:definitions>`,
  ].join('\n');

  return xml;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


async function getConsolidationById(consolidationId: string): Promise<MultiSMEConsolidation | null> {
  try {
    const res = await opensearchClient.get({
      index: INDICES.MULTI_SME_CONSOLIDATIONS,
      id: consolidationId,
    });
    return res.body._source as MultiSMEConsolidation;
  } catch {
    return null;
  }
}

async function persistConsolidation(consolidation: MultiSMEConsolidation): Promise<void> {
  await opensearchClient.index({
    index: INDICES.MULTI_SME_CONSOLIDATIONS,
    id: consolidation.consolidationId,
    body: consolidation,
    refresh: 'wait_for',
  });
}

// ─── Swimlane BPMN XML Builder ────────────────────────────────────────────────

interface AsIsNode {
  id: string;
  type: 'startEvent' | 'endEvent' | 'userTask' | 'serviceTask' | 'manualTask' | 'exclusiveGateway';
  label: string;
  lane: string;
  durationDays?: number;
}

interface AsIsFlow {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface AsIsLane {
  id: string;
  name: string;
  color?: string;
}

interface AsIsModel {
  lanes: AsIsLane[];
  nodes: AsIsNode[];
  flows: AsIsFlow[];
}

/**
 * Builds a BPMN 2.0 XML string with role-based swimlanes from an LLM-generated
 * structured process model. Produces a bpmn:Collaboration > bpmn:Participant >
 * bpmn:LaneSet layout with proper 2D coordinates.
 */
function buildSwimlaneXml(processId: string, processName: string, model: AsIsModel): string {
  function xmlId(raw: string) { return raw.replace(/[^a-zA-Z0-9_-]/g, '_'); }
  function xmlEsc(s: string) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }

  const procId = `Process_${xmlId(processId)}`;
  const defId = `Defs_${xmlId(processId)}`;
  const partId = `Part_${xmlId(processId)}`;

  const TASK_W = 120, TASK_H = 56;
  const GW_SIZE = 48;
  const EVT_R = 18;
  const H_GAP = 60;    // horizontal gap between nodes
  const LANE_H = 160;  // height per lane
  const LANE_LABEL_W = 120;
  const TOP_PAD = 20;
  const LEFT_PAD = 80;

  const lanes = model.lanes || [];
  const nodes = model.nodes || [];
  const flows = model.flows || [];

  // Assign sequential X positions based on flow order (topological-ish)
  const nodeOrder: Map<string, number> = new Map();
  let col = 0;
  // BFS order from start
  const visited = new Set<string>();
  const queue = nodes.filter(n => n.type === 'startEvent').map(n => n.id);
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    nodeOrder.set(id, col++);
    for (const f of flows) {
      if (f.from === id && !visited.has(f.to)) queue.push(f.to);
    }
  }
  // Any nodes not reached
  for (const n of nodes) {
    if (!nodeOrder.has(n.id)) nodeOrder.set(n.id, col++);
  }

  const laneIds = lanes.map(l => l.id);
  const laneIndex = (laneId: string) => {
    const i = laneIds.indexOf(laneId);
    return i >= 0 ? i : 0;
  };

  const nodeX = (n: AsIsNode) => LEFT_PAD + LANE_LABEL_W + (nodeOrder.get(n.id) || 0) * (TASK_W + H_GAP);
  const nodeY = (n: AsIsNode) => TOP_PAD + laneIndex(n.lane) * LANE_H + (LANE_H - TASK_H) / 2;
  const gwY = (n: AsIsNode) => TOP_PAD + laneIndex(n.lane) * LANE_H + (LANE_H - GW_SIZE) / 2;
  const evtY = (n: AsIsNode) => TOP_PAD + laneIndex(n.lane) * LANE_H + (LANE_H - EVT_R * 2) / 2;

  const totalCols = col;
  const totalW = LEFT_PAD + LANE_LABEL_W + totalCols * (TASK_W + H_GAP) + H_GAP;
  const totalH = TOP_PAD + lanes.length * LANE_H + 40;

  // ── BPMN semantic elements ─────────────────────────────────────────────────
  const processElements: string[] = [];

  for (const n of nodes) {
    const eid = xmlId(n.id);
    const label = xmlEsc(n.label.slice(0, 28));
    if (n.type === 'startEvent') {
      processElements.push(`    <bpmn:startEvent id="${eid}" name="${label}"><bpmn:outgoing>${flows.filter(f => f.from === n.id).map(f => xmlId(f.id)).join(' ')}</bpmn:outgoing></bpmn:startEvent>`);
    } else if (n.type === 'endEvent') {
      processElements.push(`    <bpmn:endEvent id="${eid}" name="${label}"><bpmn:incoming>${flows.filter(f => f.to === n.id).map(f => xmlId(f.id)).join(' ')}</bpmn:incoming></bpmn:endEvent>`);
    } else if (n.type === 'exclusiveGateway') {
      const inc = flows.filter(f => f.to === n.id).map(f => `<bpmn:incoming>${xmlId(f.id)}</bpmn:incoming>`).join('');
      const out = flows.filter(f => f.from === n.id).map(f => `<bpmn:outgoing>${xmlId(f.id)}</bpmn:outgoing>`).join('');
      processElements.push(`    <bpmn:exclusiveGateway id="${eid}" name="${label}">${inc}${out}</bpmn:exclusiveGateway>`);
    } else {
      const bpmnType = n.type === 'serviceTask' ? 'bpmn:serviceTask' : n.type === 'manualTask' ? 'bpmn:manualTask' : 'bpmn:userTask';
      const inc = flows.filter(f => f.to === n.id).map(f => `<bpmn:incoming>${xmlId(f.id)}</bpmn:incoming>`).join('');
      const out = flows.filter(f => f.from === n.id).map(f => `<bpmn:outgoing>${xmlId(f.id)}</bpmn:outgoing>`).join('');
      processElements.push(`    <${bpmnType} id="${eid}" name="${label}">${inc}${out}</${bpmnType}>`);
    }
  }

  for (const f of flows) {
    const fid = xmlId(f.id);
    const cond = f.label ? ` name="${xmlEsc(f.label)}"` : '';
    processElements.push(`    <bpmn:sequenceFlow id="${fid}" sourceRef="${xmlId(f.from)}" targetRef="${xmlId(f.to)}"${cond} />`);
  }

  // ── Lane set ───────────────────────────────────────────────────────────────
  const laneElements = lanes.map((lane, li) => {
    const laneNodes = nodes.filter(n => n.lane === lane.id);
    const refs = laneNodes.map(n => `      <bpmn:flowNodeRef>${xmlId(n.id)}</bpmn:flowNodeRef>`).join('\n');
    return `    <bpmn:lane id="Lane_${xmlId(lane.id)}" name="${xmlEsc(lane.name)}">\n${refs}\n    </bpmn:lane>`;
  }).join('\n');

  // ── DI shapes ─────────────────────────────────────────────────────────────
  const shapes: string[] = [];

  // Participant shape
  shapes.push(`      <bpmndi:BPMNShape id="${partId}_di" bpmnElement="${partId}" isHorizontal="true">
        <dc:Bounds x="${LEFT_PAD}" y="${TOP_PAD}" width="${totalW}" height="${totalH}" />
      </bpmndi:BPMNShape>`);

  // Lane shapes
  lanes.forEach((lane, li) => {
    shapes.push(`      <bpmndi:BPMNShape id="Lane_${xmlId(lane.id)}_di" bpmnElement="Lane_${xmlId(lane.id)}" isHorizontal="true">
        <dc:Bounds x="${LEFT_PAD + LANE_LABEL_W}" y="${TOP_PAD + li * LANE_H}" width="${totalW - LANE_LABEL_W}" height="${LANE_H}" />
      </bpmndi:BPMNShape>`);
  });

  // Node shapes
  for (const n of nodes) {
    const eid = xmlId(n.id);
    const label = xmlEsc(n.label.slice(0, 28));
    if (n.type === 'startEvent' || n.type === 'endEvent') {
      const x = nodeX(n), y = evtY(n);
      const colorAttr = n.type === 'startEvent' ? 'bioc:stroke="#10b981" bioc:fill="#d1fae5"' : 'bioc:stroke="#ef4444" bioc:fill="#fee2e2"';
      shapes.push(`      <bpmndi:BPMNShape id="${eid}_di" bpmnElement="${eid}" ${colorAttr}>
        <dc:Bounds x="${x}" y="${y}" width="${EVT_R * 2}" height="${EVT_R * 2}" />
        <bpmndi:BPMNLabel><dc:Bounds x="${x - 10}" y="${y + EVT_R * 2 + 5}" width="${EVT_R * 3}" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>`);
    } else if (n.type === 'exclusiveGateway') {
      const x = nodeX(n), y = gwY(n);
      shapes.push(`      <bpmndi:BPMNShape id="${eid}_di" bpmnElement="${eid}" isMarkerVisible="true" bioc:stroke="#f59e0b" bioc:fill="#fef3c7">
        <dc:Bounds x="${x}" y="${y}" width="${GW_SIZE}" height="${GW_SIZE}" />
        <bpmndi:BPMNLabel><dc:Bounds x="${x - 10}" y="${y + GW_SIZE + 5}" width="${GW_SIZE + 20}" height="28" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>`);
    } else {
      const x = nodeX(n), y = nodeY(n);
      shapes.push(`      <bpmndi:BPMNShape id="${eid}_di" bpmnElement="${eid}" bioc:stroke="#3b82f6" bioc:fill="#eff6ff">
        <dc:Bounds x="${x}" y="${y}" width="${TASK_W}" height="${TASK_H}" />
        <bpmndi:BPMNLabel />
      </bpmndi:BPMNShape>`);
    }
  }

  // Edge waypoints (orthogonal routing)
  const edges: string[] = [];
  for (const f of flows) {
    const fid = xmlId(f.id);
    const src = nodes.find(n => n.id === f.from);
    const tgt = nodes.find(n => n.id === f.to);
    if (!src || !tgt) continue;
    const sx = nodeX(src) + (src.type === 'exclusiveGateway' ? GW_SIZE : src.type === 'startEvent' || src.type === 'endEvent' ? EVT_R * 2 : TASK_W);
    const sy = nodeY(src) + (src.type === 'exclusiveGateway' ? GW_SIZE/2 : src.type === 'startEvent' || src.type === 'endEvent' ? EVT_R : TASK_H / 2);
    const tx = nodeX(tgt);
    const ty = nodeY(tgt) + (tgt.type === 'exclusiveGateway' ? GW_SIZE/2 : tgt.type === 'startEvent' || tgt.type === 'endEvent' ? EVT_R : TASK_H / 2);
    
    // Manhattan routing
    let midX = sx + 20;
    if (tx > sx) midX = sx + (tx - sx) / 2;

    const cond = f.label ? `<bpmndi:BPMNLabel><dc:Bounds x="${midX - 15}" y="${(sy + ty) / 2 - 10}" width="30" height="14" /></bpmndi:BPMNLabel>` : '';
    edges.push(`      <bpmndi:BPMNEdge id="${fid}_di" bpmnElement="${fid}">
        <di:waypoint x="${sx}" y="${sy}" />
        <di:waypoint x="${midX}" y="${sy}" />
        <di:waypoint x="${midX}" y="${ty}" />
        <di:waypoint x="${tx}" y="${ty}" />
        ${cond}
      </bpmndi:BPMNEdge>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"
                  xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0"
                  id="${defId}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_${xmlId(processId)}">
    <bpmn:participant id="${partId}" name="${xmlEsc(processName)}" processRef="${procId}" />
  </bpmn:collaboration>
  <bpmn:process id="${procId}" isExecutable="false">
    <bpmn:laneSet id="LaneSet_${xmlId(processId)}">
${laneElements}
    </bpmn:laneSet>
${processElements.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_${xmlId(processId)}">
${shapes.join('\n')}
${edges.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
