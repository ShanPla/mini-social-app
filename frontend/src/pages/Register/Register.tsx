import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import './Register.css';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    setLoading(true);

    // Check username availability
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      setError('That username is already taken.');
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Update the auto-generated profile with the chosen username
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ username })
        .eq('id', data.user.id);
    }

    navigate('/feed');
    setLoading(false);
  };

  return (
    <div className="register-page">
      <div className="register-box">
        <div className="register-header">
          <Link to="/login" className="register-back">← Back to Sign In</Link>
          <h2>Create Account</h2>
          <p>Join The Chronicle today</p>
        </div>

        <form onSubmit={handleRegister} className="register-form">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              placeholder="your_username"
              required
              minLength={3}
              maxLength={30}
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              minLength={6}
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary register-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>

      <div className="register-art">
        <div className="art-grid">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="art-cell" style={{ animationDelay: `${i * 0.2}s` }}>✦</div>
          ))}
        </div>
        <p className="art-quote">"Every voice matters."</p>
      </div>
    </div>
  );
}
