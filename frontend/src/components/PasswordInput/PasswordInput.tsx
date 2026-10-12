import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './PasswordInput.css';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/*
 * A password field with an eye button that shows or hides what was typed.
 * Takes the same props as a plain <input>, so it drops into a .form-group.
 */
export default function PasswordInput(props: Props) {
  const [shown, setShown] = useState(false);

  return (
    <div className="password-input">
      <input {...props} type={shown ? 'text' : 'password'} />
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
  );
}
