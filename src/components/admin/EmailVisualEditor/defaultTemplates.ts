import { EmailDesign } from './types';

export const createBlankDesign = (): EmailDesign => ({
  version: '1.0',
  globalStyles: {
    backgroundColor: '#f7faf9',
    contentWidth: 600,
    contentBackgroundColor: '#ffffff',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial",
    textColor: '#1e293b',
    linkColor: '#0e4a5a',
  },
  sections: [
    {
      id: 'sec_header_' + Math.random().toString(36).substring(2, 9),
      type: 'header',
      styles: {
        backgroundColor: '#0e4a5a',
        paddingTop: 24,
        paddingBottom: 20,
        paddingLeft: 24,
        paddingRight: 24,
      },
      columns: [
        {
          id: 'col_' + Math.random().toString(36).substring(2, 9),
          widthPercent: 100,
          blocks: [
            {
              id: 'blk_' + Math.random().toString(36).substring(2, 9),
              type: 'text',
              content: {
                type: 'text',
                data: {
                  html: '<h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; text-align: center;">DuoLife Hub</h2>',
                  align: 'center',
                },
              },
            },
          ],
        },
      ],
    },
    {
      id: 'sec_body_' + Math.random().toString(36).substring(2, 9),
      type: '1-col',
      styles: {
        backgroundColor: '#ffffff',
        paddingTop: 20,
        paddingBottom: 24,
        paddingLeft: 24,
        paddingRight: 24,
      },
      columns: [
        {
          id: 'col_' + Math.random().toString(36).substring(2, 9),
          widthPercent: 100,
          blocks: [
            {
              id: 'blk_' + Math.random().toString(36).substring(2, 9),
              type: 'text',
              content: {
                type: 'text',
                data: {
                  html: '<h3 style="margin-top: 0; color: #0e4a5a; font-size: 18px;">Olá, {{nome|Cliente}}!</h3><p style="font-size: 15px; color: #475569; line-height: 1.6;">Adicione aqui os blocos e personalize sua comunicação com o segurado ou corretor parceiro.</p>',
                  align: 'left',
                },
              },
            },
            {
              id: 'blk_' + Math.random().toString(36).substring(2, 9),
              type: 'button',
              content: {
                type: 'button',
                data: {
                  text: 'Visualizar Detalhes',
                  url: '{{link_proposta|https://duolife.com.br}}',
                  buttonColor: '#0e4a5a',
                  textColor: '#ffffff',
                  align: 'center',
                  borderRadius: 8,
                  fontSize: 15,
                  paddingX: 24,
                  paddingY: 12,
                },
              },
            },
          ],
        },
      ],
    },
    {
      id: 'sec_footer_' + Math.random().toString(36).substring(2, 9),
      type: 'footer',
      styles: {
        backgroundColor: '#f8fafc',
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 24,
        paddingRight: 24,
      },
      columns: [
        {
          id: 'col_' + Math.random().toString(36).substring(2, 9),
          widthPercent: 100,
          blocks: [
            {
              id: 'blk_' + Math.random().toString(36).substring(2, 9),
              type: 'text',
              content: {
                type: 'text',
                data: {
                  html: '<p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">DuoLife Seguros & Benefícios &bull; {{-ano-}}</p>',
                  align: 'center',
                },
              },
            },
          ],
        },
      ],
    },
  ],
});

