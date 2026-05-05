/**
 * Seed script: injects a realistic banking assessment session + gap report
 * into OpenSearch so the Banking Dashboard can be tested immediately.
 *
 * Run once from the backend directory:
 *   node seed-banking-demo.mjs
 *
 * Safe to re-run — uses fixed IDs so it upserts rather than duplicates.
 */

import { Client } from '@opensearch-project/opensearch';

const client = new Client({
    node: process.env.OPENSEARCH_NODE || 'http://localhost:9200',
    ssl: { rejectUnauthorized: false },
});

const CONVERSATIONS_INDEX = 'consultant_conversations';
const REPORTS_INDEX = 'consultant_reports';

const SESSION_ID  = 'demo-banking-session-001';
const REPORT_ID   = 'demo-banking-report-001';
const NOW         = new Date().toISOString();
const DOMAIN_ID   = 'banking';
const USER_ID     = 'seed-script';

// ── Session document ─────────────────────────────────────────────────────────
const session = {
    conversationId: SESSION_ID,
    sessionType: 'interview_session',
    sessionName: 'Banking Demo Assessment',
    domainId: DOMAIN_ID,
    userId: USER_ID,
    username: 'Demo User',
    status: 'completed',
    completionRate: 100,
    selectedAreas: [
        'kyc_aml',
        'account_opening',
        'credit_assessment',
        'underwriting',
        'disbursement',
        'payment_processing',
    ],
    coverage: {
        kyc_aml:           { questionsAnswered: 4, aiConfident: true, status: 'covered' },
        account_opening:   { questionsAnswered: 3, aiConfident: true, status: 'covered' },
        credit_assessment: { questionsAnswered: 5, aiConfident: true, status: 'covered' },
        underwriting:      { questionsAnswered: 4, aiConfident: true, status: 'covered' },
        disbursement:      { questionsAnswered: 3, aiConfident: true, status: 'covered' },
        payment_processing:{ questionsAnswered: 4, aiConfident: true, status: 'covered' },
    },
    responses: {
        kyc_aml: [
            { question: 'How does the bank verify customer identity today?', answer: 'We use Absher for Saudi nationals and manual Iqama checks for expats. No Nafath integration yet.' },
            { question: 'What AML screening tools are in use?', answer: 'We use Oracle FCCM for batch screening. Transaction monitoring uses static rules, updated quarterly.' },
            { question: 'How are STRs filed with SAMA SAFIU?', answer: 'Manually via the goAML portal. Takes 3-5 days per report. Compliance team does it.' },
            { question: 'What is the false positive rate on your AML alerts?', answer: 'Roughly 65–70% of alerts are false positives. No ML tuning in place yet.' },
        ],
        account_opening: [
            { question: 'What is the current account opening TAT?', answer: 'About 2-3 working days. Requires a branch visit even for digital applications.' },
            { question: 'What is your STP rate for account opening?', answer: 'Less than 20%. Most cases need manual data entry into the core banking system.' },
            { question: 'How is SIMAH checked during onboarding?', answer: 'Operations team pulls the SIMAH report manually at the time of account opening.' },
        ],
        credit_assessment: [
            { question: 'What bureau data do you pull for credit decisions?', answer: 'Only SIMAH. We do not currently use ZATCA or SAMA Open Banking data.' },
            { question: 'What is the cycle time from application to credit decision?', answer: 'About 7-10 working days for retail. Corporate takes 3-4 weeks.' },
            { question: 'Do you have automated scoring models?', answer: 'Basic scorecards for salary-based retail products. Not integrated into the LOS workflow.' },
            { question: 'What is your typical override rate?', answer: 'Around 35%. We track it but do not have root cause analysis in place.' },
            { question: 'How do you handle Shari\'ah compliance checks?', answer: 'Manual step by the product team before sanction. Not workflow-managed.' },
        ],
        underwriting: [
            { question: 'How is collateral registered with REGA?', answer: 'Manual process. Average 3-4 weeks after disbursement to register the property.' },
            { question: 'How long is the sanction-to-disbursement window?', answer: '10-15 working days on average. Main delays are in legal due diligence and Wathiq notarisation.' },
            { question: 'Are sanction letters generated digitally?', answer: 'Word document templates. Printed and physically signed, then scanned and emailed.' },
            { question: 'How do you manage empanelled valuers?', answer: 'Manual roster. Assignment is ad-hoc. No SLA tracking.' },
        ],
        disbursement: [
            { question: 'How are financing funds transferred?', answer: 'Via SARIE initiated manually by operations. Takes 1-2 days after all conditions are cleared.' },
            { question: 'What is the pre-disbursement condition check process?', answer: 'Paper checklist tracked in a shared Excel spreadsheet. No system enforcement.' },
            { question: 'What is your disbursement STP rate?', answer: 'About 15%. Almost all cases require manual intervention at some stage.' },
        ],
        payment_processing: [
            { question: 'What payment systems does the bank operate?', answer: 'SARIE for high-value. mada for debit. SADAD for bill payments. All on separate systems.' },
            { question: 'What is the failed transaction rate?', answer: 'About 3% for SARIE. mada failures at 1.5%. Manual investigation for all failures.' },
            { question: 'How is Direct Debit managed?', answer: 'Electronically through Saudi Payments but mandate management is in a separate spreadsheet.' },
            { question: 'How do you handle peak periods like Ramadan or government salary cycles?', answer: 'We staff up operations manually. No automated scaling or predictive capacity planning.' },
        ],
    },
    conversationContext: {
        identifiedGaps: [
            'No Nafath digital identity integration — branch visits still required',
            'High AML false positive rate (65-70%) with no ML tuning',
            'Manual STR filing via goAML — 3-5 day delay',
            'Account opening TAT 2-3 days vs industry STP best practice of <15 minutes',
            'STP rate under 20% across financing origination',
            'SIMAH-only bureau data — ZATCA and Open Banking not leveraged',
            'Credit decisioning cycle 7-10 days for retail',
            'REGA collateral registration delayed by 3-4 weeks post-disbursement',
            'Manual sanction letters — paper, signature, scan workflow',
            'SARIE disbursement manually initiated — no STP',
            'Siloed payment systems for SARIE, mada, SADAD',
            'No intraday liquidity monitoring across SARIE positions',
        ],
        painPoints: [
            'High operational cost per financing due to manual interventions',
            'SAMA inspection risk from delayed REGA registration',
            'Customer drop-off during long KYC and account opening journeys',
            'Compliance burden from manual goAML reporting',
            'Inability to scale during Ramadan and Hajj peaks',
        ],
        transformationOpportunities: [
            'Nafath e-KYC eliminates branch visits and cuts onboarding TAT to same-day',
            'AI-assisted AML screening to reduce false positives by 40%+',
            'Unified payment hub consolidating SARIE, mada, SADAD',
            'REGA API integration for real-time collateral registration',
            'ZATCA and SAMA Open Banking data for alternative credit scoring',
        ],
    },
    messages: [],
    context: 'Banking process transformation assessment for a mid-sized Saudi retail and commercial bank',
    createdAt: NOW,
    updatedAt: NOW,
};

