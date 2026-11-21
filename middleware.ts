import {NextResponse} from 'next/server';
export function middleware() {
  const response=NextResponse.next();
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','same-origin');
  response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  // Защита от подмены страницы в чужом окне и от увода формы на чужой адрес.
  // Полный CSP со script-src здесь не ставится: фреймворк вставляет свои
  // инлайновые скрипты, им нужен nonce — это отдельная доработка сборки.
  // В переносимой сборке статическая оболочка, поэтому там CSP строгий.
  response.headers.set('X-Frame-Options','DENY');
  response.headers.set('Content-Security-Policy',"frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return response;
}
export const config={matcher:['/((?!_next/static|favicon.svg).*)']};
