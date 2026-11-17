import { useState } from 'react';
import { api } from '../api/client';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** A "Contact us" link that opens a modal form, emailing the hospital's mailbox. */
export function ContactLink() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setStatus('idle');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await api.contact({ name, email, message, website });
      setStatus('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setStatus('error');
      setError('Could not send just now. Please try again, or email us directly.');
    }
  };

  return (
    <>
      <button className="linklike" onClick={() => setOpen(true)}>
        Contact us
      </button>
      {open && (
        <div className="popover-backdrop" onClick={close}>
          <div className="popover contact" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Contact us">
            <div className="popover-head">
              <h3>Contact us</h3>
              <button className="btn small" onClick={close}>
                Close
              </button>
            </div>
            {status === 'sent' ? (
              <p className="lede" style={{ fontSize: 16 }}>
                Thank you — your message is on its way. We'll be in touch soon. 🌼
              </p>
            ) : (
              <form className="contact-form" onSubmit={submit}>
                <label>
                  Your name
                  <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                </label>
                <label>
                  Your email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
                </label>
                <label>
                  Message
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={5000} rows={5} />
                </label>
                {/* honeypot: hidden from people, tempting to bots */}
                <input
                  className="hp"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
                {error && <p className="contact-error">{error}</p>}
                <button className="btn primary" type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Sending…' : 'Send message'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
