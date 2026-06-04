'use client';

import { useEffect, useRef, useState } from 'react';

const LOGO_URL = 'https://www.image2url.com/r2/default/images/1779230378321-292c7b74-6217-41ff-832a-180a535ea4cb.png';
const BG_VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

type SchoolBranding = {
  id: string;
  name: string;
  logo_url?: string | null;
  welcome_message?: string | null;
};

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameHint, setUsernameHint] = useState('');
  const [loginSchoolId, setLoginSchoolId] = useState('');
  const [schoolBranding, setSchoolBranding] = useState<SchoolBranding | null>(null);
  const brandingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlSchoolBranding = useRef<SchoolBranding | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('school_id');
    if (!sid) return;

    setLoginSchoolId(sid);
    fetch(`/api/public/school-branding?school_id=${sid}`)
      .then((r) => r.json())
      .then((d) => {
        const school = d.school || null;
        urlSchoolBranding.current = school;
        setSchoolBranding(school);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const trimmed = username.trim();
    if (brandingTimer.current) clearTimeout(brandingTimer.current);

    if (trimmed.length < 3) {
      setUsernameHint('');
      setSchoolBranding(urlSchoolBranding.current);
      return;
    }

    brandingTimer.current = setTimeout(() => {
      const params = new URLSearchParams({ username: trimmed });
      if (loginSchoolId) params.set('school_id', loginSchoolId);

      fetch(`/api/public/login-branding?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (loginSchoolId) {
            if (d.belongs_to_school && d.school) {
              setUsernameHint('');
              setSchoolBranding(d.school);
            } else {
              setUsernameHint(
                d.error || 'This username is not registered at this school.'
              );
              setSchoolBranding(urlSchoolBranding.current);
            }
            return;
          }

          setUsernameHint('');
          if (d.school) setSchoolBranding(d.school);
        })
        .catch(() => {});
    }, 400);

    return () => {
      if (brandingTimer.current) clearTimeout(brandingTimer.current);
    };
  }, [username, loginSchoolId]);

  const logoSrc = schoolBranding?.logo_url
    ? `/api/photo?path=${encodeURIComponent(schoolBranding.logo_url)}`
    : LOGO_URL;

  const welcomeLine =
    schoolBranding?.welcome_message ||
    (schoolBranding?.name ? `Welcome to ${schoolBranding.name}` : 'Sign in to your MyEduRide account');

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    if (usernameHint) {
      setError(usernameHint);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          school_id: loginSchoolId || undefined,
        }),
      });

      const text = await response.text();
      let data: { error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (!response.ok) {
        setError(data.error || 'Failed to sign in.');
        setLoading(false);
        return;
      }

      window.location.href = '/dashboard';
    } catch {
      setError('Network error. Check your connection.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
        <source src={BG_VIDEO_URL} type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8">
          <div className="text-center mb-8">
            <img src={logoSrc} alt={schoolBranding?.name || 'MyEduRide'} className="h-20 mx-auto mb-4 object-contain max-w-[200px]" />
            {schoolBranding?.name && (
              <p className="text-lg font-bold text-white mb-2">{schoolBranding.name}</p>
            )}
            <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
            <p className="text-white/70 mt-2 text-sm">{welcomeLine}</p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-4 py-3.5 border border-white/20 rounded-xl focus:ring-2 focus:ring-white/40 focus:border-transparent outline-none text-white placeholder:text-white/40 transition-all bg-white/10 backdrop-blur-sm min-h-[48px]"
                autoFocus
                autoComplete="username"
              />
              {usernameHint && (
                <p className="text-xs text-amber-200 mt-2">{usernameHint}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3.5 border border-white/20 rounded-xl focus:ring-2 focus:ring-white/40 focus:border-transparent outline-none text-white placeholder:text-white/40 transition-all bg-white/10 backdrop-blur-sm min-h-[48px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLogin();
                }}
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/20 border border-red-400/30">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading || !username.trim() || !password.trim() || !!usernameHint}
              className="w-full py-3.5 px-4 rounded-xl bg-white text-primary-700 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90 shadow-lg min-h-[48px]"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-white/80 mt-4">
          <a href="/auth/register-school" className="underline hover:text-white">
            Register your school — instant setup
          </a>
        </p>
        <p className="text-center text-xs text-white/60 mt-2">MyEduRide — The Student Safety Platform</p>
      </div>
    </div>
  );
}