export const STARTER_TEMPLATES: { id: string; name: string; description: string; design: () => EmailDesign }[] = [
  {
    id: 'welcome',
    name: 'Boas-vindas — DuoLife Hub',
    description: 'Template elegante de boas-vindas para clientes ou novos parceiros.',
    design: () => ({
      version: '1.0',
      globalStyles: {
        backgroundColor: '#f7faf9',
        contentWidth: 600,
        contentBackgroundColor: '#ffffff',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textColor: '#1e293b',
        linkColor: '#0e4a5a',
      },
      sections: [
        {
          id: 'sec_1',
          type: 'header',
          styles: { backgroundColor: '#0e4a5a', paddingTop: 28, paddingBottom: 28, paddingLeft: 24, paddingRight: 24 },
          columns: [
            {
              id: 'col_1',
              widthPercent: 100,
              blocks: [
                {
                  id: 'blk_1',
                  type: 'text',
                  content: {
                    type: 'text',
                    data: {
                      html: '<h1 style="margin: 0; color: #ffffff; font-size: 24px; text-align: center; letter-spacing: 0.5px;">✨ Seja Bem-Vindo(a) à DuoLife!</h1>',
                      align: 'center',
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'sec_2',
          type: '1-col',
          styles: { backgroundColor: '#ffffff', paddingTop: 24, paddingBottom: 16, paddingLeft: 24, paddingRight: 24 },
          columns: [
            {
              id: 'col_2',
              widthPercent: 100,
              blocks: [
                {
                  id: 'blk_2',
                  type: 'text',
                  content: {
                    type: 'text',
                    data: {
                      html: '<h2 style="color: #0e4a5a; font-size: 19px; margin-top: 0;">Olá, {{nome|Cliente}}! 👋</h2><p style="font-size: 15px; color: #475569; line-height: 1.6;">Estamos muito felizes em receber você. Sua proteção profissional está em boas mãos com as soluções completas da DuoLife.</p>',
                      align: 'left',
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'sec_3',
          type: 'footer',
          styles: { backgroundColor: '#f1f5f9', paddingTop: 20, paddingBottom: 20, paddingLeft: 24, paddingRight: 24 },
          columns: [
            {
              id: 'col_3',
              widthPercent: 100,
              blocks: [
                {
                  id: 'blk_3',
                  type: 'text',
                  content: {
                    type: 'text',
                    data: {
                      html: '<p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">DuoLife Seguros & Benefícios &bull; Disparado em {{-data-}} às {{-hora-}}</p>',
                      align: 'center',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  },
  {
    id: 'proposta_rc',
    name: 'Proposta / Cotação de Seguro RC',
    description: 'Apresentação detalhada da cotação com tabela de coberturas e botão para assinar.',
    design: () => ({
      version: '1.0',
      globalStyles: {
        backgroundColor: '#f7faf9',
        contentWidth: 600,
        contentBackgroundColor: '#ffffff',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textColor: '#1e293b',
        linkColor: '#0e4a5a',
      },
      sections: [
        {
          id: 'sec_p1',
          type: 'header',
          styles: { backgroundColor: '#0e4a5a', paddingTop: 24, paddingBottom: 24, paddingLeft: 24, paddingRight: 24 },
          columns: [
            {
              id: 'col_p1',
              widthPercent: 100,
              blocks: [
                {
                  id: 'blk_p1',
                  type: 'text',
                  content: {
                    type: 'text',
                    data: {
                      html: '<h2 style="margin: 0; color: #ffffff; text-align: center;">Proposta de Seguro DuoLife</h2>',
                      align: 'center',
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'sec_p2',
          type: '1-col',
          styles: { backgroundColor: '#ffffff', paddingTop: 20, paddingBottom: 16, paddingLeft: 24, paddingRight: 24 },
          columns: [
            {
              id: 'col_p2',
              widthPercent: 100,
              blocks: [
                {
                  id: 'blk_p2_txt',
                  type: 'text',
                  content: {
                    type: 'text',
                    data: {
                      html: '<p>Olá, <strong>{{nome|Cliente}}</strong>!</p><p>Sua cotação <strong>#{{cotacao_id}}</strong> para <strong>{{produto_nome|Seguro RC}}</strong> foi calculada com as melhores condições do mercado.</p>',
                      align: 'left',
                    },
                  },
                },
                {
                  id: 'blk_p2_tbl',
                  type: 'table',
                  content: {
                    type: 'table',
                    data: {
                      headers: ['Especificação', 'Valor / Detalhe'],
                      rows: [
                        ['Importância Segurada', 'R$ {{cobertura|200.000,00}}'],
                        ['Prêmio Anual', 'R$ {{valor|1.250,00}}'],
                        ['Corretor / Parceiro', '{{parceiro_nome|DuoLife}}'],
                      ],
                      headerBg: '#f8fafc',
                      headerColor: '#0e4a5a',
                      borderColor: '#e2e8f0',
                      striped: true,
                    },
                  },
                },
                {
                  id: 'blk_p2_btn',
                  type: 'button',
                  content: {
                    type: 'button',
                    data: {
                      text: 'Visualizar e Assinar Proposta',
                      url: '{{link_proposta|https://duolife.com.br}}',
                      buttonColor: '#00d4e0',
                      textColor: '#0e4a5a',
                      align: 'center',
                      borderRadius: 8,
                      fontSize: 16,
                      paddingX: 28,
                      paddingY: 14,
                    },
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'sec_p3',
          type: 'footer',
          styles: { backgroundColor: '#f8fafc', paddingTop: 16, paddingBottom: 16, paddingLeft: 24, paddingRight: 24 },
          columns: [
            {
              id: 'col_p3',
              widthPercent: 100,
              blocks: [
                {
                  id: 'blk_p3',
                  type: 'text',
                  content: {
                    type: 'text',
                    data: {
                      html: '<p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">DuoLife Seguros & Benefícios &bull; {{-ano-}}</p>',
                      align: 'center',
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  },
];
