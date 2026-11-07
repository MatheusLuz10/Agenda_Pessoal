import type { Embalagem, UnidadeMedida } from "@/modules/deu-sede/data/tipos";

// Catálogo de referência de produtos (SEM preços). Cervejas do portfólio
// Ambev nos formatos mais comuns, água, energéticos e bebidas quentes
// (destilados das marcas mais vendidas). Pode haver item que saiu de
// linha ou faltar algum regional: confira e desative o que não vende.
// Embalagens padrão são as mais usadas na compra por distribuidoras —
// cada fornecedor pode ter outra (a cotação registra a embalagem real).

export interface ItemCatalogo {
  nome: string;
  categoria: string;
  marca: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  volume_por_unidade: number | null;
  unidade_medida: UnidadeMedida | null;
  observacoes: string;
}

const OBS = "Catálogo de referência — confira embalagem e disponibilidade com o fornecedor.";

type Formato = "lata350" | "lata269" | "latao473" | "ln330" | "ln355" | "gf600" | "litrao" | "litrinho";

const FORMATOS: Record<Formato, { rotulo: string; volume: number; unidade: UnidadeMedida; emb: Embalagem; un: number }> = {
  lata350: { rotulo: "Lata 350 ml", volume: 350, unidade: "ml", emb: "pack", un: 12 },
  lata269: { rotulo: "Lata 269 ml", volume: 269, unidade: "ml", emb: "pack", un: 15 },
  latao473: { rotulo: "Latão 473 ml", volume: 473, unidade: "ml", emb: "pack", un: 12 },
  ln330: { rotulo: "Long Neck 330 ml", volume: 330, unidade: "ml", emb: "caixa", un: 24 },
  ln355: { rotulo: "Long Neck 355 ml", volume: 355, unidade: "ml", emb: "caixa", un: 24 },
  gf600: { rotulo: "Garrafa 600 ml", volume: 600, unidade: "ml", emb: "engradado", un: 24 },
  litrao: { rotulo: "Litrão 1 L", volume: 1000, unidade: "ml", emb: "engradado", un: 12 },
  litrinho: { rotulo: "Litrinho 300 ml", volume: 300, unidade: "ml", emb: "engradado", un: 24 },
};

// [marca, nome da cerveja, formatos]
const CERVEJAS_AMBEV: [string, string, Formato[]][] = [
  ["Brahma", "Brahma Chopp", ["lata350", "lata269", "latao473", "ln355", "gf600", "litrao", "litrinho"]],
  ["Brahma", "Brahma Duplo Malte", ["lata350", "latao473", "ln355", "gf600"]],
  ["Brahma", "Brahma Zero", ["lata350"]],
  ["Brahma", "Brahma Malzbier", ["lata350", "ln355"]],
  ["Skol", "Skol Pilsen", ["lata350", "lata269", "latao473", "gf600", "litrao", "litrinho"]],
  ["Skol", "Skol Puro Malte", ["lata350", "latao473"]],
  ["Antarctica", "Antarctica Pilsen", ["lata350", "lata269", "latao473", "gf600", "litrao", "litrinho"]],
  ["Antarctica", "Antarctica Subzero", ["lata350", "latao473", "gf600"]],
  ["Original", "Original", ["lata350", "lata269", "gf600"]],
  ["Budweiser", "Budweiser", ["lata350", "lata269", "latao473", "ln330", "gf600", "litrao"]],
  ["Budweiser", "Budweiser Zero", ["lata350"]],
  ["Stella Artois", "Stella Artois", ["lata350", "ln330", "gf600"]],
  ["Stella Artois", "Stella Artois Pure Gold", ["ln330"]],
  ["Corona", "Corona Extra", ["lata350", "ln330"]],
  ["Corona", "Corona Cero", ["ln330"]],
  ["Spaten", "Spaten", ["lata350", "latao473", "ln355", "gf600"]],
  ["Michelob", "Michelob Ultra", ["lata350", "ln330"]],
  ["Beck's", "Beck's", ["lata350", "ln330"]],
  ["Bohemia", "Bohemia Pilsen", ["lata350", "gf600"]],
  ["Serramalte", "Serramalte", ["gf600"]],
  ["Polar", "Polar Export", ["lata350"]],
  ["Colorado", "Colorado Appia", ["gf600"]],
  ["Goose Island", "Goose Island IPA", ["ln355"]],
  ["Leffe", "Leffe Blonde", ["ln330"]],
  ["Hoegaarden", "Hoegaarden Wit", ["ln330"]],
];

