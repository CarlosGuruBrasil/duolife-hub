import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/lib/auth';
import { roleIsInternal } from '@/lib/roles';
import { logger } from '@/lib/logger';
import { sendTemplatedEmail, renderTemplateString } from '@/lib/email-service';
import { sendMail } from '@/lib/mailer';

export async function POST(req: NextRequest) {
  const user = await verifyAuth();
  if (!user) return unauthorized();
  if (!roleIsInternal(user.role)) {
    return Response.json({ error: 'Acesso restrito' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { templateCode, recipientEmail, subject, htmlContent, customVariables } = body;

    const targetEmail = (recipientEmail && typeof recipientEmail === 'string' && recipientEmail.trim())
      ? recipientEmail.trim()
      : user.email;

    if (!targetEmail) {
      return Response.json({ error: 'E-mail de destino não informado' }, { status: 400 });
    }

    // Variáveis de simulação padrão
    const simulationVars: Record<string, any> = {
      nome: user.name || 'Carlos Augusto',
      email: targetEmail,
      telefone: '(11) 99999-9999',
      cotacao_id: 'COT-89421',
      produto_nome: 'Seguro RC Profissional Advogado',
      valor: '1.250,00',
      cobertura: '200.000,00',
      parceiro_nome: 'Corretora Modelo DuoLife',
      codigo_venda: 'CORRETORA_VIP',
      link_proposta: 'https://duolife.com.br/contratar/demo',
      link_fatura: 'https://duolife.com.br/pagamento/demo',
      ...(customVariables || {}),
    };

    // Caso o usuário queira testar um rascunho de HTML diretamente antes de salvar
    if (htmlContent && typeof htmlContent === 'string') {
      const renderedSubject = renderTemplateString(subject || 'Teste de E-mail — DuoLife', simulationVars);
      const renderedHtml = renderTemplateString(htmlContent, simulationVars);

      const mailResult = await sendMail({
        to: targetEmail,
        subject: `[TESTE] ${renderedSubject}`,
        html: renderedHtml,
      });

      return Response.json({
        ok: mailResult.success,
        mock: mailResult.mock,
        recipient: targetEmail,
        message: mailResult.success
          ? (mailResult.mock ? 'E-mail de teste simulado com sucesso no log do servidor.' : `E-mail de teste enviado para ${targetEmail}.`)
          : 'Falha no envio do e-mail de teste.',
        error: mailResult.error,
      });
    }

    // Caso informe um templateCode cadastrado
    if (!templateCode) {
      return Response.json({ error: 'Informe o código do template ou o conteúdo HTML de teste.' }, { status: 400 });
    }

    const result = await sendTemplatedEmail({
      templateCode,
      to: targetEmail,
      toName: user.name,
      variables: simulationVars,
      metadata: { isTest: true, initiatedBy: user.email },
    });

    return Response.json({
      ok: result.success,
      mock: result.mock,
      recipient: targetEmail,
      message: result.success
        ? (result.mock ? 'E-mail de teste simulado com sucesso no log do servidor.' : `E-mail de teste enviado para ${targetEmail}.`)
        : `Falha no envio: ${result.error}`,
      error: result.error,
    });
  } catch (err: any) {
    logger.error({ err }, 'api.admin.emails.test.failed');
    return Response.json({ error: 'Erro ao enviar e-mail de teste', details: err?.message }, { status: 500 });
  }
}
