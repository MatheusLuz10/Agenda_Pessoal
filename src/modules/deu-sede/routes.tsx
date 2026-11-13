import { Navigate, Route } from "react-router-dom";
import { DeuSedeLayout } from "@/modules/deu-sede/components/DeuSedeLayout";
import { DEU_SEDE_BASE, rota } from "@/modules/deu-sede/config/modules";
import { DashboardPage } from "@/modules/deu-sede/pages/DashboardPage";
import { NotFoundPage } from "@/modules/deu-sede/pages/NotFoundPage";
import { SettingsPage } from "@/modules/deu-sede/pages/SettingsPage";
import { ProdutosPage } from "@/modules/deu-sede/pages/produtos/ProdutosPage";
import { ProdutoFormPage } from "@/modules/deu-sede/pages/produtos/ProdutoFormPage";
import { ProdutoDetalhePage } from "@/modules/deu-sede/pages/produtos/ProdutoDetalhePage";
import { FornecedoresPage } from "@/modules/deu-sede/pages/fornecedores/FornecedoresPage";
import { FornecedorFormPage } from "@/modules/deu-sede/pages/fornecedores/FornecedorFormPage";
import { FornecedorDetalhePage } from "@/modules/deu-sede/pages/fornecedores/FornecedorDetalhePage";
import { PedidosPage } from "@/modules/deu-sede/pages/pedidos/PedidosPage";
import { PedidoSimplesPage } from "@/modules/deu-sede/pages/pedidos/PedidoSimplesPage";
import { PedidoDetalhePage } from "@/modules/deu-sede/pages/pedidos/PedidoDetalhePage";
import { RecebimentosPage } from "@/modules/deu-sede/pages/recebimentos/RecebimentosPage";
import { RegistrarRecebimentoPage } from "@/modules/deu-sede/pages/recebimentos/RegistrarRecebimentoPage";
import { EstoquePage } from "@/modules/deu-sede/pages/estoque/EstoquePage";
import { EntradaNotaPage } from "@/modules/deu-sede/pages/estoque/EntradaNotaPage";
import { RelatoriosPage } from "@/modules/deu-sede/pages/RelatoriosPage";
import { ContasPagarPage } from "@/modules/deu-sede/pages/financeiro/ContasPagarPage";
import { RegistrosPage } from "@/modules/deu-sede/pages/RegistrosPage";

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
    {/* Cotações e Comparação de preços saíram do app (migração 0020): links antigos vão para o Montar pedido */}
    <Route path="cotacoes/*" element={<Navigate to={rota("pedidos", "montar")} replace />} />
    <Route path="comparacao" element={<Navigate to={rota("pedidos", "montar")} replace />} />
    <Route path="pedidos" element={<PedidosPage />} />
    <Route path="pedidos/montar" element={<PedidoSimplesPage />} />
    <Route path="pedidos/montar-comparacao" element={<Navigate to={rota("pedidos", "montar")} replace />} />
    <Route path="pedidos/:id" element={<PedidoDetalhePage />} />
    <Route path="recebimentos" element={<RecebimentosPage />} />
    <Route path="recebimentos/novo/:pedidoId" element={<RegistrarRecebimentoPage />} />
    <Route path="pdv" element={<Navigate to="/pdv" replace />} />
    <Route path="estoque" element={<EstoquePage />} />
    <Route path="estoque/entrada" element={<EntradaNotaPage />} />
    <Route path="contas" element={<ContasPagarPage />} />
    <Route path="relatorios" element={<RelatoriosPage />} />
    <Route path="configuracoes" element={<SettingsPage />} />
    <Route path="registros" element={<RegistrosPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Route>
);