// ── Report document ──────────────────────────────────────────────────────────
const reportContent = {
    sessionId: SESSION_ID,
    generatedAt: NOW,
    executiveSummary: `This assessment reveals a mid-maturity banking institution (overall score 38/100) with significant automation opportunities across the financing origination and customer onboarding value chains. The bank operates largely on manual workflows with minimal integration between its core banking platform, SARIE, mada, and SADAD payment systems. The most critical gaps — absent Nafath e-KYC, unintegrated REGA collateral registration, and siloed payment infrastructure — create SAMA compliance exposure and suppress STP rates to below 20%. A structured transformation targeting these areas over 18 months could reduce the average financing cycle time from 14 days to under 48 hours and cut cost per financing by approximately 55%, delivering an estimated SAR 8.2M in annualised operational savings.`,

    bankingKpis: {
        avgCycleTimeDays: {
            current: 14,
            target: 2,
            unit: 'days',
            label: 'Avg Financing Cycle Time',
        },
        costPerLoan: {
            current: 4200,
            target: 1900,
            unit: 'SAR',
            label: 'Cost per Financing',
        },
        stpRate: {
            current: 15,
            target: 72,
            unit: '%',
            label: 'STP Rate',
        },
        npaRatio: {
            current: 4.8,
            target: 2.1,
            unit: '%',
            label: 'NPL Ratio',
        },
    },

    gaps: [
        { id: 'GAP-001', category: 'technology', area: 'KYC / AML', currentState: 'Manual Iqama and Absher checks at branch; no Nafath integration', targetState: 'Remote e-KYC via Nafath with biometric liveness and Absher API', gap: 'No digital identity integration — branch visit mandatory', impact: 'high', effort: 'medium', fit: 'gap', standard: 'SAMA Digital Banking Guidelines', priority: 6 },
        { id: 'GAP-002', category: 'process', area: 'KYC / AML', currentState: '65-70% false positive rate; static AML rules updated quarterly', targetState: 'ML-tuned AML with <30% false positive rate and dynamic rule updates', gap: 'No ML-based AML risk scoring; high false positive burden', impact: 'high', effort: 'medium', fit: 'gap', standard: 'SAMA AML/CFT Guidelines', priority: 6 },
        { id: 'GAP-003', category: 'process', area: 'KYC / AML', currentState: 'Manual STR filing via goAML portal; 3-5 day delay', targetState: 'Automated STR workflow with direct goAML API submission', gap: 'Manual STR filing creates SAMA SAFIU compliance risk', impact: 'high', effort: 'low', fit: 'gap', standard: 'SAMA AML/CFT Guidelines', priority: 9 },
        { id: 'GAP-004', category: 'process', area: 'Account Opening', currentState: 'Branch visit required; 2-3 day TAT; <20% STP', targetState: 'Fully digital Nafath-based opening; same-day TAT; >80% STP', gap: 'No straight-through digital account opening journey', impact: 'high', effort: 'medium', fit: 'gap', standard: 'SAMA Digital Banking Guidelines', priority: 6 },
        { id: 'GAP-005', category: 'technology', area: 'Credit Assessment', currentState: 'SIMAH only; basic scorecards not integrated into LOS', targetState: 'SIMAH + ZATCA + SAMA Open Banking; AI-integrated scoring in LOS', gap: 'Alternative data sources not leveraged; scoring not workflow-integrated', impact: 'high', effort: 'high', fit: 'gap', standard: 'SAMA Prudential Guidelines', priority: 3 },
        { id: 'GAP-006', category: 'process', area: 'Credit Assessment', currentState: '7-10 day retail credit cycle; 35% override rate unanalysed', targetState: '<24 hour retail decisioning; override rate <15% with root cause tracking', gap: 'Long credit cycle and uncontrolled override rate', impact: 'high', effort: 'medium', fit: 'gap', standard: 'APQC PCF Benchmark', priority: 6 },
        { id: 'GAP-007', category: 'technology', area: 'Underwriting & Sanction', currentState: 'REGA registration manual; 3-4 weeks post-disbursement delay', targetState: 'Automated REGA API call at disbursement; <1 minute registration', gap: 'REGA collateral registration not integrated — SAMA compliance risk', impact: 'high', effort: 'low', fit: 'gap', standard: 'Saudi Real Estate Financing Law', priority: 9 },
        { id: 'GAP-008', category: 'process', area: 'Underwriting & Sanction', currentState: 'Paper sanction letters; manual signing and scanning', targetState: 'Digital sanction letters with Nafath e-signature', gap: 'No digital document execution capability', impact: 'medium', effort: 'low', fit: 'gap', standard: 'SAMA Digital Banking Guidelines', priority: 6 },
        { id: 'GAP-009', category: 'process', area: 'Disbursement', currentState: 'SARIE transfer manually initiated; <15% STP; Excel condition tracking', targetState: 'Automated LOS-to-SARIE disbursement; >75% STP; in-system conditions', gap: 'No automated disbursement integration between LOS and SARIE', impact: 'high', effort: 'medium', fit: 'gap', standard: 'APQC PCF Benchmark', priority: 6 },
        { id: 'GAP-010', category: 'technology', area: 'SARIE / mada / SADAD Processing', currentState: 'Siloed payment systems; manual failure investigation; no unified hub', targetState: 'Unified payment hub for SARIE, mada, SADAD with automated failure handling', gap: 'Fragmented payment infrastructure increases operational risk and cost', impact: 'high', effort: 'high', fit: 'gap', standard: 'Saudi Payments Framework', priority: 3 },
    ],

    quickWins: [
        { id: 'GAP-003', category: 'process', area: 'KYC / AML', currentState: 'Manual STR filing via goAML; 3-5 day delay', targetState: 'Automated STR workflow with goAML API submission', gap: 'Manual STR filing creates SAMA SAFIU compliance risk', impact: 'high', effort: 'low', fit: 'gap', standard: 'SAMA AML/CFT Guidelines', priority: 9 },
        { id: 'GAP-007', category: 'technology', area: 'Underwriting & Sanction', currentState: 'REGA registration manual; 3-4 week delay', targetState: 'Real-time REGA API at disbursement', gap: 'REGA registration not integrated — SAMA compliance risk', impact: 'high', effort: 'low', fit: 'gap', standard: 'Saudi Real Estate Financing Law', priority: 9 },
        { id: 'GAP-008', category: 'process', area: 'Underwriting & Sanction', currentState: 'Paper sanction letters', targetState: 'Nafath e-signature digital contracts', gap: 'No digital document execution', impact: 'medium', effort: 'low', fit: 'gap', standard: 'SAMA Digital Banking Guidelines', priority: 6 },
    ],

    roadmap: [
        {
            phase: 'Phase 1 — Quick Compliance Wins (0–3 months)',
            duration: '3 months',
            items: [
                'Automate STR filing via goAML API — eliminate 3-5 day delay and SAMA SAFIU risk',
                'Integrate REGA API at disbursement for real-time collateral registration',
                'Implement Nafath e-signature for sanction letters and financing contracts',
                'Deploy direct Absher API verification to reduce branch dependency for KYC',
            ],
        },
        {
            phase: 'Phase 2 — Digital Origination (3–9 months)',
            duration: '6 months',
            items: [
                'Launch Nafath-based remote digital account opening — target same-day TAT',
                'Integrate LOS with SIMAH, ZATCA income verification, and SAMA Open Banking',
                'Deploy AI-assisted AML risk scoring to reduce false positives below 30%',
                'Build LOS-to-SARIE automated disbursement pipeline — target 60%+ STP',
            ],
        },
        {
            phase: 'Phase 3 — Unified Payments & Analytics (9–18 months)',
            duration: '9 months',
            items: [
                'Implement unified payment hub consolidating SARIE, mada, and SADAD',
                'Deploy predictive delinquency models using GOSI payroll and SIMAH signals',
                'Build real-time SAMA supervisory reporting data mart',
                'Launch AI-driven credit scoring with ML ensemble models for retail STP',
            ],
        },
    ],

    riskAssessment: [
        { risk: 'SAMA inspection finding on delayed REGA collateral registration', likelihood: 'high', impact: 'high', mitigation: 'Priority REGA API integration in Phase 1; interim manual SLA tracking to <5 days' },
        { risk: 'goAML STR backlog attracting SAFIU scrutiny', likelihood: 'medium', impact: 'high', mitigation: 'Automate goAML API submission in Phase 1; clear existing backlog within 30 days' },
        { risk: 'Nafath API availability and NCA certification requirements', likelihood: 'medium', impact: 'medium', mitigation: 'Engage Nafath integration partner early; run parallel manual track during transition' },
        { risk: 'Core banking vendor lock-in limiting payment hub integration', likelihood: 'medium', impact: 'medium', mitigation: 'Assess middleware API layer; engage Temenos/FLEXCUBE integration specialists' },
    ],

    overallScore: 38,
    overallMaturity: 'developing',
    areaScores: [
        { areaId: 'kyc_aml', areaName: 'KYC / AML', score: 32, maturityLevel: 'developing', strengths: ['Absher verification available at branch', 'goAML portal access in place'], weaknesses: ['No Nafath integration', 'High AML false positive rate', 'Manual STR filing'], recommendations: ['Automate goAML API', 'Deploy ML AML scoring', 'Integrate Nafath e-KYC'] },
        { areaId: 'account_opening', areaName: 'Account Opening', score: 28, maturityLevel: 'developing', strengths: ['SIMAH deduplication in place', 'Digital form available'], weaknesses: ['Branch visit mandatory', '<20% STP', '2-3 day TAT'], recommendations: ['Launch Nafath remote onboarding', 'Automate core banking data flow'] },
        { areaId: 'credit_assessment', areaName: 'Credit Assessment', score: 35, maturityLevel: 'developing', strengths: ['SIMAH integrated', 'Basic scorecards for retail'], weaknesses: ['ZATCA/Open Banking not used', '35% override rate', '7-10 day cycle'], recommendations: ['Integrate ZATCA income data', 'Build AI credit scoring', 'Enforce override governance'] },
        { areaId: 'underwriting', areaName: 'Underwriting & Sanction', score: 30, maturityLevel: 'developing', strengths: ['Standard sanction templates exist', 'REGA process understood'], weaknesses: ['REGA registration delayed 3-4 weeks', 'Paper sanction letters', 'Manual valuer assignment'], recommendations: ['REGA API integration', 'Nafath e-signature', 'Digital valuer portal'] },
        { areaId: 'disbursement', areaName: 'Disbursement', score: 28, maturityLevel: 'developing', strengths: ['SARIE connectivity in place', 'Condition checklist exists'], weaknesses: ['<15% STP', 'Excel-tracked conditions', 'Manual SARIE initiation'], recommendations: ['LOS-to-SARIE automated disbursement', 'In-system condition tracking'] },
        { areaId: 'payment_processing', areaName: 'SARIE / mada / SADAD Processing', score: 42, maturityLevel: 'developing', strengths: ['All major channels connected', 'Saudi Payments membership active'], weaknesses: ['Siloed systems', 'Manual failure handling', 'No peak capacity scaling'], recommendations: ['Unified payment hub', 'Automated failure remediation', 'Predictive peak planning'] },
    ],
    keyFindings: [
        'Overall maturity score of 38/100 places the bank in the "Developing" tier — significant gap to APQC top quartile benchmark of 75',
        'REGA collateral registration delay of 3-4 weeks post-disbursement creates material SAMA compliance exposure',
        'STP rate of 15% across financing origination drives cost per financing 120% above APQC median (SAR 4,200 vs SAR 1,900 target)',
        'AML false positive rate of 65-70% consumes significant compliance resource and masks genuine risk signals',
        'Manual goAML STR filing with 3-5 day lag is a priority SAMA SAFIU compliance risk',
        'Siloed SARIE, mada, and SADAD payment infrastructure prevents unified monitoring and increases operational risk',
    ],
    priorityRecommendations: [
        'Immediate: Automate REGA API registration at disbursement and goAML STR filing — SAMA compliance risk mitigation',
        'Short-term (0-3M): Integrate Nafath e-KYC and launch digital account opening journey',
        'Medium-term (3-9M): Deploy ZATCA + Open Banking-enriched AI credit scoring and LOS-to-SARIE automated disbursement',
        'Long-term (9-18M): Implement unified payment hub and real-time SAMA supervisory reporting data mart',
    ],
    chartData: {
        maturityRadar: [
            { area: 'KYC / AML',        current: 32, target: 75, fullMark: 100 },
            { area: 'Account Opening',   current: 28, target: 75, fullMark: 100 },
            { area: 'Credit Assessment', current: 35, target: 75, fullMark: 100 },
            { area: 'Underwriting',      current: 30, target: 75, fullMark: 100 },
            { area: 'Disbursement',      current: 28, target: 75, fullMark: 100 },
            { area: 'Payments',          current: 42, target: 75, fullMark: 100 },
        ],
        impactEffortBubble: [
            { name: 'Automate STR via goAML',    impact: 9, effort: 2, priority: 9, category: 'Process' },
            { name: 'REGA API at disbursement',  impact: 9, effort: 3, priority: 9, category: 'Technology' },
            { name: 'Nafath e-KYC',              impact: 8, effort: 5, priority: 6, category: 'Technology' },
            { name: 'AI AML scoring',            impact: 7, effort: 5, priority: 6, category: 'Technology' },
            { name: 'Digital account opening',   impact: 8, effort: 5, priority: 6, category: 'Process' },
            { name: 'LOS-to-SARIE STP',          impact: 8, effort: 5, priority: 6, category: 'Process' },
            { name: 'Unified payment hub',       impact: 7, effort: 8, priority: 3, category: 'Technology' },
            { name: 'ZATCA credit data',         impact: 6, effort: 7, priority: 3, category: 'Technology' },
        ],
        kpiBarChart: [
            { category: 'KYC / AML',        score: 32, benchmark: 75 },
            { category: 'Account Opening',   score: 28, benchmark: 75 },
            { category: 'Credit Assessment', score: 35, benchmark: 75 },
            { category: 'Underwriting',      score: 30, benchmark: 75 },
            { category: 'Disbursement',      score: 28, benchmark: 75 },
            { category: 'Payments',          score: 42, benchmark: 75 },
        ],
        gapsByCategory: [
            { name: 'Process',    count: 5, highImpact: 4 },
            { name: 'Technology', count: 4, highImpact: 3 },
            { name: 'Capability', count: 1, highImpact: 0 },
            { name: 'Data',       count: 0, highImpact: 0 },
        ],
    },
};

