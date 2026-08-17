'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PackagePlus } from 'lucide-react';

type Partner = { id: string; razao_social: string; nome_fantasia: string | null };
type Product = { id: string; name: string; code: string; category: string; product_type: string; insurer_name: string | null; flow_key: string; is_quoteable: boolean; partners_count: number };

const initial = { name: '', code: '', category: '', productType: 'insurance', providerName: '', insurerCnpj: '', description: '', publicTitle: '', targetAudience: '', commissionRate: '', minPremium: '', useRcJourney: true, policyPrefix: 'DL-RC', validityDays: '365', saleRecognition: 'on_payment', renewalEnabled: true, requiresUnderwriting: false, requiredDocumentsText: '', availability: 'all_active', partnerIds: [] as string[] };

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const res = await fetch('/api/admin/produtos');
    const data = await res.json();
    setProducts(data.products || []); setPartners(data.partners || []);
  }
  useEffect(() => { load(); }, []);

  function togglePartner(id: string) { setForm((value) => ({ ...value, partnerIds: value.partnerIds.includes(id) ? value.partnerIds.filter((item) => item !== id) : [...value.partnerIds, id] })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    const res = await fetch('/api/admin/produtos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, commissionRate: form.commissionRate === '' ? null : Number(form.commissionRate), minPremium: form.minPremium === '' ? null : Number(form.minPremium), validityDays: form.validityDays === '' ? null : Number(form.validityDays), requiredDocuments: form.requiredDocumentsText.split('\n').map((item) => item.trim()).filter(Boolean) }) });
    const data = await res.json(); setSaving(false);
    if (!res.ok) return setMessage(data.error || 'Não foi possível cadastrar o produto.');
    setForm(initial); setMessage(`Produto ${data.product.name} cadastrado.`); await load();
  }

  const rcFlow = form.useRcJourney;
  return <div><div className="mb-8 flex items-center gap-3"><PackagePlus size={25} style={{ color: 'var(--primary)' }} /><div><h1 className="admin-page-title">Produtos e serviços</h1><p className="muted mt-1 text-sm">Cadastre ofertas, defina o fluxo e habilite os parceiros que podem operá-las.</p></div></div>
    <form onSubmit={submit} className="card grid gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
      <div className="md:col-span-2 xl:col-span-3"><h2 className="font-semibold text-gray-900">Nova oferta</h2><p className="mt-1 text-sm text-gray-500">O fluxo RC profissional reutiliza a jornada já validada. Outros produtos permanecem bloqueados até ganhar fluxo próprio.</p></div>
      <label className="text-sm font-medium">Nome<input required className="form-input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: RC Profissional — Médicos" /></label>
      <label className="text-sm font-medium">Código interno<input required className="form-input mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="RC-MED-001" /></label>
      <label className="text-sm font-medium">Categoria<input required className="form-input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Responsabilidade civil" /></label>
      <label className="text-sm font-medium">Tipo<select className="form-input mt-1" value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })}><option value="insurance">Seguro</option><option value="service">Serviço</option></select></label>
      <label className="text-sm font-medium">Seguradora ou prestador<input className="form-input mt-1" value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value })} placeholder="Opcional" /></label>
      <label className="text-sm font-medium">CNPJ do fornecedor<input className="form-input mt-1" value={form.insurerCnpj} onChange={(e) => setForm({ ...form, insurerCnpj: e.target.value })} placeholder="Opcional" /></label>
      <label className="text-sm font-medium">Comissão-base (%)<input className="form-input mt-1" type="number" min="0" max="100" step="0.01" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} placeholder="Ex.: 15" /></label>
      <label className="text-sm font-medium">Preço mínimo (R$)<input className="form-input mt-1" type="number" min="0" step="0.01" value={form.minPremium} onChange={(e) => setForm({ ...form, minPremium: e.target.value })} placeholder="Opcional" /></label>
      <label className="text-sm font-medium md:col-span-2 xl:col-span-3">Descrição<textarea className="form-input mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Resumo para o catálogo do parceiro" /></label>
      <label className="text-sm font-medium xl:col-span-2">Título público<input className="form-input mt-1" value={form.publicTitle} onChange={(e) => setForm({ ...form, publicTitle: e.target.value })} placeholder="Como a oferta aparecerá ao cliente" /></label>
      <label className="text-sm font-medium">Público elegível<input className="form-input mt-1" value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} placeholder="Ex.: médicos e clínicas" /></label>
      <div className="text-sm font-medium"><span>Jornada digital</span><label className="form-input mt-1 flex items-center gap-2"><input type="checkbox" checked={form.useRcJourney} onChange={(e) => setForm({ ...form, useRcJourney: e.target.checked, productType: e.target.checked ? 'insurance' : form.productType })} /> Usar a jornada RC já existente</label></div>
      <label className="text-sm font-medium">Prefixo da apólice<input disabled={!rcFlow} className="form-input mt-1 disabled:opacity-50" value={form.policyPrefix} onChange={(e) => setForm({ ...form, policyPrefix: e.target.value.toUpperCase() })} placeholder="DL-RC" /></label>
      <label className="text-sm font-medium">Vigência (dias)<input className="form-input mt-1" type="number" min="1" max="3650" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} /></label>
      <label className="text-sm font-medium">Reconhecimento de venda<select className="form-input mt-1" value={form.saleRecognition} onChange={(e) => setForm({ ...form, saleRecognition: e.target.value })}><option value="on_payment">No primeiro pagamento</option><option value="on_full_payment">Após quitação total</option><option value="on_issuance">Na emissão</option></select></label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.renewalEnabled} onChange={(e) => setForm({ ...form, renewalEnabled: e.target.checked })} /> Permite renovação</label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.requiresUnderwriting} onChange={(e) => setForm({ ...form, requiresUnderwriting: e.target.checked })} /> Exige análise técnica</label>
      <label className="text-sm font-medium md:col-span-2 xl:col-span-3">Documentos obrigatórios<textarea className="form-input mt-1" value={form.requiredDocumentsText} onChange={(e) => setForm({ ...form, requiredDocumentsText: e.target.value })} placeholder={'Um documento por linha\nEx.: Comprovante de atividade'} /></label>
      <fieldset className="md:col-span-2 xl:col-span-3"><legend className="text-sm font-medium">Disponibilidade</legend><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={form.availability === 'all_active'} onChange={() => setForm({ ...form, availability: 'all_active' })} /> Todos os parceiros ativos</label><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={form.availability === 'selected'} onChange={() => setForm({ ...form, availability: 'selected' })} /> Escolher parceiros</label>{form.availability === 'selected' && <div className="mt-3 grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">{partners.map((partner) => <label key={partner.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.partnerIds.includes(partner.id)} onChange={() => togglePartner(partner.id)} /> {partner.nome_fantasia || partner.razao_social}</label>)}</div>}</fieldset>
      {message && <p className="md:col-span-2 xl:col-span-3 text-sm text-gray-700">{message}</p>}<div className="md:col-span-2 xl:col-span-3"><button disabled={saving} className="btn-primary">{saving ? 'Cadastrando...' : 'Cadastrar produto'}</button></div>
    </form>
    <div className="card mt-8 overflow-hidden p-0"><div className="border-b p-5"><h2 className="font-semibold text-gray-900">Catálogo atual</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-gray-50 text-left text-gray-600"><th className="px-5 py-3">Oferta</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Fluxo</th><th className="px-5 py-3">Parceiros</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className="border-t"><td className="px-5 py-4"><div className="font-medium">{product.name}</div><div className="text-xs text-gray-500">{product.code} · {product.category}</div></td><td className="px-5 py-4">{product.product_type === 'insurance' ? 'Seguro' : 'Serviço'}</td><td className="px-5 py-4">{product.flow_key === 'rc_professional_v1' ? 'RC profissional' : 'Pendente'}</td><td className="px-5 py-4">{product.partners_count}</td><td className="px-5 py-4">{product.is_quoteable ? 'Disponível' : 'Em breve'}</td></tr>)}</tbody></table></div></div>
  </div>;
}
