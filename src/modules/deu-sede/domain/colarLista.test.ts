import { describe, expect, it } from "vitest";
import {
  associar,
  converterParaEmbalagem,
  interpretarLista,
  precoMudou,
  semelhanca,
  sugerirCategoria,
  unidadesDaDescricao,
  type Candidato,
} from "./colarLista";

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

describe("produto novo a partir da nota", () => {
  it("lê a coluna 'Itens por embalagem' da instrução da IA", () => {
    const { linhas } = interpretarLista(`Código;Produto;Quantidade;Unidade;Itens por embalagem;Valor unitário;Valor total
7891149103102;CERV BRAHMA CHOPP LT 350ML;10;CX;12;39,90;399,00
123;AGUA CRYSTAL 500ML;24;UN;1;1,50;36,00
456;GELO 5KG;3;PCT;;8,00;24,00`);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ codigo: "7891149103102", quantidade: 10, unidade: "CX", unidadesPorEmbalagem: 12, valorUnitario: 39.9 });
    expect(linhas[1]).toMatchObject({ unidade: "UN", unidadesPorEmbalagem: 1, valorUnitario: 1.5 });
    expect(linhas[2]).toMatchObject({ unidadesPorEmbalagem: null, valorUnitario: 8 });
  });

  it("sem a coluna, tira as unidades da descrição", () => {
    const { linhas } = interpretarLista("Produto;Quantidade;Valor unitário\nREFRIG COCA COLA 2L PET FD6;5;45,00");
    expect(linhas[0].unidadesPorEmbalagem).toBe(6);
  });

  it("reconhece os jeitos comuns de escrever na nota", () => {
    expect(unidadesDaDescricao("CERV BRAHMA CHOPP LT 350ML C/12")).toBe(12);
    expect(unidadesDaDescricao("CERV SKOL LT 269ML CX C/ 15")).toBe(15);
    expect(unidadesDaDescricao("AGUA CRYSTAL 500ML FD 12UN")).toBe(12);
    expect(unidadesDaDescricao("SKOL 12X350ML")).toBe(12);
    expect(unidadesDaDescricao("HEINEKEN SIX PACK LN 330ML")).toBe(6);
    // volume não é quantidade por embalagem
    expect(unidadesDaDescricao("COCA COLA 2L")).toBeNull();
    expect(unidadesDaDescricao("HEINEKEN LN 330ML")).toBeNull();
    expect(unidadesDaDescricao("CX 600ML")).toBeNull();
  });

  it("sugere a categoria pelo nome", () => {
    const cats = ["Cervejas", "Refrigerantes", "Águas", "Sucos", "Energéticos", "Descartáveis", "Outros"].map((nome) => ({ id: nome, nome }));
    expect(sugerirCategoria("CERV BRAHMA CHOPP LT 350ML", cats)).toBe("Cervejas");
    expect(sugerirCategoria("REFRIG GUARANA ANTARCTICA 2L", cats)).toBe("Refrigerantes");
    expect(sugerirCategoria("AGUA MINERAL CRYSTAL 500ML", cats)).toBe("Águas");
    expect(sugerirCategoria("ENERG RED BULL 250ML", cats)).toBe("Energéticos");
    expect(sugerirCategoria("SUCO DEL VALLE UVA 1L", cats)).toBe("Sucos");
    expect(sugerirCategoria("COPO DESCARTAVEL 200ML", cats)).toBe("Descartáveis");
    expect(sugerirCategoria("GELO 5KG", cats)).toBeNull();
  });
});

describe("formato simples da instrução para a IA (Produto; Quantidade; Embalagem; Preço)", () => {
  it("lê as 4 colunas sem cabeçalho e tira as unidades da embalagem", () => {
    const { linhas, ignoradas } = interpretarLista(`Cerveja Brahma Lata 269ml; 2; CX 12; 45,90
Refrigerante Coca-Cola 2L; 3; FD 6; 54,00
Água Mineral 500ml; 1; PCT C/12; 18,50
Bitter Campari 900ml; 2; UN; 39,90
Cerveja Amstel Lata 269ml; 1; DZ; 36,00
Cerveja Skol Lata 269ml; 4; Caixa com 15; R$ 41,90`);
    expect(ignoradas).toEqual([]);
    expect(linhas.map((l) => [l.descricao, l.quantidade, l.unidade, l.unidadesPorEmbalagem, l.valorUnitario])).toEqual([
      ["Cerveja Brahma Lata 269ml", 2, "CX 12", 12, 45.9],
      ["Refrigerante Coca-Cola 2L", 3, "FD 6", 6, 54],
      ["Água Mineral 500ml", 1, "PCT C/12", 12, 18.5],
      ["Bitter Campari 900ml", 2, "UN", 1, 39.9],
      ["Cerveja Amstel Lata 269ml", 1, "DZ", 12, 36],
      ["Cerveja Skol Lata 269ml", 4, "Caixa com 15", 15, 41.9],
    ]);
  });

  it("aceita a linha de cabeçalho se a IA escrever", () => {
    const { linhas } = interpretarLista(`Produto; Quantidade; Embalagem; Preço da embalagem
Cerveja Brahma Lata 269ml; 2; CX 12; 45,90`);
    expect(linhas).toHaveLength(1);
    expect([linhas[0].descricao, linhas[0].quantidade, linhas[0].unidadesPorEmbalagem, linhas[0].valorUnitario]).toEqual([
      "Cerveja Brahma Lata 269ml",
      2,
      12,
      45.9,
    ]);
  });
});

describe("sujeira que a IA deixa no fim da linha", () => {
  it('"\\" (quebra de linha do markdown) e <br> não grudam no preço', () => {
    const { linhas } = interpretarLista(
      ["ACHOCOL LIQ PIRAKIDS 200ML; 1; CX 27; 47,52\\", "CERVEJA AMSTEL LT 269ML; 1; DZ 12; 36,00 \\", "REFR 2L PEPSI; 1; CX 6; 51,90<br>"].join("\n"),
    );
    expect(linhas.map((l) => [l.valorUnitario, l.unidadesPorEmbalagem])).toEqual([
      [47.52, 27],
      [36, 12],
      [51.9, 6],
    ]);
  });
});