// ── Write to OpenSearch ──────────────────────────────────────────────────────
async function seed() {
    console.log('Connecting to OpenSearch…');

    // Verify connection
    try {
        await client.info();
        console.log('✅ Connected to OpenSearch');
    } catch (err) {
        console.error('❌ Cannot connect to OpenSearch:', err.message);
        process.exit(1);
    }

    // Upsert session
    console.log('\nUpserting demo session…');
    await client.index({
        index: CONVERSATIONS_INDEX,
        id: SESSION_ID,
        body: session,
        refresh: true,
    });
    console.log(`✅ Session written: id="${SESSION_ID}" index="${CONVERSATIONS_INDEX}"`);

    // Upsert report
    console.log('\nUpserting demo report…');
    const reportDoc = {
        reportId: REPORT_ID,
        sessionId: SESSION_ID,
        name: 'Banking Gap Analysis — Demo',
        type: 'gap',
        broadAreaId: 'all',
        broadAreaName: 'All Areas',
        domainId: DOMAIN_ID,
        generatedBy: USER_ID,
        status: 'ready',
        fileSize: '42 KB',
        downloadCount: 0,
        content: reportContent,
        createdAt: NOW,
        updatedAt: NOW,
    };

    await client.index({
        index: REPORTS_INDEX,
        id: REPORT_ID,
        body: reportDoc,
        refresh: true,
    });
    console.log(`✅ Report written: id="${REPORT_ID}" index="${REPORTS_INDEX}"`);

    // Verify the bankingKpis are retrievable (same query as dashboard route)
    console.log('\nVerifying banking KPI query…');
    const check = await client.search({
        index: REPORTS_INDEX,
        body: {
            query: { bool: { must: [
                { term: { status: 'ready' } },
                { term: { domainId: 'banking' } },
            ] } },
            size: 10,
            _source: ['content.bankingKpis'],
        },
    });

    const hit = check.body.hits.hits.find(h => h._source?.content?.bankingKpis != null);
    if (hit) {
        const kpis = hit._source?.content?.bankingKpis;
        console.log('✅ Banking KPI query returns data:');
        console.log(`   Cycle Time:  ${kpis.avgCycleTimeDays.current} → ${kpis.avgCycleTimeDays.target} days`);
        console.log(`   Cost:        SAR ${kpis.costPerLoan.current} → SAR ${kpis.costPerLoan.target}`);
        console.log(`   STP Rate:    ${kpis.stpRate.current}% → ${kpis.stpRate.target}%`);
        console.log(`   NPL Ratio:   ${kpis.npaRatio.current}% → ${kpis.npaRatio.target}%`);
    } else {
        console.error('❌ Banking KPI query returned no results — check index mapping');
    }

    console.log('\n✅ Seed complete. Refresh the Banking Dashboard to see the KPIs.');
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