const cervejas: ItemCatalogo[] = CERVEJAS_AMBEV.flatMap(([marca, nome, formatos]) =>
  formatos.map((f) => {
    const x = FORMATOS[f];
    return {
      nome: `Cerveja ${nome} ${x.rotulo}`,
      categoria: "Cervejas",
      marca,
      tipo_embalagem: x.emb,
      unidades_por_embalagem: x.un,
      volume_por_unidade: x.volume,
      unidade_medida: x.unidade,
      observacoes: OBS,
    };
  }),
);

const simples = (
  categoria: string,
  marca: string,
  nome: string,
  volume: number | null = null,
  unidade: UnidadeMedida | null = null,
  emb: Embalagem = "unidade",
  un = 1,
): ItemCatalogo => ({
  nome,
  categoria,
  marca,
  tipo_embalagem: emb,
  unidades_por_embalagem: un,
  volume_por_unidade: volume,
  unidade_medida: unidade,
  observacoes: volume === null ? `${OBS} Volume não informado.` : OBS,
});

const outros: ItemCatalogo[] = [
  simples("Águas", "AMA", "Água Mineral AMA sem gás 500 ml", 500, "ml", "fardo", 12),
  simples("Águas", "AMA", "Água Mineral AMA sem gás 1,5 L", 1.5, "l", "fardo", 6),
  simples("Energéticos", "Fusion", "Energético Fusion 2 L", 2, "l"),
  simples("Energéticos", "Fusion", "Energético Fusion Lata"),
  simples("Energéticos", "Red Bull", "Energético Red Bull 250 ml", 250, "ml"),
  simples("Energéticos", "Red Bull", "Energético Red Bull Sugarfree 250 ml", 250, "ml"),
  simples("Energéticos", "Monster", "Energético Monster Energy 473 ml", 473, "ml"),
  ...[
    ["51", "Cachaça 51"],
    ["Pitú", "Cachaça Pitú"],
    ["Ypióca", "Cachaça Ypióca Prata"],
    ["Velho Barreiro", "Cachaça Velho Barreiro"],
    ["Smirnoff", "Vodka Smirnoff"],
    ["Absolut", "Vodka Absolut"],
    ["Orloff", "Vodka Orloff"],
    ["Johnnie Walker", "Whisky Johnnie Walker Red Label"],
    ["Johnnie Walker", "Whisky Johnnie Walker Black Label"],
    ["Old Parr", "Whisky Old Parr 12 anos"],
    ["Chivas Regal", "Whisky Chivas Regal 12 anos"],
    ["Jack Daniel's", "Whisky Jack Daniel's Old No. 7"],
    ["White Horse", "Whisky White Horse"],
    ["Ballantine's", "Whisky Ballantine's Finest"],
    ["Tanqueray", "Gin Tanqueray"],
    ["Beefeater", "Gin Beefeater"],
    ["Gordon's", "Gin Gordon's"],
    ["Bacardi", "Rum Bacardi Carta Blanca"],
    ["Dreher", "Conhaque Dreher"],
    ["Campari", "Bitter Campari"],
    ["Martini", "Vermute Martini Bianco"],
    ["José Cuervo", "Tequila José Cuervo Especial"],
  ].map(([marca, nome]) => simples("Bebidas quentes", marca, nome)),
];

export const CATALOGO: ItemCatalogo[] = [...cervejas, ...outros];
