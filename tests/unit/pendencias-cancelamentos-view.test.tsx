// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PendenciasKpiCards,
  ParcelasAcordeao,
  PendenciasFiltrosBar,
  PendenciasTabela,
  PendenciasCancelamentosView,
} from '@/components/pendencias';
import type {
  PendenciaCancelamentoItem,
  PendenciasKPIs,
  PendenciasPaginadasResult,
  ParcelaDetalhe,
} from '@/types/pendencias-cancelamentos';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('Central de Pendências e Cancelamentos — Componentes de Interface', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockKpis: PendenciasKPIs = {
    totalContratacoesEmAtraso: 5,
    valorTotalEmAtraso: 4250.75,
    totalContratacoesCanceladas: 2,
    valorOriginalTotalCanceladas: 18000.0,
  };

  const mockParcelas: ParcelaDetalhe[] = [
    {
      id: 'parc-1',
      installmentNumber: 1,
      amount: 850.15,
      dueDate: '2026-10-01',
      paidAt: '2026-10-01',
      status: 'paid',
      daysOverdue: 0,
      cancellationDeadline: '2026-10-31',
      isPastDeadline: false,
      externalPaymentId: 'pay_123',
      bankSlipUrl: 'https://asaas.com/boleto/1',
      pixQrCodeUrl: 'https://asaas.com/pix/1',
      invoiceUrl: 'https://asaas.com/invoice/1',
    },
    {
      id: 'parc-2',
      installmentNumber: 2,
      amount: 850.15,
      dueDate: '2026-11-01',
      paidAt: null,
      status: 'overdue',
      daysOverdue: 4,
      cancellationDeadline: '2026-12-01',
      isPastDeadline: false,
      externalPaymentId: 'pay_124',
      bankSlipUrl: 'https://asaas.com/boleto/2',
      pixQrCodeUrl: null,
      invoiceUrl: 'https://asaas.com/invoice/2',
    },
    {
      id: 'parc-3',
      installmentNumber: 3,
      amount: 850.15,
      dueDate: '2026-09-01',
      paidAt: null,
      status: 'overdue',
      daysOverdue: 65,
      cancellationDeadline: '2026-10-01',
      isPastDeadline: true,
      externalPaymentId: 'pay_125',
      bankSlipUrl: null,
      pixQrCodeUrl: null,
      invoiceUrl: null,
    },
  ];

  const mockItems: PendenciaCancelamentoItem[] = [
    {
      id: 'cot-001',
      cotacaoId: 'cot-001',
      saleId: 'sale-001',
      tipoRegistro: 'venda',
      policyNumber: 'AP-9901',
      clientName: 'Dr. Roberto Santos',
      clientCpfCnpj: '12345678901',
      clientEmail: 'roberto@medico.com',
      clientPhone: '11988887777',
      corretoraId: 'corr-01',
      corretoraNome: 'Corretora Elite Prime',
      partnerId: 'part-01',
      partnerNome: 'Parceiro Elite',
      managerUserId: 'mgr-01',
      managerNome: 'Gestor Carlos',
      vendedorUserId: 'vend-01',
      vendedorNome: 'Vendedora Marina',
      productId: 'prod-01',
      productName: 'RC Médico Individual',
      valorTotalContratacao: 10200.0,
      situacaoContrato: 'em_atraso_tolerancia',
      motivoCancelamento: null,
      dataCancelamento: null,
      valorRecebidoAntesCancelamento: 850.15,
      qtdParcelasVencidas: 1,
      valorTotalAtraso: 850.15,
      dataVencimentoMaisAntiga: '2026-11-01',
      maiorDiasAtraso: 4,
      dataLimiteCancelamentoMaisCritica: '2026-12-01',
      parcelas: mockParcelas,
    },
    {
      id: 'cot-002',
      cotacaoId: 'cot-002',
      saleId: null,
      tipoRegistro: 'cotacao',
      policyNumber: null,
      clientName: 'Dra. Camila Duarte',
      clientCpfCnpj: '98765432100',
      clientEmail: 'camila@clinica.com',
      clientPhone: '21977776666',
      corretoraId: 'corr-02',
      corretoraNome: 'Seguros Modelo',
      partnerId: 'part-02',
      partnerNome: 'Parceiro Modelo',
      managerUserId: null,
      managerNome: null,
      vendedorUserId: null,
      vendedorNome: null,
      productId: 'prod-02',
      productName: 'RC Odonto Plus',
      valorTotalContratacao: 3600.0,
      situacaoContrato: 'cancelada',
      motivoCancelamento: 'Inadimplência',
      dataCancelamento: '2026-10-15',
      valorRecebidoAntesCancelamento: 0,
      qtdParcelasVencidas: 2,
      valorTotalAtraso: 600.0,
      dataVencimentoMaisAntiga: '2026-09-01',
      maiorDiasAtraso: 45,
      dataLimiteCancelamentoMaisCritica: '2026-10-01',
      parcelas: [],
    },
  ];

  const mockPaginadasResult: PendenciasPaginadasResult = {
    items: mockItems,
    kpis: mockKpis,
    total: 2,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. PendenciasKpiCards
  // =========================================================================
  describe('PendenciasKpiCards', () => {
    it('deve renderizar os 4 cards de KPIs com valores e textos formatados', () => {
      act(() => {
        root.render(<PendenciasKpiCards kpis={mockKpis} activeTab="em_atraso" />);
      });

      const cardsContainer = container.querySelector('[data-testid="kpis-grid"]');
      expect(cardsContainer).not.toBeNull();

      // Card 1
      const cardAtraso = container.querySelector('[data-testid="kpi-contratacoes-em-atraso"]');
      expect(cardAtraso?.textContent).toContain('Contratações em Atraso');
      expect(cardAtraso?.textContent).toContain('5');
      expect(cardAtraso?.textContent).toContain('Atenção');

      // Card 2
      const cardTotalAtraso = container.querySelector('[data-testid="kpi-total-em-atraso"]');
      expect(cardTotalAtraso?.textContent).toContain('Total em Atraso');
      expect(cardTotalAtraso?.textContent).toContain('4.250,75');

      // Card 3
      const cardCanceladas = container.querySelector('[data-testid="kpi-contratacoes-canceladas"]');
      expect(cardCanceladas?.textContent).toContain('Contratações Canceladas');
      expect(cardCanceladas?.textContent).toContain('2');

      // Card 4
      const cardValorCancelado = container.querySelector('[data-testid="kpi-valor-original-cancelado"]');
      expect(cardValorCancelado?.textContent).toContain('Valor Original Cancelado');
      expect(cardValorCancelado?.textContent).toContain('18.000,00');
      expect(cardValorCancelado?.textContent).toContain('não representa prejuízo líquido efetivo');
    });

    it('deve disparar onSelectTab ao clicar nos cards de atraso ou canceladas', () => {
      const handleSelectTab = vi.fn();
      act(() => {
        root.render(
          <PendenciasKpiCards
            kpis={mockKpis}
            activeTab="visao_geral"
            onSelectTab={handleSelectTab}
          />
        );
      });

      const cardAtraso = container.querySelector('[data-testid="kpi-contratacoes-em-atraso"]') as HTMLElement;
      act(() => {
        cardAtraso.click();
      });
      expect(handleSelectTab).toHaveBeenCalledWith('em_atraso');

      const cardCanceladas = container.querySelector('[data-testid="kpi-contratacoes-canceladas"]') as HTMLElement;
      act(() => {
        cardCanceladas.click();
      });
      expect(handleSelectTab).toHaveBeenCalledWith('canceladas');
    });

    it('deve renderizar skeleton quando isLoading for verdadeiro', () => {
      act(() => {
        root.render(<PendenciasKpiCards kpis={mockKpis} isLoading={true} />);
      });

      const skeleton = container.querySelector('[data-testid="kpis-loading-skeleton"]');
      expect(skeleton).not.toBeNull();
    });
  });

  // =========================================================================
  // 2. ParcelasAcordeao
  // =========================================================================
  describe('ParcelasAcordeao', () => {
    it('deve exibir mensagem informativa quando não houver parcelas registradas', () => {
      act(() => {
        root.render(<ParcelasAcordeao parcelas={[]} cotacaoId="cot-002" />);
      });

      const emptyBox = container.querySelector('[data-testid="parcelas-empty"]');
      expect(emptyBox).not.toBeNull();
      expect(emptyBox?.textContent).toContain('Nenhuma parcela gerada no gateway');
      expect(emptyBox?.textContent).toContain('As cobranças ainda não foram emitidas pelo Asaas');
    });

    it('deve renderizar a tabela de parcelas com situação, atraso e links do Asaas', () => {
      act(() => {
        root.render(
          <ParcelasAcordeao
            parcelas={mockParcelas}
            cotacaoId="cot-001"
            policyNumber="AP-9901"
          />
        );
      });

      const acordeao = container.querySelector('[data-testid="parcelas-acordeao"]');
      expect(acordeao).not.toBeNull();
      expect(acordeao?.textContent).toContain('Demonstrativo de Parcelas');
      expect(acordeao?.textContent).toContain('Apólice #AP-9901');

      // Linha 1 (Paga)
      const row1 = container.querySelector('[data-testid="parcela-row-1"]');
      expect(row1?.textContent).toContain('#1');
      expect(row1?.textContent).toContain('850,15');
      expect(row1?.textContent).toContain('Paga');

      // Linha 2 (Vencida com atraso de 4 dias)
      const row2 = container.querySelector('[data-testid="parcela-row-2"]');
      expect(row2?.textContent).toContain('#2');
      expect(row2?.textContent).toContain('Vencida');
      expect(row2?.textContent).toContain('4 dias');

      // Linha 3 (Vencida com prazo expirado BR-031)
      const row3 = container.querySelector('[data-testid="parcela-row-3"]');
      expect(row3?.textContent).toContain('#3');
      expect(row3?.textContent).toContain('65 dias');
      expect(row3?.textContent).toContain('Prazo expirado');

      // Verifica links de ação do Asaas (Boleto, Pix, Fatura)
      const links = container.querySelectorAll('a[target="_blank"]');
      expect(links.length).toBeGreaterThan(0);
      const linkHrefs = Array.from(links).map((a) => a.getAttribute('href'));
      expect(linkHrefs).toContain('https://asaas.com/boleto/1');
      expect(linkHrefs).toContain('https://asaas.com/pix/1');
      expect(linkHrefs).toContain('https://asaas.com/invoice/1');
    });
  });

  // =========================================================================
  // 3. PendenciasFiltrosBar
  // =========================================================================
  describe('PendenciasFiltrosBar', () => {
    it('deve renderizar os controles de filtro e disparar onChange na seleção de tipo de registro', () => {
      const handleChange = vi.fn();
      const handleLimpar = vi.fn();

      act(() => {
        root.render(
          <PendenciasFiltrosBar
            filtros={{}}
            onChange={handleChange}
            onLimpar={handleLimpar}
            tab="em_atraso"
          />
        );
      });

      const selectTipo = container.querySelector('#select-tipo-registro') as HTMLSelectElement;
      expect(selectTipo).not.toBeNull();

      act(() => {
        selectTipo.value = 'venda';
        selectTipo.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({ tipoRegistro: 'venda', page: 1 })
      );
    });

    it('deve disparar onChange com faixa de atraso selecionada', () => {
      const handleChange = vi.fn();

      act(() => {
        root.render(
          <PendenciasFiltrosBar
            filtros={{}}
            onChange={handleChange}
            onLimpar={vi.fn()}
            tab="em_atraso"
          />
        );
      });

      const selectAtraso = container.querySelector('#select-faixa-atraso') as HTMLSelectElement;
      expect(selectAtraso).not.toBeNull();

      act(() => {
        selectAtraso.value = '1-5';
        selectAtraso.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({ diasAtrasoMin: 1, diasAtrasoMax: 5, page: 1 })
      );
    });

    it('deve exibir botão de limpar filtros quando houver filtros aplicados e disparar onLimpar', () => {
      const handleLimpar = vi.fn();

      act(() => {
        root.render(
          <PendenciasFiltrosBar
            filtros={{ q: 'Roberto', tipoRegistro: 'venda' }}
            onChange={vi.fn()}
            onLimpar={handleLimpar}
            tab="em_atraso"
          />
        );
      });

      const btnLimpar = container.querySelector('[data-testid="btn-limpar-filtros"]') as HTMLButtonElement;
      expect(btnLimpar).not.toBeNull();

      act(() => {
        btnLimpar.click();
      });

      expect(handleLimpar).toHaveBeenCalled();
    });

    it('deve expandir painel de datas ao clicar no botão de período', () => {
      act(() => {
        root.render(
          <PendenciasFiltrosBar
            filtros={{}}
            onChange={vi.fn()}
            onLimpar={vi.fn()}
            tab="em_atraso"
          />
        );
      });

      expect(container.querySelector('[data-testid="painel-filtros-avancados"]')).toBeNull();

      const btnPeriodo = container.querySelector('button[aria-label="Alternar filtros por período"]') as HTMLButtonElement;
      act(() => {
        btnPeriodo.click();
      });

      expect(container.querySelector('[data-testid="painel-filtros-avancados"]')).not.toBeNull();
    });
  });

  // =========================================================================
  // 4. PendenciasTabela
  // =========================================================================
  describe('PendenciasTabela', () => {
    it('deve renderizar as linhas de contratação com dados do cliente e badges', () => {
      act(() => {
        root.render(
          <PendenciasTabela
            items={mockItems}
            tab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      const tabela = container.querySelector('[data-testid="pendencias-tabela"]');
      expect(tabela).not.toBeNull();

      // Cliente 1
      expect(container.textContent).toContain('Dr. Roberto Santos');
      expect(container.textContent).toContain('Corretora Elite Prime');
      expect(container.textContent).toContain('RC Médico Individual');
      expect(container.textContent).toContain('Atraso (Tolerância)');

      // Cliente 2
      expect(container.textContent).toContain('Dra. Camila Duarte');
      expect(container.textContent).toContain('RC Odonto Plus');
      expect(container.textContent).toContain('Cancelada');
    });

    it('deve alternar a expansão do acordeão de parcelas ao clicar no botão chevron', () => {
      act(() => {
        root.render(
          <PendenciasTabela
            items={mockItems}
            tab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      const linha1 = container.querySelector('[data-testid="linha-pendencia-cot-001"]') as HTMLElement;
      const toggleBtn = linha1.querySelector('button[aria-label*="parcelas"]') as HTMLButtonElement;

      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('#acordeao-detalhe-cot-001')).toBeNull();

      // Clica para expandir
      act(() => {
        toggleBtn.click();
      });

      expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
      const acordeao = container.querySelector('#acordeao-detalhe-cot-001');
      expect(acordeao).not.toBeNull();
      expect(acordeao?.textContent).toContain('Demonstrativo de Parcelas');

      // Clica novamente para recolher
      act(() => {
        toggleBtn.click();
      });

      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('#acordeao-detalhe-cot-001')).toBeNull();
    });

    it('deve renderizar estado vazio quando items for vazio', () => {
      act(() => {
        root.render(
          <PendenciasTabela
            items={[]}
            tab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      const empty = container.querySelector('[data-testid="tabela-empty-state"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('Nenhuma contratação em atraso!');
    });

    it('deve disparar onSort ao clicar em cada um dos cabeçalhos ordenáveis', () => {
      const handleSort = vi.fn();
      act(() => {
        root.render(
          <PendenciasTabela
            items={mockItems}
            tab="em_atraso"
            baseRoute="/portal"
            onSort={handleSort}
          />
        );
      });

      // 1. Cliente
      const btnCliente = container.querySelector('button[aria-label="Ordenar por nome do cliente"]') as HTMLButtonElement;
      expect(btnCliente).not.toBeNull();
      act(() => { btnCliente.click(); });
      expect(handleSort).toHaveBeenCalledWith('cliente');

      // 2. Contratação
      const btnContratacao = container.querySelector('button[aria-label="Ordenar por código de contratação ou apólice"]') as HTMLButtonElement;
      expect(btnContratacao).not.toBeNull();
      act(() => { btnContratacao.click(); });
      expect(handleSort).toHaveBeenCalledWith('contratacao');

      // 3. Situação / Atraso
      const btnAtraso = container.querySelector('button[aria-label="Ordenar por dias de atraso"]') as HTMLButtonElement;
      expect(btnAtraso).not.toBeNull();
      act(() => { btnAtraso.click(); });
      expect(handleSort).toHaveBeenCalledWith('dias_atraso');

      // 4. Valor
      const btnValor = container.querySelector('button[aria-label="Ordenar por valor total"]') as HTMLButtonElement;
      expect(btnValor).not.toBeNull();
      act(() => { btnValor.click(); });
      expect(handleSort).toHaveBeenCalledWith('valor');

      // 5. Parceiro / Corretora
      const btnCorretora = container.querySelector('button[aria-label="Ordenar por corretora ou parceiro"]') as HTMLButtonElement;
      expect(btnCorretora).not.toBeNull();
      act(() => { btnCorretora.click(); });
      expect(handleSort).toHaveBeenCalledWith('corretora');

      // 6. Vencimento
      const btnVencimento = container.querySelector('button[aria-label="Ordenar por data de vencimento mais antiga"]') as HTMLButtonElement;
      expect(btnVencimento).not.toBeNull();
      act(() => { btnVencimento.click(); });
      expect(handleSort).toHaveBeenCalledWith('vencimento');
    });
  });

  // =========================================================================
  // 5. PendenciasCancelamentosView
  // =========================================================================
  describe('PendenciasCancelamentosView', () => {
    it('deve renderizar a visão completa com abas, KPIs, tabela e paginação', () => {
      act(() => {
        root.render(
          <PendenciasCancelamentosView
            initialData={mockPaginadasResult}
            initialTab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      expect(container.textContent).toContain('Central de Pendências e Cancelamentos');
      expect(container.querySelector('[data-testid="tab-em-atraso"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="tab-canceladas"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="tab-visao-geral"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="pendencias-paginacao"]')).not.toBeNull();
    });

    it('deve trocar de aba e requisitar dados atualizados via fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockPaginadasResult,
          items: [mockItems[1]],
        }),
      } as any);

      act(() => {
        root.render(
          <PendenciasCancelamentosView
            initialData={mockPaginadasResult}
            initialTab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      const tabCanceladas = container.querySelector('[data-testid="tab-canceladas"]') as HTMLButtonElement;

      await act(async () => {
        tabCanceladas.click();
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/pendencias-cancelamentos?tab=canceladas')
      );
    });

    it('deve disparar sincronização com Asaas e recarregar dados ao clicar em Atualizar Dados', async () => {
      const fetchCalls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, opts: any) => {
        const urlStr = String(url);
        fetchCalls.push(urlStr);
        if (urlStr.includes('/sync')) {
          return {
            ok: true,
            json: async () => ({ ok: true, totalProcessed: 5, updatedToPaid: 2 }),
          } as any;
        }
        return {
          ok: true,
          json: async () => mockPaginadasResult,
        } as any;
      });

      act(() => {
        root.render(
          <PendenciasCancelamentosView
            initialData={mockPaginadasResult}
            initialTab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      const btnAtualizar = container.querySelector('[data-testid="btn-atualizar-dados"]') as HTMLButtonElement;
      await act(async () => {
        btnAtualizar.click();
      });

      expect(fetchCalls[0]).toContain('/api/pendencias-cancelamentos/sync');
      expect(fetchCalls[1]).toContain('/api/pendencias-cancelamentos?tab=em_atraso');
    });

    it('deve exibir alerta de erro quando fetch falha', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/sync')) {
          return { ok: true, json: async () => ({ ok: true }) } as any;
        }
        return {
          ok: false,
          json: async () => ({ error: 'Falha de conexão com o banco de dados' }),
        } as any;
      });

      act(() => {
        root.render(
          <PendenciasCancelamentosView
            initialData={mockPaginadasResult}
            initialTab="em_atraso"
            baseRoute="/portal"
          />
        );
      });

      const btnAtualizar = container.querySelector('[data-testid="btn-atualizar-dados"]') as HTMLButtonElement;

      await act(async () => {
        btnAtualizar.click();
      });

      const alertErro = container.querySelector('[data-testid="alert-erro-central"]');
      expect(alertErro).not.toBeNull();
      expect(alertErro?.textContent).toContain('Falha de conexão com o banco de dados');
    });
  });
});
