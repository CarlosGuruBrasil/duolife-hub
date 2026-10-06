import { z } from 'zod';

// Replicando exatamente o schema protegido em app/api/cotacoes/route.ts
const cotacaoSchema = z.object({
  id: z.string().trim().optional().nullable(),
  cotacaoId: z.string().trim().optional().nullable(),
  clientName: z.string().trim().min(2, 'Nome do proponente deve ter ao menos 2 caracteres'),
  clientCpfCnpj: z
    .string()
    .trim()
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length === 11 || val.length === 14, {
      message: 'CPF deve conter 11 dígitos ou CNPJ deve conter 14 dígitos',
    }),
  clientEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val ? val.trim().toLowerCase() : null))
    .refine(
      (val) => {
        if (!val || val === '') return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      },
      { message: 'Endereço de e-mail informado é inválido' }
    ),
  clientPhone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => (val ? val.replace(/\D/g, '') : null)),
  importanciaSegurada: z
    .preprocess((val) => {
      if (val === null || val === undefined || val === '' || val === 0 || val === '0') return null;
      if (typeof val === 'string') {
        const parsed = Number(val.replace(/[^\d.,]/g, '').replace(',', '.'));
        return isNaN(parsed) || parsed <= 0 ? null : parsed;
      }
      if (typeof val === 'number') {
        return val <= 0 || isNaN(val) ? null : val;
      }
      return null;
    }, z.number().positive().optional().nullable()),
  notes: z.string().trim().optional().nullable(),
  productId: z.string().trim().min(1).optional().nullable(),
  clientData: z.record(z.string(), z.unknown()).optional().nullable(),
  adminSelectedPartnerId: z.string().trim().optional().nullable(),
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('✓ ' + msg);
}

console.log('=== TESTES DE RESILIÊNCIA E BLINDAGEM DO COTACAO_SCHEMA ===');

// Teste 1: Importância Segurada = 0 ou nulo ou vazio (Antes quebrava com 400!)
const r1 = cotacaoSchema.safeParse({
  clientName: 'Carlos Eduardo',
  clientCpfCnpj: '12345678909',
  importanciaSegurada: 0,
});
assert(r1.success, 'Importância segurada = 0 é convertida para null com sucesso sem erro 400');
assert(r1.data?.importanciaSegurada === null, 'importanciaSegurada resultante é null');

const r1b = cotacaoSchema.safeParse({
  clientName: 'Carlos Eduardo',
  clientCpfCnpj: '12345678909',
  importanciaSegurada: null,
});
assert(r1b.success, 'Importância segurada = null é aceita');

// Teste 2: CPF / CNPJ com máscara e pontuação é limpo automaticamente
const r2 = cotacaoSchema.safeParse({
  clientName: 'Maria Silva',
  clientCpfCnpj: '123.456.789-01',
});
assert(r2.success, 'CPF com pontuação passa na validação');
assert(r2.data?.clientCpfCnpj === '12345678901', 'CPF tem pontuação removida');

const r2b = cotacaoSchema.safeParse({
  clientName: 'Empresa Teste',
  clientCpfCnpj: '12.345.678/0001-90',
});
assert(r2b.success, 'CNPJ com pontuação passa na validação');
assert(r2b.data?.clientCpfCnpj === '12345678000190', 'CNPJ tem pontuação removida');

// Teste 3: Campos nulos não quebram mais
const r3 = cotacaoSchema.safeParse({
  clientName: 'João Santos',
  clientCpfCnpj: '12345678901',
  clientEmail: null,
  clientPhone: null,
  cotacaoId: null,
  notes: null,
  productId: null,
  clientData: null,
});
assert(r3.success, 'Payload com múltiplos campos null é aceito sem 400');

// Teste 4: E-mail em caixa alta ou com espaços é normalizado
const r4 = cotacaoSchema.safeParse({
  clientName: 'João Santos',
  clientCpfCnpj: '12345678901',
  clientEmail: '  Carlos@Empresa.COM.br  ',
});
assert(r4.success, 'E-mail com espaços e maiúsculas é válido');
assert(r4.data?.clientEmail === 'carlos@empresa.com.br', 'E-mail é convertido para lowercase e trimmed');

// Teste 5: CPF incompleto gera mensagem clara e detalhada
const r5 = cotacaoSchema.safeParse({
  clientName: 'João Santos',
  clientCpfCnpj: '123456',
});
assert(!r5.success, 'CPF incompleto (< 11 dígitos) é rejeitado');
assert(
  Boolean(r5.error?.issues[0]?.message.includes('11 dígitos')),
  'Mensagem de erro explícita sobre 11 dígitos'
);

// Teste 6: Nome curto gera mensagem clara
const r6 = cotacaoSchema.safeParse({
  clientName: 'J',
  clientCpfCnpj: '12345678901',
});
assert(!r6.success, 'Nome com 1 letra é rejeitado');
assert(
  Boolean(r6.error?.issues[0]?.message.includes('2 caracteres')),
  'Mensagem de erro explícita sobre 2 caracteres'
);

console.log('==============================================');
console.log('TODOS OS TESTES DE SCHEMA PASSARAM COM SUCESSO');
console.log('==============================================');
