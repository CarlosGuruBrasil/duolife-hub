// Estados imutáveis: a cotação já virou negócio fechado (ou deixou de ser um).
// 'emitida' entra aqui porque, com apólice emitida, recusar/regerar contrato ou fatura
// deixaria o registro em contradição com a venda já existente em `sales`.
// 'assinado' e 'pagamento_gerado' NÃO são terminais de propósito: a seguradora ainda
// pode recusar o risco depois do contrato assinado ou do boleto emitido.
export const ESTADOS_TERMINAIS = ['aprovada', 'recusada', 'expirada', 'emitida'];
