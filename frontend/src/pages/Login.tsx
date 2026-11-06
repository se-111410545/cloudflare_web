import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coffee, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const [mode, setMode] = useState<'pin' | 'password'>('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload =
        mode === 'pin'
          ? { pin: pin.trim() }
          : { email: email.trim(), password };
      const data = await api.post('/auth/login', payload);
      login(data.token, data.user);
      navigate('/pos');
    } catch (err: any) {
      setError(err.message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pos-900 via-pos-600 to-pos-500 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <Coffee className="mx-auto mb-2 h-12 w-12" />
          <h1 className="text-2xl font-bold">POS 系統</h1>
          <p className="mt-1 text-sm text-white/80">請輸入 PIN 快速登入</p>
        </div>

        <div className="card-pos p-6">
          <div className="mb-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('pin')}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
                mode === 'pin'
                  ? 'bg-pos-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <KeyRound className="h-4 w-4" /> PIN 登入
            </button>
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
                mode === 'password'
                  ? 'bg-pos-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> 帳密登入
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'pin' ? (
              <div className="space-y-2">
                <Label htmlFor="pin">4 位數 PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="text-center text-2xl tracking-[0.5em]"
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="boss@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密碼</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? '登入中…' : '登入'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-gray-400">
            線上訂單請至
            <a href="/order" className="ml-1 font-semibold text-pos-700 underline">
              /order
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
