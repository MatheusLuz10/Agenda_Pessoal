// Lista real gerada por IA a partir de uma nota de distribuidora (31 itens):
// unidades da nota (CX, FD, DZ, PT) e reconhecimento por nome sem trocar
// um produto por outro parecido.
import { describe, expect, it } from "vitest";
import { CATALOGO } from "@/modules/deu-sede/data/catalogo";
import { associar, ehCodigoDeBarras, embalagemDaUnidade, interpretarLista, notaAssociacao, type Candidato } from "./colarLista";

const LISTA = `Código;Produto;Quantidade;Unidade;Valor unitário;Valor total
7411;CERVEJA AMSTEL LT 269ML;1;DZ;36,00;36,00
4776;CERVEJA ANTARCTICA SUBZERO LT 269ML;1;CX;41,90;41,90
13786;CERVEJA BRAHMA CHOP LT MULTPACK 15X269ML;1;CX;39,90;39,90
924;CERVEJA BUDWEISER LONG NECK 330ML;1;CX;134,80;134,80
4482;CERVEJA BUDWEISER LT 269ML;1;CX;49,50;49,50
11759;CERVEJA CORONA EXTRA LT 350ML;1;CX;44,96;44,96
1211;CERVEJA CORONA LONG NECK 330ML;1;CX;174,90;174,90
925;CERVEJA HEINEKEN LONG NECK 330ML;1;CX;135,00;135,00
10792;CERVEJA HEINEKEN LONG NECK SHOT 250ML;1;CX;124,00;124,00
11710;CERVEJA IMPERIO LT 15X269ML;1;CX;40,50;40,50
1010;CERVEJA IMPERIO MALTE GOLD L NECK 210ML;1;CX;76,50;76,50
12585;CERVEJA IMPERIO ULTRA L NECK 275ML;1;CX;61,00;61,00
13686;CERVEJA IMPERIO ULTRA LT 12X269ML;1;CX;41,00;41,00
12646;CERVEJA MICHELOB ULTRA LONG NECK 330ML;1;CX;146,88;146,88
10076;CERVEJA SKOL PILSEN LT MULTPACK 15X269ML;1;CX;39,50;39,50
8539;CERVEJA STELLA ARTOIS L N PUR S/GL 330ML;1;CX;167,28;167,28
6013;CERVEJA STELLA ARTOIS LONG NECK 330ML;1;CX;157,00;157,00
11761;CERVEJA STELLA ARTOIS LT 269ML;1;CX;36,80;36,80
13797;CERVEJA STELLA ARTOIS PURE GOLD LT 269ML;1;CX;36,48;36,48
1346;REFR 1L COCA COLA;1;FD;46,90;46,90
7714;REFR 1L GUARANA ANTARTICA;1;FD;64,20;64,20
1330;REFR 2L COCA COLA;1;FD;66,00;66,00
8634;REFR 2L COCA COLA ZERO;1;FD;69,30;69,30
514;REFR 2L FANTA LARANJA;1;FD;66,00;66,00
1175;REFR 2L GUARANA ANTARCTICA;1;FD;54,00;54,00
4496;REFR 2L PARAENSE GUARANA;1;FD;37,50;37,50
516;REFR 350ML COCA COLA LT DZ;1;DZ;47,00;47,00
6175;REFR 350ML COCA COLA S/ ACUCAR LT;1;DZ;46,08;46,08
12440;REFR 350ML FANTA LARANJA LT 6X1;1;PT;23,50;23,50
12370;REFR 350ML FANTA UVA LT;1;PT;23,50;23,50
12561;REFR 350ML GUARANA ANT LT MULTI PACK;1;DZ;36,00;36,00`;

const { linhas, ignoradas } = interpretarLista(LISTA);
const linha = (trecho: string) => {
  const l = linhas.find((x) => x.descricao.includes(trecho));
  if (!l) throw new Error(`linha "${trecho}" não encontrada`);
  return l;
};
const comoCandidatos = (nomes: string[]): Candidato[] => nomes.map((nome) => ({ id: nome, nome, codigos: [], unidadesPorEmbalagem: 1 }));

