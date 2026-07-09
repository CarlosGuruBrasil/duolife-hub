import re

with open('src/components/portal/CotacaoFormRC.tsx', 'r') as f:
    content = f.read()

passo2_3_4 = """      {/* PASSO 2: COBERTURA & PERFIL PROFISSIONAL */}
      {step === 2 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">2. Seleção de Plano e Cobertura</h3>
          
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {planos.map((plano) => {
              const isSelected = planoSel?.tipoDePlano === plano.tipoDePlano;
              return (
                <div
                  key={plano.tipoDePlano}
                  onClick={() => {
                    setPlanoSel(plano);
                    setParcelaSel(null);
                  }}
                  className={`border-2 rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between ${
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-[0_0_15px_rgba(0,212,224,0.15)]'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <h4 className="font-bold text-base text-white">{plano.nomeExibido}</h4>
                    <div className="mt-3 text-2xl font-black text-accent">{plano.cobertura}</div>
                    <div className="text-xs text-gray-400 mt-1">Limite Máximo de Cobertura</div>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-3 text-sm text-gray-300 space-y-2">
                    <div>
                      <span className="text-gray-400 text-xs block">Franquia obrigatória</span>
                      <span className="font-semibold text-white">{plano.franquia}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block">Valor à vista</span>
                      <span className="font-semibold text-emerald-400">{plano.parcela}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="text-lg font-bold text-accent pt-4">Renovação e Perfil</h3>
          
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-4">
            <label className="block">
              <span className="field-label text-white">É uma renovação de apólice?</span>
              <select
                value={form.isRenovacao}
                onChange={(e) => updateField('isRenovacao', e.target.value)}
                className="form-input md:w-64 mt-2"
              >
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Faturamento Bruto Anual (Últimos 12 meses)</span>
              <input
                required
                value={form.faturamentoAntes}
                onChange={(e) => updateField('faturamentoAntes', applyMoneyMask(e.target.value))}
                className="form-input"
                placeholder="R$ 0,00"
              />
            </label>

            <label className="block">
              <span className="field-label">Faturamento Estimado (Próximos 12 meses)</span>
              <input
                required
                value={form.faturamentoDepois}
                onChange={(e) => updateField('faturamentoDepois', applyMoneyMask(e.target.value))}
                className="form-input"
                placeholder="R$ 0,00"
              />
            </label>
          </div>

          <div>
            <span className="field-label mb-2 block">Áreas de Atuação</span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {AREAS_ATUACAO.map((area) => (
                <label key={area.key} className="flex items-center space-x-2 cursor-pointer bg-slate-900 border border-slate-800 p-3 rounded-lg hover:border-accent/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={form.atuacao.includes(area.key)}
                    onChange={() => handleCheckboxAtuacao(area.key)}
                    className="rounded border-slate-700 bg-slate-800 text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-gray-300">{area.label}</span>
                </label>
              ))}
            </div>
          </div>

          <h3 className="text-lg font-bold text-accent pt-4">Pessoa Politicamente Exposta (PPE)</h3>
          
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Você ou sua empresa ocupou cargo público relevante nos últimos 5 anos?</span>
              <select
                value={form.ppeCargos}
                onChange={(e) => updateField('ppeCargos', e.target.value)}
                className="form-input"
              >
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>

            <label className="block">
              <span className="field-label">Seu sócio, cônjuge ou representante legal é PPE?</span>
              <select
                value={form.ppeRepresenta}
                onChange={(e) => updateField('ppeRepresenta', e.target.value)}
                className="form-input"
              >
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </label>
          </div>

          {(form.ppeCargos === 'Sim' || form.ppeRepresenta === 'Sim') && (
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
              <span className="field-label block font-semibold text-accent">Selecione as funções ocupadas:</span>
              <div className="space-y-2">
                {CARGOS_PPE.map((cargo) => (
                  <label key={cargo.id} className="flex items-start space-x-2 cursor-pointer text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.ppeCargoSelect.includes(cargo.id)}
                      onChange={() => handleCheckboxPpe(cargo.id)}
                      className="mt-1 rounded border-slate-700 bg-slate-800 text-accent focus:ring-accent"
                    />
                    <span>{cargo.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 3: DECLARAÇÕES & HISTÓRICO */}
      {step === 3 && (
        <div className="card space-y-6">
          {form.isRenovacao === 'Sim' && (
            <>
              <h3 className="text-lg font-bold text-accent">3. Seguro Anterior (Últimos 2 anos)</h3>
              
              <div className="grid gap-5 md:grid-cols-3">
                <label className="block">
                  <span className="field-label">Seguradora</span>
                  <input
                    value={form.seguradora}
                    onChange={(e) => updateField('seguradora', e.target.value)}
                    className="form-input"
                    placeholder="Ex: Porto Seguro"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Vigência</span>
                  <input
                    type="date"
                    value={form.vigencia}
                    onChange={(e) => updateField('vigencia', e.target.value)}
                    className="form-input"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Limite Segurado</span>
                  <input
                    value={form.limite}
                    onChange={(e) => updateField('limite', applyMoneyMask(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Franquia</span>
                  <input
                    value={form.franquiaAnterior}
                    onChange={(e) => updateField('franquiaAnterior', applyMoneyMask(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Prêmio Líquido Pago</span>
                  <input
                    value={form.premio}
                    onChange={(e) => updateField('premio', applyMoneyMask(e.target.value))}
                    className="form-input"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label className="block">
                  <span className="field-label">Data de Retroatividade</span>
                  <input
                    type="date"
                    value={form.dataRetroativa}
                    onChange={(e) => updateField('dataRetroativa', e.target.value)}
                    className="form-input"
                  />
                </label>
              </div>
            </>
          )}

          {planoSel?.tipoDePlano !== '100k' ? (
            <>
              <h3 className="text-lg font-bold text-accent pt-4">Questionário de Risco (Underwriting)</h3>
              
              <div className="space-y-4">
                {[
                  {
                    id: 'propostaRecusada',
                    q: 'Já teve proposta de seguro recusada, cancelada ou com recusa de renovação?',
                    det: 'propostaDetalhe'
                  },
                  {
                    id: 'reclamacaoProfissional',
                    q: 'Já houve alguma reclamação, queixa, notificação ou ação judicial de terceiros alegando falha/dano profissional nos últimos 2 anos?',
                    det: 'reclamacaoDetalhe'
                  },
                  {
                    id: 'investigacaoAutoridade',
                    q: 'Responde ou já respondeu a algum processo ético, disciplinar (como OAB) ou administrativo nos últimos 2 anos?',
                    det: 'investigacaoDetalhe'
                  },
                  {
                    id: 'fatoTerceiros',
                    q: 'Tem conhecimento de algum fato, ato, omissão, queixa pendente ou circunstância que possa motivar reclamação judicial no futuro?',
                    det: 'fatoDetalhe'
                  },
                  {
                    id: 'pagouReclamacao',
                    q: 'Já realizou algum pagamento de indenização com recursos próprios por falhas profissionais nos últimos 2 anos?',
                    det: 'pagouDetalhe'
                  }
                ].map((item) => {
                  const val = form[item.id as keyof FormState] as string;
                  return (
                    <div key={item.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                        <span className="text-sm text-gray-300 font-medium">{item.q}</span>
                        <select
                          value={val}
                          onChange={(e) => updateField(item.id as keyof FormState, e.target.value)}
                          className="form-input md:w-32"
                        >
                          <option value="Não">Não</option>
                          <option value="Sim">Sim</option>
                        </select>
                      </div>
                      {val === 'Sim' && (
                        <label className="block">
                          <span className="field-label text-red-300 font-semibold">Descreva os detalhes e fatos:</span>
                          <textarea
                            required
                            value={form[item.det as keyof FormState] as string}
                            onChange={(e) => updateField(item.det as keyof FormState, e.target.value)}
                            className="form-input min-h-20 border-red-900/50 focus:border-red-500"
                            placeholder="Informe datas, motivos e valores envolvidos..."
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-5 rounded-xl text-emerald-200">
              <span className="font-semibold block mb-1">Declarações Simplificadas</span>
              O plano de R$ 100.000 (100k) selecionado possui isenção do preenchimento do questionário de risco. Você pode avançar.
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleNext}
              className="btn btn-primary flex items-center space-x-2"
            >
              <span>Avançar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 4: PAGAMENTO */}
      {step === 4 && (
        <div className="card space-y-6">
          <h3 className="text-lg font-bold text-accent">4. Pagamento</h3>

          {/* Cupom Promocional */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
            <h4 className="font-bold text-sm text-white flex items-center space-x-2">
              <Percent className="w-4 h-4 text-accent" />
              <span>Cupom Promocional</span>
            </h4>
            <div className="flex gap-3">
              <input
                value={cupomCode}
                onChange={(e) => setCupomCode(e.target.value)}
                className="form-input max-w-xs"
                placeholder="Insira o código do cupom"
                disabled={cupomAplicado}
              />
              {!cupomAplicado ? (
                <button
                  onClick={handleValidarCupom}
                  className="btn btn-secondary text-sm px-4 py-2"
                >
                  Aplicar
                </button>
              ) : (
                <button
                  onClick={() => {
                    setCupomAplicado(false);
                    setCupomDesconto(0);
                    setCupomCode('');
                  }}
                  className="btn btn-secondary bg-red-950/20 text-red-400 border-red-900 hover:bg-red-950/40 text-sm px-4 py-2"
                >
                  Remover
                </button>
              )}
            </div>
            {cupomError && <p className="text-xs text-red-400">{cupomError}</p>}
            {cupomAplicado && (
              <p className="text-xs text-emerald-400 font-semibold">
                Cupom de Desconto de {cupomDesconto}% aplicado com sucesso!
              </p>
            )}
          </div>

          {/* Opções de Parcelamento */}
          {planoSel && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-accent">Condições de Pagamento</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {getOpcoesParcelamento(planoSel).map((op) => {
                  const isParcSelected = parcelaSel?.qtd === op.qtd;
                  const valorExibe = op.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  const valorTotalExibe = (op.valor * op.qtd).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  
                  return (
                    <div
                      key={op.qtd}
                      onClick={() => setParcelaSel({ qtd: op.qtd, valor: op.valor })}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-colors ${
                        isParcSelected
                          ? 'border-accent bg-accent/5'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-bold text-sm text-gray-200">
                        {op.qtd}x de {valorExibe}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Total a pagar: {valorTotalExibe}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={handleBack}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <button
              onClick={handleGerarContrato}
              disabled={loading || !planoSel || !parcelaSel}
              className="btn btn-primary flex items-center space-x-2"
            >
              {loading ? (
                <span>Gerando Contrato...</span>
              ) : (
                <>
                  <span>Ir para Assinatura</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* PASSO 5: ASSINATURA E PAGAMENTO */}
      {step === 5 && ("""

# Replace from step 2 down to step 4 start
pattern = re.compile(r'      \{\/\* PASSO 2: PERFIL PROFISSIONAL & RISCOS \*\/}.*?      \{\/\* PASSO 4: ASSINATURA E PAGAMENTO \*\/}\n      \{step === 4 && \(', re.DOTALL)

new_content = pattern.sub(passo2_3_4, content)

with open('src/components/portal/CotacaoFormRC.tsx', 'w') as f:
    f.write(new_content)
