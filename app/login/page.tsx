import type { Metadata } from 'next';
import LoginClient from './_client';

export const metadata: Metadata = {
  title: 'Login',
  description: 'Acesse o portal do parceiro DuoLife para acompanhar cotações, vendas e comissões.',
};

export default function LoginPage() {
  return <LoginClient />;
}