describe("lista da nota gerada por IA", () => {
  it("lê as 31 linhas com quantidade e valor por embalagem", () => {
    expect(ignoradas).toEqual([]);
    expect(linhas).toHaveLength(31);
    expect(linha("AMSTEL")).toMatchObject({ codigo: "7411", quantidade: 1, unidade: "DZ", valorUnitario: 36 });
  });

  it("entende a unidade da nota: DZ = pack com 12, PT = pack, FD = fardo", () => {
    expect(embalagemDaUnidade("DZ")).toEqual({ tipo: "pack", unidades: 12 });
    expect(embalagemDaUnidade("PT")).toEqual({ tipo: "pack", unidades: null });
    expect(embalagemDaUnidade("FD")).toEqual({ tipo: "fardo", unidades: null });
    expect(embalagemDaUnidade("CX12")).toEqual({ tipo: "caixa", unidades: 12 });
    expect(embalagemDaUnidade("UN")).toEqual({ tipo: "unidade", unidades: 1 });
    expect(linha("AMSTEL").unidadesPorEmbalagem).toBe(12);
    expect(linha("GUARANA ANT LT MULTI PACK").unidadesPorEmbalagem).toBe(12);
  });

  it("tira as unidades da descrição quando a nota diz (15X269ML, 12X269ML, 6X1)", () => {
    expect(linha("BRAHMA CHOP").unidadesPorEmbalagem).toBe(15);
    expect(linha("IMPERIO ULTRA LT").unidadesPorEmbalagem).toBe(12);
    expect(linha("FANTA LARANJA LT 6X1").unidadesPorEmbalagem).toBe(6);
  });

  it("não inventa unidades que a nota não informa", () => {
    expect(linha("HEINEKEN LONG NECK 330ML").unidadesPorEmbalagem).toBeNull();
    expect(linha("2L COCA COLA ZERO").unidadesPorEmbalagem).toBeNull();
    expect(linha("FANTA UVA").unidadesPorEmbalagem).toBeNull();
  });

  it("só código de barras (EAN) serve para reconhecer em qualquer fornecedor", () => {
    expect(ehCodigoDeBarras("7891149103102")).toBe(true);
    expect(ehCodigoDeBarras("78911491")).toBe(true);
    expect(ehCodigoDeBarras("924")).toBe(false);
    expect(ehCodigoDeBarras("13786")).toBe(false);
  });
});

