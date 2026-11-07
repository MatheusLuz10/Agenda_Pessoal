import { describe, expect, it } from "vitest";
import { associar, converterParaEmbalagem, interpretarLista, precoMudou, semelhanca, type Candidato } from "./colarLista";

const candidatos: Candidato[] = [
  { id: "brahma", nome: "Cerveja Brahma Chopp Lata 269 ml", codigos: ["7891149103102"], unidadesPorEmbalagem: 12 },
  { id: "coca", nome: "Refrigerante Coca-Cola 2 L", codigos: ["CC2L"], unidadesPorEmbalagem: 6 },
  { id: "agua", nome: "Água Mineral Crystal 500 ml", codigos: [], unidadesPorEmbalagem: 12 },
];

describe("interpretar lista colada", () => {
  it("lista com ponto e vírgula e cabeçalho (formato sugerido para a IA)", () => {
    const { linhas } = interpretarLista(`Código;Produto;Quantidade;Unidade;Valor unitário;Valor total
7891149103102;BRAHMA CHOPP LT 269ML;20;CX;39,90;798,00
CC2L;COCA COLA 2L;10;FD;45,00;450,00
Total;;;;;1.248,00`);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ codigo: "7891149103102", quantidade: 20, unidade: "CX", valorUnitario: 39.9, valorTotal: 798 });
    expect(linhas[1]).toMatchObject({ descricao: "COCA COLA 2L", quantidade: 10, valorUnitario: 45 });
  });

  it("tabela copiada do Excel (tabulação) com valores em milhar", () => {
    const { linhas } = interpretarLista("Produto\tQtd\tVlr Unit\tVlr Total\nÁgua Crystal 500ml\t5\t1.200,50\t6.002,50");
    expect(linhas[0]).toMatchObject({ quantidade: 5, valorUnitario: 1200.5, valorTotal: 6002.5 });
  });

  it("tabela em markdown", () => {
    const { linhas } = interpretarLista(`| Produto | Quantidade | Preço |
|---|---|---|
| Brahma Chopp 269ml | 20 | 39,90 |`);
    expect(linhas).toEqual([expect.objectContaining({ descricao: "Brahma Chopp 269ml", quantidade: 20, valorUnitario: 39.9 })]);
  });

  it("sem cabeçalho: descobre colunas pelo conteúdo", () => {
    const { linhas } = interpretarLista("Brahma Chopp 269ml;20;39,90;798,00");
    expect(linhas[0]).toMatchObject({ descricao: "Brahma Chopp 269ml", quantidade: 20, valorUnitario: 39.9, valorTotal: 798 });
  });

  it("texto livre, um produto por linha", () => {
    const { linhas } = interpretarLista(`- 20 cx Brahma Chopp 269ml R$ 39,90
10 fardos Coca-Cola 2L - 45,00
Água Crystal 500 ml x 5 R$ 18,00`);
    expect(linhas[0]).toMatchObject({ quantidade: 20, unidade: "cx", valorUnitario: 39.9 });
    expect(linhas[0].descricao).toBe("Brahma Chopp 269ml");
    expect(linhas[1]).toMatchObject({ quantidade: 10, valorUnitario: 45 });
    expect(linhas[2]).toMatchObject({ quantidade: 5, valorUnitario: 18 });
    expect(linhas[2].descricao).toContain("500 ml");
  });

  it("só total: calcula o valor unitário", () => {
    const { linhas } = interpretarLista("Produto;Quantidade;Valor total\nCoca 2L;10;450,00");
    expect(linhas[0].valorUnitario).toBe(45);
  });
});

describe("associar ao produto do sistema", () => {
  it("pelo código", () => {
    expect(associar({ linha: 1, texto: "", codigo: "CC2L", descricao: "XYZ", quantidade: 1, unidade: null, valorUnitario: 1, valorTotal: null }, candidatos)).toEqual({
      candidatoId: "coca",
      confianca: "codigo",
    });
  });

  it("pelo nome, mesmo abreviado", () => {
    const r = associar({ linha: 1, texto: "", codigo: null, descricao: "BRAHMA CHOPP LT 269ML", quantidade: 1, unidade: null, valorUnitario: 1, valorTotal: null }, candidatos);
    expect(r.candidatoId).toBe("brahma");
    expect(semelhanca("agua crystal 500ml", "Água Mineral Crystal 500 ml")).toBeGreaterThan(0.6);
  });

  it("não inventa associação quando não reconhece", () => {
    const r = associar({ linha: 1, texto: "", codigo: null, descricao: "Gelo em cubos 5kg", quantidade: 1, unidade: null, valorUnitario: 1, valorTotal: null }, candidatos);
    expect(r).toEqual({ candidatoId: null, confianca: "nenhuma" });
  });

  it("converte nota em unidades para embalagens", () => {
    expect(converterParaEmbalagem({ quantidade: 240, unidade: "UN", valorUnitario: 3.325 }, 12)).toEqual({
      quantidade: 20,
      valorUnitario: 39.9,
      convertido: true,
    });
    expect(converterParaEmbalagem({ quantidade: 20, unidade: "CX", valorUnitario: 39.9 }, 12).convertido).toBe(false);
  });

  it("detecta preço alterado", () => {
    expect(precoMudou(41.5, 39.9)).toBe(true);
    expect(precoMudou(39.9, 39.9)).toBe(false);
    expect(precoMudou(null, 39.9)).toBe(false);
  });
});
