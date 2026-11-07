// Exportação de relatórios em PDF e Excel com identificação da DEU SEDE!,
// período, data de emissão e totais. As bibliotecas (jsPDF, ExcelJS) só
// são baixadas quando o usuário clica em exportar.
import { dataHoraBR } from "@/modules/deu-sede/domain/formatos";

export type Formato = "texto" | "moeda" | "moeda4" | "numero" | "percentual" | "data";

export interface ColunaRelatorio {
  titulo: string;
  formato?: Formato;
}

export interface TabelaRelatorio {
  titulo: string;
  colunas: ColunaRelatorio[];
  linhas: (string | number | null)[][];
  totais?: (string | number | null)[];
}

export interface Relatorio {
  titulo: string;
  empresa: string;
  periodo: string;
  filtros: string[];
  resumo: [string, string][];
  tabelas: TabelaRelatorio[];
  observacao?: string;
}

const VERDE: [number, number, number] = [30, 42, 36];
const AMARELO: [number, number, number] = [226, 163, 26];
const OFFWHITE: [number, number, number] = [242, 232, 213];

function formatar(v: string | number | null, f: Formato = "texto"): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  switch (f) {
    case "moeda":
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "moeda4":
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
    case "numero":
      return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    case "percentual":
      return `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "data": {
      const [y, m, d] = String(v).slice(0, 10).split("-");
      return `${d}/${m}/${y}`;
    }
    default:
      return String(v);
  }
}

function nomeArquivo(r: Relatorio, ext: string) {
  const base = r.titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const hoje = new Date().toISOString().slice(0, 10);
  return `deu-sede-${base}-${hoje}.${ext}`;
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportarPdf(r: Relatorio) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const largo = r.tabelas.some((t) => t.colunas.length > 6);
  const doc = new jsPDF({ orientation: largo ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margem = 14;

  // Cabeçalho com a marca
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, larguraPagina, 24, "F");
  doc.setFillColor(...AMARELO);
  doc.rect(0, 24, larguraPagina, 1.2, "F");
  doc.setTextColor(...OFFWHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(r.empresa || "DEU SEDE!", margem, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Gestão de compras", margem, 17.5);
  doc.text(`Emitido em ${dataHoraBR(new Date().toISOString())}`, larguraPagina - margem, 11, { align: "right" });

  let y = 34;
  doc.setTextColor(...VERDE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(r.titulo, margem, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Período: ${r.periodo}`, margem, y);
  y += 5;
  if (r.filtros.length) {
    const linhas = doc.splitTextToSize(`Filtros: ${r.filtros.join(" · ")}`, larguraPagina - margem * 2);
    doc.text(linhas, margem, y);
    y += 5 * linhas.length;
  }
  if (r.observacao) {
    const linhas = doc.splitTextToSize(r.observacao, larguraPagina - margem * 2);
    doc.setTextColor(139, 90, 43);
    doc.text(linhas, margem, y);
    doc.setTextColor(...VERDE);
    y += 5 * linhas.length;
  }

  if (r.resumo.length) {
    autoTable(doc, {
      startY: y + 2,
      body: r.resumo.map(([k, v]) => [k, v]),
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 1.5, textColor: VERDE },
      columnStyles: { 0: { fontStyle: "normal" }, 1: { fontStyle: "bold", halign: "right" } },
      tableWidth: 110,
      margin: { left: margem },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  for (const t of r.tabelas) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      y = 18;
    }
    doc.text(t.titulo, margem, y);
    const alinhar = t.colunas.map((c) => (c.formato && c.formato !== "texto" && c.formato !== "data" ? "right" : "left"));
    autoTable(doc, {
      startY: y + 2,
      head: [t.colunas.map((c) => c.titulo)],
      body: t.linhas.map((l) => l.map((v, i) => formatar(v, t.colunas[i]?.formato))),
      foot: t.totais ? [t.totais.map((v, i) => (v === null ? "" : formatar(v, t.colunas[i]?.formato)))] : undefined,
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: VERDE, lineColor: [230, 218, 196], lineWidth: 0.1 },
      headStyles: { fillColor: VERDE, textColor: OFFWHITE, fontStyle: "bold" },
      footStyles: { fillColor: OFFWHITE, textColor: VERDE, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 246, 238] },
      columnStyles: Object.fromEntries(alinhar.map((a, i) => [i, { halign: a as "left" | "right" }])),
      // cabeçalho e totais alinhados como os valores da coluna
      didParseCell: (d) => {
        if (d.section !== "body") d.cell.styles.halign = alinhar[d.column.index] as "left" | "right";
      },
      margin: { left: margem, right: margem },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(91, 101, 96);
    doc.text(`${r.empresa || "DEU SEDE!"} · ${r.titulo} · página ${i} de ${paginas}`, larguraPagina / 2, doc.internal.pageSize.getHeight() - 8, {
      align: "center",
    });
  }
  doc.save(nomeArquivo(r, "pdf"));
}

