import jsPDF from 'jspdf';

interface AreaScore {
  areaName: string;
  score: number;
  maturityLevel: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

interface GapEntry {
  area: string;
  gap: string;
  currentState: string;
  targetState: string;
  impact: string;
  effort: string;
  category?: string;
  fit?: string;
}

interface QuickWin {
  area: string;
  gap: string;
  category?: string;
  impact?: string;
}

interface RoadmapPhase {
  phase: string;
  duration: string;
  items: string[];
}

interface RiskEntry {
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
}

export interface ReportPDFData {
  name: string;
  type: string;
  generatedAt: string;
  // Overview tab data
  executiveSummary?: string;
  overallScore?: number;
  overallMaturity?: string;
  keyFindings?: string[];
  priorityRecommendations?: string[];
  areaScores?: AreaScore[];
  // Gap tab data
  gaps?: GapEntry[];
  quickWins?: QuickWin[];
  roadmap?: RoadmapPhase[];
  riskAssessment?: RiskEntry[];
  // Q&A tab data
  responses?: Record<string, { question: string; answer: string | string[] | number }[]>;
}

export async function generateReportPDF(data: ReportPDFData): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const addPage = () => {
    doc.addPage();
    y = margin;
  };

  const checkPage = (needed: number) => {
    if (y + needed > 270) addPage();
  };

  // Helper to add wrapped text
  const addText = (
    text: string,
    fontSize: number,
    options?: { bold?: boolean; color?: [number, number, number] },
  ) => {
    doc.setFontSize(fontSize);
    if (options?.bold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    if (options?.color) doc.setTextColor(...options.color);
    else doc.setTextColor(40, 40, 40);
    const lines: string[] = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      checkPage(fontSize * 0.5);
      doc.text(line, margin, y);
      y += fontSize * 0.45;
    }
    y += 2;
  };

  const addSectionHeader = (title: string) => {
    checkPage(15);
    y += 5;
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y - 5, contentWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 3, y + 2);
    y += 12;
    doc.setTextColor(40, 40, 40);
  };

  // ===== TITLE PAGE =====
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 297, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('ProcessIQ Discovery', pageWidth / 2, 80, { align: 'center' });
  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.text(data.name || 'Assessment Report', pageWidth / 2, 100, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`Type: ${data.type || 'Report'}`, pageWidth / 2, 120, { align: 'center' });
  doc.text(
    `Generated: ${new Date(data.generatedAt || Date.now()).toLocaleDateString()}`,
    pageWidth / 2,
    130,
    { align: 'center' },
  );
  if (data.overallScore !== undefined) {
    doc.setFontSize(48);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.overallScore}`, pageWidth / 2, 170, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Overall Score - ${data.overallMaturity || ''}`, pageWidth / 2, 185, {
      align: 'center',
    });
  }

  // ===== OVERVIEW TAB =====
  addPage();
  doc.setTextColor(40, 40, 40);

  if (data.executiveSummary) {
    addSectionHeader('EXECUTIVE SUMMARY');
    addText(data.executiveSummary, 11);
  }

  if (data.keyFindings?.length) {
    addSectionHeader('KEY FINDINGS');
    for (const finding of data.keyFindings) {
      addText(`  - ${finding}`, 10);
    }
  }

  if (data.priorityRecommendations?.length) {
    addSectionHeader('PRIORITY RECOMMENDATIONS');
    for (const rec of data.priorityRecommendations) {
      addText(`  - ${rec}`, 10);
    }
  }

  if (data.areaScores?.length) {
    addSectionHeader('AREA SCORES');
    for (const area of data.areaScores) {
      checkPage(30);
      addText(
        `${area.areaName} - Score: ${area.score}/100 (${area.maturityLevel})`,
        11,
        { bold: true },
      );
      if (area.strengths?.length) {
        addText('Strengths:', 10, { bold: true, color: [34, 197, 94] });
        for (const s of area.strengths) addText(`  + ${s}`, 9);
      }
      if (area.weaknesses?.length) {
        addText('Weaknesses:', 10, { bold: true, color: [239, 68, 68] });
        for (const w of area.weaknesses) addText(`  - ${w}`, 9);
      }
      if (area.recommendations?.length) {
        addText('Recommendations:', 10, { bold: true, color: [59, 130, 246] });
        for (const r of area.recommendations) addText(`  > ${r}`, 9);
      }
      y += 4;
    }
  }

  // ===== GAPS TAB =====
  if (data.gaps?.length) {
    addPage();
    addSectionHeader('GAP ANALYSIS');
    for (const gap of data.gaps) {
      checkPage(25);
      addText(`${gap.area}: ${gap.gap}`, 11, { bold: true });
      addText(`Current: ${gap.currentState}`, 9);
      addText(`Target: ${gap.targetState}`, 9);
      addText(
        `Impact: ${gap.impact} | Effort: ${gap.effort}`,
        9,
        { color: gap.impact === 'high' ? [239, 68, 68] : [100, 100, 100] },
      );
      y += 3;
    }

    if (data.quickWins?.length) {
      addSectionHeader('QUICK WINS');
      for (const qw of data.quickWins) {
        addText(`[${qw.area || qw.category || ''}] ${qw.gap}`, 10);
      }
    }

    if (data.roadmap?.length) {
      addSectionHeader('ROADMAP');
      for (const phase of data.roadmap) {
        addText(`${phase.phase} (${phase.duration})`, 11, { bold: true });
        for (const item of phase.items) addText(`  - ${item}`, 9);
        y += 3;
      }
    }

    if (data.riskAssessment?.length) {
      addSectionHeader('RISK ASSESSMENT');
      for (const risk of data.riskAssessment) {
        checkPage(20);
        addText(`${risk.risk}`, 10, { bold: true });
        addText(`Likelihood: ${risk.likelihood} | Impact: ${risk.impact}`, 9);
        addText(`Mitigation: ${risk.mitigation}`, 9);
        y += 3;
      }
    }
  }

  // ===== Q&A TAB =====
  if (data.responses && Object.keys(data.responses).length > 0) {
    addPage();
    addSectionHeader('INTERVIEW Q&A');
    for (const [areaId, qas] of Object.entries(data.responses)) {
      addText(areaId, 12, { bold: true });
      for (const qa of qas) {
        checkPage(15);
        addText(`Q: ${qa.question}`, 10, { bold: true });
        let answer: string;
        if (typeof qa.answer === 'string') {
          answer = qa.answer;
        } else if (Array.isArray(qa.answer)) {
          answer = qa.answer.join(', ');
        } else {
          answer = JSON.stringify(qa.answer);
        }
        addText(`A: ${answer}`, 10);
        y += 2;
      }
      y += 5;
    }
  }

  // Save
  const safeName = (data.name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  doc.save(`${safeName}.pdf`);
}
