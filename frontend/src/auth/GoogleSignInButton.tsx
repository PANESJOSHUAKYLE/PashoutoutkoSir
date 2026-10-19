import { useEffect, useRef } from 'react';

type GoogleCredentialResponse = { credential?: string };
type GoogleSignInOptions = {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
};
type GoogleButtonOptions = {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: GoogleSignInOptions) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
        };
      };
    };
  }
}

interface Props {
  clientId: string;
  text: 'continue_with' | 'signup_with' | 'signin_with';
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}

export default function GoogleSignInButton({ clientId, text, onCredential, onError }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCredential, onError });
  callbacks.current = { onCredential, onError };

  useEffect(() => {
    if (!clientId || !host.current) return;
    const initialize = () => {
      if (!window.google?.accounts.id || !host.current) return;
      host.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: response => {
          if (response.credential) callbacks.current.onCredential(response.credential);
          else callbacks.current.onError('Google did not return an identity credential. Please try again.');
        },
      });
      window.google.accounts.id.renderButton(host.current, {
        theme: 'outline', size: 'large', text, shape: 'rectangular',
        width: Math.min(320, Math.floor(host.current.clientWidth || 320)),
      });
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (window.google?.accounts.id) {
      initialize();
    } else if (script) {
      script.addEventListener('load', initialize);
      script.addEventListener('error', onScriptError);
    } else {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.addEventListener('load', initialize);
      script.addEventListener('error', onScriptError);
      document.head.appendChild(script);
    }

    function onScriptError() {
      callbacks.current.onError('Google sign-in could not load. Check your internet connection and try again.');
    }
    return () => {
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', onScriptError);
    };
  }, [clientId, text]);

  return <div ref={host} className="flex min-h-11 justify-center" aria-label="Continue with Google" />;
}