export async function exportarExcel(r: Relatorio) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = r.empresa || "DEU SEDE!";
  wb.created = new Date();
  const ws = wb.addWorksheet(r.titulo.slice(0, 31));
  const largura = Math.max(4, ...r.tabelas.map((t) => t.colunas.length));

  const titulo = ws.addRow([r.empresa || "DEU SEDE!"]);
  titulo.font = { bold: true, size: 16, color: { argb: "FF1E2A24" } };
  ws.mergeCells(titulo.number, 1, titulo.number, largura);
  ws.addRow([r.titulo]).font = { bold: true, size: 13, color: { argb: "FF1E2A24" } };
  ws.addRow([`Período: ${r.periodo}`]);
  ws.addRow([`Emitido em: ${dataHoraBR(new Date().toISOString())}`]);
  if (r.filtros.length) ws.addRow([`Filtros: ${r.filtros.join(" · ")}`]);
  if (r.observacao) ws.addRow([r.observacao]).font = { italic: true, color: { argb: "FF8B5A2B" } };
  ws.addRow([]);

  for (const [k, v] of r.resumo) {
    const linha = ws.addRow([k, v]);
    linha.getCell(2).font = { bold: true };
  }
  if (r.resumo.length) ws.addRow([]);

  const formatoExcel: Record<Formato, string | undefined> = {
    texto: undefined,
    data: "dd/mm/yyyy",
    moeda: '"R$" #,##0.00',
    moeda4: '"R$" #,##0.0000',
    numero: "#,##0.###",
    percentual: '0.0"%"',
  };
  const valorExcel = (v: string | number | null, f: Formato = "texto") => {
    if (v === null || v === undefined || v === "") return null;
    if (f === "data") {
      const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    return f === "texto" ? String(v) : Number(v);
  };

  for (const t of r.tabelas) {
    ws.addRow([t.titulo]).font = { bold: true, size: 12, color: { argb: "FF1E2A24" } };
    const cab = ws.addRow(t.colunas.map((c) => c.titulo));
    cab.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFF2E8D5" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2A24" } };
    });
    for (const l of t.linhas) {
      const row = ws.addRow(l.map((v, i) => valorExcel(v, t.colunas[i]?.formato)));
      t.colunas.forEach((c, i) => {
        const fmt = formatoExcel[c.formato ?? "texto"];
        if (fmt) row.getCell(i + 1).numFmt = fmt;
      });
    }
    if (t.totais) {
      const row = ws.addRow(t.totais.map((v, i) => valorExcel(v, t.colunas[i]?.formato)));
      row.font = { bold: true };
      row.eachCell((c, i) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2E8D5" } };
        const fmt = formatoExcel[t.colunas[i - 1]?.formato ?? "texto"];
        if (fmt) c.numFmt = fmt;
      });
    }
    ws.addRow([]);
  }

  ws.columns.forEach((col, i) => {
    const maior = Math.max(10, ...r.tabelas.map((t) => Math.max(t.colunas[i]?.titulo.length ?? 0, ...t.linhas.map((l) => String(l[i] ?? "").length))));
    col.width = Math.min(48, maior + 2);
  });

  const buffer = await wb.xlsx.writeBuffer();
  baixar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nomeArquivo(r, "xlsx"));
}
