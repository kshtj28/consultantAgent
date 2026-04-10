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

// Color palette
const COLORS = {
  primary: [15, 23, 42] as [number, number, number],       // slate-900
  headerBg: [30, 41, 59] as [number, number, number],      // slate-800
  accent: [99, 102, 241] as [number, number, number],      // indigo-500
  text: [40, 40, 40] as [number, number, number],
  textLight: [100, 116, 139] as [number, number, number],  // slate-500
  white: [255, 255, 255] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  blue: [59, 130, 246] as [number, number, number],
  tableRowAlt: [241, 245, 249] as [number, number, number], // slate-100
  tableBorder: [203, 213, 225] as [number, number, number], // slate-300
};

export async function generateReportPDF(data: ReportPDFData): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // Track sections for TOC
  const tocEntries: { title: string; page: number }[] = [];
  let currentPage = 1;

  const getPageNum = () => currentPage;

  const addPage = () => {
    doc.addPage();
    currentPage++;
    y = margin + 10; // leave room for header line
  };

  const checkPage = (needed: number) => {
    if (y + needed > pageHeight - 20) addPage();
  };

  // Add page numbers and footer to all pages at the end
  const addPageNumbers = () => {
    const totalPages = doc.getNumberOfPages();
    for (let i = 2; i <= totalPages; i++) { // skip title page
      doc.setPage(i);
      // Footer line
      doc.setDrawColor(...COLORS.tableBorder);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      // Page number
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.textLight);
      doc.text(`Page ${i - 1} of ${totalPages - 1}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
      // Document name in footer
      doc.text(data.name || 'Assessment Report', margin, pageHeight - 7);
      doc.text('ProcessIQ Discovery', pageWidth - margin, pageHeight - 7, { align: 'right' });
    }
  };

  // Helper to add wrapped text
  const addText = (
    text: string,
    fontSize: number,
    options?: { bold?: boolean; color?: [number, number, number]; maxWidth?: number; indent?: number },
  ) => {
    const effectiveIndent = options?.indent || 0;
    const effectiveWidth = options?.maxWidth || (contentWidth - effectiveIndent);
    doc.setFontSize(fontSize);
    if (options?.bold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    if (options?.color) doc.setTextColor(...options.color);
    else doc.setTextColor(...COLORS.text);
    const lines: string[] = doc.splitTextToSize(text, effectiveWidth);
    for (const line of lines) {
      checkPage(fontSize * 0.5);
      doc.text(line, margin + effectiveIndent, y);
      y += fontSize * 0.45;
    }
    y += 2;
  };

  const addSectionHeader = (title: string, trackToc = true) => {
    checkPage(18);
    y += 6;
    if (trackToc) {
      tocEntries.push({ title, page: getPageNum() });
    }
    doc.setFillColor(...COLORS.headerBg);
    doc.rect(margin, y - 5, contentWidth, 10, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 4, y + 2);
    y += 12;
    doc.setTextColor(...COLORS.text);
  };

  const addSubHeader = (title: string) => {
    checkPage(12);
    y += 3;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.accent);
    doc.text(title, margin, y);
    y += 6;
    doc.setTextColor(...COLORS.text);
  };

  // ---- Table drawing helpers ----
  const drawTable = (
    headers: string[],
    rows: string[][],
    colWidths: number[],
    options?: { headerColor?: [number, number, number]; fontSize?: number }
  ) => {
    const fontSize = options?.fontSize || 8;
    const headerColor = options?.headerColor || COLORS.headerBg;
    const rowHeight = 7;
    const cellPadding = 2;

    // Compute actual col widths proportionally to fill contentWidth
    const totalRatio = colWidths.reduce((a, b) => a + b, 0);
    const actualWidths = colWidths.map(w => (w / totalRatio) * contentWidth);

    // Draw header
    checkPage(rowHeight + 5);
    let x = margin;
    doc.setFillColor(...headerColor);
    doc.rect(margin, y - 1, contentWidth, rowHeight + 1, 'F');
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.white);
    for (let i = 0; i < headers.length; i++) {
      const cellText = doc.splitTextToSize(headers[i], actualWidths[i] - cellPadding * 2);
      doc.text(cellText[0] || '', x + cellPadding, y + 4);
      x += actualWidths[i];
    }
    y += rowHeight + 1;

    // Draw rows
    doc.setFont('helvetica', 'normal');
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];

      // Calculate row height based on content wrapping
      let maxLines = 1;
      const cellLines: string[][] = [];
      for (let i = 0; i < row.length; i++) {
        const lines = doc.splitTextToSize(row[i] || '', actualWidths[i] - cellPadding * 2);
        cellLines.push(lines);
        maxLines = Math.max(maxLines, lines.length);
      }
      const dynamicRowHeight = Math.max(rowHeight, maxLines * fontSize * 0.42 + 3);

      checkPage(dynamicRowHeight + 2);

      // Alternating row background
      if (r % 2 === 1) {
        doc.setFillColor(...COLORS.tableRowAlt);
        doc.rect(margin, y - 1, contentWidth, dynamicRowHeight, 'F');
      }

      // Row border
      doc.setDrawColor(...COLORS.tableBorder);
      doc.setLineWidth(0.2);
      doc.line(margin, y - 1 + dynamicRowHeight, margin + contentWidth, y - 1 + dynamicRowHeight);

      doc.setTextColor(...COLORS.text);
      doc.setFontSize(fontSize);
      x = margin;
      for (let i = 0; i < row.length; i++) {
        let lineY = y + 3;
        for (const line of cellLines[i]) {
          doc.text(line, x + cellPadding, lineY);
          lineY += fontSize * 0.42;
        }
        x += actualWidths[i];
      }
      y += dynamicRowHeight;
    }
    y += 4;
  };

  // ===== PAGE 1: TITLE PAGE =====
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Accent bar
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 65, pageWidth, 3, 'F');

  doc.setTextColor(...COLORS.white);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('ProcessIQ Discovery', pageWidth / 2, 85, { align: 'center' });

  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.text(data.name || 'Assessment Report', pageWidth / 2, 102, { align: 'center' });

  // Divider
  doc.setDrawColor(99, 102, 241);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 30, 112, pageWidth / 2 + 30, 112);

  doc.setFontSize(12);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Assessment Type: ${data.type || 'Readiness Analysis'}`, pageWidth / 2, 125, { align: 'center' });
  doc.text(
    `Generated: ${new Date(data.generatedAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    pageWidth / 2, 135, { align: 'center' },
  );

  if (data.overallScore !== undefined) {
    // Score circle
    const cx = pageWidth / 2;
    const cy = 175;
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1.5);
    doc.circle(cx, cy, 22, 'S');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.text(`${data.overallScore}`, cx, cy + 5, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('Overall Score', cx, cy + 30, { align: 'center' });
    if (data.overallMaturity) {
      doc.setFontSize(12);
      doc.setTextColor(...COLORS.accent);
      doc.text(data.overallMaturity, cx, cy + 38, { align: 'center' });
    }
  }

  // Confidential notice
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('CONFIDENTIAL', pageWidth / 2, pageHeight - 20, { align: 'center' });

  // ===== PAGE 2: TABLE OF CONTENTS (placeholder — filled later) =====
  addPage();
  const tocPageIndex = currentPage; // remember which page TOC is on
  const tocStartY = y;
  // Reserve space — we'll come back and fill it

  // ===== EXECUTIVE SUMMARY =====
  addPage();
  addSectionHeader('EXECUTIVE SUMMARY');

  if (data.overallScore !== undefined) {
    // Score + maturity summary box
    checkPage(30);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 2, contentWidth, 22, 'F');
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(0.8);
    doc.line(margin, y - 2, margin, y + 20);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.text);
    doc.text(`Overall Readiness Score: ${data.overallScore}/100`, margin + 5, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textLight);
    doc.text(`Maturity Level: ${data.overallMaturity || 'N/A'}`, margin + 5, y + 12);

    const areasAssessed = data.areaScores?.length || 0;
    const gapCount = data.gaps?.length || 0;
    const highImpactGaps = data.gaps?.filter(g => (g.impact || '').toLowerCase() === 'high').length || 0;
    doc.text(`Areas Assessed: ${areasAssessed}  |  Total Gaps: ${gapCount}  |  High Impact Gaps: ${highImpactGaps}`, margin + 5, y + 18);
    y += 28;
  }

  if (data.executiveSummary) {
    addText(data.executiveSummary, 10);
    y += 2;
  }

  if (data.keyFindings?.length) {
    addSubHeader('Key Findings');
    for (const finding of data.keyFindings) {
      addText(`\u2022  ${finding}`, 9, { indent: 3 });
    }
  }

  if (data.priorityRecommendations?.length) {
    addSubHeader('Priority Recommendations');
    for (let i = 0; i < data.priorityRecommendations.length; i++) {
      addText(`${i + 1}.  ${data.priorityRecommendations[i]}`, 9, { indent: 3 });
    }
  }

  // ===== AREA SCORES TABLE =====
  if (data.areaScores?.length) {
    addSectionHeader('AREA SCORES');

    // Summary table
    const scoreHeaders = ['Area', 'Score', 'Maturity', 'Key Strengths', 'Key Weaknesses'];
    const scoreRows = data.areaScores.map(a => [
      a.areaName,
      `${a.score}/100`,
      a.maturityLevel,
      (a.strengths || []).slice(0, 2).join('; ') || '-',
      (a.weaknesses || []).slice(0, 2).join('; ') || '-',
    ]);
    drawTable(scoreHeaders, scoreRows, [3, 1.2, 2, 4, 4]);

    // Detailed breakdown
    for (const area of data.areaScores) {
      checkPage(25);
      addSubHeader(`${area.areaName} (${area.score}/100 - ${area.maturityLevel})`);

      if (area.strengths?.length) {
        addText('Strengths:', 9, { bold: true, color: COLORS.green });
        for (const s of area.strengths) addText(`  + ${s}`, 8, { indent: 3 });
      }
      if (area.weaknesses?.length) {
        addText('Weaknesses:', 9, { bold: true, color: COLORS.red });
        for (const w of area.weaknesses) addText(`  - ${w}`, 8, { indent: 3 });
      }
      if (area.recommendations?.length) {
        addText('Recommendations:', 9, { bold: true, color: COLORS.blue });
        for (const r of area.recommendations) addText(`  > ${r}`, 8, { indent: 3 });
      }
      y += 3;
    }
  }

  // ===== GAP ANALYSIS TABLE =====
  if (data.gaps?.length) {
    addPage();
    addSectionHeader('GAP ANALYSIS');

    // Summary stats
    const highGaps = data.gaps.filter(g => (g.impact || '').toLowerCase() === 'high').length;
    const medGaps = data.gaps.filter(g => (g.impact || '').toLowerCase() === 'medium').length;
    const lowGaps = data.gaps.length - highGaps - medGaps;

    checkPage(12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    doc.text(`Total: ${data.gaps.length} gaps identified  |  `, margin, y);
    const tw1 = doc.getTextWidth(`Total: ${data.gaps.length} gaps identified  |  `);
    doc.setTextColor(...COLORS.red);
    doc.text(`High: ${highGaps}`, margin + tw1, y);
    const tw2 = doc.getTextWidth(`High: ${highGaps}  `);
    doc.setTextColor(...COLORS.amber);
    doc.text(`  Medium: ${medGaps}`, margin + tw1 + tw2, y);
    const tw3 = doc.getTextWidth(`  Medium: ${medGaps}  `);
    doc.setTextColor(...COLORS.green);
    doc.text(`  Low: ${lowGaps}`, margin + tw1 + tw2 + tw3, y);
    y += 8;

    // Gap table
    const gapHeaders = ['Area', 'Gap Description', 'Current State', 'Target State', 'Impact', 'Effort'];
    const gapRows = data.gaps.map(g => [
      g.area,
      g.gap,
      g.currentState,
      g.targetState,
      (g.impact || '').toUpperCase(),
      (g.effort || '').toUpperCase(),
    ]);
    drawTable(gapHeaders, gapRows, [2.5, 4, 3, 3, 1.2, 1.2], { fontSize: 7.5 });

    // Quick Wins
    if (data.quickWins?.length) {
      addSectionHeader('QUICK WINS');
      const qwHeaders = ['Area', 'Quick Win', 'Category', 'Impact'];
      const qwRows = data.quickWins.map(qw => [
        qw.area || '',
        qw.gap,
        qw.category || '-',
        qw.impact || '-',
      ]);
      drawTable(qwHeaders, qwRows, [2.5, 5, 2, 1.5]);
    }

    // Roadmap
    if (data.roadmap?.length) {
      addSectionHeader('IMPLEMENTATION ROADMAP');
      for (const phase of data.roadmap) {
        checkPage(15);
        addSubHeader(`${phase.phase} (${phase.duration})`);
        for (const item of phase.items) addText(`\u2022  ${item}`, 9, { indent: 3 });
        y += 2;
      }
    }

    // Risk Assessment Table
    if (data.riskAssessment?.length) {
      addSectionHeader('RISK ASSESSMENT');
      const riskHeaders = ['Risk', 'Likelihood', 'Impact', 'Mitigation Strategy'];
      const riskRows = data.riskAssessment.map(r => [
        r.risk,
        r.likelihood,
        r.impact,
        r.mitigation,
      ]);
      drawTable(riskHeaders, riskRows, [3, 1.5, 1.5, 5]);
    }
  }

  // ===== Q&A TAB =====
  if (data.responses && Object.keys(data.responses).length > 0) {
    addPage();
    addSectionHeader('INTERVIEW Q&A');
    for (const [areaId, qas] of Object.entries(data.responses)) {
      addSubHeader(areaId);
      for (let i = 0; i < qas.length; i++) {
        const qa = qas[i];
        checkPage(18);

        // Question number badge
        doc.setFillColor(...COLORS.accent);
        doc.roundedRect(margin, y - 3, 6, 6, 1, 1, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.text(`${i + 1}`, margin + 3, y + 0.5, { align: 'center' });

        // Question text
        doc.setTextColor(...COLORS.text);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const qLines = doc.splitTextToSize(qa.question, contentWidth - 10);
        for (const line of qLines) {
          doc.text(line, margin + 8, y);
          y += 4;
        }

        // Answer
        let answer: string;
        if (typeof qa.answer === 'string') {
          answer = qa.answer;
        } else if (Array.isArray(qa.answer)) {
          answer = qa.answer.join(', ');
        } else {
          answer = JSON.stringify(qa.answer);
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.textLight);
        const aLines = doc.splitTextToSize(`A: ${answer}`, contentWidth - 10);
        for (const line of aLines) {
          checkPage(5);
          doc.text(line, margin + 8, y);
          y += 3.8;
        }
        y += 4;
      }
      y += 3;
    }
  }

  // ===== FILL IN TABLE OF CONTENTS =====
  doc.setPage(tocPageIndex);
  let tocY = tocStartY;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.text);
  doc.text('Table of Contents', margin, tocY);
  tocY += 12;

  doc.setDrawColor(...COLORS.tableBorder);
  doc.setLineWidth(0.3);
  doc.line(margin, tocY - 3, margin + contentWidth, tocY - 3);
  tocY += 5;

  for (let i = 0; i < tocEntries.length; i++) {
    const entry = tocEntries[i];
    const displayPage = entry.page - 1; // subtract title page

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    doc.text(`${i + 1}.  ${entry.title}`, margin + 2, tocY);

    // Dot leader
    const titleWidth = doc.getTextWidth(`${i + 1}.  ${entry.title}`);
    const pageNumStr = `${displayPage}`;
    const pageNumWidth = doc.getTextWidth(pageNumStr);
    const dotsStart = margin + 2 + titleWidth + 3;
    const dotsEnd = margin + contentWidth - pageNumWidth - 2;

    doc.setTextColor(...COLORS.tableBorder);
    doc.setFontSize(8);
    let dotX = dotsStart;
    while (dotX < dotsEnd) {
      doc.text('.', dotX, tocY);
      dotX += 2;
    }

    doc.setFontSize(11);
    doc.setTextColor(...COLORS.accent);
    doc.setFont('helvetica', 'bold');
    doc.text(pageNumStr, margin + contentWidth, tocY, { align: 'right' });
    tocY += 8;
  }

  // ===== ADD PAGE NUMBERS =====
  addPageNumbers();

  // Save
  const safeName = (data.name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  doc.save(`${safeName}.pdf`);
}
