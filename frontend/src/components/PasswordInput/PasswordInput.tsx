import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/*
 * A password field with an eye button that shows or hides what was typed,
 * and a note under it while Caps Lock is on.
 * Takes the same props as a plain <input>, so it drops into a .form-group.
 */
export default function PasswordInput({ onKeyDown, onKeyUp, onBlur, ...props }: Props) {
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  /* Caps Lock state is only readable from a key event, so check on every key */
  const readCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState('CapsLock'));
  };

  return (
    <div className="password-input">
      <div className="password-input-field">
        <input
          {...props}
          type={shown ? 'text' : 'password'}
          onKeyDown={(e) => { readCapsLock(e); onKeyDown?.(e); }}
          onKeyUp={(e) => { readCapsLock(e); onKeyUp?.(e); }}
          onBlur={(e) => { setCapsLock(false); onBlur?.(e); }}
        />
        <button
          type="button"
          className="password-input-toggle"
          onClick={() => setShown((s) => !s)}
          /* A mouse click leaves the caret in the field so typing carries on */
          onMouseDown={(e) => e.preventDefault()}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-controls={props.id}
          title={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {/* Always in the page so screen readers announce the text when it appears */}
      <span className="password-input-caps" role="status">
        {capsLock ? 'Caps Lock is on' : ''}
      </span>
    </div>
  );
}