describe("reconhecer pelo nome sem trocar de produto", () => {
  it("com todos cadastrados, cada linha encontra o próprio produto", () => {
    const cands = comoCandidatos(linhas.map((l) => l.descricao));
    for (const l of linhas) expect(associar({ ...l, codigo: null }, cands).candidatoId).toBe(l.descricao);
  });

  it("produto que ainda não existe vira novo, em vez de cair num parecido", () => {
    const ausentes = ["SUBZERO", "SHOT 250ML", "ULTRA LT 12X269", "PUR S/GL", "PURE GOLD", "1L COCA", "COCA COLA ZERO", "S/ ACUCAR", "FANTA UVA"];
    const cands = comoCandidatos(linhas.filter((l) => !ausentes.some((a) => l.descricao.includes(a))).map((l) => l.descricao));
    for (const a of ausentes) expect(associar({ ...linha(a), codigo: null }, cands), a).toEqual({ candidatoId: null, confianca: "nenhuma" });
  });

  it("volume, sabor, versão e marca diferentes não são o mesmo produto", () => {
    expect(notaAssociacao("REFR 1L COCA COLA", "REFR 2L COCA COLA")).toBe(0);
    expect(notaAssociacao("REFR 2L COCA COLA ZERO", "REFR 2L COCA COLA")).toBe(0);
    expect(notaAssociacao("REFR 350ML FANTA UVA LT", "REFR 350ML FANTA LARANJA LT 6X1")).toBe(0);
    expect(notaAssociacao("CERVEJA STELLA ARTOIS PURE GOLD LT 269ML", "CERVEJA STELLA ARTOIS LT 269ML")).toBe(0);
    expect(notaAssociacao("CERVEJA ANTARCTICA SUBZERO LT 269ML", "CERVEJA AMSTEL LT 269ML")).toBe(0);
    expect(notaAssociacao("REFR 2L GUARANA ANTARCTICA", "REFR 2L PARAENSE GUARANA")).toBe(0);
    expect(notaAssociacao("Cerveja Corona Long Neck 330 ml", "Cerveja Corona Cero Long Neck 330 ml")).toBe(0);
  });

  it("abreviação e erro de digitação da nota ainda reconhecem", () => {
    expect(notaAssociacao("CERVEJA BRAHMA CHOP LT MULTPACK 15X269ML", "Cerveja Brahma Chopp Lata 269 ml")).toBe(1);
    expect(notaAssociacao("REFR 1L GUARANA ANTARTICA", "Guaraná Antarctica 1 L")).toBe(1);
    expect(notaAssociacao("REFR 350ML GUARANA ANT LT MULTI PACK", "Guaraná Antarctica Lata 350 ml")).toBe(1);
  });

  it("com o catálogo de referência, reconhece o certo e não troca nenhum", () => {
    const cands = CATALOGO.map((p) => ({ id: p.nome, nome: p.nome, codigos: [], unidadesPorEmbalagem: p.unidades_por_embalagem }));
    const achado = (trecho: string) => associar({ ...linha(trecho), codigo: null }, cands).candidatoId;
    expect(achado("BRAHMA CHOP")).toBe("Cerveja Brahma Chopp Lata 269 ml");
    expect(achado("SKOL PILSEN")).toBe("Cerveja Skol Pilsen Lata 269 ml");
    expect(achado("BUDWEISER LONG NECK")).toBe("Cerveja Budweiser Long Neck 330 ml");
    expect(achado("STELLA ARTOIS LONG NECK")).toBe("Cerveja Stella Artois Long Neck 330 ml");
    expect(achado("CORONA LONG NECK")).toBe("Cerveja Corona Extra Long Neck 330 ml");
    expect(achado("MICHELOB")).toBe("Cerveja Michelob Ultra Long Neck 330 ml");
    // catálogo só tem Stella em lata 350 ml: a de 269 ml é outro produto
    expect(achado("STELLA ARTOIS LT 269ML")).toBeNull();
    expect(achado("STELLA ARTOIS PURE GOLD LT 269ML")).toBeNull();
  });
});

describe("nome parecido com palavras a mais na nota (outro sabor ou versão?)", () => {
  const cands = comoCandidatos([
    "Cerveja Skol Lata 269ml",
    "Refrigerante Coca-Cola Lata 220ml",
    "Energético Red Bull 250ml",
    "Água Crystal 500ml",
    "Cerveja Heineken",
    "CERVEJA AMSTEL LT 269ML",
  ]);
  const de = (descricao: string) =>
    associar({ linha: 1, texto: "", codigo: null, descricao, quantidade: 1, unidade: null, valorUnitario: 1, valorTotal: null }, cands);

  it("marca como dúvida em vez de ligar direto ao parecido", () => {
    expect(de("Skol Beats Senses 269ml")).toEqual({ candidatoId: "Cerveja Skol Lata 269ml", confianca: "nome", duvida: true });
    expect(de("Coca-Cola Café 220ml")).toMatchObject({ candidatoId: "Refrigerante Coca-Cola Lata 220ml", duvida: true });
    expect(de("Red Bull Tropical 250ml")).toMatchObject({ candidatoId: "Energético Red Bull 250ml", duvida: true });
    expect(de("Agua Crystal com gas 500ml")).toMatchObject({ candidatoId: "Água Crystal 500ml", duvida: true });
    expect(de("Heineken Barril 5L")).toMatchObject({ candidatoId: "Cerveja Heineken", duvida: true });
  });

  it("mesmo nome (só tipo, embalagem ou volume escritos diferente) continua reconhecido direto", () => {
    expect(de("CERVEJA AMSTEL LT 269ML")).toEqual({ candidatoId: "CERVEJA AMSTEL LT 269ML", confianca: "nome" });
    expect(de("CERV SKOL LT 269ML")).toEqual({ candidatoId: "Cerveja Skol Lata 269ml", confianca: "nome" });
    expect(de("REFR COCA COLA LT 220ML")).toEqual({ candidatoId: "Refrigerante Coca-Cola Lata 220ml", confianca: "nome" });
  });
});
