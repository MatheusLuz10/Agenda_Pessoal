import { Navigate, Route } from "react-router-dom";
import { DeuSedeLayout } from "@/modules/deu-sede/components/DeuSedeLayout";
import { DEU_SEDE_BASE } from "@/modules/deu-sede/config/modules";
import { DashboardPage } from "@/modules/deu-sede/pages/DashboardPage";
import { NotFoundPage } from "@/modules/deu-sede/pages/NotFoundPage";
import { SettingsPage } from "@/modules/deu-sede/pages/SettingsPage";
import { ProdutosPage } from "@/modules/deu-sede/pages/produtos/ProdutosPage";
import { ProdutoFormPage } from "@/modules/deu-sede/pages/produtos/ProdutoFormPage";
import { ProdutoDetalhePage } from "@/modules/deu-sede/pages/produtos/ProdutoDetalhePage";
import { FornecedoresPage } from "@/modules/deu-sede/pages/fornecedores/FornecedoresPage";
import { FornecedorFormPage } from "@/modules/deu-sede/pages/fornecedores/FornecedorFormPage";
import { FornecedorDetalhePage } from "@/modules/deu-sede/pages/fornecedores/FornecedorDetalhePage";
import { CotacoesPage } from "@/modules/deu-sede/pages/cotacoes/CotacoesPage";
import { CotacaoFormPage } from "@/modules/deu-sede/pages/cotacoes/CotacaoFormPage";
import { CotacaoDetalhePage } from "@/modules/deu-sede/pages/cotacoes/CotacaoDetalhePage";
import { ComparacaoPage } from "@/modules/deu-sede/pages/ComparacaoPage";
import { PedidosPage } from "@/modules/deu-sede/pages/pedidos/PedidosPage";
import { MontarPedidoPage } from "@/modules/deu-sede/pages/pedidos/MontarPedidoPage";
import { PedidoDetalhePage } from "@/modules/deu-sede/pages/pedidos/PedidoDetalhePage";
import { RecebimentosPage } from "@/modules/deu-sede/pages/recebimentos/RecebimentosPage";
import { RegistrarRecebimentoPage } from "@/modules/deu-sede/pages/recebimentos/RegistrarRecebimentoPage";
import { EstoquePage } from "@/modules/deu-sede/pages/estoque/EstoquePage";
import { EntradaNotaPage } from "@/modules/deu-sede/pages/estoque/EntradaNotaPage";
import { RelatoriosPage } from "@/modules/deu-sede/pages/RelatoriosPage";

// Rotas da seção DEU SEDE!. Entram no App.tsx dentro do
// <RequireAuth />, então valem as mesmas regras de login do app
// (sem .env.local = modo de teste local, sem login).
export const deuSedeRoutes = (
  <Route path={DEU_SEDE_BASE} element={<DeuSedeLayout />}>
    <Route index element={<DashboardPage />} />
    <Route path="produtos" element={<ProdutosPage />} />
    <Route path="produtos/novo" element={<ProdutoFormPage />} />
    <Route path="produtos/:id" element={<ProdutoDetalhePage />} />
    <Route path="produtos/:id/editar" element={<ProdutoFormPage />} />
    <Route path="fornecedores" element={<FornecedoresPage />} />
    <Route path="fornecedores/novo" element={<FornecedorFormPage />} />
    <Route path="fornecedores/:id" element={<FornecedorDetalhePage />} />
    <Route path="fornecedores/:id/editar" element={<FornecedorFormPage />} />
    <Route path="cotacoes" element={<CotacoesPage />} />
    <Route path="cotacoes/nova" element={<CotacaoFormPage />} />
    <Route path="cotacoes/:id" element={<CotacaoDetalhePage />} />
    <Route path="cotacoes/:id/editar" element={<CotacaoFormPage />} />
    <Route path="comparacao" element={<ComparacaoPage />} />
    <Route path="pedidos" element={<PedidosPage />} />
    <Route path="pedidos/montar" element={<MontarPedidoPage />} />
    <Route path="pedidos/:id" element={<PedidoDetalhePage />} />
    <Route path="recebimentos" element={<RecebimentosPage />} />
    <Route path="recebimentos/novo/:pedidoId" element={<RegistrarRecebimentoPage />} />
    <Route path="pdv" element={<Navigate to="/pdv" replace />} />
    <Route path="estoque" element={<EstoquePage />} />
    <Route path="estoque/entrada" element={<EntradaNotaPage />} />
    <Route path="relatorios" element={<RelatoriosPage />} />
    <Route path="configuracoes" element={<SettingsPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>
);
